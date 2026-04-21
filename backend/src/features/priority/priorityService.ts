import { Task, TaskList, PrioritizedTask } from '../../models/types.js';
import { syncStateRepository } from '../../db/syncStateRepository.js';

export interface PriorityConfig {
    overdueWeight: number;
    dueTodayWeight: number;
    dueWithin3DaysWeight: number;
    highPriorityKeywords: string[];
    highPriorityWeight: number;
    mediumPriorityKeywords: string[];
    mediumPriorityWeight: number;
    taskListWeights: Map<string, number>;
    defaultListWeight: number;
}

export class PriorityService {
    private config: PriorityConfig;
    private repository = syncStateRepository;

    constructor(config?: Partial<PriorityConfig>) {
        const defaultConfig: PriorityConfig = {
            overdueWeight: 2,
            dueTodayWeight: 2,
            dueWithin3DaysWeight: 1,
            highPriorityKeywords: ['urgent', 'asap', 'critical', 'deadline', '!!', '!!!'],
            highPriorityWeight: 2,
            mediumPriorityKeywords: ['important', 'soon', 'today', 'tomorrow', '!'],
            mediumPriorityWeight: 1,
            taskListWeights: new Map([
                ['Work', 2],
                ['Personal', 1],
                ['Shopping', 0],
                ['Errands', 0],
                ['Ideas', -1],
                ['Someday', -1],
            ]),
            defaultListWeight: 0,
        };

        this.config = { ...defaultConfig, ...config };
        if (config?.taskListWeights) {
            this.config.taskListWeights = new Map([
                ...defaultConfig.taskListWeights,
                ...config.taskListWeights
            ]);
        }
    }

    // ============ DB access via repository ============

    async getAllPendingTasks(taskListId?: string): Promise<Task[]> {
        const tasks = taskListId
            ? await this.repository.getTasksByListId(taskListId)
            : await this.repository.getAllTasks();
        return tasks.filter(t => t.status !== 'completed');
    }

    async getTaskById(taskId: string): Promise<Task | null> {
        return this.repository.getTaskById(taskId);
    }

    async getTaskListById(taskListId: string): Promise<TaskList | null> {
        return this.repository.getTaskListById(taskListId);
    }

    async getAllTaskListsMap(): Promise<Map<string, TaskList>> {
        const lists = await this.repository.getAllTaskLists();
        const map = new Map<string, TaskList>();
        for (const list of lists) {
            map.set(list.id, list);
        }
        return map;
    }

    // ============ Scoring logic ============

    private calculateDueScore(dueDate?: string): number {
        if (!dueDate) return 0;

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const due = new Date(dueDate);
        due.setHours(0, 0, 0, 0);

        const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays < 0)  return this.config.overdueWeight;
        if (diffDays === 0) return this.config.dueTodayWeight;
        if (diffDays <= 3)  return this.config.dueWithin3DaysWeight;
        return 0;
    }

    private calculateKeywordScore(title: string): number {
        const lower = title.toLowerCase();
        let score = 0;

        for (const kw of this.config.highPriorityKeywords) {
            if (lower.includes(kw.toLowerCase())) {
                score += this.config.highPriorityWeight;
                break;
            }
        }
        for (const kw of this.config.mediumPriorityKeywords) {
            if (lower.includes(kw.toLowerCase())) {
                score += this.config.mediumPriorityWeight;
                break;
            }
        }
        return score;
    }

    private calculateListScore(taskList?: TaskList): number {
        if (!taskList) return this.config.defaultListWeight;

        for (const [name, weight] of this.config.taskListWeights) {
            if (taskList.title.toLowerCase() === name.toLowerCase()) return weight;
        }
        for (const [name, weight] of this.config.taskListWeights) {
            if (taskList.title.toLowerCase().includes(name.toLowerCase())) return weight;
        }
        return this.config.defaultListWeight;
    }

    private normalizeToPriority(totalScore: number): number {
        if (totalScore <= -0.5) return 1;
        if (totalScore <= 0.5)  return 2;
        if (totalScore <= 1.5)  return 3;
        if (totalScore <= 2.5)  return 4;
        return 5;
    }

    private taskSortComparator(a: PrioritizedTask, b: PrioritizedTask): number {
        if (a.priority !== b.priority) return b.priority - a.priority;
        if (a.due && b.due) return new Date(a.due).getTime() - new Date(b.due).getTime();
        if (a.due) return -1;
        if (b.due) return 1;
        return a.title.localeCompare(b.title);
    }

    // ============ Public API ============

    /**
     * Score a single task synchronously. Pass taskList to avoid a DB fetch.
     */
    scoreTask(task: Task, taskList?: TaskList): PrioritizedTask {
        const dueScore = this.calculateDueScore(task.due);
        const keywordScore = this.calculateKeywordScore(task.title);
        const listScore = this.calculateListScore(taskList);
        const totalScore = dueScore + keywordScore + listScore;
        const priority = this.normalizeToPriority(totalScore);

        return {
            ...task,
            priority,
            priorityBreakdown: { dueScore, keywordScore, listScore, totalScore }
        };
    }

    /**
     * Fetch a task by ID and return it with its priority score.
     */
    async scoreTaskById(taskId: string): Promise<PrioritizedTask | null> {
        const task = await this.getTaskById(taskId);
        if (!task) return null;
        const taskList = await this.getTaskListById(task.taskListId);
        return this.scoreTask(task, taskList ?? undefined);
    }

    /**
     * Convenience alias used by the controller.
     */
    async getPrioritizedTaskById(taskId: string): Promise<PrioritizedTask | null> {
        return this.scoreTaskById(taskId);
    }

    /**
     * Get all pending tasks scored and sorted by priority.
     * @param taskListId - Optional filter by task list ID
     */
    async getPrioritizedTasks(taskListId?: string): Promise<PrioritizedTask[]> {
        const [tasks, taskListsMap] = await Promise.all([
            this.getAllPendingTasks(taskListId),
            this.getAllTaskListsMap()
        ]);

        return tasks
            .map(task => this.scoreTask(task, taskListsMap.get(task.taskListId)))
            .sort((a, b) => this.taskSortComparator(a, b));
    }

    updateConfig(config: Partial<PriorityConfig>): void {
        if (config.overdueWeight !== undefined) this.config.overdueWeight = config.overdueWeight;
        if (config.dueTodayWeight !== undefined) this.config.dueTodayWeight = config.dueTodayWeight;
        if (config.dueWithin3DaysWeight !== undefined) this.config.dueWithin3DaysWeight = config.dueWithin3DaysWeight;
        if (config.highPriorityKeywords !== undefined) this.config.highPriorityKeywords = config.highPriorityKeywords;
        if (config.highPriorityWeight !== undefined) this.config.highPriorityWeight = config.highPriorityWeight;
        if (config.mediumPriorityKeywords !== undefined) this.config.mediumPriorityKeywords = config.mediumPriorityKeywords;
        if (config.mediumPriorityWeight !== undefined) this.config.mediumPriorityWeight = config.mediumPriorityWeight;
        if (config.defaultListWeight !== undefined) this.config.defaultListWeight = config.defaultListWeight;
        if (config.taskListWeights !== undefined) this.config.taskListWeights = new Map(config.taskListWeights);
        console.log('Priority configuration updated');
    }

    getConfig(): PriorityConfig {
        return { ...this.config };
    }
}

export const priorityService = new PriorityService();
