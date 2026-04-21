import { SyncState, SyncStateChanges, Task, TaskList } from '../models/types.js';
import { syncStateRepository } from '../db/index.js';
import { compareStates } from './stateComparer.js';
import { reconcileChanges } from './changeReconciler.js';
import { applyChangesToState } from './stateApplier.js';

import { googleTasksService } from '../services/google/googleTasksService.js';
import { notionService } from '../services/notion/notionService.js';
import { notionPageToTaskList, notionPageToTask } from '../services/notion/notionMapper.js';
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints.js';

/**
 * Runtime index of Notion page IDs, rebuilt each sync cycle.
 * Maps GTask IDs -> Notion page IDs.
 */
interface NotionPageIndex {
    /** GTask TaskList ID -> Notion project page ID */
    projectPageIdByGTaskId: Map<string, string>;
    /** GTask Task ID -> Notion task page ID */
    taskPageIdByGTaskId: Map<string, string>;
    /** Notion project page ID -> TaskList (needed for task mapping) */
    taskListByProjectPageId: Map<string, TaskList>;
}

function buildNotionPageIndex(
    projectPages: PageObjectResponse[],
    taskPages: PageObjectResponse[]
): { index: NotionPageIndex; notionState: SyncState } {
    const index: NotionPageIndex = {
        projectPageIdByGTaskId: new Map(),
        taskListByProjectPageId: new Map(),
        taskPageIdByGTaskId: new Map(),
    };

    const taskLists: TaskList[] = [];

    for (const page of projectPages) {
        const taskList = notionPageToTaskList(page);
        if (taskList) {
            index.projectPageIdByGTaskId.set(taskList.id, page.id);
            index.taskListByProjectPageId.set(page.id, taskList);
            taskLists.push(taskList);
        }
    }

    const tasks: Task[] = [];
    for (const page of taskPages) {
        const task = notionPageToTask(page, index.taskListByProjectPageId);
        if (task) {
            index.taskPageIdByGTaskId.set(task.id, page.id);
            tasks.push(task);
        }
    }

    return {
        index,
        notionState: { tasklists: taskLists, tasks },
    };
}

export class SyncEngine {
    private googleTasksService: typeof googleTasksService;
    private notionService: typeof notionService;

    constructor() {
        this.googleTasksService = googleTasksService;
        this.notionService = notionService;
    }

    // ============ Auth ============

    private async verifyAuth(): Promise<boolean> {
        console.log('Verifying Google Tasks authentication...');
        const isAuthenticated = await this.googleTasksService.isAuthenticated();
        if (!isAuthenticated) {
            const status = await this.googleTasksService.getAuthStatus();
            console.error('Authentication required:', status.error);
            await this.googleTasksService.reauthenticate();
            console.log('Please run /sync again after authentication');
            return false;
        }
        const isConnected = await this.googleTasksService.testConnection();
        if (!isConnected) {
            console.error('Connection test failed');
            return false;
        }
        console.log('Authentication verified successfully');
        return true;
    }

    // ============ Fetch States ============

    async fetchNotionState(): Promise<{ index: NotionPageIndex; notionState: SyncState } | null> {
        try {
            const projectPages = await this.notionService.getProjectPages();
            const taskPages = await this.notionService.getTaskPages();
            const { index, notionState } = buildNotionPageIndex(projectPages, taskPages);
            return { index, notionState };
        } catch (error) {
            console.error('Error fetching Notion state', error);
            return null;
        }
    }

    async fetchGoogleTasksState(): Promise<SyncState | null> {
        try {
            const tasklists = await this.googleTasksService.getTaskLists();
            const tasks: Task[] = [];
            for (const list of tasklists) {
                const listTasks = await this.googleTasksService.getTasksFromList(list.id);
                tasks.push(...listTasks);
            }
            return { tasklists, tasks };
        } catch (error) {
            console.error('Error fetching Google Tasks state', error);
            return null;
        }
    }

    // ============ Push to Notion ============

