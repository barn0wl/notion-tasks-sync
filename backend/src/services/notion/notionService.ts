import { notionClient } from './notionClient.js';
import { 
    taskListToNotionProperties, 
    notionPageToTaskList,
    taskToNotionProperties,
    notionPageToTask,
    taskUpdateToNotionProperties,
    NOTION_FIELD_MAPPING
} from './notionMapper.js';
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints.js';
import { Task, TaskList } from '../../models/types.js';

class NotionService {
    private get client() {
        return notionClient.getClient();
    }

    private get projectsDatabaseId() {
        return notionClient.getDatabaseIds().projectsDatabaseId;
    }

    private get tasksDatabaseId() {
        return notionClient.getDatabaseIds().tasksDatabaseId;
    }

    // ============ Connection Testing ============

    async testConnection(): Promise<{ success: boolean; error?: string }> {
        return notionClient.testConnection();
    }

    isConfigured(): boolean {
        return notionClient.isConfigured() && notionClient.areDatabasesConfigured();
    }

    // ============ Project (Task List) Operations ============

    async getProjectPages(): Promise<PageObjectResponse[]> {
        try {
            const { archiveField } = NOTION_FIELD_MAPPING.project;
            const response = await this.client.databases.query({
                database_id: this.projectsDatabaseId,
                filter: {
                    and: [
                        {
                            property: 'GTaskID',
                            rich_text: { is_not_empty: true }
                        },
                        {
                            property: archiveField,
                            checkbox: { equals: false }
                        }
                    ]
                }
            });
            return response.results as PageObjectResponse[];
        } catch (error) {
            console.error('Error fetching project pages:', error);
            throw error;
        }
    }

    async getTaskLists(): Promise<TaskList[]> {
        const pages = await this.getProjectPages();
        const taskLists: TaskList[] = [];
        
        for (const page of pages) {
            const taskList = notionPageToTaskList(page);
            if (taskList) {
                taskLists.push(taskList);
            }
        }
        
        return taskLists;
    }

    async createTaskList(taskList: TaskList): Promise<string> {
        try {
            const response = await this.client.pages.create({
                parent: { database_id: this.projectsDatabaseId },
                properties: taskListToNotionProperties(taskList)
            });
            console.log(`Task list created in Notion: ${response.id}`);
            return response.id;
        } catch (error) {
            console.error('Error creating task list in Notion:', error);
            throw error;
        }
    }

    async updateTaskList(pageId: string, newTitle: string): Promise<void> {
        try {
            const { nameField } = NOTION_FIELD_MAPPING.project;
            await this.client.pages.update({
                page_id: pageId,
                properties: {
                    [nameField]: { title: [{ text: { content: newTitle } }] }
                }
            });
            console.log(`Task list updated: ${pageId}`);
        } catch (error) {
            console.error('Error updating task list:', error);
            throw error;
        }
    }

    // ============ Task Operations ============

    async getTaskPages(): Promise<PageObjectResponse[]> {
        try {
            const { archiveField } = NOTION_FIELD_MAPPING.task;
            const response = await this.client.databases.query({
                database_id: this.tasksDatabaseId,
                filter: {
                    and: [
                        {
                            property: 'GTaskID',
                            rich_text: { is_not_empty: true }
                        },
                        {
                            property: archiveField,
                            checkbox: { equals: false }
                        }
                    ]
                }
            });
            return response.results as PageObjectResponse[];
        } catch (error) {
            console.error('Error fetching task pages:', error);
            throw error;
        }
    }

    async getAllTasks(projectPages: PageObjectResponse[]): Promise<Task[]> {
        // Build map of project page ID -> TaskList
        const projectMap = new Map<string, TaskList>();
        for (const page of projectPages) {
            const taskList = notionPageToTaskList(page);
            if (taskList && page.id) {
                projectMap.set(page.id, taskList);
            }
        }

        const taskPages = await this.getTaskPages();
        const tasks: Task[] = [];
        
        for (const page of taskPages) {
            const task = notionPageToTask(page, projectMap);
            if (task && page.id) {
                tasks.push(task);
            }
        }
        
        return tasks;
    }

    async createTask(task: Task, projectPageId: string): Promise<string> {
        try {
            const response = await this.client.pages.create({
                parent: { database_id: this.tasksDatabaseId },
                properties: taskToNotionProperties(task, projectPageId)
            });
            console.log(`Task created in Notion: ${response.id}`);
            return response.id;
        } catch (error) {
            console.error('Error creating task in Notion:', error);
            throw error;
        }
    }

    async updateTask(taskPageId: string, updatedTask: Task, projectPageId: string): Promise<void> {
        try {
            await this.client.pages.update({
                page_id: taskPageId,
                properties: taskUpdateToNotionProperties(updatedTask, projectPageId)
            });
            console.log(`Task updated: ${taskPageId}`);
        } catch (error) {
            console.error('Error updating task:', error);
            throw error;
        }
    }

    // ============ Archive Operations ============

    async archivePage(pageId: string): Promise<void> {
        try {
            // Use the archive field from task mapping (same field name for both)
            const { archiveField } = NOTION_FIELD_MAPPING.task;
            await this.client.pages.update({
                page_id: pageId,
                properties: {
                    [archiveField]: { checkbox: true }
                }
            });
            console.log(`Page archived: ${pageId}`);
        } catch (error) {
            console.error('Error archiving page:', error);
            throw error;
        }
    }
}

export const notionService = new NotionService();
