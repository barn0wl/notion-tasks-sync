import { Database } from 'sqlite';
import { getDatabase } from '../../db/database.js';
import { Task, TaskList, PrioritizedTask } from '../../models/types.js';

export interface PriorityConfig {
    // Due date weights
    overdueWeight: number;
    dueTodayWeight: number;
    dueWithin3DaysWeight: number;
    
    // Keyword weights
    highPriorityKeywords: string[];
    highPriorityWeight: number;
    mediumPriorityKeywords: string[];
    mediumPriorityWeight: number;
    
    // Task list weights (list name -> weight)
    taskListWeights: Map<string, number>;
    
    // Default weight for unknown task lists
    defaultListWeight: number;
}

export class PriorityService {
    private db: Database | null = null;
    private config: PriorityConfig;

    constructor(config?: Partial<PriorityConfig>) {
        // Default configuration
        const defaultConfig: PriorityConfig = {
            overdueWeight: 2,
            dueTodayWeight: 2,
            dueWithin3DaysWeight: 1,
            highPriorityKeywords: ['urgent', 'asap', 'critical', 'deadline', '!!', '!!!'],
            highPriorityWeight: 2,
            mediumPriorityKeywords: ['important', 'soon', 'today', 'tomorrow', '!'],
            mediumPriorityWeight: 1,
            taskListWeights: new Map([
                ['Work', 2],
                ['Personal', 1],
                ['Shopping', 0],
                ['Errands', 0],
                ['Ideas', -1],
                ['Someday', -1],
            ]),
            defaultListWeight: 0,
        };

        // Merge with provided config
        this.config = { ...defaultConfig, ...config };
        if (config?.taskListWeights) {
            this.config.taskListWeights = new Map([
                ...defaultConfig.taskListWeights,
                ...config.taskListWeights
            ]);
        }
    }

    private async getDb(): Promise<Database> {
        if (!this.db) {
            this.db = await getDatabase();
        }
        return this.db;
    }

    /**
     * Get all tasks from database (optionally filtered by task list)
     */
    async getAllTasks(taskListId?: string): Promise<Task[]> {
        const db = await this.getDb();
        
        let query = `
            SELECT 
                t.id,
                t.title,
                t.status,
                t.due,
                t.completed,
                t.taskListId,
                t.selfLink
            FROM tasks t
            WHERE t.status != 'completed'
        `;
        
        const params: string[] = [];
        if (taskListId) {
            query += ` AND t.taskListId = ?`;
            params.push(taskListId);
        }
        
        query += ` ORDER BY t.title`;
        
        const rows = await db.all<Array<{
            id: string;
            title: string;
            status: string;
            due: string | null;
            completed: string | null;
            taskListId: string;
            selfLink: string | null;
        }>>(query, params);
        
        return rows.map(row => ({
            id: row.id,
            title: row.title,
            status: row.status,
            due: row.due || undefined,
            completed: row.completed || undefined,
            taskListId: row.taskListId,
            selfLink: row.selfLink || undefined
        }));
    }

    /**
     * Get task list by ID
     */
    async getTaskListById(taskListId: string): Promise<TaskList | null> {
        const db = await this.getDb();
        const row = await db.get<{ id: string; title: string; selfLink: string | null }>(
            `SELECT id, title, selfLink FROM task_lists WHERE id = ?`,
            [taskListId]
        );
        
        if (!row) return null;
        return {
            id: row.id,
            title: row.title,
            selfLink: row.selfLink || undefined
        };
    }

    /**
     * Get all task lists (for batch processing)
     */
    async getAllTaskLists(): Promise<Map<string, TaskList>> {
        const db = await this.getDb();
        const rows = await db.all<Array<{ id: string; title: string; selfLink: string | null }>>(
            `SELECT id, title, selfLink FROM task_lists`
        );
        
        const map = new Map<string, TaskList>();
        for (const row of rows) {
            map.set(row.id, {
                id: row.id,
                title: row.title,
                selfLink: row.selfLink || undefined
            });
        }
        return map;
    }

    /**
     * Calculate due date proximity score
     */
    private calculateDueScore(dueDate?: string): number {
        if (!dueDate) return 0;
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const due = new Date(dueDate);
        due.setHours(0, 0, 0, 0);
        
        const diffTime = due.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays < 0) {
            // Overdue
            return this.config.overdueWeight;
        } else if (diffDays === 0) {
            // Due today
            return this.config.dueTodayWeight;
        } else if (diffDays <= 3) {
            // Due within 3 days
            return this.config.dueWithin3DaysWeight;
        }
        
