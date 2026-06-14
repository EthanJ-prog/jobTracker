const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from the workspace root .env file by default.
// This handles the case where backend/server.js is started from a different working directory.
const envPath = path.resolve(__dirname, '../.env');
const dotenvResult = dotenv.config({ path: envPath });
if (dotenvResult.error) {
    console.warn(`Warning: Could not load .env from ${envPath}: ${dotenvResult.error.message}`);
    const fallbackResult = dotenv.config();
    if (fallbackResult.error) {
        console.warn(`Warning: Could not load fallback .env from current working directory: ${fallbackResult.error.message}`);
    } else {
        console.log('Loaded environment variables from current working directory as fallback.');
    }
} else {
    console.log(`Loaded environment variables from ${envPath}`);
}

// Import required dependencies
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const fetch = require('node-fetch');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { GoogleGenerativeAI } = require('@google/generative-ai');
// Backend main server for Pathfinder.
// - Serves REST endpoints for job search, job storage, resume upload/analysis,
//   user authentication (including optional 2FA) and match-score calculation.
// - Uses SQLite for lightweight persistence and supports Ollama/Gemini for
//   AI-powered resume/job analysis when configured.
// Secret used to sign JWTs. In production this should come from a secure
// environment variable and be rotated regularly. The fallback is only for
// local development and must NOT be used in production systems.
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key_change_this';

const ADMIN_EMAIL = 'admin@pathfinder.com';

// In-memory store for short-lived 2FA codes. Keys are user IDs and values
// contain the code plus an expiration timestamp. This is suitable for small
// deployments and testing but should be backed by a shared store (Redis)
// when running multiple server instances.
const twoFactorCodes = new Map();

const { Resend } = require('resend');
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM || 'Pathfinder 2FA <onboarding@resend.dev>';
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

// Initialize Express application
const app = express();
const PORT = process.env.PORT || 3000;

// Configure middleware
app.use(cors()); // Enable CORS for cross-origin requests
app.use(express.json()); // Parse JSON request bodies

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: 'Too many authentication attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

const twoFALimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // limit each IP to 10 2FA attempts per windowMs
  message: 'Too many 2FA attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {fileSize: 10 * 1024 * 1024
    }, 
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type, only pdf and docx allowed'));
        }
    }
});

// Initialize SQLite database connection
const db = new sqlite3.Database('jobs.db', (err) => {
    if (err) {
        console.error('DB error:', err.message);
    } else {
        console.log('Connected to jobs.db');
    }
});

// JSearch API configuration
const JSEARCH_API_KEY = process.env.JSEARCH_API_KEY;
const JSEARCH_BASE_URL = process.env.JSEARCH_BASE_URL || 'https://jsearch.p.rapidapi.com';
const JSEARCH_REQ_LIMIT = parseInt(process.env.JSEARCH_REQ_LIMIT, 10) || 50;

// Ollama configuration
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL;
const OLLAMA_MODEL = process.env.OLLAMA_MODEL;
const RESUME_OLLAMA_MODEL = process.env.RESUME_OLLAMA_MODEL;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL_NAME || process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const geminiClient = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;
const geminiModel = geminiClient ? geminiClient.getGenerativeModel({ model: GEMINI_MODEL }) : null;

if (!GEMINI_API_KEY) {
    console.warn('Warning: GEMINI_API_KEY is not set. Resume parsing using Gemini will be disabled.');
} else if (!geminiModel) {
    console.warn(`Warning: Gemini model initialization failed for model "${GEMINI_MODEL}". Please verify GEMINI_MODEL and GEMINI_API_KEY.`);
} else {
    console.log(`Gemini configured successfully. Model: ${GEMINI_MODEL}`);
}

const PROGRAMMING_LANGUAGES = [
    'javascript', 'python', 'java', 'c++', 'c#', 'ruby', 'php', 'swift',
    'kotlin', 'go', 'rust', 'typescript', 'scala', 'r', 'matlab', 'perl',
    'objective-c', 'dart', 'lua', 'haskell', 'sql', 'html', 'css', 'bash',
    'powershell', 'assembly', 'vba', 'groovy', 'elixir', 'clojure', 'f#'
];

const FRAMEWORKS_AND_LIBRARIES = [
    'react', 'angular', 'vue', 'node', 'express', 'django', 'flask', 'spring',
    'rails', 'laravel', 'asp.net', '.net', 'jquery', 'bootstrap', 'tailwind',
    'next.js', 'nuxt', 'gatsby', 'svelte', 'ember', 'backbone', 'redux',
    'graphql', 'rest', 'fastapi', 'nestjs', 'electron', 'react native',
    'flutter', 'xamarin', 'unity', 'unreal', 'tensorflow', 'pytorch', 'keras',
    'scikit-learn', 'pandas', 'numpy', 'matplotlib', 'opencv', 'spark'
];

const TOOLS_AND_PLATFORMS = [
    'git', 'github', 'gitlab', 'bitbucket', 'docker', 'kubernetes', 'aws',
    'azure', 'gcp', 'firebase', 'heroku', 'vercel', 'netlify', 'jenkins',
    'travis', 'circleci', 'terraform', 'ansible', 'puppet', 'chef', 'nginx',
    'apache', 'linux', 'unix', 'windows server', 'macos', 'mongodb', 'mysql',
    'postgresql', 'redis', 'elasticsearch', 'kafka', 'rabbitmq', 'dynamodb',
    'oracle', 'sql server', 'sqlite', 'cassandra', 'neo4j', 'graphql',
    'postman', 'swagger', 'jira', 'confluence', 'slack', 'figma', 'sketch',
    'photoshop', 'illustrator', 'webpack', 'vite', 'babel', 'eslint', 'npm',
    'yarn', 'pip', 'maven', 'gradle', 'cmake', 'make'
];

const SOFT_SKILLS_AND_CONCEPTS = [
    'agile', 'scrum', 'kanban', 'ci/cd', 'devops', 'microservices', 'api',
    'rest api', 'testing', 'unit testing', 'integration testing', 'tdd',
    'bdd', 'debugging', 'problem solving', 'communication', 'teamwork',
    'leadership', 'project management', 'code review', 'documentation',
    'mentoring', 'collaboration', 'time management', 'critical thinking',
    'machine learning', 'deep learning', 'data analysis', 'data science',
    'artificial intelligence', 'nlp', 'computer vision', 'cloud computing',
    'cybersecurity', 'networking', 'database design', 'system design',
    'algorithms', 'data structures', 'object oriented', 'functional programming'
];

const EDUCATION_KEYWORDS = [
    'bachelor', 'master', 'phd', 'doctorate', 'associate', 'degree',
    'computer science', 'software engineering', 'information technology',
    'electrical engineering', 'mathematics', 'physics', 'data science',
    'bootcamp', 'certification', 'certified', 'university', 'college'
];

const EXPERIENCE_KEYWORDS = [
    'junior', 'senior', 'lead', 'principal', 'staff', 'entry level',
    'mid level', 'experienced', 'manager', 'director', 'architect',
    'intern', 'internship', 'fresher', 'graduate', 'years experience',
    '1 year', '2 years', '3 years', '4 years', '5 years', '6 years',
    '7 years', '8 years', '9 years', '10 years', '1+ years', '2+ years',
    '3+ years', '4+ years', '5+ years', '6+ years', '7+ years', '8+ years'
];

/**
 * Normalizes text by converting to lowercase and removing special characters
 * @param {string} text - The text to normalize
 * @returns {string} Normalized text with consistent spacing
 */
