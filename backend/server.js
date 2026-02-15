// Load environment variables from .env file
require('dotenv').config();

// Import required dependencies
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const fetch = require('node-fetch');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const bcrypt = require('bcrypt');
const twoFactorCodes = new Map();

// Initialize Express application
const app = express();
const PORT = process.env.PORT || 3000;

// Configure middleware
app.use(cors()); // Enable CORS for cross-origin requests
app.use(express.json()); // Parse JSON request bodies

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

// Ollama configuration
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL;
const OLLAMA_MODEL = process.env.OLLAMA_MODEL;

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

/**
 * Checks if Ollama AI service is available at the configured URL
 * Updates ollamaAvailable flag based on connection status
 */
async function checkOllamaAvailability() {
    try {
        const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
        if (response.ok) {
            ollamaAvailable = true;
            console.log(`Ollama connected successfully at ${OLLAMA_BASE_URL} using model: ${OLLAMA_MODEL}`);
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

db.run(`
    CREATE TABLE IF NOT EXISTS saved_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        company TEXT,
        date TEXT,
        link TEXT,
        notes TEXT,
        status TEXT DEFAULT 'saved'
    )
`);

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
        - Write a single, well structured paragraph (50-100 words)
        - Focus on the most important aspects: role purpose, key responsibilities, essential requriments, and notable benefits
        - Use clear, professional language suitable for job seekers
        - Avoid redundancy and generic phrases 
        - Prioritize specfic techincal skills, qualifications, and responsibilities over vague descriptions,
        - If salary/compensation is mentioned, include it
        - If remote work options are specified, mention them 
        - Maintain a neutral, informative tone 

        OUTPUT FORMAT: 
        Write only the summary paragraph. Do not include headers, bullet points, or formatting marks. The summary should flow naturally as a single paragraph.

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

app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (password.length < 12) {
      return res.status(400).json({ error: 'Password must be at least 12 characters' });
    }

    // Hash password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Insert user
    const query = `
      INSERT INTO users (email, password_hash)
      VALUES (?, ?)
    `;

    db.run(query, [email, passwordHash], function (err) {
      if (err) {
        if (err.message.includes('UNIQUE')) {
          return res.status(409).json({ error: 'Email already in use' });
        }
        return res.status(500).json({ error: 'Database error' });
      }

      res.status(201).json({
        message: 'User created successfully',
        userId: this.lastID
      });
    });

  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});


app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Look up user in DB
    db.get(
      `SELECT id, password_hash, two_factor_enabled FROM users WHERE email = ?`,
      [email],
      async (err, user) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ error: 'Database error' });
        }

        // User not found
        if (!user) {
          return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Compare password with bcrypt
        const passwordMatch = await bcrypt.compare(
          password,
          user.password_hash
        );

        if (!passwordMatch) {
          return res.status(401).json({ error: 'Invalid credentials' });
        }

        // If user has 2FA enabled
        if (user.two_factor_enabled) {
          const code = Math.floor(100000 + Math.random() * 900000).toString();

          twoFactorCodes.set(user.id, {
            code,
            expiresAt: Date.now() + 5 * 60 * 1000 // 5 minutes
          });

          // In real app email the code here
          console.log(`2FA code for ${email}: ${code}`);

          return res.status(200).json({
            message: '2FA required',
            twoFactorRequired: true,
            userId: user.id
          });
        }

        // Login success (no 2FA)
        res.status(200).json({
          message: 'Login successful',
          authenticated: true
        });
      }
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});



