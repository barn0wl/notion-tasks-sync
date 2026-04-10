import { SyncStateChanges, Task, TaskList } from '../models/types.js';

// Helper types for the reconciliation strategy
export interface ConflictResolutionStrategy {
    resolveTaskListConflicts(
        notionChanges: SyncStateChanges,
        googleChanges: SyncStateChanges
    ): SyncStateChanges;
}

/**
 * Default strategy: Google Tasks always wins.
 * When there's a conflict, Google's version takes priority.
 */
export class GoogleWinsStrategy implements ConflictResolutionStrategy {
    resolveTaskListConflicts(
        notionChanges: SyncStateChanges,
        googleChanges: SyncStateChanges
    ): SyncStateChanges {
        const finalChanges: SyncStateChanges = {
            tasks: { added: [], deleted: [], updated: [] },
            taskLists: { added: [], deleted: [], updated: [] }
        };

        // Helper Maps
        const googleAddedTaskListsMap = new Map<string, TaskList>();
        googleChanges.taskLists.added.forEach(list => googleAddedTaskListsMap.set(list.id, list));

        const googleUpdatedTaskListsMap = new Map<string, TaskList>();
        googleChanges.taskLists.updated.forEach(list => googleUpdatedTaskListsMap.set(list.id, list));

        const googleAddedTasksMap = new Map<string, Task>();
        googleChanges.tasks.added.forEach(task => googleAddedTasksMap.set(task.id, task));

        const googleUpdatedTasksMap = new Map<string, Task>();
        googleChanges.tasks.updated.forEach(task => googleUpdatedTasksMap.set(task.id, task));

        // ===== Task Lists =====
        // Google changes are applied unconditionally (Google wins)
        googleChanges.taskLists.updated.forEach(update => finalChanges.taskLists.updated.push(update));
        googleChanges.taskLists.deleted.forEach(deleteId => finalChanges.taskLists.deleted.push(deleteId));
        googleChanges.taskLists.added.forEach(newList => finalChanges.taskLists.added.push(newList));

        // Notion changes are applied only if they don't conflict with Google
        // Updated lists: only if not also updated or deleted by Google
        notionChanges.taskLists.updated.forEach(update => {
            if (!googleChanges.taskLists.deleted.includes(update.id) &&
                !googleUpdatedTaskListsMap.has(update.id)) {
                finalChanges.taskLists.updated.push(update);
            }
        });

        // Deleted lists: only if not also updated or deleted by Google
        notionChanges.taskLists.deleted.forEach(deleteId => {
            if (!googleChanges.taskLists.deleted.includes(deleteId) &&
                !googleUpdatedTaskListsMap.has(deleteId)) {
                finalChanges.taskLists.deleted.push(deleteId);
            }
        });

        // Added lists: only if not already added by Google
        notionChanges.taskLists.added.forEach(newList => {
            if (!googleAddedTaskListsMap.has(newList.id)) {
                finalChanges.taskLists.added.push(newList);
            }
        });

        // ===== Tasks =====
        // Google changes are applied unconditionally
        googleChanges.tasks.updated.forEach(update => finalChanges.tasks.updated.push(update));
        googleChanges.tasks.deleted.forEach(deleteId => finalChanges.tasks.deleted.push(deleteId));
        googleChanges.tasks.added.forEach(newTask => finalChanges.tasks.added.push(newTask));

        // Notion changes are applied only if they don't conflict with Google
        notionChanges.tasks.updated.forEach(update => {
            if (!googleChanges.tasks.deleted.includes(update.id) &&
                !googleUpdatedTasksMap.has(update.id)) {
                finalChanges.tasks.updated.push(update);
            }
        });

        notionChanges.tasks.deleted.forEach(deleteId => {
            if (!googleChanges.tasks.deleted.includes(deleteId) &&
                !googleUpdatedTasksMap.has(deleteId)) {
                finalChanges.tasks.deleted.push(deleteId);
            }
        });

        notionChanges.tasks.added.forEach(newTask => {
            if (!googleAddedTasksMap.has(newTask.id)) {
                finalChanges.tasks.added.push(newTask);
            }
        });

        return finalChanges;
    }
}

// Optional: A more sophisticated strategy (for future)
export class LastWriteWinsStrategy implements ConflictResolutionStrategy {
    resolveTaskListConflicts(
        notionChanges: SyncStateChanges,
        googleChanges: SyncStateChanges
    ): SyncStateChanges {
        // This would compare timestamps instead of blindly favoring Google
        // For now, just delegate to GoogleWins
        console.warn('LastWriteWinsStrategy not fully implemented, falling back to GoogleWins');
        const fallback = new GoogleWinsStrategy();
        return fallback.resolveTaskListConflicts(notionChanges, googleChanges);
    }
}

// Singleton instance with default strategy
let currentStrategy: ConflictResolutionStrategy = new GoogleWinsStrategy();

/**
 * Set the conflict resolution strategy at runtime.
 * Useful for testing or future enhancements.
 */
export function setConflictResolutionStrategy(strategy: ConflictResolutionStrategy): void {
    currentStrategy = strategy;
}

/**
 * Reconcile changes from Notion and Google Tasks into a single set of changes to apply.
 * @param notionChanges - Changes detected from Notion
 * @param googleChanges - Changes detected from Google Tasks
 * @returns Final reconciled changes to apply to both systems
 */
export function reconcileChanges(
    notionChanges: SyncStateChanges,
    googleChanges: SyncStateChanges
): SyncStateChanges {
    return currentStrategy.resolveTaskListConflicts(notionChanges, googleChanges);
}