function normalizeText(text) {
    if (!text || typeof text !== 'string') {
        return '';
    }

    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s\+\#\.]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Escapes special regex characters in a string
 * @param {string} str - The string to escape
 * @returns {string} The escaped string safe for regex patterns
 */
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extracts matching keywords from text using a provided keyword list
 * @param {string} text - The text to search for keywords
 * @param {Array<string>} keywordList - List of keywords to match
 * @returns {Array<string>} Array of found keywords from the text
 */
function extractKeywords(text, keywordList) {
    const normalizedText = normalizeText(text);
    const foundKeywords = [];
    for (const keyword of keywordList){
        const keywordLower = keyword.toLowerCase();
        const pattern = new RegExp(`\\b${escapeRegex(keywordLower)}\\b`, 'i');
        if (pattern.test(normalizedText)){
            foundKeywords.push(keyword);
        }
    }
    return foundKeywords;
}

function extractAllSkills(text) {
    const languages = extractKeywords(text, PROGRAMMING_LANGUAGES);
    const frameworks = extractKeywords(text, FRAMEWORKS_AND_LIBRARIES);
    const tools = extractKeywords(text, TOOLS_AND_PLATFORMS);
    const softSkills = extractKeywords(text, SOFT_SKILLS_AND_CONCEPTS);
    const education = extractKeywords(text, EDUCATION_KEYWORDS);
    const experience = extractKeywords(text, EXPERIENCE_KEYWORDS);

    const technical = [...new Set([...languages, ...frameworks, ...tools])];

    return {
        technical,
        languages,
        frameworks,
        tools,
        softSkills,
        education,
        experience,
        all: [...new Set([...technical, ...softSkills, ...education, ...experience])]
    };
}

/**
 * Calculates a match score between a resume and job description
 * Evaluates technical skills (10%), soft skills (20%), experience (40%), and education (30%)
 * @param {string} resumeText - The resume text content
 * @param {string} jobDesc - The job description text
 * @param {string} jobTitle - Optional job title to include in analysis
 * @returns {Object} Match score and detailed breakdown of matched/missing skills
 */
function calculateMatchScore(resumeText, jobDesc, jobTitle = '') {
    const fullJobText = `${jobTitle} ${jobDesc}`;
    const resumeSkills = extractAllSkills(resumeText);
    const jobSkills = extractAllSkills(jobDesc);

    const matchedTechnical = jobSkills.technical.filter(skill => 
        resumeSkills.technical.includes(skill)
    );

    const technicalScore = jobSkills.technical.length > 0 
    ? (matchedTechnical.length / jobSkills.technical.length) * 100
    : 100;

    const matchedSoftSkills = jobSkills.softSkills.filter(skill => 
        resumeSkills.softSkills.includes(skill)
    );

    const softSkillsScore = jobSkills.softSkills.length > 0
    ? (matchedSoftSkills.length / jobSkills.softSkills.length) * 100
    : 100;

        const matchedExp = jobSkills.experience.filter(skill => 
        resumeSkills.experience.includes(skill)
    );

    const experienceScore = jobSkills.experience.length > 0
        ? (matchedExp.length / jobSkills.experience.length) * 100
        : 100;

    const matchedEducation = jobSkills.education.filter(skill => 
        resumeSkills.education.includes(skill)
    );

    const educationScore = jobSkills.education.length > 0
    ? (matchedEducation.length / jobSkills.education.length) * 100
    : 100;

    const finalScore = Math.round(
        (technicalScore * .1) + 
        (softSkillsScore * .2) + 
        (experienceScore * .4) + 
        (educationScore * .3)
    );

    const missingTechnical = jobSkills.technical.filter(skill => 
        !resumeSkills.technical.includes(skill)
    );

    const missingSoftSkills = jobSkills.softSkills.filter(skill => 
        !resumeSkills.softSkills.includes(skill)
    );

    return {
        score: finalScore,

        breakdown: {
            technical: Math.round(technicalScore),
            softSkills: Math.round(softSkillsScore),
            experience: Math.round(experienceScore),
            education: Math.round(educationScore)
        },

        matchedSkills: {
            technical: matchedTechnical,
            softSkills: matchedSoftSkills,
            experience: matchedExp,
            education: matchedEducation
        },

        missingSkills: {
            technical: missingTechnical,
            softSkills: missingSoftSkills
        },

        summary: {
            totalJobRequirements: jobSkills.all.length,
            totalMatched: matchedTechnical.length + matchedEducation.length +
                        matchedExp.length + matchedSoftSkills.length,
            resumeSkillsCount: resumeSkills.all.length
        }
    };
}

let ollamaAvailable = false;
let resumeOllamaAvailable = false;

/**
 * Check whether an Ollama model name is present in the list of installed models.
 * Some Ollama responses include model names with additional metadata after a
 * colon (e.g. "model:version"), so this function checks for exact matches
 * and prefix matches.
 * @param {Array<string>} installedModels - Array of model names reported by Ollama
 * @param {string} modelName - Desired model name to look for
 * @returns {boolean} True when model is installed/available
 */
function isInstalledOllamaModel (installedModels, modelName) {
    if (!modelName || !Array.isArray(installedModels)) return false;
    return installedModels.some((installedModel) => installedModel === modelName || 
    installedModel.startsWith(`${modelName}:`));
}

/**
 * Checks if Ollama AI service is available at the configured URL
 * Updates ollamaAvailable flag based on connection status
 */
async function checkOllamaAvailability() {
    try {
        const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
        if (response.ok) {
            const data = await response.json();
            const installedModels = Array.isArray(data.models) ? data.models.map((model) => model.name) : [];
            ollamaAvailable = isInstalledOllamaModel(installedModels, OLLAMA_MODEL);
            resumeOllamaAvailable = isInstalledOllamaModel(installedModels, RESUME_OLLAMA_MODEL);

            if (ollamaAvailable) console.log(`✓ Ollama is available at ${OLLAMA_BASE_URL} with model "${OLLAMA_MODEL}"`);
            if(!ollamaAvailable) console.warn(`Warning! Ollama is running but model "${OLLAMA_MODEL}" is not installed. Job description summarization will not be available.`);
            if (resumeOllamaAvailable) console.log(`✓ Resume analysis model "${RESUME_OLLAMA_MODEL}" is available on Ollama`);
            if (RESUME_OLLAMA_MODEL && !resumeOllamaAvailable) console.warn(`Warning! Resume analysis model "${RESUME_OLLAMA_MODEL}" is not installed on Ollama. Resume matching functionality will be limited.`);

        } else {
            console.warn('Warning! Ollama server is not responding. Job description summarization will not be available.');
        }
    } catch (err) {
        console.warn(`Warning! Could not connect to Ollama at ${OLLAMA_BASE_URL}. Make sure Ollama is running. Job description summarization will not be available.`);
    }
}

checkOllamaAvailability();

// Validate API key configuration
if (!JSEARCH_API_KEY) {
    console.warn('Warning: JSEARCH_API_KEY is not set. Job search functionality will be disabled.');
}
// Initialize SQLite schema: lightweight tables for users, saved jobs,
// JSearch monthly usage counters, job listings, resumes and precomputed matches.
// The schema is intentionally simple for local/dev use; consider migrating
// to a managed DB for production and using migrations for schema changes.

db.run(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        two_factor_enabled BOOLEAN DEFAULT 0,
        name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

// Migration: Add name column if it doesn't exist (for existing databases)
db.run(`
    PRAGMA table_info(users);
`, (err, data) => {
    if (!err) {
        db.all(`PRAGMA table_info(users)`, (err, columns) => {
            if (!err && columns) {
                const hasNameColumn = columns.some(col => col.name === 'name');
                if (!hasNameColumn) {
                    db.run(`ALTER TABLE users ADD COLUMN name TEXT`);
                }
            }
        });
    }
});

db.run(`
    CREATE TABLE IF NOT EXISTS saved_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        company TEXT,
        date TEXT,
        link TEXT,
        notes TEXT,
        status TEXT DEFAULT 'saved',
        user_id INTEGER,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )
`);

db.run(`
    CREATE TABLE IF NOT EXISTS jsearch_usage (
        month_key TEXT PRIMARY KEY,
        count INTEGER DEFAULT 0
    )
`);

function getCurrentKey () {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}

/**
 * Ensure the monthly JSearch API quota has not been exceeded.
 * Uses a simple SQLite-backed counter keyed by YYYY-MM to limit the number
 * of external API requests made each month (helps avoid exceeding paid limits).
 * @returns {Promise<boolean>} Resolves true when a request may proceed, false when limit reached
 */
function jsearchQuotaCalculation () {
    return new Promise((resolve) => {
        const currentMonthKey = getCurrentKey();

        db.get(
            'SELECT count FROM jsearch_usage WHERE month_key = ?',
            [currentMonthKey],
            (err, row) => {
                if (err) {
                    console.error('Could not get quota from job usage table.', err.message);
                    return resolve(false);
                }

                const currentCount = row ? row.count : 0;
                if (currentCount >= JSEARCH_REQ_LIMIT) {
                    return resolve(false);
                }

                db.run(
                    `INSERT INTO jsearch_usage (month_key, count) VALUES (?, 1)
                    ON CONFLICT(month_key) DO UPDATE SET count = count + 1`,
                    [currentMonthKey], 
                    (writeErr) => {
                        if (writeErr) {
                            console.error('Error writing into the usage table.', writeErr.message);
                            return resolve(false);
                        }
                        resolve(true);
                    }
                );
            }
        );
    });
}


/**
 * Calculates expiration date and method for a job
 * @param {string} postedDate - Posted date from API (can be null)
 * @param {string} createdAt - When job was added to our database
 * @returns {Object} Object with expiration details
 */
function calculateJobExpiration(postedDate, createdAt) {
    const twoWeeksInMs = 14 * 24 * 60 * 60 * 1000; // 14 days in milliseconds
    let expirationMethod = 'posted_date';
    let expiresAt = null;
    
    // If we have a posted date, use it for expiration calculation
    if (postedDate) {
        try {
            // Parse the posted date (could be ISO string or timestamp)
            const postedDateTime = new Date(postedDate);
            if (!isNaN(postedDateTime.getTime())) {
                // Add 2 weeks to posted date
                expiresAt = new Date(postedDateTime.getTime() + twoWeeksInMs).toISOString();
                expirationMethod = 'posted_date';
            }
        } catch (error) {
            console.warn('Failed to parse posted date:', postedDate, error.message);
        }
    }
    
    // If no valid posted date, use created_at as fallback
    if (!expiresAt && createdAt) {
        try {
            const createdDateTime = new Date(createdAt);
            if (!isNaN(createdDateTime.getTime())) {
                // Add 2 weeks to created date
                expiresAt = new Date(createdDateTime.getTime() + twoWeeksInMs).toISOString();
                expirationMethod = 'created_at';
            }
        } catch (error) {
            console.warn('Failed to parse created date:', createdAt, error.message);
        }
    }
    
    // If we still can't calculate expiration, mark as never expires
    if (!expiresAt) {
        expirationMethod = 'never';
    }
    
    return {
        expiresAt,
        expirationMethod
    };
}

/**
 * Generates a summary of a job description using Ollama AI model
 * Returns null if Ollama is unavailable or the description is empty
 * @param {string} description - The job description to summarize
 * @returns {Promise<Object>} Object with summary text and elapsed time in seconds
 */
async function generateJobDescriptionSummary(description) {
    if(!description || typeof description !== 'string' || !description.trim()){
        return {summary: null, elapsed: 0};
    }

    if(!ollamaAvailable) return {summary: null, elapsed: 0};    

    const startTime = Date.now();
    try {
        const cleanDescription = description.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
        if (!cleanDescription) return {summary: null, elapsed: 0};

        const prompt = `You are an expert job description analyst. Create a concise, professional summary of the following job posting. 
        
        INSTRUCTIONS: 
        - Write a single, well structured paragraph (75 words; one to two concise sentences)
        - Focus on the most important aspects: role purpose, key responsibilities, essential requriments, and notable benefits
        - Use clear, professional language suitable for job seekers
        - Avoid redundancy and generic phrases 
        - Prioritize specfic techincal skills, qualifications, and responsibilities over vague descriptions,
        - If salary/compensation is mentioned, include it
        - If remote work options are specified, mention them 
        - Maintain a neutral, informative tone 

        OUTPUT FORMAT: 
        Write only the summary paragraph (75 words). Do not include headers, bullet points, or formatting marks. Keep it concise and suitable for a short card preview. Do not add any information that is not explicitly stated in the description. Do not include the word "summary" in the output.

        Job Description:
        ${cleanDescription}
        
        `;
        
        const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: OLLAMA_MODEL,
                prompt: prompt,
                stream: false
            })
        });

        if (!response.ok) {
            throw new Error(`Ollama API returned ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        const summary = data.response ? data.response.trim() : null;
        
        const elapsed = Date.now() - startTime;
        
        return {summary: summary || null, elapsed: elapsed / 1000};

    } catch (err) {
        const elapsed = Date.now() - startTime;
        return {summary: null, elapsed: elapsed / 1000};
    }
}

function extractJsonObject(text) {
    if (!text || typeof text !== 'string') return null;
    let cleanText = text.trim();
    if (cleanText.startsWith('```json')) cleanText = cleanText.replace('```json', '').trim();
    if (cleanText.startsWith('```')) cleanText = cleanText.replace('```', '').trim();
    if (cleanText.endsWith('```')) cleanText = cleanText.slice(0, -3).trim();
    const firstBracket = cleanText.indexOf('{');
    const lastBracket = cleanText.lastIndexOf('}');
    if (firstBracket === -1 || lastBracket === -1) return null;
    return cleanText.slice(firstBracket, lastBracket + 1);
}

function normalizeResumeText(text) {
    const rawList = Array.isArray(text) ? text : (typeof text === 'string' && text.trim() ? [text] : []);
    return [...new Set(rawList.map(item => String(item || '').trim()).filter(Boolean))];
}

function normalizeResumeContactInfo(contactInfo) {
    const contact = contactInfo && typeof contactInfo === 'object' && !Array.isArray(contactInfo) ? contactInfo : {};
    return {
        name: typeof contact.name === 'string' ? contact.name.trim() : '',
        email: typeof contact.email === 'string' ? contact.email.trim() : '',
        phone: typeof contact.phone === 'string' ? contact.phone.trim() : '',
        location: typeof contact.location === 'string' ? contact.location.trim() : '',
        linkedIn: typeof contact.linkedIn === 'string' ? contact.linkedIn.trim() : ''
    };
}

/**
 * Parse a resume using the configured Gemini model.
 * This wrapper validates configuration and enforces PDF-only processing
 * for the Gemini path. It sends base64-encoded file bytes to the model
 * with a strict prompt requesting JSON of a fixed shape, then extracts
 * and normalizes the returned JSON.
 */
async function parseResumeWithGemini(fileBuffer, mimetype) {
    if (!GEMINI_API_KEY) {
        throw new Error('Gemini is not configured. No GEMINI_API_KEY was found. Ensure backend .env contains GEMINI_API_KEY and the server is loading the correct .env file.');
    }
    if (!geminiClient) {
        throw new Error('Gemini client initialization failed. Verify GEMINI_API_KEY and backend configuration.');
    }
    if (!geminiModel) {
        throw new Error(`Gemini model is not initialized. Check GEMINI_MODEL (${GEMINI_MODEL}) and GEMINI_API_KEY configuration.`);
    }
    if (mimetype !== 'application/pdf') throw new Error('Only pdf resumes are supported.');

    const prompt = `Read this resume and return ONLY valid JSON with this exact shape: 
    {"raw_text":"string",
    "skills":["string"],
    "experience":["string"],
    "education":["string"],
    "contact_info":{"name":"string","email":"string","phone":"string","location":"string","linkedIn":"string"}}`;
    const result = await geminiModel.generateContent([prompt, {inlineData: { mimeType: mimetype, data: fileBuffer.toString('base64') } }]);
    const responseText = result && result.response ? result.response.text() : '';
    const jsonString = extractJsonObject(responseText);
    if (!jsonString) throw new Error('Gemini did not return valid json');
    
    const parsed = JSON.parse(jsonString);
    const normalizedRawText = typeof parsed.raw_text === 'string' ? parsed.raw_text.trim() : '';
    const normalizedSkills = normalizeResumeText(parsed.skills);
    const normalizedExperience = normalizeResumeText(parsed.experience);
    const normalizedEducation = normalizeResumeText(parsed.education);
    const normalizedContactInfo = normalizeResumeContactInfo(parsed.contact_info);

    return { rawText: normalizedRawText, skills: normalizedSkills, experience: normalizedExperience, education: normalizedEducation, contactInfo: normalizedContactInfo };
}

/**
 * Maps JSearch API job data to our database schema
 * @param {Object} job - Job object from JSearch API
 * @returns {Object} Mapped job object for database storage
 */
function mapJSearchJobToDB(job){
    return {
        job_id: job.job_id,
        title: job.job_title || null,
        company: job.employer_name || null,
        location: [job.job_city, job.job_state, job.job_country].filter(Boolean).join(', '),
        employment_type: job.job_employment_type || null,
        description: job.job_description || null,
        apply_link: (job.job_apply_link || (Array.isArray(job.job_apply_links) ? job.job_apply_links[0] : null)) || null,
        is_remote: job.job_is_remote ? 1 : 0,
        posted_date: job.job_posted_at_datetime_utc || job.job_posted_at_timestamp || null,
        salary_min: job.job_min_salary || null,
        salary_max: job.job_max_salary || null,
    };
}

/**
 * Upserts a job listing into the database (insert or update if exists)
 * @param {Object} db - Database connection object
 * @param {Object} row - Job data to upsert
 * @returns {Promise<number>} Number of affected rows
 */
async function upsertJobListing(db, row){
    const expiration = calculateJobExpiration(row.posted_date, new Date().toISOString());
    let descriptionSummary = null;
    let ollamaTime = 0;
    if(row.description){
        const existingJob = await new Promise((resolve, reject) => {
            db.get('SELECT description_summary FROM job_listings WHERE job_id = ?', [row.job_id], (err, result) => {
                if(err) return reject(err);
                resolve(result);
            });
        }).catch(() => null);
        
        if (!existingJob || !existingJob.description_summary) {
            const result = await generateJobDescriptionSummary(row.description);
            descriptionSummary = result.summary;
            ollamaTime = result.elapsed;
        } else {
            descriptionSummary = existingJob.description_summary;
        }
    }

    return new Promise((resolve, reject) => {
        // SQL query to insert or update job listing based on job_id
        const sql = `
            INSERT INTO job_listings (
                job_id, title, company, location, employment_type, description, description_summary, 
                apply_link, is_remote, posted_date, salary_min, salary_max,
                status, expiration_method, expires_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(job_id) DO UPDATE SET
                title = excluded.title,
                company = excluded.company,
                location = excluded.location,
                employment_type = excluded.employment_type,
                description = excluded.description,
                description_summary = COALESCE(excluded.description_summary, job_listings.description_summary),
                apply_link = excluded.apply_link,
                is_remote = excluded.is_remote,
                posted_date = excluded.posted_date,
                salary_min = excluded.salary_min,
                salary_max = excluded.salary_max,
                expiration_method = excluded.expiration_method,
                expires_at = excluded.expires_at
        `;
        
        // Execute the upsert query with job data including expiration info
        db.run(
            sql, 
            [
                row.job_id, 
                row.title,
                row.company,
                row.location,
                row.employment_type,
                row.description,
                descriptionSummary,
                row.apply_link,
                row.is_remote,
                row.posted_date,
                row.salary_min,
                row.salary_max,
                'active', // Default status for new jobs
                expiration.expirationMethod,
                expiration.expiresAt
            ], 
            function(err) {
                if(err) {
                    return reject(err);
                }

                db.get(
                    'SELECT id FROM job_listings WHERE job_id = ?', 
                    [row.job_id],
                    (lookupErr, jobRow) => {
                        if (!lookupErr && jobRow) {
                            recalculateMatches(jobRow.id, row.title, row.description);
                        }
                    }
                );

                resolve({changes: this.changes, ollamaTime: ollamaTime});
            }
        );
    });
}


/**
 * Checks if a password meets strong security requirements
 * Requires: 12+ characters, uppercase, lowercase, numbers, and special characters
 * @param {string} password - The password to validate
 * @returns {boolean} True if password meets all requirements
 */
function isStrongPassword(password) {
    const minLength = 12;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /[0-9]/.test(password);
    const hasSpecialChars = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    return password.length >= minLength && hasUpperCase && hasLowerCase && hasNumbers && hasSpecialChars;
}

// Middleware helper: verifies a Bearer JWT from the Authorization header.
// On success attaches decoded token payload to `req.user` and calls `next()`.
// Responds with 401 when no token provided, 403 when token invalid/expired.
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
}

