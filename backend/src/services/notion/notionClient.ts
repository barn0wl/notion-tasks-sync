import { Client } from '@notionhq/client';
import dotenv from 'dotenv';

dotenv.config();

class NotionClient {
    private client: Client | null = null;
    private notionApiKey: string;

    constructor() {
        this.notionApiKey = process.env.NOTION_API_KEY || '';
    }

    /**
     * Get the Notion client (initializes if needed)
     */
    getClient(): Client {
        if (!this.client) {
            if (!this.notionApiKey) {
                throw new Error('NOTION_API_KEY is not set in environment variables');
            }
            this.client = new Client({ auth: this.notionApiKey });
        }
        return this.client;
    }

    /**
     * Test the connection to Notion API
     * Makes a lightweight API call to verify the API key works
     */
    async testConnection(): Promise<{ success: boolean; error?: string }> {
        try {
            const client = this.getClient();
            // Try to list users (requires minimal permissions)
            await client.users.list({ page_size: 1 });
            return { success: true };
        } catch (error: any) {
            console.error('Notion connection test failed:', error.message);
            return { 
                success: false, 
                error: error.message || 'Unknown error' 
            };
        }
    }

    /**
     * Check if API key is configured
     */
    isConfigured(): boolean {
        return !!this.notionApiKey && this.notionApiKey !== 'your_notion_api_key_here';
    }

    /**
     * Get the configured database IDs
     */
    getDatabaseIds() {
        return {
            projectsDatabaseId: process.env.PROJECTS_DATABASE_ID || '',
            tasksDatabaseId: process.env.TASKS_DATABASE_ID || '',
        };
    }

    /**
     * Check if database IDs are configured
     */
    areDatabasesConfigured(): boolean {
        const { projectsDatabaseId, tasksDatabaseId } = this.getDatabaseIds();
        return !!projectsDatabaseId && !!tasksDatabaseId &&
               projectsDatabaseId !== 'your_projects_database_id_here' &&
               tasksDatabaseId !== 'your_tasks_database_id_here';
    }
}

export const notionClient = new NotionClient();