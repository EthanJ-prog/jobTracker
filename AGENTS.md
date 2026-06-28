# Repository Guidelines

## Project Structure & Module Organization

Pathfinder is a vanilla HTML/CSS/JS job search and application tracker with a Node/SQLite backend.

- `backend/`: Express server, SQLite database, and Node dependencies. Main entry point is `backend/server.js`.
- `home/`, `finder/`, `tracker/`, `auth/`: Static frontend pages, each with colocated `.html`, `.css`, and `.js` files.
- `shared/`: Reusable frontend styles and scripts, including popup and theme assets.
- `Scripts/`: Python utilities for job ingestion and marking expired jobs.
- `backend/jobs.db`: local SQLite runtime data. Treat as generated/user data unless explicitly asked to edit it.

There is no dedicated test directory yet.

## Build, Test, and Development Commands

- `cd backend && npm install`: install backend dependencies.
- `cd backend && npm start`: run the Express API at `http://localhost:3000`.
- `python -m http.server 8000`: serve the static frontend from the repo root, then open pages such as `http://localhost:8000/finder/finder.html`.
- `python Scripts/Ingest_jobs.py --api-base http://localhost:3000 --query "software engineer"`: ingest jobs through the backend search endpoint.
- `python Scripts/mark_expired_jobs.py --dry-run --stats`: preview expiration changes.
- `cd backend && npm test`: currently a placeholder that exits with an error.

## Coding Style & Naming Conventions

Use plain JavaScript, CSS, HTML, Node, and Python. Do not add frontend frameworks unless the project direction changes. Keep indentation consistent with existing files: 2 spaces in frontend JavaScript, 4 spaces in backend JavaScript and Python. Use descriptive camelCase for JavaScript functions/variables and snake_case for Python variables. Prefer shared CSS in `shared/` when styling is reused across pages.

## Testing Guidelines

No formal test framework is configured. For JavaScript syntax checks, use:

```sh
node --check backend/server.js
node --check finder/finder.js
```

Manually verify auth, finder search/filtering, resume upload, saved jobs, and tracker drag/drop after changes that touch those areas. Add focused tests if introducing a test framework later.

## Commit & Pull Request Guidelines

Recent commits use short, imperative, lowercase summaries such as `fixed job type in tracker search`. Keep commits scoped and describe the user-visible change. Pull requests should include a brief summary, affected pages/endpoints, manual test steps, and screenshots for visual/UI changes. Mention any required `.env` settings without exposing secrets.

## Security & Configuration Tips

Keep `.env` files out of commits. Required integrations may include `JSEARCH_API_KEY`, `GEMINI_API_KEY`, EmailJS keys, and optional Ollama settings. Avoid committing API keys, local database changes, or generated caches.