        return 0;
    }

    /**
     * Calculate keyword score from task title
     */
    private calculateKeywordScore(title: string): number {
        const lowerTitle = title.toLowerCase();
        let score = 0;
        
        // Check for high priority keywords
        for (const keyword of this.config.highPriorityKeywords) {
            if (lowerTitle.includes(keyword.toLowerCase())) {
                score += this.config.highPriorityWeight;
                break; // Only count once per category
            }
        }
        
        // Check for medium priority keywords
        for (const keyword of this.config.mediumPriorityKeywords) {
            if (lowerTitle.includes(keyword.toLowerCase())) {
                score += this.config.mediumPriorityWeight;
                break; // Only count once per category
            }
        }
        
        return score;
    }

    /**
     * Calculate task list context score
     */
    private calculateListScore(taskList?: TaskList): number {
        if (!taskList) return this.config.defaultListWeight;
        
        // Check for exact match first
        for (const [listName, weight] of this.config.taskListWeights) {
            if (taskList.title.toLowerCase() === listName.toLowerCase()) {
                return weight;
            }
        }
        
        // Check for partial matches (e.g., "Work Projects" matches "Work")
        for (const [listName, weight] of this.config.taskListWeights) {
            if (taskList.title.toLowerCase().includes(listName.toLowerCase())) {
                return weight;
            }
        }
        
        return this.config.defaultListWeight;
    }

    /**
     * Score a single task
     * @param task - The task to score
     * @param taskList - Optional task list context (if not provided, will fetch from DB)
     * @returns Priority score (1-5, where 5 is highest priority)
     */
    async scoreTask(task: Task, taskList?: TaskList): Promise<PrioritizedTask> {
        // Fetch task list if not provided
        let list: TaskList | undefined = taskList;
        if (!list) {
            const fetchedList = await this.getTaskListById(task.taskListId);
            if (fetchedList) {
                list = fetchedList;
            }
        }
        
        // Calculate individual scores
        const dueScore = this.calculateDueScore(task.due);
        const keywordScore = this.calculateKeywordScore(task.title);
        const listScore = this.calculateListScore(list);
        
        // Total raw score (can be negative from list score)
        let totalScore = dueScore + keywordScore + listScore;
        
        // Normalize to 1-5 scale
        // Raw score range typically: -1 to 5
        // Map to 1-5: -1->1, 0->2, 1->3, 2->4, 3-5->5
        let priority: number;
        if (totalScore <= -0.5) {
            priority = 1;
        } else if (totalScore <= 0.5) {
            priority = 2;
        } else if (totalScore <= 1.5) {
            priority = 3;
        } else if (totalScore <= 2.5) {
            priority = 4;
        } else {
            priority = 5;
        }
        
        return {
            ...task,
            priority,
            priorityBreakdown: {
                dueScore,
                keywordScore,
                listScore,
                totalScore
            }
        };
    }

    /**
     * Get all prioritized tasks, sorted by priority (highest first)
     * @param taskListId - Optional filter by task list ID
     */
    async getPrioritizedTasks(taskListId?: string): Promise<PrioritizedTask[]> {
        // Get all tasks (optionally filtered)
        const tasks = await this.getAllTasks(taskListId);
        
        // Get all task lists for batch processing (avoids N+1 queries)
        const taskLists = await this.getAllTaskLists();
        
        // Score each task
        const prioritizedTasks: PrioritizedTask[] = [];
        for (const task of tasks) {
            const taskList = taskLists.get(task.taskListId);
            const prioritizedTask = await this.scoreTask(task, taskList);
            prioritizedTasks.push(prioritizedTask);
        }
        
        // Sort by priority (highest first), then by due date (earliest first), then by title
        prioritizedTasks.sort((a, b) => {
            if (a.priority !== b.priority) {
                return b.priority - a.priority;
            }
            
            // If same priority, sort by due date
            if (a.due && b.due) {
                return new Date(a.due).getTime() - new Date(b.due).getTime();
            }
            if (a.due) return -1;
            if (b.due) return 1;
            
            // Finally by title
            return a.title.localeCompare(b.title);
        });
        
        return prioritizedTasks;
    }

    /**
     * Update priority configuration at runtime
     */
    updateConfig(config: Partial<PriorityConfig>): void {
        if (config.overdueWeight !== undefined) this.config.overdueWeight = config.overdueWeight;
        if (config.dueTodayWeight !== undefined) this.config.dueTodayWeight = config.dueTodayWeight;
        if (config.dueWithin3DaysWeight !== undefined) this.config.dueWithin3DaysWeight = config.dueWithin3DaysWeight;
        if (config.highPriorityKeywords !== undefined) this.config.highPriorityKeywords = config.highPriorityKeywords;
        if (config.highPriorityWeight !== undefined) this.config.highPriorityWeight = config.highPriorityWeight;
        if (config.mediumPriorityKeywords !== undefined) this.config.mediumPriorityKeywords = config.mediumPriorityKeywords;
        if (config.mediumPriorityWeight !== undefined) this.config.mediumPriorityWeight = config.mediumPriorityWeight;
        if (config.defaultListWeight !== undefined) this.config.defaultListWeight = config.defaultListWeight;
        if (config.taskListWeights !== undefined) {
            this.config.taskListWeights = new Map(config.taskListWeights);
        }
        
        console.log('Priority configuration updated');
    }

    /**
     * Get current configuration
     */
    getConfig(): PriorityConfig {
        return { ...this.config };
    }
}

// Export singleton instance
export const priorityService = new PriorityService();