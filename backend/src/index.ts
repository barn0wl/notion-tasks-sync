import express from 'express';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import { syncEngine } from './core/index.js';
import { googleTasksService } from './services/google/googleTasksService.js';
import { googleAuth } from './services/google/googleAuth.js';
import { analyticsRouter } from './controllers/analyticsController.js';
import { priorityRouter } from './controllers/priorityController.js';

dotenv.config();
const app = express();

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

// Health check
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Analytics routes
app.use('/analytics', analyticsRouter);

// Priority routes
app.use('/tasks', priorityRouter);

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

// Get auth URL for manual authentication
app.get('/auth/url', async (_req, res) => {
    try {
        const url = await googleAuth.getAuthUrl();
        res.json({ authUrl: url });
    } catch (error) {
        res.status(500).json({ error: String(error) });
    }
});

// Callback endpoint for OAuth (if using web flow)
app.get('/auth/callback', async (req, res) => {
    const code = req.query.code as string;
    if (!code) {
        res.status(400).json({ error: 'No code provided' });
        return;
    }
    try {
        await googleAuth.exchangeCodeForTokens(code);
        res.json({ message: 'Authentication successful! You can now use /sync' });
    } catch (error) {
        res.status(500).json({ error: String(error) });
    }
});

// Force refresh token (without deleting)
app.post('/auth/refresh', async (_req, res) => {
    try {
        const success = await googleAuth.refreshToken();
        if (success) {
            res.json({ message: 'Token refreshed successfully' });
        } else {
            res.status(401).json({ message: 'Could not refresh token. Please re-authenticate at /auth/url' });
        }
    } catch (error) {
        res.status(500).json({ error: String(error) });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
