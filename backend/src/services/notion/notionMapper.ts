import { Task, TaskList } from '../../models/types.js';

import type {
    PageObjectResponse,
    RichTextItemResponse,
    DatePropertyItemObjectResponse,
    CheckboxPropertyItemObjectResponse,
    RelationPropertyItemObjectResponse,
    UrlPropertyItemObjectResponse
} from '@notionhq/client/build/src/api-endpoints.js';

// ============ Field Name Constants (Hardcoded for MVP) ============
export const NOTION_FIELD_MAPPING = {
    project: {
        nameField: 'Name',
        gTaskIdField: 'GTaskID',
        urlField: 'List URL',
        archiveField: 'Archive',
    },
    task: {
        nameField: 'Name',
        gTaskIdField: 'GTaskID',
        dueField: 'Due',
        completedField: 'Completed',
        doneField: 'Done',
        urlField: 'Task URL',
        projectRelationField: 'Project',
        archiveField: 'Archive',
    }
} as const;

// ============ Inline property shapes (from page.properties) ============
type TitlePageProperty = {
    type: 'title';
    title: Array<RichTextItemResponse>;
    id: string;
};

type RichTextPageProperty = {
    type: 'rich_text';
    rich_text: Array<RichTextItemResponse>;
    id: string;
};

type UrlPageProperty = {
    type: 'url';
    url: string | null;
    id: string;
};

type DatePageProperty = {
    type: 'date';
    date: { start: string; end: string | null; time_zone: string | null } | null;
    id: string;
};

type CheckboxPageProperty = {
    type: 'checkbox';
    checkbox: boolean;
    id: string;
};

type RelationPageProperty = {
    type: 'relation';
    relation: Array<{ id: string }>;
    id: string;
};

// ============ Type Guards ============
function isPageObjectResponse(page: any): page is PageObjectResponse {
    return page && page.object === 'page' && page.properties;
}

// ============ Project (Task List) Mapping ============

export function taskListToNotionProperties(taskList: TaskList): Record<string, any> {
    const { nameField, gTaskIdField, urlField } = NOTION_FIELD_MAPPING.project;
    return {
        [nameField]: {
            title: [{ text: { content: taskList.title } }]
        },
        [gTaskIdField]: {
            rich_text: [{ text: { content: taskList.id } }]
        },
        [urlField]: {
            url: taskList.selfLink || ''
        }
    };
}

export function notionPageToTaskList(page: PageObjectResponse): TaskList | null {
    if (!isPageObjectResponse(page)) return null;
    const { nameField, gTaskIdField, urlField } = NOTION_FIELD_MAPPING.project;
    const props = page.properties;

    const titleProp = props[nameField] as unknown as TitlePageProperty;
    const gTaskIdProp = props[gTaskIdField] as unknown as RichTextPageProperty;
    const urlProp = props[urlField] as unknown as UrlPageProperty;

    if (!titleProp?.title?.[0]?.plain_text) return null;
    if (!gTaskIdProp?.rich_text?.[0]?.plain_text) return null;

    return {
        id: gTaskIdProp.rich_text[0].plain_text,
        title: titleProp.title[0].plain_text,
        selfLink: urlProp?.url || undefined
    };
}

// ============ Task Mapping ============

export function taskToNotionProperties(task: Task, projectPageId: string): Record<string, any> {
    const { nameField, gTaskIdField, dueField, completedField, doneField, urlField, projectRelationField } = NOTION_FIELD_MAPPING.task;
    return {
        [nameField]: {
            title: [{ text: { content: task.title } }]
        },
        [gTaskIdField]: {
            rich_text: [{ text: { content: task.id } }]
        },
        [dueField]: {
            date: task.due ? { start: task.due } : null
        },
        [completedField]: {
            date: task.completed ? { start: task.completed } : null
        },
        [doneField]: {
            checkbox: task.status === 'completed'
        },
        [urlField]: {
            url: task.selfLink || ''
        },
        [projectRelationField]: {
            relation: [{ id: projectPageId }]
        }
    };
}

export function notionPageToTask(
    page: PageObjectResponse,
    projectPageToTaskListMap: Map<string, TaskList>
): Task | null {
    if (!isPageObjectResponse(page)) return null;
    const { nameField, gTaskIdField, dueField, completedField, doneField, urlField, projectRelationField } = NOTION_FIELD_MAPPING.task;
    const props = page.properties;

    const titleProp = props[nameField] as unknown as TitlePageProperty;
    const gTaskIdProp = props[gTaskIdField] as unknown as RichTextPageProperty;
    const dueProp = props[dueField] as unknown as DatePageProperty;
    const completedProp = props[completedField] as unknown as DatePageProperty;
    const doneProp = props[doneField] as unknown as CheckboxPageProperty;
    const urlProp = props[urlField] as unknown as UrlPageProperty;
    const relationProp = props[projectRelationField] as unknown as RelationPageProperty;

    if (!titleProp?.title?.[0]?.plain_text) return null;
    if (!gTaskIdProp?.rich_text?.[0]?.plain_text) return null;

    const projectPageId = relationProp?.relation?.[0]?.id;
    if (!projectPageId) return null;

    const taskList = projectPageToTaskListMap.get(projectPageId);
    if (!taskList) return null;

    return {
        id: gTaskIdProp.rich_text[0].plain_text,
        title: titleProp.title[0].plain_text,
        selfLink: urlProp?.url || undefined,
        status: doneProp?.checkbox ? 'completed' : 'needsAction',
        due: dueProp?.date?.start || undefined,
        completed: completedProp?.date?.start || undefined,
        taskListId: taskList.id
    };
}

export function taskUpdateToNotionProperties(updatedTask: Task, projectPageId: string): Record<string, any> {
    const { nameField, dueField, completedField, doneField, projectRelationField } = NOTION_FIELD_MAPPING.task;
    return {
        [nameField]: {
            title: [{ text: { content: updatedTask.title } }]
        },
        [dueField]: {
            date: updatedTask.due ? { start: updatedTask.due } : null
        },
        [completedField]: {
            date: updatedTask.completed ? { start: updatedTask.completed } : null
        },
        [doneField]: {
            checkbox: updatedTask.status === 'completed'
        },
        [projectRelationField]: {
            relation: [{ id: projectPageId }]
        }
    };
}
