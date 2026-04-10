import express from 'express';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import { syncEngine } from './core/index.js';

dotenv.config();
const app = express();

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

// Health check
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Run full sync
app.get('/sync', async (_req, res) => {
    try {
        const success = await syncEngine.runFullSync();
        if (success) {
            const stats = await syncEngine.getSyncStats();
            res.json({
                message: 'Sync completed successfully',
                stats
            });
        } else {
            res.status(500).json({ error: 'Sync failed' });
        }
    } catch (error) {
        res.status(500).json({ error: String(error) });
    }
});

// Get sync stats
app.get('/stats', async (_req, res) => {
    try {
        const stats = await syncEngine.getSyncStats();
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: String(error) });
    }
});

// Get current synced state
app.get('/state', async (_req, res) => {
    try {
        const state = await syncEngine.getCurrentSyncState();
        res.json(state);
    } catch (error) {
        res.status(500).json({ error: String(error) });
    }
});
