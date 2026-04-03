import { Client } from '@notionhq/client';
import dotenv from 'dotenv';
import { IPageObject} from "../models/notionTypes.js";
import { Task } from "../models/types.js";

dotenv.config();

class NotionService {

    // Initialize Notion client with your API key
    public notion = new Client({
        auth: process.env.NOTION_API_KEY,
      })

    private tasksDatabaseId : string = process.env.TASKS_DATABASE_ID || ""
    private projectsDatabaseId : string = process.env.PROJECTS_DATABASE_ID || ""

    // POST methods
    async addListPageToNotion (listPage: IPageObject) {
        try {
            const response = await this.notion.pages.create({
                parent: {
                    type: 'database_id',
                    database_id: this.projectsDatabaseId,
                },
                properties: listPage.properties
            })
            console.log("Project page added. ID:", response.id)
            return response.id
        } catch(error) {
            console.log("Error adding list to Notion:", error)
        }
    }

    async addTaskPageToNotion (taskPage: IPageObject) {
        try {
            const response = await this.notion.pages.create({
                parent: {
                    type: 'database_id',
                    database_id: this.tasksDatabaseId,
                },
                properties: taskPage.properties
            })
            console.log("Task page added. ID:", response.id)
            return response.id
        } catch(error) {
            console.log('Error adding task to Notion:', error)
        }
    }

    // UPDATE methods
    async updateNotionListPage (listPageId: string, newTitle: string) {
        try {
            await this.notion.pages.update({
                page_id: listPageId,
                properties: {
                    Name: {
                        title: [{
                            text: { content: newTitle}
                        }]
                    }
                },
            })
            console.log("Project page updated. ID:", listPageId)
        } catch (error) {
            console.log("Error updating Notion project:", error)
        }  
    }

    async updateNotionTaskPage (taskPageId: string, updatedTask: Task, notionListPageId: string) {
        try {
            await this.notion.pages.update({
                page_id: taskPageId,
                properties: {
                    Name: {
                        title: [{
                            text: { content: updatedTask.title}
                        }]
                    },
                    Due: {
                        date: updatedTask.due? {
                            start: updatedTask.due,
                            } : null
                    },
                    Completed: {
                        date: updatedTask.completed? {
                            start: updatedTask.completed,
                            } : null
                    },
                    Done: {
                        checkbox: updatedTask.status === 'completed'? true : false
                    },
                    Project: {
                        relation: [{
                            id: notionListPageId
                        }]
                    }
                },
            })
            console.log("Task page updated. ID:", taskPageId)
        } catch (error) {
            console.log("Error updating Notion task:", error)
        }
    }

    async archivePage (pageId: string) {
        try {
            await this.notion.pages.update({
                page_id: pageId,
                properties: {
                    Archive: {
                        checkbox: true 
                    }
                }
            })
            console.log("Page archived. ID:", pageId)
        } catch(err) {
            console.log('Error while archiving task:', err)
        }
    }

    // GET methods: these are useful to first determine the state of the data on the end of Notion
    async getListPages () {
        try {
            const response = await this.notion.databases.query({
                database_id: this.projectsDatabaseId,
                filter: {
                    and: [
                            {
                            property: 'GTaskID',
                            rich_text: {
                                is_not_empty: true,
                                }
                            },
                            {
                                property: 'Archive',
                                checkbox: {
                                    equals: false
                                }
                            } 
                        ]
                    }
            })
            return response.results as IPageObject[]
        } catch (error) {
            console.log("Error querying projects database:", error)
        }
    }

    async getTaskPages () {
        try {
            const response = await this.notion.databases.query({
                database_id: this.tasksDatabaseId,
                filter: {
                    and: [
                            {
                            property: 'GTaskID',
                            rich_text: {
                                is_not_empty: true,
                                }
                            },
                            {
                                property: 'Archive',
                                checkbox: {
                                    equals: false
                                }
                            } 
                        ]
                    }
            })
            return response.results as IPageObject[]
        } catch (error) {
            console.log("Error querying tasks database:", error)
        }
    }
}

export default new NotionService();