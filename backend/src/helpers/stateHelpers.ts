import {SyncState, SyncStateChanges, Task, TaskList } from "../models/types.js"

function compareStates (oldState: SyncState, newState: SyncState): SyncStateChanges {
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
    }

    // tasklists
    const oldTaskListsMap = createTaskListMap(oldState.tasklists)
    const newTaskListsMap = createTaskListMap(newState.tasklists)

    //detecting added or updated task lists
    for (const newTaskList of newState.tasklists) {
        const oldTaskList = oldTaskListsMap.get(newTaskList.id)
        if (!oldTaskList) {
            changes.taskLists.added.push(newTaskList)
        } else {
            if (hasChanged(newTaskList, oldTaskList)) {
                changes.taskLists.updated.push(newTaskList)
            }
        }
    }

    // detecting deleted task lists
    for (const oldTaskList of oldState.tasklists) {
        if (!newTaskListsMap.has(oldTaskList.id)) {
          changes.taskLists.deleted.push(oldTaskList.id);
        }
    }

    // tasks
    const oldTasksMap = createTaskMap(oldState.tasks)
    const newTasksMap = createTaskMap(newState.tasks)

    // detecting added or updated tasks
    for (const newTask of newState.tasks) {
        const oldTask = oldTasksMap.get(newTask.id)
        if (!oldTask) {
          changes.tasks.added.push(newTask)
        } else {
          if (hasChanged(newTask, oldTask)) {
            changes.tasks.updated.push(newTask)
          }
        }
      }
    
    // detecting deleted tasks
    for (const oldTask of oldState.tasks) {
        if (!newTasksMap.has(oldTask.id)) {
          changes.tasks.deleted.push(oldTask.id);
        }
      }

    return changes
}

function reconcileChanges (notionChanges: SyncStateChanges, googleTaskChanges: SyncStateChanges) : SyncStateChanges {
  const finalChanges: SyncStateChanges = {
    tasks: {
      added: [],
      deleted: [],
      updated: []
    },
    taskLists: {
      added: [],
      deleted: [],
      updated: []
    }
  }
//In our system, google Tasks will always have priority
  //Taskslists
  googleTaskChanges.taskLists.updated.forEach( update =>
    finalChanges.taskLists.updated.push(update)
  )

  googleTaskChanges.taskLists.deleted.forEach( deleteId =>
    finalChanges.taskLists.deleted.push(deleteId)
  )

  googleTaskChanges.taskLists.added.forEach( newTaskList =>
    finalChanges.taskLists.added.push(newTaskList)
  )
  //Tasks
  googleTaskChanges.tasks.updated.forEach( update =>
    finalChanges.tasks.updated.push(update)
  )

  googleTaskChanges.tasks.deleted.forEach( deleteId =>
    finalChanges.tasks.deleted.push(deleteId)
  )
  
  googleTaskChanges.tasks.added.forEach( newTask =>
    finalChanges.tasks.added.push(newTask)
  )

  const googleAddedTaskListsMap = createTaskListMap(googleTaskChanges.taskLists.added)
  const googleUpdatedTaskListsMap = createTaskListMap(googleTaskChanges.taskLists.updated)
  const googleAddedTasksMap = createTaskMap(googleTaskChanges.tasks.added)
  const googleUpdatedTasksMap = createTaskMap(googleTaskChanges.tasks.updated)

//Notion changes are dispatched with more care
  //Tasklists
  notionChanges.taskLists.updated.forEach( update => {
    //make sure the updated tasklist in Notion has neither been deleted nor updated in googleTasks
    //otherwise, we dont push the change
    if (!googleTaskChanges.taskLists.deleted.includes(update.id)
      && !googleUpdatedTaskListsMap.has(update.id)) {
      finalChanges.taskLists.updated.push(update)
    }
  })

  notionChanges.taskLists.deleted.forEach( deleteId => {
    //make sure deleted tasklist in Notion hasnt been updated nor deleted in GoogleTasks
    if (!googleTaskChanges.taskLists.deleted.includes(deleteId)
      && !googleUpdatedTaskListsMap.has(deleteId)) {
        finalChanges.taskLists.deleted.push(deleteId)
    }
  })
  
  notionChanges.taskLists.added.forEach( newTaskList => {
    //making sure we're not adding the exact same tasklist
    if (!googleAddedTaskListsMap.has(newTaskList.id))
    finalChanges.taskLists.added.push(newTaskList)
  })

  //Tasks
  notionChanges.tasks.updated.forEach( update => {
    //make sure the updated task in Notion has neither been deleted nor updated in googleTasks
    //otherwise, we dont push the change
    if (!googleTaskChanges.tasks.deleted.includes(update.id)
    && !googleUpdatedTasksMap.has(update.id)) {
      finalChanges.tasks.updated.push(update)
    }
  })

  notionChanges.tasks.deleted.forEach( deleteId => {
    //make sure deleted task in Notion hasnt been updated nor deleted in GoogleTasks
    if (!googleTaskChanges.tasks.deleted.includes(deleteId)
      && !googleUpdatedTasksMap.has(deleteId)) {
      finalChanges.tasks.deleted.push(deleteId)
    }
  })

  notionChanges.tasks.added.forEach( newTask => {
      //making sure we're not adding the exact same task
    if (!googleAddedTasksMap.has(newTask.id))
    finalChanges.tasks.added.push(newTask)
  })

  return finalChanges
}

