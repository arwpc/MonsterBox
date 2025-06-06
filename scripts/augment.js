#!/usr/bin/env node

/**
 * Augment CLI Simulation
 * Provides `augment run <task-id>` functionality
 */

const AugmentRunner = require('./augment-runner');

const args = process.argv.slice(2);

if (args.length === 0) {
    console.log('🎯 Augment CLI Simulation');
    console.log('Usage: node scripts/augment.js <command> [options]');
    console.log('Commands:');
    console.log('  run <task-id>  - Run a specific task');
    console.log('  list           - List all available tasks');
    process.exit(0);
}

const command = args[0];

if (command === 'run' && args.length >= 2) {
    const runner = new AugmentRunner();
    runner.loadConfig();
    runner.loadTasks();
    
    const taskId = args[1];
    const success = runner.runTask(taskId);
    process.exit(success ? 0 : 1);
} else if (command === 'list') {
    const runner = new AugmentRunner();
    runner.loadConfig();
    runner.loadTasks();
    runner.listTasks();
} else {
    console.error('❌ Invalid command or missing task ID');
    console.log('Usage: node scripts/augment.js run <task-id>');
    process.exit(1);
}