function requireAdmin(req, res, next) {
    const userId = req.user.userId;
    db.get('SELECT email FROM users WHERE id = ?', [userId], (err, user) => {
        if (err) return res.status(500).json({ error: 'Database Error' });
        if (!user || user.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Admin not found' });
        next();


    });

}

function optionalAuthenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return next();

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (!err) req.user = user;
        next();
    });
}


async function send2FACodeByEmail(code, email) {
    if (!resend) {
        return false;
    }

    const text = `Your verification code is: ${code}\n\nDo not share this with anyone. It expires in 5 minutes.`;

    try {
        const { error } = await resend.emails.send({
            from: RESEND_FROM,
            to: email,
            subject: 'Pathfinder login code — do not share',
            text,
            html: `<p>Your verification code is: <strong>${code}</strong></p><p>Do not share this with anyone. It expires in 5 minutes.</p>`
        });

        if (error) {
            console.error('Resend send failed:', error);
            return false;
        }

        return true;
    } catch (err) {
        console.error('Resend send error:', err.message);
        return false;
    }
}

// Sign-up endpoint: validates input, enforces password strength,
// hashes the password with bcrypt and stores the user in `users` table.
// Returns 201 on success, 409 if email is already used, and 400/500 for
// client/server errors respectively.
app.post('/api/auth/signup', authLimiter, async (req, res) => {
    try {
        const { email, password, name, twoFactorEnabled, enable2FA: enable2FARequest } = req.body;

        // Basic input validation
        if (!email || !password) {
                return res.status(400).json({ error: 'Email and password required' });
        }

        // Enforce strong passwords to reduce account compromise risk
        if (!isStrongPassword(password)) {
                return res.status(400).json({
                error: 'Password must be at least 12 characters and include uppercase, lowercase, number, and special character'
                });
     }

        // Hash the password before storing. Use a reasonable salt rounds count.
        const passwordHash = await bcrypt.hash(password, 12);
        const requested2FA =
            typeof twoFactorEnabled !== 'undefined'
                ? twoFactorEnabled
                : (enable2FARequest ?? req.body.enable2fa);
        const enable2FA = requested2FA ? 1 : 0;
        const userName = typeof name === 'string' ? name.trim() : '';

        db.run(
            `INSERT INTO users (email, password_hash, two_factor_enabled, name) VALUES (?, ?, ?, ?)`,
            [email, passwordHash, enable2FA, userName],
            async function (err) {
                if (err) {
                    // Unique constraint violation -> duplicate email
                    if (err.message.includes('UNIQUE')) {
                        return res.status(409).json({ error: 'Email already in use' });
                    }
                    return res.status(500).json({ error: 'Database error' });
                }

                const newUserId = this.lastID;
                if (enable2FA) {
                    const code = Math.floor(100000 + Math.random() * 900000).toString();
                    twoFactorCodes.set(newUserId, {
                        code,
                        expiresAt: Date.now() + 5 * 60 * 1000,
                        rememberMe: false
                    }); 
                    const sent = await send2FACodeByEmail(code, email);     
                    if (!sent) {
                        return res.status(500).json({ error: 'Failed to send 2FA code. Please try again later.' });
                    }
                    
                    return res.status(201).json({
                        twoFactorRequired: true,
                        userId: newUserId
                    });
                }

                const token = jwt.sign(
                    { userId: newUserId },
                    JWT_SECRET,
                    { expiresIn: '1h' }
                );

                // Created successfully
                res.status(201).json({
                    authenticated: true,
                    token
                });
            }
        );

    } catch {
        res.status(500).json({ error: 'Server error' });
    }
});


