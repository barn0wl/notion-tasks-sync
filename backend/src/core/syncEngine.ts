import { SyncState, SyncStateChanges } from '../models/types.js';
import { NotionData } from '../models/notionTypes.js';
import { syncStateRepository } from '../db/index.js';
import { compareStates } from './stateComparer.js';
import { reconcileChanges } from './changeReconciler.js';
import { applyChangesToState } from './stateApplier.js';

// Import services (these already exist)
import googleTasks from '../services/googleTasksService.js';
import notion from '../services/notionService.js';
import notionHelpers from '../helpers/notionHelpers.js';

export class SyncEngine {
    private googleTasksService: typeof googleTasks;
    private notionService: typeof notion;

    constructor() {
        this.googleTasksService = googleTasks;
        this.notionService = notion;
    }

    /**
     * Fetch current state from Notion
     */
    async fetchNotionState(): Promise<{ notionData: NotionData; notionState: SyncState } | null> {
        try {
            const myProjectsPages = await this.notionService.getListPages();
            const myTaskPages = await this.notionService.getTaskPages();

            if (myProjectsPages && myTaskPages) {
                const notionData = notionHelpers.parseNotionData(myProjectsPages, myTaskPages);
                const notionState = notionHelpers.parseNotionState(notionData);
                return { notionData, notionState };
            }
            return null;
        } catch (error) {
            console.error("Error fetching Notion state", error);
            return null;
        }
    }

    /**
     * Fetch current state from Google Tasks
     */
    async fetchGoogleTasksState(): Promise<SyncState | null> {
        try {
            const googleService = await this.googleTasksService.create();
            const myTaskLists = await googleService.getTaskLists();

            const myTasks = [];
            if (myTaskLists) {
                for (const taskList of myTaskLists) {
                    const tasks = await googleService.getTasksFromList(taskList.id);
                    if (tasks) {
                        for (const task of tasks) {
                            myTasks.push(task);
                        }
                    }
                }
            }

            return {
                tasklists: myTaskLists || [],
                tasks: myTasks
            };
        } catch (error) {
            console.error("Error fetching Google Tasks state", error);
            return null;
        }
    }

    /**
     * Push changes to Notion
     */
    async pushChangesToNotion(notionData: NotionData, changes: SyncStateChanges): Promise<void> {
        const googleService = await this.googleTasksService.create();

        // Task Lists (Projects in Notion)
        for (const addedList of changes.taskLists.added) {
            const pageId = await this.notionService.addListPageToNotion(
                notionHelpers.parseListToNotionPage(addedList)
            );
            if (pageId) {
                notionData.projects.push({
                    pageId: pageId,
                    list: addedList
                });
            }
        }

        for (const updatedList of changes.taskLists.updated) {
            const projectData = notionData.projects.find(project => updatedList.id === project.list.id);
            if (projectData) {
                await this.notionService.updateNotionListPage(projectData.pageId, updatedList.title);
                projectData.list.title = updatedList.title;
            }
        }

        for (const deletedId of changes.taskLists.deleted) {
            const projectData = notionData.projects.find(project => deletedId === project.list.id);
            if (projectData) {
                await this.notionService.archivePage(projectData.pageId);
                notionData.projects = notionData.projects.filter(p => p.pageId !== projectData.pageId);
            }
        }

        // Tasks
        for (const addedTask of changes.tasks.added) {
            const projectData = notionData.projects.find(project => addedTask.taskListId === project.list.id);
            if (projectData) {
                const pageId = await this.notionService.addTaskPageToNotion(
                    notionHelpers.parseTaskToNotionPage(addedTask, projectData.pageId)
                );
                if (pageId) {
                    notionData.tasks.push({
                        pageId: pageId,
                        task: addedTask,
                        projectPageId: projectData.pageId
                    });
                }
            }
        }

        for (const updatedTask of changes.tasks.updated) {
            const taskData = notionData.tasks.find(t => t.task.id === updatedTask.id);
            const projectData = notionData.projects.find(p => updatedTask.taskListId === p.list.id);
            if (taskData && projectData) {
                await this.notionService.updateNotionTaskPage(
                    taskData.pageId,
                    updatedTask,
                    projectData.pageId
                );
                taskData.task = updatedTask;
                taskData.projectPageId = projectData.pageId;
            }
        }

        for (const deletedId of changes.tasks.deleted) {
            const taskData = notionData.tasks.find(t => t.task.id === deletedId);
            if (taskData) {
                await this.notionService.archivePage(taskData.pageId);
                notionData.tasks = notionData.tasks.filter(t => t.pageId !== taskData.pageId);
            }
        }
    }

