import { Router, Request, Response } from 'express';
import { analyticsService } from '../features/analytics/analyticsService.js';

export const analyticsRouter = Router();

/**
 * GET /analytics
 * Full dashboard snapshot
 */
analyticsRouter.get('/', async (_req: Request, res: Response) => {
    try {
        const snapshot = await analyticsService.getDashboardSnapshot();
        res.json({
            success: true,
            data: snapshot
        });
    } catch (error) {
        console.error('Error fetching analytics dashboard:', error);
        res.status(500).json({
            success: false,
            error: String(error)
        });
    }
});

/**
 * GET /analytics/overdue
 * Just overdue tasks (optional)
 */
analyticsRouter.get('/overdue', async (_req: Request, res: Response) => {
    try {
        const overdue = await analyticsService.getOverdueTasks();
        res.json({
            success: true,
            data: overdue
        });
    } catch (error) {
        console.error('Error fetching overdue tasks:', error);
        res.status(500).json({
            success: false,
            error: String(error)
        });
    }
});

/**
 * GET /analytics/completion-rate
 * Get completion rate (optionally with days parameter)
 * Example: /analytics/completion-rate?days=7
 */
analyticsRouter.get('/completion-rate', async (req: Request, res: Response) => {
    try {
        const days = req.query.days ? parseInt(req.query.days as string) : undefined;
        if (days !== undefined && (isNaN(days) || days <= 0)) {
            res.status(400).json({
                success: false,
                error: 'Days parameter must be a positive integer'
            });
            return;
        }
        
        const rate = await analyticsService.getCompletionRate(days);
        res.json({
            success: true,
            data: {
                rate,
                window: days ? `${days} days` : 'all time'
            }
        });
    } catch (error) {
        console.error('Error fetching completion rate:', error);
        res.status(500).json({
            success: false,
            error: String(error)
        });
    }
});

/**
 * GET /analytics/daily-trend
 * Get daily completion trend
 * Example: /analytics/daily-trend?days=30
 */
analyticsRouter.get('/daily-trend', async (req: Request, res: Response) => {
    try {
        const days = req.query.days ? parseInt(req.query.days as string) : 30;
        if (isNaN(days) || days <= 0) {
            res.status(400).json({
                success: false,
                error: 'Days parameter must be a positive integer'
            });
            return;
        }
        
        const trend = await analyticsService.getDailyCompletionTrend(days);
        res.json({
            success: true,
            data: {
                trend,
                days
            }
        });
    } catch (error) {
        console.error('Error fetching daily trend:', error);
        res.status(500).json({
            success: false,
            error: String(error)
        });
    }
});

/**
 * GET /analytics/top-lists
 * Get top task lists
 * Example: /analytics/top-lists?limit=5&sortBy=total
 */
analyticsRouter.get('/top-lists', async (req: Request, res: Response) => {
    try {
        const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
        const sortBy = (req.query.sortBy as 'total' | 'completionRate') || 'total';
        
        if (isNaN(limit) || limit <= 0) {
            res.status(400).json({
                success: false,
                error: 'Limit parameter must be a positive integer'
            });
            return;
        }
        
        if (sortBy !== 'total' && sortBy !== 'completionRate') {
            res.status(400).json({
                success: false,
                error: 'SortBy parameter must be "total" or "completionRate"'
            });
            return;
        }
        
        const topLists = await analyticsService.getTopTaskLists(limit, sortBy);
        res.json({
            success: true,
            data: {
                taskLists: topLists,
                limit,
                sortBy
            }
        });
    } catch (error) {
        console.error('Error fetching top task lists:', error);
        res.status(500).json({
            success: false,
            error: String(error)
        });
    }
});