app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { email, password, rememberMe = false } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    db.get(
      `SELECT id, password_hash, two_factor_enabled FROM users WHERE email = ?`,
      [email],
      async (err, user) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });

        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) return res.status(401).json({ error: 'Invalid credentials' });

        if (user.two_factor_enabled) {
          const code = Math.floor(100000 + Math.random() * 900000).toString();

          twoFactorCodes.set(user.id, {
            code,
            expiresAt: Date.now() + 5 * 60 * 1000,
            rememberMe: Boolean(rememberMe)
          });

          const sent = await send2FACodeByEmail(code, email);
          if (!sent) {
            return res.status(500).json({ error: 'Failed to send 2FA code. Please try again later.' });
          }

          return res.json({
            twoFactorRequired: true,
            userId: user.id
          });
        }

        // No 2FA = Issue JWT
        const token = jwt.sign(
          { userId: user.id },
          JWT_SECRET,
          { expiresIn: rememberMe ? '30d' : '1h' }
        );

        res.json({
          authenticated: true,
          token
        });
      }
    );

  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// Login endpoint: verifies credentials and handles optional 2FA.
// Flow:
// 1) Verify email/password against stored bcrypt hash.
// 2) If user has 2FA enabled, generate a short-lived code and return
//    a response indicating 2FA is required (actual delivery of the code
//    should be done via email/SMS in production).
// 3) If 2FA not enabled, issue a signed JWT (1 hour expiry).



