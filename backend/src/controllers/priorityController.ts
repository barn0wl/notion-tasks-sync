import { Router, Request, Response } from 'express';
import { priorityService } from '../features/priority/priorityService.js';

export const priorityRouter = Router();

/**
 * POST /tasks/prioritized/score
 * Score a single task (useful for testing the scoring logic)
 * Body: { task: Task, taskList?: TaskList }
 */
priorityRouter.post('/prioritized/score', async (req: Request, res: Response) => {
    try {
        const { task, taskList } = req.body;
        
        if (!task) {
            res.status(400).json({
                success: false,
                error: 'Task object is required in request body'
            });
            return;
        }
        
        const scoredTask = await priorityService.scoreTask(task, taskList);
        
        res.json({
            success: true,
            data: scoredTask
        });
    } catch (error) {
        console.error('Error scoring task:', error);
        res.status(500).json({
            success: false,
            error: String(error)
        });
    }
});

/**
 * GET /tasks/prioritized/config
 * Get current priority configuration
 */
priorityRouter.get('/prioritized/config', async (_req: Request, res: Response) => {
    try {
        const config = priorityService.getConfig();
        // Convert Map to object for JSON serialization
        const configObject = {
            overdueWeight: config.overdueWeight,
            dueTodayWeight: config.dueTodayWeight,
            dueWithin3DaysWeight: config.dueWithin3DaysWeight,
            highPriorityKeywords: config.highPriorityKeywords,
            highPriorityWeight: config.highPriorityWeight,
            mediumPriorityKeywords: config.mediumPriorityKeywords,
            mediumPriorityWeight: config.mediumPriorityWeight,
            taskListWeights: Object.fromEntries(config.taskListWeights),
            defaultListWeight: config.defaultListWeight,
        };
        
        res.json({
            success: true,
            data: configObject
        });
    } catch (error) {
        console.error('Error fetching priority config:', error);
        res.status(500).json({
            success: false,
            error: String(error)
        });
    }
});

/**
 * PUT /tasks/prioritized/config
 * Update priority configuration
 * Body: Partial<PriorityConfig>
 */
priorityRouter.put('/prioritized/config', async (req: Request, res: Response) => {
    try {
        const updates = req.body;
        
        // Convert taskListWeights back to Map if provided
        if (updates.taskListWeights && typeof updates.taskListWeights === 'object') {
            updates.taskListWeights = new Map(Object.entries(updates.taskListWeights));
        }
        
        priorityService.updateConfig(updates);
        
        // Return updated config
        const config = priorityService.getConfig();
        const configObject = {
            overdueWeight: config.overdueWeight,
            dueTodayWeight: config.dueTodayWeight,
            dueWithin3DaysWeight: config.dueWithin3DaysWeight,
            highPriorityKeywords: config.highPriorityKeywords,
            highPriorityWeight: config.highPriorityWeight,
            mediumPriorityKeywords: config.mediumPriorityKeywords,
            mediumPriorityWeight: config.mediumPriorityWeight,
            taskListWeights: Object.fromEntries(config.taskListWeights),
            defaultListWeight: config.defaultListWeight,
        };
        
        res.json({
            success: true,
            message: 'Priority configuration updated successfully',
            data: configObject
        });
    } catch (error) {
        console.error('Error updating priority config:', error);
        res.status(500).json({
            success: false,
            error: String(error)
        });
    }
});

/**
 * GET /tasks/prioritized/:taskId
 * Get a single task with its priority score
 */
priorityRouter.get('/prioritized/:taskId', async (req, res) => {
    const task = await priorityService.getPrioritizedTaskById(req.params.taskId);
    if (!task) {
        res.status(404).json({ success: false, error: `Task ${req.params.taskId} not found` });
        return;
    }
    res.json({ success: true, data: task });
});

/**
 * GET /tasks/prioritized
 * Get all tasks with priority scores, sorted by priority (highest first)
 * 
 * Query params:
 * - list: Filter by task list ID
 * - limit: Limit number of results
 * - minPriority: Minimum priority (1-5) to include
 */
priorityRouter.get('/prioritized', async (req: Request, res: Response) => {
    try {
        const taskListId = req.query.list as string;
        const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
        const minPriority = req.query.minPriority ? parseInt(req.query.minPriority as string) : undefined;
        
        // Validate parameters
        if (limit !== undefined && (isNaN(limit) || limit <= 0)) {
            res.status(400).json({
                success: false,
                error: 'Limit parameter must be a positive integer'
            });
            return;
        }
        
        if (minPriority !== undefined && (isNaN(minPriority) || minPriority < 1 || minPriority > 5)) {
            res.status(400).json({
                success: false,
                error: 'minPriority must be between 1 and 5'
            });
            return;
        }
        
        // Get prioritized tasks
        let tasks = await priorityService.getPrioritizedTasks(taskListId);
        
        // Apply min priority filter
        if (minPriority !== undefined) {
            tasks = tasks.filter(task => task.priority >= minPriority);
        }
        
        // Apply limit
        const originalCount = tasks.length;
        if (limit !== undefined) {
            tasks = tasks.slice(0, limit);
        }
        
        // Calculate statistics
        const priorityDistribution = {
            1: tasks.filter(t => t.priority === 1).length,
            2: tasks.filter(t => t.priority === 2).length,
            3: tasks.filter(t => t.priority === 3).length,
            4: tasks.filter(t => t.priority === 4).length,
            5: tasks.filter(t => t.priority === 5).length,
        };
        
        const averagePriority = tasks.length > 0 
            ? tasks.reduce((sum, t) => sum + t.priority, 0) / tasks.length 
            : 0;
        
        res.json({
            success: true,
            data: {
                tasks,
                metadata: {
                    total: originalCount,
                    returned: tasks.length,
                    filtered: limit !== undefined || minPriority !== undefined,
                    taskListId: taskListId || 'all',
                    averagePriority: parseFloat(averagePriority.toFixed(2)),
                    priorityDistribution
                }
            }
        });
    } catch (error) {
        console.error('Error fetching prioritized tasks:', error);
        res.status(500).json({
            success: false,
            error: String(error)
        });
    }
});
