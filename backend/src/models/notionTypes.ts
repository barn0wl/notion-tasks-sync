import { Task, TaskList } from "./types.js"

export interface IPageObject {
    id?: string,
    properties: PageObjectProperties
}

interface PageObjectProperties {
    [key: string] : TitleProperty | DateProperty | RelationProperty | CheckboxProperty | URLProperty | TextProperty
}

export interface TitleProperty {
    type?: "title",
    title: [
        {
            type?: "text",
            text: {
                content: string
            }
        }
    ]
}

export interface CheckboxProperty {
    type?: "checkbox",
    checkbox: boolean,
  }

export interface DateProperty {
    type?: "date",
    date: {
        start: string,
        } | null
}

export interface RelationProperty {
    type?: "relation",
    relation : {
        id : string,
    }[]
}

export interface URLProperty {
    type?: "url",
    url : string
}

export interface TextProperty {
    "rich_text": {
        type?: "text",
        text: {
            content: string
        }
    }[]
}

export interface NotionData {
    tasks: {
        pageId: string,
        task: Task,
        projectPageId: string
    }[],
    projects: {
        pageId: string,
        list: TaskList,
    }[]
}