app.post('/api/auth/2fa/verify', twoFALimiter, async (req, res) => {
  try {
    const { userId, code } = req.body;

    if (!userId || !code) {
      return res.status(400).json({ error: 'Missing userId or code' });
    }

    const stored = twoFactorCodes.get(userId);

    if (!stored) {
      return res.status(400).json({ error: 'No 2FA request found' });
    }

    if (Date.now() > stored.expiresAt) {
      twoFactorCodes.delete(userId);
      return res.status(401).json({ error: 'Verification code expired' });
    }

    if (stored.code !== code) {
      return res.status(401).json({ error: 'Invalid verification code' });
    }

    const remember = Boolean(stored.rememberMe);
    twoFactorCodes.delete(userId);

    // Issue JWT AFTER successful 2FA
    const token = jwt.sign(
      { userId },
      JWT_SECRET,
      { expiresIn: remember ? '30d' : '1h' }
    );

    res.json({
      authenticated: true,
      token
    });

  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// 2FA verification endpoint: checks the short-lived code previously
// generated during login. On successful verification the server issues
// the same JWT used for normal logins. Codes are deleted after use
// or when expired to prevent replay attacks.

// Get user profile endpoint: returns user info (name, email, created_at)
app.get('/api/user/profile', authenticateToken, (req, res) => {
  try {
    const userId = req.user.userId;

    db.get(
      'SELECT id, email, name, created_at FROM users WHERE id = ?',
      [userId],
      (err, user) => {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }
        if (!user) {
          return res.status(404).json({ error: 'User not found' });
        }

        db.get(
          'SELECT COUNT(*) as resume_count FROM resume_history WHERE user_id = ?',
          [userId],
          (err2, countRow) => {
            if (err2) {
              return res.status(500).json({ error: 'Database error' });
            }

            res.json({
              id: user.id,
              email: user.email,
              name: user.name || '',
              created_at: user.created_at,
              resume_count: countRow?.resume_count || 0
            });
          }
        );
      }
    );
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/user/resumes', authenticateToken, (req, res) => {
  const userId = req.user.userId;

  db.get(
    'SELECT id, filename, file_type, created_at, updated_at FROM resumes WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1',
    [userId],
    (err, currentResume) => {
      if (err) {
        console.error('Error fetching current resume:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      db.all(
        'SELECT id, filename, file_type, uploaded_at, replaced_at FROM resume_history WHERE user_id = ? ORDER BY replaced_at DESC',
        [userId],
        (err2, historyRows) => {
          if (err2) {
            console.error('Error fetching resume history:', err2);
            return res.status(500).json({ error: 'Database error' });
          }

          res.json({
            current: currentResume || null,
            history: historyRows || []
          });
        }
      );
    }
  );
});

// Update user profile endpoint: allows updating user name
app.put('/api/user/profile', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { name } = req.body;

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Name is required' });
    }

    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      return res.status(400).json({ error: 'Name cannot be empty' });
    }

    db.run(
      'UPDATE users SET name = ? WHERE id = ?',
      [trimmedName, userId],
      (err) => {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }

        res.json({
          success: true,
          message: 'Profile updated successfully',
          name: trimmedName
        });
      }
    );
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get 2FA status endpoint
app.get('/api/user/2fa-status', authenticateToken, (req, res) => {
  try {
    const userId = req.user.userId;

    db.get(
      'SELECT two_factor_enabled FROM users WHERE id = ?',
      [userId],
      (err, user) => {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }
        if (!user) {
          return res.status(404).json({ error: 'User not found' });
        }

        res.json({
          two_factor_enabled: Boolean(user.two_factor_enabled)
        });
      }
    );
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// Toggle 2FA endpoint
app.put('/api/user/2fa-toggle', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { enable } = req.body;

    if (typeof enable !== 'boolean') {
      return res.status(400).json({ error: 'Invalid request: enable must be a boolean' });
    }

    const twoFactorEnabled = enable ? 1 : 0;

    db.run(
      'UPDATE users SET two_factor_enabled = ? WHERE id = ?',
      [twoFactorEnabled, userId],
      (err) => {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }

        res.json({
          success: true,
          message: `Two-factor authentication ${enable ? 'enabled' : 'disabled'} successfully`,
          two_factor_enabled: enable
        });
      }
    );
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete account endpoint: allows users to permanently delete their account
app.delete('/api/user/account', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    // First, delete all saved jobs for this user
    db.run(
      'DELETE FROM saved_jobs WHERE user_id = ?',
      [userId],
      (err) => {
        if (err) {
          console.error('Error deleting saved jobs:', err);
          return res.status(500).json({ error: 'Failed to delete account data' });
        }

        // Then delete the user
        db.run(
          'DELETE FROM users WHERE id = ?',
          [userId],
          (deleteErr) => {
            if (deleteErr) {
              console.error('Error deleting user:', deleteErr);
              return res.status(500).json({ error: 'Failed to delete account' });
            }

            res.json({
              success: true,
              message: 'Account deleted successfully'
            });
          }
        );
      }
    );
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/admin/check', authenticateToken, requireAdmin, (req, res) => {
    res.json({ isAdmin: true });
});

app.get('/api/admin/users', authenticateToken, requireAdmin, (req, res) => {
    db.all('SELECT id, email, name FROM users', [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Database Error' });
        res.json(rows);
    });
});

 function runAdminDelete(sql, params) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) return reject(err);
            resolve(this.changes);
        });
    });
}

app.delete('/api/admin/users/:id', authenticateToken, requireAdmin, async(req, res) => {
    const id = req.params.id;
    try {
        await runAdminDelete('DELETE FROM job_matches WHERE resume_id in (SELECT id FROM resumes WHERE user_id = ?)', [id]);
        await runAdminDelete('DELETE FROM resume_history WHERE user_id = ?', [id]);
        await runAdminDelete('DELETE FROM resumes WHERE user_id = ?', [id]);
        await runAdminDelete('DELETE FROM saved_jobs WHERE user_id = ?', [id]);
        const deleted = await runAdminDelete('DELETE FROM users WHERE id = ?', [id]);
        res.json({ deleted });
    } catch (err) {
        console.error('Error deleting user:', err);
        res.status(500).json({ error: 'Database Error' });
    }
});

app.get('/api/admin/jobs', authenticateToken, requireAdmin, (req, res) => {
    db.all('SELECT id, title, company FROM job_listings', [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Database Error' });
        res.json(rows);
    });
});

app.delete('/api/admin/jobs/:id', authenticateToken, requireAdmin, async(req, res) => {
    const id = req.params.id;
    try {
        await runAdminDelete('DELETE FROM job_matches WHERE job_id = ?', [id]);
        const deleted = await runAdminDelete('DELETE FROM job_listings WHERE id = ?', [id]);
        res.json({ deleted });
    } catch (err) {
        console.error('Error deleting job:', err);
        res.status(500).json({ error: 'Database Error' });
    }
});

// Example protected route which requires a valid JWT. The `authenticateToken`
// middleware validates the token and exposes decoded payload in `req.user`.
app.get('/api/protected', authenticateToken, (req, res) => {
    res.json({ message: 'Access granted' });
});

/**
 * Search for jobs using JSearch API and store results in database
 * GET /api/jobs/search?query=term&page=1&country=us&date_posted=all
 */
app.get('/api/jobs/search', async (req, res) => {
    const startTime = Date.now();
    try{
        // Extract and validate query parameters
        const query = (req.query.query || '').toString();
        const page = parseInt(req.query.page, 10) || 1;
        const country = (req.query.country || 'us').toString();
        const date_posted = (req.query.date_posted || 'all').toString();
        
        // Validate required parameters
        if(!query) {
            return res.status(400).json({error: 'Missing query parameter: query'});
        }
        if(!JSEARCH_API_KEY) {
            return res.status(500).json({error: 'Server missing API configuration'});
        }

        const canUseJSearch = await jsearchQuotaCalculation();

        if (!canUseJSearch) {
            return res.status(429).json({ error: "Rate limit for JSearch reached" });
        }

        // Build JSearch API URL with parameters
        const url = `${JSEARCH_BASE_URL}/search?query=${encodeURIComponent(query)}&page=${page}&num_pages=1&country=${encodeURIComponent(country)}&date_posted=${encodeURIComponent(date_posted)}`;

        // Make request to JSearch API
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'x-rapidapi-key': JSEARCH_API_KEY,
                'x-rapidapi-host': 'jsearch.p.rapidapi.com'
            }
        });

        // Handle API errors
        if (!response.ok) {
            const text = await response.text();
            console.error(`✗ JSearch API error: ${response.status} - ${text.substring(0, 100)}`);
            return res.status(502).json({error: 'Failed to fetch jobs from JSearch'});
        }

        // Parse response and extract job data
        const data = await response.json();
        const jobs = Array.isArray(data.data) ? data.data : [];

        if (jobs.length === 0) {
            return res.json({count: 0, jobs: []});
        }
        
        // Store each job in database
        const ollamaTime = [];
        for (const job of jobs) {
            const row = mapJSearchJobToDB(job);
            if(!row.job_id) continue; // Skip jobs without valid ID
            try{
                const result = await upsertJobListing(db, row);
                if(result.ollamaTime > 0) {
                    ollamaTime.push(result.ollamaTime);
                    console.log(`Ollama: ${result.ollamaTime.toFixed(1)}s`);
                }
            } catch (e) {
                
            }
        }

        if(ollamaTime.length > 0){
            const averageTime = ollamaTime.reduce((a,b) => a + b, 0) / ollamaTime.length;
            console.log(`Average Ollama time: ${averageTime.toFixed(1)}s (${ollamaTime.length} summaries) `);
        }
        
        // Return mapped job data to client
        const result = jobs.map(mapJSearchJobToDB);
        res.json({count: result.length, jobs: result});
    }catch (err){
        const elapsed = Date.now() - startTime;
        console.error(`✗ Search error after ${(elapsed/1000).toFixed(1)}s: ${err.message}`);
        res.status(500).json({error: 'Internal server error'});
    }
});