    /**
     * Push changes to Google Tasks
     */
    async pushChangesToGoogleTasks(changes: SyncStateChanges): Promise<void> {
        const googleService = await this.googleTasksService.create();

        // Task Lists
        for (const addedList of changes.taskLists.added) {
            await googleService.insertTaskList(addedList);
        }

        for (const updatedList of changes.taskLists.updated) {
            await googleService.patchTaskList(updatedList);
        }

        for (const deletedId of changes.taskLists.deleted) {
            await googleService.deleteTaskList(deletedId);
        }

        // Tasks
        for (const addedTask of changes.tasks.added) {
            await googleService.insertTask(addedTask);
        }

        for (const updatedTask of changes.tasks.updated) {
            await googleService.patchTask(updatedTask);
        }

        for (const deletedId of changes.tasks.deleted) {
            // Need to find the task to delete it properly
            const task = await googleService.getTaskById?.(deletedId);
            if (task) {
                await googleService.deleteTask(task);
            }
        }
    }

    /**
     * Run a full sync cycle
     * @returns True if successful, false otherwise
     */
    async runFullSync(): Promise<boolean> {
        try {
            console.log("Starting full sync cycle...");

            // 1. Initialize Google service
            await this.googleTasksService.create();
            console.log("✓ Google Tasks service initialized");

            // 2. Fetch states from both platforms
            console.log("Fetching Notion state...");
            const notionStateResponse = await this.fetchNotionState();
            console.log("Fetching Google Tasks state...");
            const googleTaskState = await this.fetchGoogleTasksState();

            if (!notionStateResponse || !googleTaskState) {
                console.error("Failed to fetch states from one or both platforms");
                return false;
            }

            const { notionData, notionState } = notionStateResponse;

            // 3. Load current synced state from database
            const currentSyncedState = await syncStateRepository.loadFullSyncState();
            console.log(`Loaded synced state: ${currentSyncedState.tasklists.length} lists, ${currentSyncedState.tasks.length} tasks`);

            // 4. Compare states to find changes
            const notionChanges = compareStates(currentSyncedState, notionState);
            const googleTaskChanges = compareStates(currentSyncedState, googleTaskState);

            console.log("Notion changes:", {
                lists: notionChanges.taskLists.added.length + notionChanges.taskLists.updated.length + notionChanges.taskLists.deleted.length,
                tasks: notionChanges.tasks.added.length + notionChanges.tasks.updated.length + notionChanges.tasks.deleted.length
            });
            console.log("Google changes:", {
                lists: googleTaskChanges.taskLists.added.length + googleTaskChanges.taskLists.updated.length + googleTaskChanges.taskLists.deleted.length,
                tasks: googleTaskChanges.tasks.added.length + googleTaskChanges.tasks.updated.length + googleTaskChanges.tasks.deleted.length
            });

            // 5. Reconcile conflicts (Google wins by default)
            const finalChanges = reconcileChanges(notionChanges, googleTaskChanges);

            // 6. Apply changes to in-memory synced state
            applyChangesToState(currentSyncedState, finalChanges);

            // 7. Push changes to both platforms
            console.log("Pushing changes to Notion...");
            await this.pushChangesToNotion(notionData, finalChanges);

            console.log("Pushing changes to Google Tasks...");
            await this.pushChangesToGoogleTasks(finalChanges);

            // 8. Save the new synced state to database
            await syncStateRepository.saveFullSyncState(currentSyncedState);
            await syncStateRepository.setLastSyncTime(new Date().toISOString());

            console.log("Sync cycle completed successfully!");
            return true;
        } catch (error) {
            console.error("Error during sync cycle:", error);
            return false;
        }
    }

    /**
     * Get the current synced state from database
     */
    async getCurrentSyncState(): Promise<SyncState> {
        return await syncStateRepository.loadFullSyncState();
    }

    /**
     * Get sync statistics
     */
    async getSyncStats() {
        return await syncStateRepository.getSyncStats();
    }
}

// Export a singleton instance
export const syncEngine = new SyncEngine();
