const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { normalizeJobDescription } = require('../jobDescription');

const databasePath = path.resolve(__dirname, '..', 'jobs.db');
const dryRun = process.argv.includes('--dry-run');
const db = new sqlite3.Database(databasePath);

function all(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (error, rows) => {
            if (error) reject(error);
            else resolve(rows);
        });
    });
}

function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function onRun(error) {
            if (error) reject(error);
            else resolve(this.changes);
        });
    });
}

async function normalizeStoredDescriptions() {
    const jobs = await all('SELECT id, description FROM job_listings WHERE description IS NOT NULL');
    const changes = [];

    for (const job of jobs) {
        const normalizedDescription = normalizeJobDescription(job.description);
        if (normalizedDescription && normalizedDescription !== job.description) {
            changes.push({ id: job.id, description: normalizedDescription });
        }
    }

    if (!dryRun && changes.length > 0) {
        await run('BEGIN IMMEDIATE TRANSACTION');
        try {
            for (const job of changes) {
                await run('UPDATE job_listings SET description = ? WHERE id = ?', [
                    job.description,
                    job.id
                ]);
            }
            await run('COMMIT');
        } catch (error) {
            await run('ROLLBACK');
            throw error;
        }
    }

    console.log(`${dryRun ? 'Would normalize' : 'Normalized'} ${changes.length} of ${jobs.length} job descriptions.`);
    console.log('Existing description summaries, requirements, and match records were not changed.');
}

normalizeStoredDescriptions()
    .catch((error) => {
        console.error(`Description normalization failed: ${error.message}`);
        process.exitCode = 1;
    })
    .finally(() => {
        db.close();
    });