/**
 * Retrieve job listings from database with optional search and pagination
 * GET /api/jobs?q=search&limit=50&offset=0
 */
app.get('/api/jobs', (req, res) =>{
    // Extract and validate query parameters
    const query = (req.query.q || '').toString().trim();
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100); // Cap at 100
    const offset = (parseInt(req.query.offset, 10) || 0); 

    const employmentType = (req.query.employment_type || '').toString().trim();
    const isRemote = (req.query.is_remote === 'true' || req.query.is_remote === '1' || req.query.is_remote === 1);
    const location = (req.query.location || '').toString().trim();
    const minSalary = (parseInt(req.query.salary_min, 10) || null);
    const datePosted = (req.query.posted_date || '').toString().trim();
    
    // Build dynamic WHERE clause for search - only show active jobs
    const params = [];
    let whereClause = "WHERE status = 'active'"; // Only show active jobs
    
    if (query) {
        whereClause += ` AND (title LIKE ? OR company LIKE ? OR location LIKE ?)`;
        const likeQuery = `%${query}%`;
        params.push(likeQuery, likeQuery, likeQuery);
    }

    if(employmentType) {
        let searchPattern = '';
        if(employmentType === 'full_time') {
            searchPattern = '%Full-time%';
        } else if (employmentType ==='part_time') {
            searchPattern = '%Part-time%';
        } else if (employmentType === 'contract') {
            searchPattern = '%Contractor%';
        } else if(employmentType === 'internship') {
            searchPattern = '%Intern%';
        } else {
            searchPattern = `%${employmentType}%`;
        }
        whereClause += ` AND employment_type IS NOT NULL AND employment_type LIKE ?`;
        params.push(searchPattern);
    }

    if (isRemote) {
        whereClause += ` AND is_remote = 1`;
    }

    if (location){
        whereClause += ` AND location LIKE ?`;
        params.push(`%${location}%`);
    }

    if (minSalary && minSalary > 0) {
        whereClause += ` AND (salary_min IS NOT NULL AND salary_min >= ? OR salary_max IS NOT NULL AND salary_max >= ?)`;
        params.push(minSalary, minSalary);
    }
    
    if (datePosted){
        const now = new Date();
        let cutOffDate = null;
        if (datePosted === '24H') {
            cutOffDate = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
        } else if (datePosted === '7D') {
            cutOffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        } else if (datePosted === '30D') {
            cutOffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        }

        if (cutOffDate) {
            whereClause += ` AND posted_date >= ?`;
            params.push(cutOffDate.toISOString());
        } 
    }

    // Construct SQL query with search and pagination - include new columns
    const sql = `SELECT id, job_id, title, company, location, employment_type, description, description_summary, apply_link, is_remote, posted_date, salary_min, salary_max, status, expiration_method, expires_at, created_at
                 FROM job_listings ${whereClause}
                 ORDER BY created_at DESC
                 LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    
    // Execute query and return results
    db.all(sql, params, (err, rows) => {
        if (err) {
            console.error('Error fetching jobs from database:', err.message);
            return res.status(500).json({error: 'Failed to fetch jobs'});
        }
        res.json({count: rows.length, jobs: rows});
    });
});

// Create main job_listings table for storing job data from external APIs
db.run(`
    CREATE TABLE IF NOT EXISTS job_listings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT UNIQUE,
        title TEXT,
        company TEXT,
        location TEXT,
        employment_type TEXT,
        description TEXT,
        description_summary TEXT,
        apply_link TEXT,
        is_remote BOOLEAN,
        posted_date TEXT,
        salary_min INTEGER,
        salary_max INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'active',
        expiration_method TEXT DEFAULT 'posted_date',
        expires_at DATETIME
    )
`);

db.run(`
    CREATE TABLE IF NOT EXISTS resumes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL UNIQUE,
        filename TEXT NOT NULL,
        file_type TEXT NOT NULL,
        raw_text TEXT,
        skills TEXT,
        experience TEXT,
        education TEXT,
        contact_info TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )
`);

db.run(`
    CREATE TABLE IF NOT EXISTS resume_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        filename TEXT NOT NULL,
        file_type TEXT NOT NULL,
        raw_text TEXT,
        skills TEXT,
        experience TEXT,
        education TEXT,
        contact_info TEXT,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        replaced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )
`);

db.run(`
    CREATE TABLE IF NOT EXISTS job_matches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        resume_id INTEGER NOT NULL,
        job_id INTEGER NOT NULL,
        matched_score INTEGER NOT NULL,
        breakdown_json TEXT,
        matched_skills_json TEXT,
        missing_skills_json TEXT,
        calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (resume_id) REFERENCES resumes(id),
        FOREIGN KEY (job_id) REFERENCES job_listings(id),
        UNIQUE(resume_id, job_id)
    )
