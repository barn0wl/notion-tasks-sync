import { Database } from 'sqlite';
import { getDatabase } from './database.js';
import { SyncState, Task, TaskList } from '../models/types.js';

export class SyncStateRepository {
    private db: Database | null = null;

    private async getDb(): Promise<Database> {
        if (!this.db) {
            this.db = await getDatabase();
        }
        return this.db;
    }

    // ============ Task Lists ============

    async saveTaskList(taskList: TaskList): Promise<void> {
        const db = await this.getDb();
        await db.run(
            `INSERT OR REPLACE INTO task_lists (id, title, selfLink, last_synced)
             VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
            [taskList.id, taskList.title, taskList.selfLink || null]
        );
    }

    async saveTaskLists(taskLists: TaskList[]): Promise<void> {
        for (const list of taskLists) {
            await this.saveTaskList(list);
        }
    }

    async getAllTaskLists(): Promise<TaskList[]> {
        const db = await this.getDb();
        const rows = await db.all<{ id: string; title: string; selfLink: string | null }[]>(
            `SELECT id, title, selfLink FROM task_lists ORDER BY title`
        );
        return rows.map(row => ({
            id: row.id,
            title: row.title,
            selfLink: row.selfLink || undefined
        }));
    }

    async getTaskListById(id: string): Promise<TaskList | null> {
        const db = await this.getDb();
        const row = await db.get<{ id: string; title: string; selfLink: string | null }>(
            `SELECT id, title, selfLink FROM task_lists WHERE id = ?`,
            [id]
        );
        if (!row) return null;
        return {
            id: row.id,
            title: row.title,
            selfLink: row.selfLink || undefined
        };
    }

    async deleteTaskList(id: string): Promise<void> {
        const db = await this.getDb();
        // Tasks will be deleted automatically due to FOREIGN KEY CASCADE
        await db.run(`DELETE FROM task_lists WHERE id = ?`, [id]);
    }

    // ============ Tasks ============

    async saveTask(task: Task): Promise<void> {
        const db = await this.getDb();
        await db.run(
            `INSERT OR REPLACE INTO tasks (id, title, status, due, completed, taskListId, selfLink, last_synced)
             VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [
                task.id,
                task.title,
                task.status,
                task.due || null,
                task.completed || null,
                task.taskListId,
                task.selfLink || null
            ]
        );
    }

    async saveTasks(tasks: Task[]): Promise<void> {
        for (const task of tasks) {
            await this.saveTask(task);
        }
    }

    async getAllTasks(): Promise<Task[]> {
        const db = await this.getDb();
        const rows = await db.all<{
            id: string;
            title: string;
            status: string;
            due: string | null;
            completed: string | null;
            taskListId: string;
            selfLink: string | null;
        }[]>(`SELECT * FROM tasks ORDER BY title`);

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

    async getTasksByListId(taskListId: string): Promise<Task[]> {
        const db = await this.getDb();
        const rows = await db.all<{
            id: string;
            title: string;
            status: string;
            due: string | null;
            completed: string | null;
            taskListId: string;
            selfLink: string | null;
        }[]>(`SELECT * FROM tasks WHERE taskListId = ? ORDER BY title`, [taskListId]);

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

    async getTaskById(id: string): Promise<Task | null> {
        const db = await this.getDb();
        const row = await db.get<{
            id: string;
            title: string;
            status: string;
            due: string | null;
            completed: string | null;
            taskListId: string;
            selfLink: string | null;
        }>(`SELECT * FROM tasks WHERE id = ?`, [id]);

        if (!row) return null;
        return {
            id: row.id,
            title: row.title,
            status: row.status,
            due: row.due || undefined,
            completed: row.completed || undefined,
            taskListId: row.taskListId,
            selfLink: row.selfLink || undefined
        };
    }

    async deleteTask(id: string): Promise<void> {
        const db = await this.getDb();
        await db.run(`DELETE FROM tasks WHERE id = ?`, [id]);
    }

    async deleteTasksByListId(taskListId: string): Promise<void> {
        const db = await this.getDb();
        await db.run(`DELETE FROM tasks WHERE taskListId = ?`, [taskListId]);
    }

    // ============ Sync State (Full Load/Save) ============

    async loadFullSyncState(): Promise<SyncState> {
        const taskLists = await this.getAllTaskLists();
        const tasks = await this.getAllTasks();
        return { tasklists: taskLists, tasks };
    }

    async saveFullSyncState(state: SyncState): Promise<void> {
        await this.saveTaskLists(state.tasklists);
        await this.saveTasks(state.tasks);
    }

    async clearAllData(): Promise<void> {
        const db = await this.getDb();
        await db.exec(`DELETE FROM tasks`);
        await db.exec(`DELETE FROM task_lists`);
    }

    // ============ Sync Metadata ============

    async setLastSyncTime(timestamp: string): Promise<void> {
        const db = await this.getDb();
        await db.run(
            `INSERT OR REPLACE INTO sync_metadata (key, value, updated_at)
             VALUES ('last_sync_time', ?, CURRENT_TIMESTAMP)`,
            [timestamp]
        );
    }

    async getLastSyncTime(): Promise<string | null> {
        const db = await this.getDb();
        const row = await db.get<{ value: string }>(
            `SELECT value FROM sync_metadata WHERE key = 'last_sync_time'`
        );
        return row?.value || null;
    }

    async getSyncStats(): Promise<{
        totalTaskLists: number;
        totalTasks: number;
        lastSyncTime: string | null;
    }> {
        const db = await this.getDb();
        const taskListCount = await db.get<{ count: number }>(`SELECT COUNT(*) as count FROM task_lists`);
        const taskCount = await db.get<{ count: number }>(`SELECT COUNT(*) as count FROM tasks`);
        const lastSyncTime = await this.getLastSyncTime();

        return {
            totalTaskLists: taskListCount?.count || 0,
            totalTasks: taskCount?.count || 0,
            lastSyncTime
        };
    }
}

// Export a singleton instance
export const syncStateRepository = new SyncStateRepository();
