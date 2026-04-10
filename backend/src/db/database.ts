import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';
import fs from 'fs';

// Ensure the data directory exists
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const DB_PATH = path.join(dataDir, 'sync_state.db');

let dbInstance: Database | null = null;

export async function getDatabase(): Promise<Database> {
    if (dbInstance) {
        return dbInstance;
    }

    dbInstance = await open({
        filename: DB_PATH,
        driver: sqlite3.Database
    });

    await initializeTables(dbInstance);
    return dbInstance;
}

async function initializeTables(db: Database) {
    // Task lists table
    await db.exec(`
        CREATE TABLE IF NOT EXISTS task_lists (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            selfLink TEXT,
            last_synced TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Tasks table
    await db.exec(`
        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            status TEXT NOT NULL,
            due TEXT,
            completed TEXT,
            taskListId TEXT NOT NULL,
            selfLink TEXT,
            last_synced TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (taskListId) REFERENCES task_lists(id) ON DELETE CASCADE
        )
    `);

    // Sync metadata table (stores last sync time, etc.)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS sync_metadata (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Indexes for performance
    await db.exec(`
        CREATE INDEX IF NOT EXISTS idx_tasks_taskListId ON tasks(taskListId);
        CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    `);

    console.log('Database initialized at:', DB_PATH);
}

export async function closeDatabase() {
    if (dbInstance) {
        await dbInstance.close();
        dbInstance = null;
    }
}