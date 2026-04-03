import fs from 'fs/promises';
import path from 'path';
import process from 'process';
import { authenticate } from '@google-cloud/local-auth';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

import { Task, TaskList } from '../models/types.js';

class GoogleTasksService {
  
    // If modifying these scopes, delete token.json.
    private SCOPES = ['https://www.googleapis.com/auth/tasks'];
    // The file token.json stores the user's access and refresh tokens, and is
    // created automatically when the authorization flow completes for the first time.
    private TOKEN_PATH = path.join(process.cwd(), 'token.json');
    private CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

    public client?: OAuth2Client

    constructor(client?: OAuth2Client) {
      this.client = client
    }

    // Initializing the task service with the client attribute
    async create(): Promise<GoogleTasksService> {
      const client = await this.authorize();
      return new GoogleTasksService(client)
    }

    //Reads previously authorized credentials from the save file.
    async loadSavedCredentialsIfExist(): Promise<OAuth2Client | null> {
      try {
        const content = await fs.readFile(this.TOKEN_PATH, 'utf-8');
        const credentials = JSON.parse(content);
        return google.auth.fromJSON(credentials) as OAuth2Client;
      } catch (err) {
        return null;
      }
    }

    //Serializes credentials to a file compatible with GoogleAuth.fromJSON.
    async saveCredentials(client: OAuth2Client): Promise<void> {
      const content = await fs.readFile(this.CREDENTIALS_PATH, 'utf-8');
      const keys = JSON.parse(content);
      const key = keys.installed || keys.web;
      const payload = JSON.stringify({
        type: 'authorized_user',
        client_id: key.client_id,
        client_secret: key.client_secret,
        refresh_token: client.credentials.refresh_token,
      });
      await fs.writeFile(this.TOKEN_PATH, payload);
    }

    //Load or request authorization to call APIs.
    async authorize(): Promise<OAuth2Client> {
      let client = await this.loadSavedCredentialsIfExist();
      if (client) {
        return client;
      }
      client = await authenticate({
        scopes: this.SCOPES,
        keyfilePath: this.CREDENTIALS_PATH,
      });
      if (client.credentials) {
        await this.saveCredentials(client);
      }
      return client;
    }

    async getTaskLists(): Promise<TaskList[]|undefined> {
      try {
        const service = google.tasks({ version: 'v1', auth: this.client });
        const res = await service.tasklists.list();
        const taskLists = res.data.items;
    
        if (taskLists && taskLists.length) {
          
          console.log('Task lists found')
          return taskLists as TaskList[]
    
        } else {
          console.log('No task lists found.');
        }
      } catch (error) {
        console.log('Error fetching task lists');
      }
    }
    
    async getTasksFromList(listId: string): Promise<Task[]|undefined> {
      try {
        const service = google.tasks({ version: 'v1', auth: this.client });
        const res = await service.tasks.list(
            {
                tasklist : listId,
                showHidden : true
            }
        )
        const taskList = res.data.items
        if (taskList && taskList.length) {
            const formattedTaskList = taskList as Task[]
            formattedTaskList.forEach( task => task.taskListId = listId)
            console.log('List of tasks found. List ID:', listId)
            return formattedTaskList
        } else {
          console.log('No tasks found inside list. ID:', listId)
        }
      } catch (error) {
        console.log("Error fetching tasks from list. ID:", listId, error)
      }
    }
    
    async insertTaskList(list: TaskList) {
      
      const service = google.tasks({ version: 'v1', auth: this.client });
      try {
        await service.tasklists.insert( {
          requestBody: list
        })
        console.log("New tasklist created. ID:", list.id)
      } catch (error) {
        console.log("Error creating task list. ID:", list.id, error)
      }
    }
    
    async insertTask(task: Task) {
      
      const service = google.tasks({ version: 'v1', auth: this.client });
      try {
        await service.tasks.insert( {
          tasklist: task.taskListId,
          requestBody: task,
        })
        console.log("New task created. ID:", task.id)
      } catch (error) {
        console.log("Error creating task. ID:", task.id, error)
      }
    }
    
    async patchTaskList(list: TaskList) {
    
      const service = google.tasks({ version: 'v1', auth: this.client });
      try {
        await service.tasklists.patch( {
          tasklist: list.id,
          requestBody: list
        })
        console.log("Tasklist updated. ID:", list.id)
      } catch (error) {
        console.log("Error updating task list. ID:", list.id, error)
      }
    }
    
    async patchTask(task: Task) {
    
      const service = google.tasks({ version: 'v1', auth: this.client });
      try {
        await service.tasks.patch( {
          task: task.id,
          tasklist: task.taskListId,
          requestBody: task
        })
        console.log("Task updated. ID:", task.id)
      } catch (error) {
        console.log("Error updating task. ID:", task.id, error)
      }
    }
    
    async deleteTaskList(listId: string) {
    
      const service = google.tasks({ version: 'v1', auth: this.client });
      try {
        await service.tasklists.delete( {
          tasklist: listId
        })
        console.log("Tasklist deleted. ID:", listId)
      } catch (error) {
        console.log("Error deleting tasklist. ID:", listId, error)
      }
    }
    
    async deleteTask(task: Task) {
    
      const service = google.tasks({ version: 'v1', auth: this.client });
      try {
        await service.tasks.delete( {
          tasklist: task.taskListId,
          task: task.id
        })
        console.log("Task deleted. ID:", task.id)
      } catch (error) {
        console.log("Error deleting task. ID:", task.id, error)
      }
    }
}

export default new GoogleTasksService();