`);


/**
 * Get a precomputed match between the authenticated user's resume and
 * a specific job listing. Returns whether the user has an uploaded resume
 * and, if available, the score and matching breakdown stored in
 * `job_matches` for this resume/job pair.
 * GET /api/jobs/:id/match
 */
app.get('/api/jobs/:id/match', authenticateToken, (req, res) => {
    const jobId = parseInt(req.params.id, 10);
    const userId = req.user.userId;

    if (isNaN(jobId)){
        return res.status(400).json({ error: 'Invalid job ID'}); 
    }

    db.get('SELECT id FROM resumes WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1', [userId], (err, resume) => {
        if (err) {
            console.error('Error fetching resumes', err);
            return res.status(500).json({ error: 'Database error' });
        }

        if (!resume) {
            return res.json({ hasResume: false, match: null});
        }

        db.get(
            `SELECT matched_score, breakdown_json, matched_skills_json, missing_skills_json 
            FROM job_matches
            WHERE resume_id = ? AND job_id = ?`,
            [resume.id, jobId],
            (err, match) => {
                if (err) {
                    console.error('Error fetching matches', err);
                    return res.status(500).json({ error: 'Database error' });
                }
                
                if (!match) {
                    console.error('Could not find matches', err);
                    return res.json({ hasResume: true, match: null});
                }

                res.json({
                    hasResume: true,
                    match: {
                        score: match.matched_score, 
                        breakdown: JSON.parse(match.breakdown_json || '{}'),
                        matchedSkills: JSON.parse(match.matched_skills_json || '{}'),
                        missingSkills: JSON.parse(match.missing_skills_json || '{}')
                    }
                });
            }
        );
    });
});

app.get('/api/matches', authenticateToken, (req, res) => {
    const userId = req.user.userId;

    db.get('SELECT id FROM resumes WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1', [userId], (err, resume) => {
       if (err) {
        console.error('Error fetching resume:', err);
        return res.status(500).json({Error: 'Database error'});
       } 

       if (!resume){
        return res.json({
            hasResume: false,
            matches: {}
        });
       }

       db.all(
            `SELECT job_id, matched_score, breakdown_json, matched_skills_json, missing_skills_json 
            FROM job_matches
            WHERE resume_id = ?`,
            [resume.id], 
            (err, rows) => {
                if (err) {
                    console.error('Error fetching matches:', err);
                    return res.status(500).json({Error: 'Database error'});
                }
                const matchesMap = {};
                for (const row of rows){
                    matchesMap[row.job_id] = {
                        score: row.matched_score,
                        breakdown: JSON.parse(row.breakdown_json || '{}'),
                        matchedSkills: JSON.parse(row.matched_skills_json || '{}'),
                        missingSkills: JSON.parse(row.missing_skills_json || '{}')
                    };
                }
                res.json({
                    hasResume: true,
                    matches: matchesMap
                }); 
            }
        );

    });
});

/**
 * GET /jobs
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
app.get('/jobs', authenticateToken, (req, res,) => {

    const userId = req.user.userId;

    db.all('SELECT * FROM saved_jobs WHERE user_id = ?', [userId], (err, rows) => {
        if (err) {
            console.error('Error fetching jobs:', err.message);
            return res.status(500).json({error: 'Failed to fetch jobs'});
        }
        res.json(rows);
    });
});

/**
 * Get total count of job listings with optional search filter
 * Subtracts saved jobs to give accurate count of displayable jobs
 * GET /api/jobs/count?q=search
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
app.get('/api/jobs/count', optionalAuthenticateToken, (req, res) => {
    const query = (req.query.q || '').toString().trim();
    const employmentType = (req.query.employment_type || '').toString().trim(); 
    const isRemote = (req.query.is_remote === 'true' || req.query.is_remote === '1' || req.query.is_remote === 1);
    const location = (req.query.location || '').toString().trim();
    const minSalary = (parseInt(req.query.salary_min, 10) || null);
    const datePosted = (req.query.posted_date || req.query.datePosted || '').toString().trim();

    // Build search parameters for job_listings
    const params = [];
    let whereClause = "WHERE jl.status = 'active'";

    if (query) {
        whereClause += ` AND (jl.title LIKE ? OR jl.company LIKE ? OR jl.location LIKE ?)`;
        const likeQuery = `%${query}%`;
        params.push(likeQuery, likeQuery, likeQuery);
    }

    if(employmentType) {
        let searchPattern = '';
        if(employmentType === 'full_time') {
            searchPattern = '%Full-time%';
        } else if (employmentType ==='part_time') {
            searchPattern = '%Part-time%';
        } else if (employmentType === 'contract') {
            searchPattern = '%Contractor%';
        } else if(employmentType === 'internship') {
            searchPattern = '%Intern%';
        } else {
            searchPattern = `%${employmentType}%`;
        }
        whereClause += ` AND jl.employment_type IS NOT NULL AND jl.employment_type LIKE ?`;
        params.push(searchPattern);
    }

    if (isRemote) {
        whereClause += ` AND jl.is_remote = 1`;
    }

    if (location){
        whereClause += ` AND jl.location LIKE ?`;
        params.push(`%${location}%`);
    }

    if (minSalary && minSalary > 0) {
        whereClause += ` AND (jl.salary_min IS NOT NULL AND jl.salary_min >= ? OR jl.salary_max IS NOT NULL AND jl.salary_max >= ?)`;
        
        params.push(minSalary, minSalary);
    }
    
    if (datePosted){
        const now = new Date();
        let cutOffDate = null;
        if (datePosted === '24H') {
            cutOffDate = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
        } else if (datePosted === '7D') {
            cutOffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        } else if (datePosted === '30D') {
            cutOffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        }

        if (cutOffDate) {
            whereClause += ` AND jl.posted_date >= ?`;
            params.push(cutOffDate.toISOString());
        } 
    }

    const userId = req.user && req.user.userId;
    const savedFilter = userId
            ? `AND NOT EXISTS (
            SELECT 1 FROM saved_jobs sj
            WHERE sj.user_id = ?
            AND sj.title = jl.title
            AND sj.company = jl.company
            AND sj.status = 'saved'
        )` 
        : '';


    const countParams = userId ? [...params, userId] : params;

    const countSQL = `
        SELECT COUNT(*) as total 
        FROM job_listings jl
        ${whereClause}
        ${savedFilter}
    `;

    db.get(countSQL, countParams, (err, row) => {
        if (err) {
            console.error('Error counting jobs:', err.message);
            return res.status(500).json({error: 'Failed to count jobs'});
        }

        res.json({ total: row ? row.total : 0 });
    });
});
/**
 * Mark expired jobs as expired based on their expiration dates
 * POST /api/jobs/mark-expired
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
app.post('/api/jobs/mark-expired', (req, res) => {
    // Get current time in ISO format
    const currentTime = new Date().toISOString();
    
    // SQL query to mark jobs as expired if their expires_at date has passed
    const sql = `
        UPDATE job_listings 
        SET status = 'expired' 
        WHERE status = 'active' 
        AND expires_at IS NOT NULL 
        AND expires_at <= ?
    `;
    
    // Execute the update query
    db.run(sql, [currentTime], function(err) {
        if (err) {
            console.error('Error marking expired jobs:', err.message);
            return res.status(500).json({error: 'Failed to mark expired jobs'});
        }
        
        // Return how many jobs were marked as expired
        res.json({ 
            message: 'Expired jobs marked successfully',
            expired_count: this.changes 
        });
    });
});

/**
 * POST /jobs
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
app.post('/jobs', authenticateToken, (req, res) => {
    const {title, company, date, link, notes, status} = req.body;
    const userId = req.user.userId
    const query = 'INSERT INTO saved_jobs (title, company, date, link, notes, status, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)';
    db.run(query, [title, company, date, link, notes, status || 'saved', userId], function (err) {
        if (err) {
            console.error('Error putting jobs:', err.message);
            return res.status(500).json({error: 'Failed to create job'});
        }
        res.status(201).json({id: this.lastID});
    });
});

/**
 * Update an existing job entry
 * PUT /jobs/:id
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
app.put('/jobs/:id', authenticateToken, (req, res) =>{
    const userId = req.user.userId;
    const jobId = req.params.id;
    const {title, company, date, link, notes, status} = req.body;
    const query = 'UPDATE saved_jobs SET title = ?, company = ?, date = ?, link = ?, notes = ?, status = ? WHERE id = ? AND user_id = ?';
    db.run(query, [title, company, date, link, notes, status || 'saved', jobId, userId], function(err) {
        if (err) {
            console.error('Error updating jobs:', err.message);
            return res.status(500).json({error: 'Failed to update job'});
        }
        res.json({updated: this.changes});
    });
});

/**
 * Delete a job entry
 * DELETE /jobs/:id
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
app.delete('/jobs/:id', authenticateToken, (req, res) =>{
    const userId = req.user.userId;
    const jobId = req.params.id;
    db.run('DELETE FROM saved_jobs WHERE id = ? AND user_id = ?', [jobId, userId], function(err){
         if (err) {
            console.error('Error deleting jobs:', err.message);
            return res.status(500).json({error: 'Failed to delete job'});
        }
        res.json({deleted: this.changes});
    })
}); 

app.post('/api/jobs/summarize-description', async(req, res) => {
    const startTime = Date.now();
    try {
        const {description} = req.body;
        if (!description || typeof description !== 'string') {
            return res.status(400).json({error: 'Description is required'});
        }
        if (!ollamaAvailable) {
            return res.status(500).json({error: 'Ollama is not available. Make sure Ollama is running and the model is installed.'});
        }

        const summary = await generateJobDescriptionSummary(description);
        const elapsed = Date.now() - startTime;
        console.log(`✓ Summary endpoint: ${(elapsed/1000).toFixed(1)}s`);

        res.json({summary: summary || ''});
    } catch (err){
        const elapsed = Date.now() - startTime;
        console.error(`✗ Summary endpoint error after ${(elapsed/1000).toFixed(1)}s: ${err.message}`);
        res.status(500).json({error: 'Internal server error: ' + err.message});
    }
});

/**
 * Parses resume content from PDF or DOCX files
 * @param {Buffer} fileBuffer - The file buffer content
 * @param {string} mimetype - The MIME type of the file (pdf or docx)
 * @returns {Promise<string>} Extracted text content from the resume
 * @throws {Error} If file type is unsupported or parsing fails
 */
async function parseResume(fileBuffer, mimetype) {
    try {
        if (mimetype === 'application/pdf') {
            const parser = new pdfParse.PDFParse({ data: fileBuffer });
            const result = await parser.getText();
            return result.text;
        } else if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            const result = await mammoth.extractRawText({buffer: fileBuffer});
            return result.value;
        } else {
            throw new Error('Unsupported file type, only pdf or docx are allowed');
        }
    } catch (err) {
        console.error('Error parsing resumes', err);
        throw new Error('Unable to parse resume, please verify file type: ' + err.message);
    }
}




app.post('/api/resume/upload', authenticateToken, upload.single('resume'), async (req, res) => {
    const userId = req.user.userId;
    try {
        if (!req.file){
            return res.status(400).json({error: 'No file uploaded'});
        }
        const {originalname, mimetype, buffer} = req.file;
        const parsedResume = await parseResumeWithGemini(buffer, mimetype);
        const rawText = parsedResume.rawText;

        if (!rawText || rawText.trim().length === 0){
            return res.status(400).json({error: 'Could not extract text from resume file'});
        }

        const fileType = 'pdf';
        const skillsText = parsedResume.skills.join(', ');
        const experienceText = parsedResume.experience.join(', ');
        const educationText = parsedResume.education.join(', ');
        const contactInfoText = JSON.stringify(parsedResume.contactInfo);

        db.get('SELECT * FROM resumes WHERE user_id = ?', [userId], (err, existingResume) => {
            if (err) {
                return res.status(500).json({error: 'Failed to query existing resume'});
            }

            const completeUpload = async (resumeId) => {
                try {
                    await finishResumeUpload(res, originalname, rawText, resumeId);
                } catch (err) {
                    console.error('Error completing resume upload:', err);
                }
            };

            const saveNewResume = () => {
                db.run(
                    `INSERT INTO resumes (user_id, filename, file_type, raw_text, skills, experience, education, contact_info, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                    [userId, originalname, fileType, rawText, skillsText, experienceText, educationText, contactInfoText],
                    function(err) {
                        if (err) {
                            return res.status(500).json({error: 'Failed to save resume to database'});
                        }
                        completeUpload(this.lastID);
                    }
                );
            };

            const replaceExistingResume = () => {
                db.serialize(() => {
                    db.run(
                        `INSERT INTO resume_history (user_id, filename, file_type, raw_text, skills, experience, education, contact_info, uploaded_at, replaced_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                        [
                            userId,
                            existingResume.filename,
                            existingResume.file_type,
                            existingResume.raw_text,
                            existingResume.skills,
                            existingResume.experience,
                            existingResume.education,
                            existingResume.contact_info,
                            existingResume.created_at || new Date().toISOString()
                        ],
                        function(err) {
                            if (err) {
                                return res.status(500).json({error: 'Failed to archive existing resume'});
                            }

                            db.run(
                                `UPDATE resumes SET filename = ?, file_type = ?, raw_text = ?, skills = ?, experience = ?, education = ?, contact_info = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`,
                                [originalname, fileType, rawText, skillsText, experienceText, educationText, contactInfoText, userId],
                                function(err) {
                                    if (err) {
                                        return res.status(500).json({error: 'Failed to replace existing resume'});
                                    }

                                    db.get('SELECT id FROM resumes WHERE user_id = ?', [userId], async (e2, row2) => {
                                        if (e2 || !row2) {
                                            return res.status(500).json({ err: 'Could not resolve resume id after save' });
                                        }
                                        completeUpload(row2.id);
                                    });
                                }
                            );
                        }
                    );
                });
            };

            if (existingResume) {
                replaceExistingResume();
            } else {
                saveNewResume();
            }
        });
    } catch (err) {
        res.status(500).json({error: 'Failed to process resume: ' + err.message});
    };
});

async function finishResumeUpload(res, originalName, rawText, resumeId) {
    console.log('Starting match calculation for active jobs');

    try {
        const matchStats = await calculateAllMatches(resumeId, rawText);
        console.log(`Match calculation complete: ${matchStats.jobsProcessed} jobs processed`);
        res.json({
            message: 'Resume uploaded and parsed successfully',
            id: resumeId,
            filename: originalName,
            text_length: rawText.length,
            matchesCalculated: matchStats.jobsProcessed,
            averageScore: matchStats.averageScore
        });

    } catch (matchError) {
        console.error('Match calculation error: ', matchError);
        res.json({
            message: 'Resume uploaded successfully, match calculation pending',
            id: resumeId,
            filename: originalName,
            text_length: rawText.length,
            matchesCalculated: 0
        });
    }
}


               

/**
 * Calculates match scores between a resume and all active job listings
 * Clears previous matches and recalculates scores for the uploaded resume
 * @param {number} resumeID - The ID of the uploaded resume
 * @param {string} rawText - The raw text content of the resume
 * @returns {Promise<Object>} Object containing jobsProcessed count and averageScore
 */
function calculateAllMatches(resumeID, rawText) {
    return new Promise((resolve, reject) => {
        // Clear previous matches for this resume
        db.run('DELETE FROM job_matches WHERE resume_id = ?', [resumeID], (err) =>{
            if (err) {
                console.error('Could not delete previous job matches:', err);
                return reject(err);
            }
            
            // Fetch all active job listings
            db.all(
                `SELECT id, title, description FROM job_listings WHERE status = 'active'`,
                [],
                (err, jobs) =>{
                    if (err) {
                        console.error('Error fetching jobs from job_listings', err);
                        return reject(err);
                    }

                    if (!jobs || jobs.length === 0) {
                        return resolve({jobsProcessed: 0, averageScore: 0});
                    }

                    let totalScore = 0;
                    let jobsProcessed = 0;
                    let jobsToProcess = jobs.length;

                    // Calculate matches for each job
                    for (const job of jobs) {
                        if (!job.description) {
                          jobsToProcess--;
                          continue;
                        }

                        // Calculate match score between resume and job
                        const matchResult = calculateMatchScore(rawText, job.description, job.title || '');

                        // Store match result in database
                        db.run(
                            `INSERT OR REPLACE INTO job_matches
                            (resume_id, job_id, matched_score, breakdown_json, matched_skills_json, missing_skills_json, calculated_at) 
                            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                            [
                                resumeID,
                                job.id,
                                matchResult.score,
                                JSON.stringify(matchResult.breakdown),
                                JSON.stringify(matchResult.matchedSkills),
                                JSON.stringify(matchResult.missingSkills),
                            ], 
                            (err) => {
                                if (err) {
                                    console.error(`Error saving match for job ${job.id}: `, err);
                                }

                                totalScore += matchResult.score;
                                jobsProcessed++;

                                // Resolve when all jobs have been processed
                                if (jobsProcessed === jobsToProcess) {
                                    const averageScore = jobsProcessed > 0 ? Math.round(totalScore / jobsProcessed) : 0; 
                                    resolve({
                                        jobsProcessed,
                                        averageScore
                                    });
                                }
                            }
                        );
                    }

                    // Handle edge case where there are no jobs with descriptions
                    if (jobsToProcess === 0) {
                        resolve({
                            jobsProcessed: 0,
                            averageScore: 0
                        });
                    }
                }
            );
        });
    });
}

