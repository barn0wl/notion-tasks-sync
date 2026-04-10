import express from 'express';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import { syncEngine } from './core/index.js';
import { googleTasksService } from './services/google/googleTasksService.js';

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

// Check authentication status
app.get('/auth/status', async (_req, res) => {
    const status = await googleTasksService.getAuthStatus();
    res.json(status);
});

// Test connection
app.get('/auth/test', async (_req, res) => {
    const isConnected = await googleTasksService.testConnection();
    res.json({ connected: isConnected });
});

// Force re-authentication (useful for testing)
app.post('/auth/reauth', async (_req, res) => {
    await googleTasksService.reauthenticate();
    res.json({ message: 'Token deleted. Please run /sync to re-authenticate.' });
});
