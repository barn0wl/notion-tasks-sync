import { CheckboxProperty, DateProperty, IPageObject, NotionData, RelationProperty, TextProperty, TitleProperty, URLProperty} from "../models/notionTypes.js"
import { TaskList, Task, SyncState } from "../models/types.js"

function parseListToNotionPage(list: TaskList) : IPageObject {
    return {
        properties: {
            Name: {
                type: "title",
                title: [
                    {
                        type: "text",
                        text: {
                            content: list.title
                        }
                    }
                ]
            },
            "List URL": {
                type: "url",
                url: list.selfLink?? ""
            },
            GTaskID : {
                "rich_text" : [{
                    type: "text",
                    text: {
                        content: list.id
                    }
                }]

            }
        }
    }
}

function parseTaskToNotionPage(task: Task, notionListPageId: string) : IPageObject {
    return {
        properties: {
            Name: {
                type: "title",
                title: [
                    {
                        type: "text",
                        text: {
                            content: task.title
                        }
                    }
                ]
            },
            Due: {
                type: "date",
                date: task.due? {
                    start: task.due,
                    } : null
            },
            Completed : {
                type: "date",
                date: task.completed? {
                    start: task.completed,
                    } : null
            },
            Done: {
                type: "checkbox",
                checkbox: task.status === 'completed'? true : false,
              },
            "Task URL": {
                type: "url",
                url: task.selfLink?? ""
            },
            Project : {
                type: "relation",
                relation: [{
                    id: notionListPageId
                }]
            },
            GTaskID : {
                "rich_text" : [{
                    type: "text",
                    text: {
                        content: task.id
                    }
                }]

            }
        }
    }
}

function parseNotionPageToList (page: IPageObject) : TaskList {
    const nameProp = page.properties.Name as TitleProperty
    const listIDProp = page.properties.GTaskID as TextProperty
    const linkProp = page.properties["List URL"] as URLProperty

    return {
        id: listIDProp.rich_text[0].text.content,
        title: nameProp.title[0].text.content,
        selfLink: linkProp.url
    }
}

function parseNotionPageToTask (page: IPageObject, projectsData: { pageId: string, list: TaskList }[] ) : Task {
    const nameProp = page.properties.Name as TitleProperty
    const taskIDProp = page.properties.GTaskID as TextProperty
    const dueProp = page.properties.Due as DateProperty
    const completedProp = page.properties.Completed as DateProperty
    const doneProp = page.properties.Done as CheckboxProperty
    const linkProp = page.properties["Task URL"] as URLProperty
    const relationProp = page.properties.Project as RelationProperty

    const projectPageId = relationProp.relation[0].id
    const projectData = projectsData.find( data => data.pageId === projectPageId)
    if (projectData) {
        const listId = projectData.list.id

        return {
            id: taskIDProp.rich_text[0].text.content,
            title: nameProp.title[0].text.content,
            selfLink: linkProp.url,
            status: doneProp.checkbox? "completed" : "needsAction",
            due: dueProp.date?.start,
            completed: completedProp.date?.start,
            taskListId: listId
        }
    } else {
        throw console.error("Project Id in this Notion Task page does not match any of the project Ids registered");  
    }
}

function parseNotionData (listPages: IPageObject[], taskPages: IPageObject[]) : NotionData {
    const data : NotionData = {
        tasks: [],
        projects:[]
    }

    listPages.forEach( listPage => {
        if (listPage.id) {
            const newList = {
                pageId: listPage.id,
                list: parseNotionPageToList(listPage)
            }
            data.projects.push(newList)
        }
    })

    taskPages.forEach( taskPage => {
        if (taskPage.id) {
            const relationProp = taskPage.properties.Project as RelationProperty
            const newTask = {
                pageId: taskPage.id,
                task: parseNotionPageToTask(taskPage, data.projects),
                projectPageId: relationProp.relation[0].id
            }
            data.tasks.push(newTask)
        }
    })
    return data
}

function parseNotionState (notionData: NotionData) : SyncState {
    const state: SyncState = {
        tasks: [],
        tasklists: []
    }

    notionData.tasks.forEach( taskData => state.tasks.push(taskData.task))
    notionData.projects.forEach( projectData => state.tasklists.push( projectData.list))

    return state
}

export default {parseListToNotionPage, parseTaskToNotionPage, parseNotionData, parseNotionState}