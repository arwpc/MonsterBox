#!/usr/bin/env node

/**
 * Simple Augment Task Runner Simulation
 * Reads augment.tasks.yaml and executes tasks via SSH
 */

const fs = require('fs');
const { execSync } = require('child_process');
const yaml = require('js-yaml');

class AugmentRunner {
    constructor() {
        this.configPath = '.augment/config.yaml';
        this.tasksPath = 'augment.tasks.yaml';
        this.agents = {};
        this.tasks = {};
    }

    loadConfig() {
        try {
            const configContent = fs.readFileSync(this.configPath, 'utf8');
            const config = yaml.load(configContent);
            
            // Load agents
            if (config.agents) {
                config.agents.forEach(agent => {
                    this.agents[agent.name] = agent;
                });
            }
            
            console.log(`✅ Loaded ${Object.keys(this.agents).length} agents from ${this.configPath}`);
        } catch (error) {
            console.error(`❌ Failed to load config from ${this.configPath}:`, error.message);
            process.exit(1);
        }
    }

    loadTasks() {
        try {
            const tasksContent = fs.readFileSync(this.tasksPath, 'utf8');
            const tasksConfig = yaml.load(tasksContent);
            
            // Load tasks
            if (tasksConfig.tasks) {
                tasksConfig.tasks.forEach(task => {
                    this.tasks[task.id] = task;
                });
            }
            
            console.log(`✅ Loaded ${Object.keys(this.tasks).length} tasks from ${this.tasksPath}`);
        } catch (error) {
            console.error(`❌ Failed to load tasks from ${this.tasksPath}:`, error.message);
            process.exit(1);
        }
    }

    runTask(taskId) {
        const task = this.tasks[taskId];
        if (!task) {
            console.error(`❌ Task '${taskId}' not found`);
            return false;
        }

        const agent = this.agents[task.agent];
        if (!agent) {
            console.error(`❌ Agent '${task.agent}' not found for task '${taskId}'`);
            return false;
        }

        console.log(`🚀 Running task '${taskId}' on agent '${task.agent}'`);
        console.log(`📋 Command: ${task.command}`);

        try {
            if (agent.type === 'shell' && agent.runner.ssh) {
                const ssh = agent.runner.ssh;
                let sshCommand;
                
                if (ssh.password) {
                    // Use direct SSH with password (requires SSH keys to be set up or manual password entry)
                    sshCommand = `ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no ${ssh.user}@${ssh.host} "${task.command}"`;
                } else if (ssh.identityFile) {
                    sshCommand = `ssh -i ${ssh.identityFile} -o ConnectTimeout=10 -o StrictHostKeyChecking=no ${ssh.user}@${ssh.host} "${task.command}"`;
                } else {
                    sshCommand = `ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no ${ssh.user}@${ssh.host} "${task.command}"`;
                }

                console.log(`🔗 SSH Command: ${sshCommand.replace(ssh.password || '', '***')}`);
                
                const result = execSync(sshCommand, { 
                    encoding: 'utf8',
                    timeout: 30000 
                });
                
                console.log(`✅ Task '${taskId}' completed successfully`);
                console.log(`📤 Output:`);
                console.log(result);
                return true;
            } else {
                console.error(`❌ Unsupported agent type or runner configuration`);
                return false;
            }
        } catch (error) {
            console.error(`❌ Task '${taskId}' failed:`, error.message);
            if (error.stdout) {
                console.log(`📤 Stdout:`, error.stdout);
            }
            if (error.stderr) {
                console.log(`📤 Stderr:`, error.stderr);
            }
            return false;
        }
    }

    listTasks() {
        console.log('\n📋 Available Tasks:');
        Object.entries(this.tasks).forEach(([id, task]) => {
            console.log(`  • ${id}: ${task.command} (agent: ${task.agent})`);
        });
    }

    run() {
        const args = process.argv.slice(2);
        
        if (args.length === 0) {
            console.log('🎯 Augment Task Runner Simulation');
            console.log('Usage: node scripts/augment-runner.js <command> [task-id]');
            console.log('Commands:');
            console.log('  list     - List all available tasks');
            console.log('  run      - Run a specific task');
            return;
        }

        this.loadConfig();
        this.loadTasks();

        const command = args[0];
        
        switch (command) {
            case 'list':
                this.listTasks();
                break;
            case 'run':
                if (args.length < 2) {
                    console.error('❌ Please specify a task ID to run');
                    this.listTasks();
                    return;
                }
                const taskId = args[1];
                this.runTask(taskId);
                break;
            default:
                console.error(`❌ Unknown command: ${command}`);
                break;
        }
    }
}

// Run if called directly
if (require.main === module) {
    const runner = new AugmentRunner();
    runner.run();
}

module.exports = AugmentRunner;
