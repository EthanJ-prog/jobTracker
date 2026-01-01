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

let ollamaAvailable = false;
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
        - Maintain a neutral, infromative tone 

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
                resolve({changes: this.changes, ollamaTime: ollamaTime});
            }
        );
    });
}

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
    const isRemote = (req.query.isRemote === 'true' || req.query.isRemote === '1' || req.query.isRemote === 1);
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
        throw new Error('Unable to parse resume, please pass in file type', err);
    }
}

// Will work on this in the future 
function extractResumeData(text){
    return null
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
            function(err){
                if (err) {
                    console.error('Error saving resume:', err);
                    return res.status(500).json({err: 'Failed to save resume to database'});
                }
                const elapsed = Date.now() - startTime;
                console.log(`Resume was saved: ${originalname} (${(elapsed/1000).toFixed(1)}s)`)

                res.json({
                    message: 'Resume uploaded and parsed succesfully',
                    id: this.lastID,
                    filename: originalname,
                    text_length: rawText.length
                });
            }
        );
    } catch (err) {
        const elapsed = Date.now() - startTime;
        console.error(`Resume upload error after (${(elapsed/1000).toFixed(1)}s: ${err.message})`);
        res.status(500).json({error: 'Failed to process resume: ' + err.message});

    }
});

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