/**
 * Recalculate match scores for a single job across all stored resumes.
 * This is invoked after a job is created or updated so stored resumes can
 * be re-scored against the new/changed job description.
 * @param {number|string} jobID - Job identifier in `job_listings`
 * @param {string} jobTitle - Job title (optional)
 * @param {string} jobDesc - Full job description text
 */
function recalculateMatches(jobID, jobTitle, jobDesc) {
    if (!jobDesc) {
        console.log("Skipping job, missing description", jobID);
        return;
    }

    db.all('SELECT id, raw_text FROM resumes', [], (err, resumes) => {
        if (err) {
            console.error('Error fetching resumes for match recalculation', err);
            return;
        }

        if (!resumes || resumes.length === 0) {
            console.log('Resume not found');
            return;
        }

        for (const resume of resumes){
            if (!resume.raw_text){
                continue;
            }

            const matchResult = calculateMatchScore(resume.raw_text, jobDesc, jobTitle || '');

            db.run(
                `INSERT or REPLACE INTO job_matches
                (resume_id, job_id, matched_score, breakdown_json, matched_skills_json, missing_skills_json, calculated_at)
                VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                [
                    resume.id,
                    jobID,
                    matchResult.score,
                    JSON.stringify(matchResult.breakdown),
                    JSON.stringify(matchResult.matchedSkills),
                    JSON.stringify(matchResult.missingSkills)
                ],
                (err) =>{
                    if (err){
                        console.error(`Error saving match for job ${jobID}: `, err);
                    } else {
                        console.log(`Match score recalculated for ${jobID}`, matchResult.score);
                    }

                }

            );
        }
        
        
    });


}

app.get('/api/resume', authenticateToken, (req, res) => {
    const userId = req.user.userId;

    db.get('SELECT * FROM resumes WHERE user_id = ?', [userId], (err, row) => {

    if (err) {
        console.error('Error fetching resumes', err);
        return res.status(500).json({Error: 'Failed to fetch resume'});
    }

    if (!row) {
        console.error('No resume found in database');
        return res.status(404).json({Error: 'Resume not found'});
    }

    const resume = {
        id: row.id, 
        filename: row.filename,
        file_type: row.file_type,
        raw_text: row.raw_text,
        skills: row.skills ? row.skills.split(', ') : [],
        experience: row.experience,
        education: row.education,
        contact_info: row.contact_info ? JSON.parse(row.contact_info) : null,
        created_at: row.created_at,
        updated_at: row.updated_at
    };

    res.json(resume);
    });
});

/**
 * Remove the authenticated user's resume and delete any associated job match scores
 * DELETE /api/resume/remove
 */
app.delete('/api/resume/remove', authenticateToken, (req, res) => {
    const userId = req.user.userId;

    db.get('SELECT id FROM resumes WHERE user_id = ?', [userId], (err, row) => {
        if (err) {
            console.error('Error fetching resume for deletion', err);
            return res.status(500).json({error: 'Failed to remove resume'});
        }

        if (!row) {
            return res.status(404).json({error: 'No resume found to remove'});
        }

        const resumeId = row.id;

        db.serialize(() => {
            db.run('DELETE FROM job_matches WHERE resume_id = ?', [resumeId], function (err) {
                if (err) {
                    console.error('Error deleting resume match scores', err);
                }
            });

            db.run('DELETE FROM resumes WHERE id = ?', [resumeId], function (err) {
                if (err) {
                    console.error('Error deleting resume', err);
                    return res.status(500).json({error: 'Failed to remove resume'});
                }

                res.json({message: 'Resume removed successfully'});
            });
        });
    });
});

/**
 * Health check endpoint
 * GET /
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
app.get('/', (req, res) => {
    res.send('Backend is running!');
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server started at http://localhost:${PORT}`);
});


