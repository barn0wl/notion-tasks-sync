import { SyncState, SyncStateChanges, Task, TaskList } from '../models/types.js';

// Helper: Create Map for quick lookups
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

// Helper: Check if a task or task list has changed
function isTask(target: Task | TaskList): target is Task {
    return (target as Task).status !== undefined;
}

function parseDate(dateString: string): Date {
    return new Date(dateString);
}

function areDatesEqual(date1: string, date2: string): boolean {
    const d1 = parseDate(date1);
    const d2 = parseDate(date2);
    return (
        d1.getFullYear() === d2.getFullYear() &&
        d1.getMonth() === d2.getMonth() &&
        d1.getDate() === d2.getDate()
    );
}

function hasDuePropertyChanged(due1: string | undefined, due2: string | undefined): boolean {
    return (
        (typeof due1 !== typeof due2) ||
        (
            typeof due1 === "string" && typeof due2 === "string" &&
            !areDatesEqual(due1, due2)
        )
    );
}

function hasChanged(current: Task | TaskList, old: Task | TaskList): boolean {
    if (isTask(current) && isTask(old)) {
        return (
            current.title !== old.title ||
            current.status !== old.status ||
            current.taskListId !== old.taskListId ||
            hasDuePropertyChanged(current.due, old.due)
        );
    } else if (!isTask(current) && !isTask(old)) {
        return current.title !== old.title;
    } else {
        throw new Error('The two parameters being compared are not of the same type');
    }
}

/**
 * Compare two SyncState objects and return the differences.
 * @param oldState - The previous state
 * @param newState - The new state to compare against
 * @returns SyncStateChanges containing added, deleted, and updated items
 */
export function compareStates(oldState: SyncState, newState: SyncState): SyncStateChanges {
    const changes: SyncStateChanges = {
        tasks: {
            added: [],
            deleted: [],
            updated: [],
        },
        taskLists: {
            added: [],
            deleted: [],
            updated: [],
        },
    };

    // Compare task lists
    const oldTaskListsMap = createTaskListMap(oldState.tasklists);
    const newTaskListsMap = createTaskListMap(newState.tasklists);

    // Detect added or updated task lists
    for (const newTaskList of newState.tasklists) {
        const oldTaskList = oldTaskListsMap.get(newTaskList.id);
        if (!oldTaskList) {
            changes.taskLists.added.push(newTaskList);
        } else {
            if (hasChanged(newTaskList, oldTaskList)) {
                changes.taskLists.updated.push(newTaskList);
            }
        }
    }

    // Detect deleted task lists
    for (const oldTaskList of oldState.tasklists) {
        if (!newTaskListsMap.has(oldTaskList.id)) {
            changes.taskLists.deleted.push(oldTaskList.id);
        }
    }

    // Compare tasks
    const oldTasksMap = createTaskMap(oldState.tasks);
    const newTasksMap = createTaskMap(newState.tasks);

    // Detect added or updated tasks
    for (const newTask of newState.tasks) {
        const oldTask = oldTasksMap.get(newTask.id);
        if (!oldTask) {
            changes.tasks.added.push(newTask);
        } else {
            if (hasChanged(newTask, oldTask)) {
                changes.tasks.updated.push(newTask);
            }
        }
    }

    // Detect deleted tasks
    for (const oldTask of oldState.tasks) {
        if (!newTasksMap.has(oldTask.id)) {
            changes.tasks.deleted.push(oldTask.id);
        }
    }

    return changes;
}
