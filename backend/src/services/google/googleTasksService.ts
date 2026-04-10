import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { Task, TaskList } from '../../models/types.js';
import { googleAuth } from './googleAuth.js';

class GoogleTasksService {
    private client: OAuth2Client | null = null;

    /**
     * Ensure the client is initialized
     */
    private async ensureClient(): Promise<OAuth2Client> {
        if (!this.client) {
            this.client = await googleAuth.getClient();
        }
        return this.client;
    }

    /**
     * Check if user is authenticated
     */
    async isAuthenticated(): Promise<boolean> {
        const status = await googleAuth.checkAuthStatus();
        return status.isAuthenticated && status.hasValidToken;
    }

    /**
     * Get authentication status details
     */
    async getAuthStatus() {
        return await googleAuth.checkAuthStatus();
    }

    /**
     * Force re-authentication (delete token and start over)
     */
    async reauthenticate(): Promise<void> {
        await googleAuth.invalidateToken();
        this.client = null;
        this.client = await googleAuth.getClient();
    }

    /**
     * Get all task lists
     */
    async getTaskLists(): Promise<TaskList[]> {
        const client = await this.ensureClient();
        const service = google.tasks({ version: 'v1', auth: client });
        
        try {
            const res = await service.tasklists.list();
            const taskLists = res.data.items || [];
            console.log(`Found ${taskLists.length} task lists`);
            return taskLists as TaskList[];
        } catch (error) {
            console.error('Error fetching task lists:', error);
            throw error;
        }
    }

    /**
     * Get all tasks from a specific list
     */
    async getTasksFromList(listId: string): Promise<Task[]> {
        const client = await this.ensureClient();
        const service = google.tasks({ version: 'v1', auth: client });
        
        try {
            const res = await service.tasks.list({
                tasklist: listId,
                showHidden: true
            });
            
            const tasks = res.data.items || [];
            // Attach taskListId to each task
            tasks.forEach(task => (task as Task).taskListId = listId);
            console.log(`Found ${tasks.length} tasks in list ${listId}`);
            return tasks as Task[];
        } catch (error) {
            console.error(`Error fetching tasks from list ${listId}:`, error);
            throw error;
        }
    }

    /**
     * Get all tasks from all lists
     */
    async getAllTasks(): Promise<Task[]> {
        const taskLists = await this.getTaskLists();
        const allTasks: Task[] = [];
        
        for (const list of taskLists) {
            const tasks = await this.getTasksFromList(list.id);
            allTasks.push(...tasks);
        }
        
        console.log(`Total tasks across all lists: ${allTasks.length}`);
        return allTasks;
    }

    /**
     * Get full sync state (all lists + all tasks)
     */
    async getFullState(): Promise<{ tasklists: TaskList[]; tasks: Task[] }> {
        const tasklists = await this.getTaskLists();
        const tasks = await this.getAllTasks();
        return { tasklists, tasks };
    }

    /**
     * Insert a new task list
     */
    async insertTaskList(list: TaskList): Promise<TaskList> {
        const client = await this.ensureClient();
        const service = google.tasks({ version: 'v1', auth: client });
        
        try {
            const response = await service.tasklists.insert({
                requestBody: list
            });
            console.log(`Task list created: ${response.data.id}`);
            return response.data as TaskList;
        } catch (error) {
            console.error(`Error creating task list:`, error);
            throw error;
        }
    }

    /**
     * Insert a new task
     */
    async insertTask(task: Task): Promise<Task> {
        const client = await this.ensureClient();
        const service = google.tasks({ version: 'v1', auth: client });
        
        try {
            const response = await service.tasks.insert({
                tasklist: task.taskListId,
                requestBody: task,
            });
            console.log(`Task created: ${response.data.id}`);
            return response.data as Task;
        } catch (error) {
            console.error(`Error creating task:`, error);
            throw error;
        }
    }

    /**
     * Update a task list
     */
    async patchTaskList(list: TaskList): Promise<TaskList> {
        const client = await this.ensureClient();
        const service = google.tasks({ version: 'v1', auth: client });
        
        try {
            const response = await service.tasklists.patch({
                tasklist: list.id,
                requestBody: list
            });
            console.log(`Task list updated: ${list.id}`);
            return response.data as TaskList;
        } catch (error) {
            console.error(`Error updating task list:`, error);
            throw error;
        }
    }

    /**
     * Update a task
     */
    async patchTask(task: Task): Promise<Task> {
        const client = await this.ensureClient();
        const service = google.tasks({ version: 'v1', auth: client });
        
        try {
            const response = await service.tasks.patch({
                task: task.id,
                tasklist: task.taskListId,
                requestBody: task
            });
            console.log(`Task updated: ${task.id}`);
            return response.data as Task;
        } catch (error) {
            console.error(`Error updating task:`, error);
            throw error;
        }
    }

    /**
     * Delete a task list
     */
    async deleteTaskList(listId: string): Promise<void> {
        const client = await this.ensureClient();
        const service = google.tasks({ version: 'v1', auth: client });
        
        try {
            await service.tasklists.delete({
                tasklist: listId
            });
            console.log(`Task list deleted: ${listId}`);
        } catch (error) {
            console.error(`Error deleting task list:`, error);
            throw error;
        }
    }

    /**
     * Delete a task
     */
    async deleteTask(task: Task): Promise<void> {
        const client = await this.ensureClient();
        const service = google.tasks({ version: 'v1', auth: client });
        
        try {
            await service.tasks.delete({
                tasklist: task.taskListId,
                task: task.id
            });
            console.log(`Task deleted: ${task.id}`);
        } catch (error) {
            console.error(`Error deleting task:`, error);
            throw error;
        }
    }

    /**
     * Find a task by its ID across all task lists
     */
    async getTaskById(taskId: string): Promise<Task | null> {
        const taskLists = await this.getTaskLists();
        
        for (const taskList of taskLists) {
            const tasks = await this.getTasksFromList(taskList.id);
            const foundTask = tasks.find(task => task.id === taskId);
            if (foundTask) {
                return foundTask;
            }
        }
        return null;
    }

    /**
     * Test the connection (simple API call)
     */
    async testConnection(): Promise<boolean> {
        try {
            const client = await this.ensureClient();
            const service = google.tasks({ version: 'v1', auth: client });
            await service.tasklists.list({ maxResults: 1 });
            console.log("Google Tasks connection successful");
            return true;
        } catch (error) {
            console.error("Google Tasks connection failed:", error);
            return false;
        }
    }
}

// Export singleton
export const googleTasksService = new GoogleTasksService();