    async pushChangesToNotion(index: NotionPageIndex, changes: SyncStateChanges): Promise<void> {
        // --- Task Lists ---
        for (const addedList of changes.taskLists.added) {
            const pageId = await this.notionService.createTaskList(addedList);
            // Register the new page in the index so tasks added in the same
            // cycle can find the correct project page ID.
            index.projectPageIdByGTaskId.set(addedList.id, pageId);
            index.taskListByProjectPageId.set(pageId, addedList);
        }

        for (const updatedList of changes.taskLists.updated) {
            const pageId = index.projectPageIdByGTaskId.get(updatedList.id);
            if (pageId) {
                await this.notionService.updateTaskList(pageId, updatedList.title);
            } else {
                console.warn(`No Notion page found for updated task list: ${updatedList.id}`);
            }
        }

        for (const deletedId of changes.taskLists.deleted) {
            const pageId = index.projectPageIdByGTaskId.get(deletedId);
            if (pageId) {
                await this.notionService.archivePage(pageId);
                index.projectPageIdByGTaskId.delete(deletedId);
            } else {
                console.warn(`No Notion page found for deleted task list: ${deletedId}`);
            }
        }

        // --- Tasks ---
        for (const addedTask of changes.tasks.added) {
            const projectPageId = index.projectPageIdByGTaskId.get(addedTask.taskListId);
            if (projectPageId) {
                const pageId = await this.notionService.createTask(addedTask, projectPageId);
                index.taskPageIdByGTaskId.set(addedTask.id, pageId);
            } else {
                console.warn(`No Notion project page found for task list: ${addedTask.taskListId}, skipping task ${addedTask.id}`);
            }
        }

        for (const updatedTask of changes.tasks.updated) {
            const taskPageId = index.taskPageIdByGTaskId.get(updatedTask.id);
            const projectPageId = index.projectPageIdByGTaskId.get(updatedTask.taskListId);
            if (taskPageId && projectPageId) {
                await this.notionService.updateTask(taskPageId, updatedTask, projectPageId);
            } else {
                console.warn(`Missing page IDs for updated task ${updatedTask.id}: taskPageId=${taskPageId}, projectPageId=${projectPageId}`);
            }
        }

        for (const deletedId of changes.tasks.deleted) {
            const taskPageId = index.taskPageIdByGTaskId.get(deletedId);
            if (taskPageId) {
                await this.notionService.archivePage(taskPageId);
                index.taskPageIdByGTaskId.delete(deletedId);
            } else {
                console.warn(`No Notion page found for deleted task: ${deletedId}`);
            }
        }
    }

    // ============ Push to Google Tasks ============

    async pushChangesToGoogleTasks(changes: SyncStateChanges): Promise<void> {
        for (const addedList of changes.taskLists.added) {
            await this.googleTasksService.insertTaskList(addedList);
        }
        for (const updatedList of changes.taskLists.updated) {
            await this.googleTasksService.patchTaskList(updatedList);
        }
        for (const deletedId of changes.taskLists.deleted) {
            await this.googleTasksService.deleteTaskList(deletedId);
        }

        for (const addedTask of changes.tasks.added) {
            await this.googleTasksService.insertTask(addedTask);
        }
        for (const updatedTask of changes.tasks.updated) {
            await this.googleTasksService.patchTask(updatedTask);
        }
        for (const deletedId of changes.tasks.deleted) {
            const task = await this.googleTasksService.getTaskById(deletedId);
            if (task) {
                await this.googleTasksService.deleteTask(task);
            } else {
                console.warn(`Task not found in Google Tasks for deletion: ${deletedId}`);
            }
        }
    }

    // ============ Full Sync ============

    async runFullSync(): Promise<boolean> {
        try {
            console.log('Starting full sync cycle...');

            const authValid = await this.verifyAuth();
            if (!authValid) {
                console.error('Cannot proceed: authentication failed');
                return false;
            }

            // 1. Fetch current state from both platforms
            console.log('Fetching Notion state...');
            const notionResult = await this.fetchNotionState();

            console.log('Fetching Google Tasks state...');
            const googleState = await this.fetchGoogleTasksState();

            if (!notionResult || !googleState) {
                console.error('Failed to fetch states from one or both platforms');
                return false;
            }

            const { index, notionState } = notionResult;

            // 2. Load last synced state from DB
            const syncedState = await syncStateRepository.loadFullSyncState();
            console.log(`Loaded synced state: ${syncedState.tasklists.length} lists, ${syncedState.tasks.length} tasks`);

            // 3. Diff each platform against the last synced state
            const notionChanges = compareStates(syncedState, notionState);
            const googleChanges = compareStates(syncedState, googleState);

            console.log('Notion changes:', {
                lists: notionChanges.taskLists.added.length + notionChanges.taskLists.updated.length + notionChanges.taskLists.deleted.length,
                tasks: notionChanges.tasks.added.length + notionChanges.tasks.updated.length + notionChanges.tasks.deleted.length,
            });
            console.log('Google changes:', {
                lists: googleChanges.taskLists.added.length + googleChanges.taskLists.updated.length + googleChanges.taskLists.deleted.length,
                tasks: googleChanges.tasks.added.length + googleChanges.tasks.updated.length + googleChanges.tasks.deleted.length,
            });

            // 4. Reconcile conflicts (Google wins by default)
            const finalChanges = reconcileChanges(notionChanges, googleChanges);

            // 5. Apply changes to in-memory synced state
            applyChangesToState(syncedState, finalChanges);

            // 6. Push to both platforms
            console.log('Pushing changes to Notion...');
            await this.pushChangesToNotion(index, finalChanges);

            console.log('Pushing changes to Google Tasks...');
            await this.pushChangesToGoogleTasks(finalChanges);

            // 7. Persist new synced state
            await syncStateRepository.saveFullSyncState(syncedState);
            await syncStateRepository.setLastSyncTime(new Date().toISOString());

            console.log('Sync cycle completed successfully!');
            return true;
        } catch (error) {
            console.error('Error during sync cycle:', error);
            return false;
        }
    }

    // ============ Utilities ============

    async getCurrentSyncState(): Promise<SyncState> {
        return syncStateRepository.loadFullSyncState();
    }

    async getSyncStats() {
        return syncStateRepository.getSyncStats();
    }
}

export const syncEngine = new SyncEngine();