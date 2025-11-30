# Pathfinder - Job Tracker

A web application to search for jobs and track your job applications in one place.

## Features

- **Career Compass** - Search and browse job listings with filters
- **Progress Map** - Kanban-style tracker to manage your applications
- **Resume Upload** - Upload and parse your resume (PDF or DOCX)
- **Job Descriptions** - AI-powered job description summaries (optional)

## Setup Instructions

### Prerequisites

- Node.js (v14+) - [Download](https://nodejs.org/)
- RapidAPI Account for JSearch API - [Sign up free](https://rapidapi.com)

### Step 1: Get API Key

1. Go to [RapidAPI](https://rapidapi.com)
2. Search for "JSearch" and subscribe (free tier available)
3. Copy your API key

### Step 2: Configure Environment

Create a `.env` file in the `backend/` folder:

```
PORT=3000
JSEARCH_API_KEY=paste_your_api_key_here
JSEARCH_BASE_URL=https://jsearch.p.rapidapi.com
```

### Step 3: Install & Start Backend

```powershell
cd backend
npm install
npm start
```

Backend runs at `http://localhost:3000`

### Step 4: Open Frontend

Open `finder/finder.html` in your browser, or use a local server:

```powershell
# Python
python -m http.server 8000

# Then visit: http://localhost:8000/finder/finder.html
```

## How to Use

### Find Jobs
1. Go to "Career Compass" tab
2. Search for job titles
3. Use filters to narrow results
4. Click "Save Job" to add to tracker

### Track Applications
1. Go to "Progress Map" tab
2. Drag jobs between columns (Saved → Applied → Interview → Offered)
3. Click jobs to add notes
4. Track your progress

### Upload Resume
1. On Career Compass page
2. Upload PDF or DOCX file
3. Resume data is extracted and stored

## Optional: AI Job Summaries

To enable AI-powered job summaries:

1. Download [Ollama](https://ollama.ai/)
2. Run: `ollama pull mistral`
3. Start Ollama: `ollama serve`
4. Add to `.env`:
   ```
   OLLAMA_BASE_URL=http://localhost:11434
   OLLAMA_MODEL=mistral
   ```

## Project Folders

```
backend/          - Node.js server
finder/           - Job search page
tracker/          - Job tracker page
home/             - Landing page
Scripts/          - Utility scripts
```

## Troubleshooting

**Server won't start?**
- Check `.env` has JSEARCH_API_KEY
- Verify Node.js is installed: `node --version`

**No jobs showing?**
- Check API key is valid on RapidAPI
- Verify backend is running at http://localhost:3000

**Resume upload fails?**
- Make sure file is PDF or DOCX
- File must be under 10MB

## Support

Check the console (F12) for error messages if something goes wrong.