function applyChangesToState (stateToUpdate: SyncState, changes: SyncStateChanges) {
  //tasklists
  const taskListMap = createTaskListMap(stateToUpdate.tasklists)

  changes.taskLists.added.forEach( addedList => stateToUpdate.tasklists.push(addedList))

  changes.taskLists.updated.forEach( update => {
    let foundList = taskListMap.get(update.id)
    if (foundList) foundList = update
    else stateToUpdate.tasklists.push(update)
  })

  changes.taskLists.deleted.forEach ( idToDelete => {
    stateToUpdate.tasklists = stateToUpdate.tasklists.filter( list => list.id !== idToDelete)
  })

  //tasks
  const taskMap = createTaskMap(stateToUpdate.tasks)

  changes.tasks.added.forEach( addedTask => stateToUpdate.tasks.push(addedTask))

  changes.tasks.updated.forEach( update => {
    let foundTask = taskMap.get(update.id)
    if (foundTask) foundTask = update
    else stateToUpdate.tasks.push(update)
  })

  changes.tasks.deleted.forEach ( idToDelete => {
    stateToUpdate.tasks = stateToUpdate.tasks.filter( task => task.id !== idToDelete)
  })
}

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

function hasChanged(current: Task | TaskList, old: Task | TaskList): boolean {
  //this function determines whether a task or tasklist is considered to have changed
  //checking if both parameters are of same type
  if (isTask(current) && isTask(old)) {
    return (
      current.title !== old.title ||
      current.status !== old.status ||
      current.taskListId !== old.taskListId ||
      hasDuePropertyChanged(current.due, old.due)
    )
  }
  else if (!isTask(current) && !isTask(old)) {
    return (
      current.title !== old.title
    )
  }
  else throw new Error('The two parameters being compared are not of the same type')
}

function isTask(target: Task | TaskList) : target is Task {
  return (target as Task).status !== undefined
}

function parseDate(dateString: string): Date {
  return new Date(dateString)
}

function areDatesEqual(date1: string, date2: string): boolean {
  const d1 = parseDate(date1);
  const d2 = parseDate(date2);

  // Compare the year, month, and date (day)
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

function hasDuePropertyChanged(due1: string|undefined, due2: string|undefined) : boolean {
  return (
    //The two due properties arent of the same type
    ( typeof due1 !== typeof due2 ) ||
    //Or they are both date strings but different dates (ignoring time)
    (
      typeof due1 === "string" && typeof due2 === "string"
      && !areDatesEqual(due1, due2)
    ) 
  )
}

export default {compareStates, reconcileChanges, applyChangesToState}