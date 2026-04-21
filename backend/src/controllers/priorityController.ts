import { Router, Request, Response } from 'express';
import { priorityService } from '../features/priority/priorityService.js';

export const priorityRouter = Router();

/**
 * POST /tasks/prioritized/score
 */
priorityRouter.post('/prioritized/score', (req: Request, res: Response) => {
    try {
        const { task, taskList } = req.body;
        if (!task) {
            res.status(400).json({ success: false, error: 'Task object is required in request body' });
            return;
        }
        // scoreTask is synchronous — no await needed
        const scoredTask = priorityService.scoreTask(task, taskList);
        res.json({ success: true, data: scoredTask });
    } catch (error) {
        console.error('Error scoring task:', error);
        res.status(500).json({ success: false, error: String(error) });
    }
});

/**
 * GET /tasks/prioritized/config
 */
priorityRouter.get('/prioritized/config', (_req: Request, res: Response) => {
    try {
        const config = priorityService.getConfig();
        res.json({
            success: true,
            data: {
                ...config,
                taskListWeights: Object.fromEntries(config.taskListWeights)
            }
        });
    } catch (error) {
        console.error('Error fetching priority config:', error);
        res.status(500).json({ success: false, error: String(error) });
    }
});

/**
 * PUT /tasks/prioritized/config
 */
priorityRouter.put('/prioritized/config', (req: Request, res: Response) => {
    try {
        const updates = req.body;
        if (updates.taskListWeights && typeof updates.taskListWeights === 'object') {
            updates.taskListWeights = new Map(Object.entries(updates.taskListWeights));
        }
        priorityService.updateConfig(updates);

        const config = priorityService.getConfig();
        res.json({
            success: true,
            message: 'Priority configuration updated successfully',
            data: {
                ...config,
                taskListWeights: Object.fromEntries(config.taskListWeights)
            }
        });
    } catch (error) {
        console.error('Error updating priority config:', error);
        res.status(500).json({ success: false, error: String(error) });
    }
});

/**
 * GET /tasks/prioritized/:taskId
 */
priorityRouter.get('/prioritized/:taskId', async (req: Request, res: Response) => {
    try {
        const task = await priorityService.getPrioritizedTaskById(req.params.taskId);
        if (!task) {
            res.status(404).json({ success: false, error: `Task ${req.params.taskId} not found` });
            return;
        }
        res.json({ success: true, data: task });
    } catch (error) {
        console.error('Error fetching task priority:', error);
        res.status(500).json({ success: false, error: String(error) });
    }
});

/**
 * GET /tasks/prioritized
 */
priorityRouter.get('/prioritized', async (req: Request, res: Response) => {
    try {
        const taskListId = req.query.list as string | undefined;
        const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
        const minPriority = req.query.minPriority ? parseInt(req.query.minPriority as string) : undefined;

        if (limit !== undefined && (isNaN(limit) || limit <= 0)) {
            res.status(400).json({ success: false, error: 'Limit parameter must be a positive integer' });
            return;
        }
        if (minPriority !== undefined && (isNaN(minPriority) || minPriority < 1 || minPriority > 5)) {
            res.status(400).json({ success: false, error: 'minPriority must be between 1 and 5' });
            return;
        }

        let tasks = await priorityService.getPrioritizedTasks(taskListId);

        if (minPriority !== undefined) {
            tasks = tasks.filter(t => t.priority >= minPriority);
        }

        const originalCount = tasks.length;

        if (limit !== undefined) {
            tasks = tasks.slice(0, limit);
        }

        // Single-pass distribution count
        const priorityDistribution: Record<1|2|3|4|5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        let prioritySum = 0;
        for (const t of tasks) {
            priorityDistribution[t.priority as 1|2|3|4|5]++;
            prioritySum += t.priority;
        }
        const averagePriority = tasks.length > 0
            ? parseFloat((prioritySum / tasks.length).toFixed(2))
            : 0;

        res.json({
            success: true,
            data: {
                tasks,
                metadata: {
                    total: originalCount,
                    returned: tasks.length,
                    filtered: limit !== undefined || minPriority !== undefined,
                    taskListId: taskListId ?? 'all',
                    averagePriority,
                    priorityDistribution
                }
            }
        });
    } catch (error) {
        console.error('Error fetching prioritized tasks:', error);
        res.status(500).json({ success: false, error: String(error) });
    }
});
