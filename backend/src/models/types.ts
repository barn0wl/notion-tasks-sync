export interface Task {
    id: string,
    title: string,
    selfLink?: string,
    status: string,
    due?: string,
    completed?: string,
    taskListId: string
}

export interface TaskList {
    id: string,
    title: string,
    selfLink?: string
}

export interface SyncState {
    tasklists: TaskList[]
    tasks: Task[]
}

export interface SyncStateChanges {
    tasks: {
      added: Task[]
      deleted: string[]
      updated: Task[]
    };
    taskLists: {
      added: TaskList[]
      deleted: string[]
      updated: TaskList[]
    };
}

export interface PrioritizedTask extends Task {
    priority: number;  // 1-5 scale, where 5 is highest priority
    priorityBreakdown: {
        dueScore: number;
        keywordScore: number;
        listScore: number;
        totalScore: number;
    };
}
