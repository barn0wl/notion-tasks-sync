//Model imports
import { SyncState, SyncStateChanges, Task} from "../models/types.js"
import { NotionData } from "../models/notionTypes.js";

//Services
import googleTasks from '../services/googleTasksService.js';
import notion from "../services/notionService.js";

//Helpers
import notionHelpers from "../helpers/notionHelpers.js";
import stateHelpers from "../helpers/stateHelpers.js";

class App {

    tasks = googleTasks

    syncState: SyncState = {
        tasklists: [],
        tasks: []
    }

    async getNotionState(): Promise<{notionData: NotionData;notionState: SyncState;} | undefined> {
        try {
            const myProjectsPages = await notion.getListPages()
            const myTaskPages = await notion.getTaskPages()
            if (myProjectsPages && myTaskPages) {
                const notionData = notionHelpers.parseNotionData(myProjectsPages, myTaskPages)
                const notionState = notionHelpers.parseNotionState(notionData)
                return { notionData, notionState }
            }
        } catch (error) {
            console.log("Error fetching Notion state", error)
        }
    }

    async getGoogleTasksState(): Promise<SyncState | undefined> {
        try {
            const myTaskLists = await this.tasks.getTaskLists()
            const myTasks : Task[] = []
            if (myTaskLists) {
                await Promise.all( myTaskLists.map( async taskList => {
                    const listId = taskList.id
                    const tasks = await this.tasks.getTasksFromList(listId)
                    if (tasks) tasks.forEach( task => myTasks.push(task))
                }))
                return {
                    tasklists: myTaskLists,
                    tasks: myTasks
                }
            }
        } catch (error) {
            console.log("Error fetching Google Tasks state", error)
        } 
    }

    async pushChangesToNotion (data: NotionData, changes: SyncStateChanges) {
        //taskLists
        await Promise.all(
            changes.taskLists.added.map( async addedList => {
                //first, we push the change to Notion
                const pageId = await notion.addListPageToNotion(notionHelpers.parseListToNotionPage(addedList))
                //then, we update the Notion data to reflect the new changes
                if (pageId) data.projects.push({
                    pageId: pageId,
                    list: addedList
                })
                else console.log("Error while adding list page")
            })
        )
    
        await Promise.all(
            changes.taskLists.updated.map( async updatedList => {
                let projectData = data.projects.find(project => updatedList.id === project.list.id)
                if (projectData) {
                    try {
                        await notion.updateNotionListPage(projectData.pageId, updatedList.title)
                        projectData.list.title = updatedList.title
                    } catch (error) {
                        console.log("Error updating list page", error)
                    }
                } else console.log("Project page for this list wasnt found in database")
            })
        )
    
        await Promise.all(
            changes.taskLists.deleted.map( async deletedId => {
                const projectData = data.projects.find(project => deletedId === project.list.id)
                if (projectData) {
                    try {
                        await notion.archivePage(projectData.pageId)
                        data.projects = data.projects.filter( pData => pData.pageId !== projectData.pageId)
                    } catch (error) {
                        console.log("Error deleting list page", error)
                    }
                }
                else console.log("Project page for this list wasnt found in database")
            })
        )
    
    
        //tasks
        await Promise.all(
            changes.tasks.added.map( async addedTask => {
                const projectData = data.projects.find(project => addedTask.taskListId === project.list.id)
                if (projectData) {
                    const pageId = await notion.addTaskPageToNotion(notionHelpers.parseTaskToNotionPage(addedTask, projectData.pageId))
                    if (pageId) data.tasks.push({
                        pageId: pageId,
                        task: addedTask,
                        projectPageId: projectData.pageId
                    })
                    else console.log("Error while adding task page")
                }
                else console.log("Project page for this task wasnt found in database")
            })
        )
    
        await Promise.all(
            changes.tasks.updated.map( async update => {
                let taskData = data.tasks.find( tData => tData.task.id === update.id)
                const projectData = data.projects.find(project => update.taskListId === project.list.id)
                if (taskData && projectData) {
                    try {
                        await notion.updateNotionTaskPage(taskData.pageId, update, projectData.pageId)
                        taskData.task = update
                        taskData.projectPageId = projectData.pageId
                    } catch (error) {
                        console.log("Error updating task page", error)
                    }
                }
                else console.log("Task page or project page for this task wasnt found in database")
            })
        )
        
        await Promise.all(
            changes.tasks.deleted.map( async deletedId => {
                const taskData = data.tasks.find( tData => tData.task.id === deletedId)
                if (taskData) {
                    try {
                        await notion.archivePage(taskData.pageId)
                        data.tasks = data.tasks.filter( tData => tData.pageId !== taskData.pageId)
                    } catch (error) {
                        console.log("Error deleting task page", error)
                    }
                }
                else console.log("Project page for this task wasnt found in database")
            })
        )
    }
    
