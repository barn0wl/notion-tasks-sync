import { syncStateRepository, closeDatabase } from "./db/index.js";

async function test() {
    console.log('Testing database...');
    
    // Clear existing data
    await syncStateRepository.clearAllData();
    
    // Save a task list
    await syncStateRepository.saveTaskList({
        id: 'test-list-1',
        title: 'My Test List',
        selfLink: 'https://example.com'
    });
    
    // Save a task
    await syncStateRepository.saveTask({
        id: 'test-task-1',
        title: 'Test Task',
        status: 'needsAction',
        taskListId: 'test-list-1',
        due: '2026-04-10',
        completed: undefined,
        selfLink: undefined
    });
    
    // Load and verify
    const lists = await syncStateRepository.getAllTaskLists();
    const tasks = await syncStateRepository.getAllTasks();
    const stats = await syncStateRepository.getSyncStats();
    
    console.log('Task Lists:', lists);
    console.log('Tasks:', tasks);
    console.log('Stats:', stats);
    
    // Set last sync time
    await syncStateRepository.setLastSyncTime(new Date().toISOString());
    const lastSync = await syncStateRepository.getLastSyncTime();
    console.log('Last sync time:', lastSync);
    
    await closeDatabase();
    console.log('Test completed!');
}

test().catch(console.error);