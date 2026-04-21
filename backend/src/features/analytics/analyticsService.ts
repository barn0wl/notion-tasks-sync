import { Database } from 'sqlite';
import { getDatabase } from '../../db/database.js';

export interface DailyCompletion {
    date: string;
    completed: number;
}

export interface TaskListStats {
    id: string;
    title: string;
    totalTasks: number;
    completedTasks: number;
    completionRate: number;
}

export interface DashboardSnapshot {
    completionRate: {
        overall: number;
        last7Days: number;
        last30Days: number;
    };
    overdueTasks: {
        count: number;
        tasks: Array<{
            id: string;
            title: string;
            due: string;
            taskListId: string;
            taskListTitle: string;
        }>;
    };
    dailyCompletionTrend: DailyCompletion[];
    topTaskLists: TaskListStats[];
    lastUpdated: string;
}

export class AnalyticsService {
    private db: Database | null = null;

    private async getDb(): Promise<Database> {
        if (!this.db) {
            this.db = await getDatabase();
        }
        return this.db;
    }

    /**
     * Get completion rate (completed/total ratio)
     * @param days - Optional window in days (e.g., 7 for last 7 days)
     */
    async getCompletionRate(days?: number): Promise<number> {
        const db = await this.getDb();

        if (days) {
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - days);
            const cutoffStr = cutoff.toISOString().split('T')[0];

            // Tasks completed in the window / tasks that were due or completed in the window
            const result = await db.get<{ completed: number; total: number }>(`
                SELECT
                    COUNT(CASE WHEN status = 'completed' AND DATE(completed) >= ? THEN 1 END) as completed,
                    COUNT(CASE WHEN
                        (status = 'completed' AND DATE(completed) >= ?)
                        OR (status != 'completed' AND due IS NOT NULL AND due >= ?)
                    THEN 1 END) as total
                FROM tasks
            `, [cutoffStr, cutoffStr, cutoffStr]);

            if (!result || result.total === 0) return 0;
            return result.completed / result.total;
        }

        const result = await db.get<{ completed: number; total: number }>(`
            SELECT
                COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
                COUNT(*) as total
            FROM tasks
        `);
        if (!result || result.total === 0) return 0;
        return result.completed / result.total;
    }

    /**
     * Get overdue tasks (due < today and status !== 'completed')
     */
    async getOverdueTasks(): Promise<{
        count: number;
        tasks: Array<{
            id: string;
            title: string;
            due: string;
            taskListId: string;
            taskListTitle: string;
        }>;
    }> {
        const db = await this.getDb();
        const today = new Date().toISOString().split('T')[0];
        
        const tasks = await db.all<Array<{
            id: string;
            title: string;
            due: string;
            taskListId: string;
            taskListTitle: string;
        }>>(`
            SELECT 
                t.id,
                t.title,
                t.due,
                t.taskListId,
                tl.title as taskListTitle
            FROM tasks t
            JOIN task_lists tl ON t.taskListId = tl.id
            WHERE t.due IS NOT NULL 
                AND t.due < ?
                AND t.status != 'completed'
            ORDER BY t.due ASC
        `, [today]);
        
        return {
            count: tasks.length,
            tasks
        };
    }

    /**
     * Get daily completion trend grouped by completed date
     * @param days - Number of days to look back (default: 30)
     */
    async getDailyCompletionTrend(days: number = 30): Promise<DailyCompletion[]> {
        const db = await this.getDb();
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        const cutoffStr = cutoffDate.toISOString().split('T')[0];
        
        const results = await db.all<Array<{ date: string; completed: number }>>(`
            SELECT 
                DATE(completed) as date,
                COUNT(*) as completed
            FROM tasks
            WHERE status = 'completed' 
                AND completed IS NOT NULL
                AND DATE(completed) >= ?
            GROUP BY DATE(completed)
            ORDER BY date ASC
        `, [cutoffStr]);
        
        // Fill in missing dates with 0
        const dateMap = new Map<string, number>();
        for (const result of results) {
            dateMap.set(result.date, result.completed);
        }
        
        const dailyCompletion: DailyCompletion[] = [];
        const currentDate = new Date(cutoffStr);
        const endDate = new Date();
        
        while (currentDate <= endDate) {
            const dateStr = currentDate.toISOString().split('T')[0];
            dailyCompletion.push({
                date: dateStr,
                completed: dateMap.get(dateStr) || 0
            });
            currentDate.setDate(currentDate.getDate() + 1);
        }
        
        return dailyCompletion;
    }

    /**
     * Get top task lists ranked by total/completed task count
     * @param limit - Number of task lists to return (default: 10)
     * @param sortBy - 'total' or 'completionRate' (default: 'total')
     */
    async getTopTaskLists(
        limit: number = 10, 
        sortBy: 'total' | 'completionRate' = 'total'
    ): Promise<TaskListStats[]> {
        const db = await this.getDb();
        
        const results = await db.all<Array<{
            id: string;
            title: string;
            totalTasks: number;
            completedTasks: number;
        }>>(`
            SELECT 
                tl.id,
                tl.title,
                COUNT(t.id) as totalTasks,
                COUNT(CASE WHEN t.status = 'completed' THEN 1 END) as completedTasks
            FROM task_lists tl
            LEFT JOIN tasks t ON tl.id = t.taskListId
            GROUP BY tl.id, tl.title
            HAVING totalTasks > 0
        `);
        
        const taskListStats: TaskListStats[] = results.map(r => ({
            id: r.id,
            title: r.title,
            totalTasks: r.totalTasks,
            completedTasks: r.completedTasks,
            completionRate: r.totalTasks > 0 ? r.completedTasks / r.totalTasks : 0
        }));
        
        // Sort and limit
        if (sortBy === 'total') {
            taskListStats.sort((a, b) => b.totalTasks - a.totalTasks);
        } else {
            taskListStats.sort((a, b) => b.completionRate - a.completionRate);
        }
        
        return taskListStats.slice(0, limit);
    }

    /**
     * Get complete dashboard snapshot
     */
    async getDashboardSnapshot(): Promise<DashboardSnapshot> {
        const [overallRate, rate7Days, rate30Days, overdue, trend, topLists] = await Promise.all([
            this.getCompletionRate(),
            this.getCompletionRate(7),
            this.getCompletionRate(30),
            this.getOverdueTasks(),
            this.getDailyCompletionTrend(30),
            this.getTopTaskLists(5)
        ]);
        
        return {
            completionRate: {
                overall: overallRate,
                last7Days: rate7Days,
                last30Days: rate30Days
            },
            overdueTasks: {
                count: overdue.count,
                tasks: overdue.tasks
            },
            dailyCompletionTrend: trend,
            topTaskLists: topLists,
            lastUpdated: new Date().toISOString()
        };
    }
}

// Export singleton instance
export const analyticsService = new AnalyticsService();