app.post('/api/auth/2fa/verify', async (req, res) => {
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

    twoFactorCodes.delete(userId);

    res.status(200).json({
      message: '2FA verification successful',
      authenticated: true
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
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
        filename TEXT UNIQUE NOT NULL,
        file_type TEXT NOT NULL,
        raw_text TEXT,
        skills TEXT,
        experience TEXT,
        education TEXT,
        contact_info TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

db.run(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        two_factor_enabled BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

app.get('/api/jobs/:id/match', (req, res) => {
    const jobId = parseInt(req.params.id, 10);

    if (isNaN(jobId)){
        return res.status(400).json({ error: 'Invalid job ID'}); 
    }

    db.get('SELECT id FROM resumes ORDER BY updated_at DESC LIMIT 1', [], (err, resume) => {
        if (err) {
            console.error('Error fetching resumes', err);
            return res.status(500).json({ error: 'Database error' });

        } 

        if (!resume) {
            console.error('Could not find resume', err);
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

app.get('/api/matches', (req, res) => {
    db.get('SELECT id FROM resumes ORDER BY updated_at DESC LIMIT 1', [], (err, resume) => {
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
app.get('/jobs', (req, res) => {
    db.all('SELECT * FROM saved_jobs', [], (err, rows) => {
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
app.get('/api/jobs/count', (req, res) => {
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


    // Count job_listings that don't have a matching saved_job (by title and company)
    // This gives accurate count of jobs that will actually be displayed
    const countSQL = `
        SELECT COUNT(*) as total 
        FROM job_listings jl
        ${whereClause}
        AND NOT EXISTS (
            SELECT 1 FROM saved_jobs sj 
            WHERE sj.title = jl.title 
            AND sj.company = jl.company
            AND sj.status = 'saved'
        )
    `;

    db.get(countSQL, params, (err, row) => {
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
app.post('/jobs', (req, res) => {
    const {title, company, date, link, notes, status} = req.body;
    const query = 'INSERT INTO saved_jobs (title, company, date, link, notes, status) VALUES (?, ?, ?, ?, ?, ?)';
    db.run(query, [title, company, date, link, notes, status || 'saved'], function (err) {
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
app.put('/jobs/:id', (req, res) =>{
    const jobId = req.params.id;
    const {title, company, date, link, notes, status} = req.body;
    const query = 'UPDATE saved_jobs SET title = ?, company = ?, date = ?, link = ?, notes = ?, status = ? WHERE id = ?';
    db.run(query, [title, company, date, link, notes, status || 'saved', jobId], function(err) {
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
app.delete('/jobs/:id', (req, res) =>{
    const jobId = req.params.id;
    db.run('DELETE FROM saved_jobs WHERE id = ?', [jobId], function(err){
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

/**
 * Extracts structured data from resume text (contact info, skills, experience, education)
 * TODO: Implement comprehensive resume data extraction to populate resume fields
 * @param {string} text - Raw resume text
 * @returns {Object|null} Structured resume data or null if not implemented
 */
function extractResumeData(text){
    // TODO: Parse resume text to extract:
    // - Contact information (email, phone, linkedin)
    // - Skills section
    // - Work experience
    // - Education
    return null;
}



app.post('/api/resume/upload', upload.single('resume'), async (req, res) => {
    const startTime = Date.now();
    try {
        if (!req.file){
            return res.status(400).json({error: 'No file uploaded'});
        }
        const {originalname, mimetype, buffer} = req.file;
        console.log(`\n Uploading resume: ${originalname} (${mimetype})`);
        const rawText = await parseResume(buffer, mimetype);
        if (!rawText || rawText.trim().length === 0){
            return res.status(400).json({error: 'Could not extract text from resume file'});
        }

        const fileType = mimetype === 'application/pdf' ? 'pdf' : 'docx';
        db.run(
            `INSERT OR REPLACE INTO resumes (filename, file_type, raw_text, skills, experience, education, contact_info, updated_at)
            VALUES (?, ?, ?, NULL, NULL, NULL, NULL, CURRENT_TIMESTAMP)`,
            [originalname, fileType, rawText],
            async function(err){
                if (err) {
                    console.error('Error saving resume:', err);
                    return res.status(500).json({err: 'Failed to save resume to database'});
                }

                const resumeID = this.lastID;

                const elapsed = Date.now() - startTime;
                console.log(`Resume was saved: ${originalname} (${(elapsed/1000).toFixed(1)}s)`)

                console.log('Starting match calculation for active jobs');

                try {
                    const matchStats = await calculateAllMatches(resumeID, rawText);
                    console.log(`Match calculation complete: ${matchStats.jobsProcessed} jobs processed`);
                    res.json({
                        message: 'Resume uploaded and parsed successfully',
                        id: resumeID,
                        filename: originalname,
                        text_length: rawText.length,
                        matchesCalculated: matchStats.jobsProcessed ,
                        averageScore: matchStats.averageScore
                    });

                } catch (matchError) {
                    console.error('Match calculation error: ', matchError);
                    res.json({
                        message: 'Resume uploaded successfully, match calculation pending',
                        id: resumeID,
                        filename: originalname,
                        text_length: rawText.length,
                        matchesCalculated: 0
                    });
                }
            }
        );
    } catch (err) {
        const elapsed = Date.now() - startTime;
        console.error(`Resume upload error after (${(elapsed/1000).toFixed(1)}s: ${err.message})`);
        res.status(500).json({error: 'Failed to process resume: ' + err.message});
    }
});

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

function recalculateMatches(jobID, jobTitle, jobDesc) {
    if (!jobDesc) {
        console.log("Skipping job, missing description", jobID);    
        return;
    }

    db.get('SELECT id, raw_text FROM resumes ORDER BY updated_at DESC LIMIT 1', [], (err, resume) => {
        if (err) {
            console.err('Error fetching resumes for match recalculation', err);
            return;
        }

        if (!resume || !resume.rawText) {
            console.log('Resume not found');
            return;
        }

        const matchResult = calculateMatchScore(resume.raw_text, jobDesc, jobTitle || '');
        
        db.run(
            `INSERT or REPLACE INTO job_matches
            (resume_id, job_id, match_score, breakdown_json, matched_skills_json, missing_skills_json, calculated_at)
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
    });


}

app.get('/api/resume', (req, res) => {
    db.get('SELECT * FROM resumes ORDER BY updated_at DESC LIMIT 1', [], (err, row) => {

    
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