    async pushChangesToGoogleTasks (state: SyncState, changes: SyncStateChanges) {
    
        //tasklists
        await Promise.all(
            changes.taskLists.added.map( async addedList => {
                try {
                    await this.tasks.insertTaskList(addedList)
                    state.tasklists.push(addedList)
                } catch (error) {
                    console.log("Error adding tasklist", error)
                }
            })
        )
    
        await Promise.all(
            changes.taskLists.updated.map( async update => {
                try {
                    await this.tasks.patchTaskList(update)
                    let list = state.tasklists.find( list => list.id === update.id)
                    if (list) list = update
                } catch (error) {
                    console.log("Error updating tasklist", error)
                } 
            })
        )
    
        await Promise.all(
            changes.taskLists.deleted.map( async deletedId => {
                try {
                    await this.tasks.deleteTaskList(deletedId)
                    state.tasklists = state.tasklists.filter( list => list.id !== deletedId)
                } catch (error) {
                    console.log("Error deleting tasklist", error)
                }
            })
        )
    
        //tasks
        await Promise.all(
            changes.tasks.added.map( async addedTask => {
                try {
                    await this.tasks.insertTask(addedTask)
                    state.tasks.push(addedTask)
                } catch (error) {
                    console.log("Error adding task", error)
                }
            })
        )
    
        await Promise.all(
            changes.tasks.updated.map( async update => {
                try {
                    await this.tasks.patchTask(update)
                    let task = state.tasks.find( task => task.id === update.id)
                    if (task) task = update
                } catch (error) {
                    console.log("Error updating task", error)
                }
            })
        )
    
        await Promise.all(
            changes.tasks.deleted.map( async deletedId => {
                try {
                    const task = state.tasks.find(task => task.id === deletedId)
                    if (task) await this.tasks.deleteTask(task)
                    state.tasks = state.tasks.filter( task => task.id !== deletedId)
                } catch (error) {
                    console.log("Error deleting task", error)
                }
            })
        )
    }

    //Main operation logic
    async runCycle() {
        try {
            this.tasks = await googleTasks.create()
            console.log("Fetching Notion and GoogleTasks states...")
            const notionStateResponse = await this.getNotionState()
            const googleTaskState = await this.getGoogleTasksState()

            if (notionStateResponse && googleTaskState) {
                const {notionData, notionState} = notionStateResponse
                console.log("Notion state:", notionState)
                console.log("Google task state:", googleTaskState)

                const notionChanges = stateHelpers.compareStates(this.syncState, notionState)
                const googleTaskChanges = stateHelpers.compareStates(this.syncState, googleTaskState)

                console.log("Notion changes:", notionChanges)
                console.log("Google task changes:", googleTaskChanges)

                const finalChanges = stateHelpers.reconcileChanges(notionChanges, googleTaskChanges)
                console.log("Final changes:", finalChanges)

                stateHelpers.applyChangesToState(this.syncState, finalChanges)

                //updating googleTasks and notion states based on new synced state
                const changesToNotionState = stateHelpers.compareStates(notionState, this.syncState)
                const changesToGoogleTaskState = stateHelpers.compareStates(googleTaskState, this.syncState)
                console.log("New changes to notion:", changesToNotionState)
                console.log("New changes to googleTasks:", changesToGoogleTaskState)

                //push changes to each API
                console.log("Pushing changes to Notion...")
                await this.pushChangesToNotion(notionData, changesToNotionState)
                console.log("Pushing changes to Google Tasks...")
                await this.pushChangesToGoogleTasks(googleTaskState, changesToGoogleTaskState)
                console.log("All operations have been completed. End of cycle.")
                console.log("Current syncstate:", this.syncState)
            }
        } catch (error) {
            console.log("Error while syncing tasks!", error)
        }  
    }
}

export default new App();