import { SyncState, SyncStateChanges, Task, TaskList } from '../models/types.js';

function createTaskListMap(taskLists: TaskList[]): Map<string, TaskList> {
    const map = new Map<string, TaskList>();
    for (const taskList of taskLists) {
        map.set(taskList.id, taskList);
    }
    return map;
}

function createTaskMap(tasks: Task[]): Map<string, Task> {
    const map = new Map<string, Task>();
    for (const task of tasks) {
        map.set(task.id, task);
    }
    return map;
}

/**
 * Apply a set of changes to a SyncState object (mutates the object).
 * @param stateToUpdate - The state to mutate
 * @param changes - The changes to apply
 */
export function applyChangesToState(stateToUpdate: SyncState, changes: SyncStateChanges): void {
    // Apply task list changes
    const taskListMap = createTaskListMap(stateToUpdate.tasklists);

    // Add new task lists
    for (const addedList of changes.taskLists.added) {
        stateToUpdate.tasklists.push(addedList);
    }

    // Update existing task lists
    for (const update of changes.taskLists.updated) {
        const foundList = taskListMap.get(update.id);
        if (foundList) {
            // Mutate in place
            foundList.title = update.title;
            foundList.selfLink = update.selfLink;
        } else {
            stateToUpdate.tasklists.push(update);
        }
    }

    // Delete task lists
    for (const idToDelete of changes.taskLists.deleted) {
        stateToUpdate.tasklists = stateToUpdate.tasklists.filter(list => list.id !== idToDelete);
    }

    // Apply task changes
    const taskMap = createTaskMap(stateToUpdate.tasks);

    // Add new tasks
    for (const addedTask of changes.tasks.added) {
        stateToUpdate.tasks.push(addedTask);
    }

    // Update existing tasks
    for (const update of changes.tasks.updated) {
        const foundTask = taskMap.get(update.id);
        if (foundTask) {
            // Mutate in place
            foundTask.title = update.title;
            foundTask.status = update.status;
            foundTask.due = update.due;
            foundTask.completed = update.completed;
            foundTask.taskListId = update.taskListId;
            foundTask.selfLink = update.selfLink;
        } else {
            stateToUpdate.tasks.push(update);
        }
    }

    // Delete tasks
    for (const idToDelete of changes.tasks.deleted) {
        stateToUpdate.tasks = stateToUpdate.tasks.filter(task => task.id !== idToDelete);
    }
}
