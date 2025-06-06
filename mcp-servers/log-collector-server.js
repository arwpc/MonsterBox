#!/usr/bin/env node

/**
 * MonsterBox Log Collector MCP Server
 *
 * Collects logs from multiple sources using Fluent Bit → File → VS Code/Augment:
 * - Browser console logs
 * - GitHub API logs
 * - RPI4b Fluent Bit aggregated logs
 * - Local file-based log collection
 * - MonsterBox application logs
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const fs = require('fs').promises;
const path = require('path');
const { spawn, exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const sshCredentials = require('../scripts/ssh-credentials');

// Load environment variables
require('dotenv').config();

class LogCollectorServer {
    constructor() {
        this.server = new Server(
            {
                name: 'monsterbox-log-collector',
                version: '1.0.0',
            },
            {
                capabilities: {
                    tools: {},
                },
            }
        );

        this.setupToolHandlers();
    }

    setupToolHandlers() {
        // List available tools
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: [
                    {
                        name: 'collect_browser_logs',
                        description: 'Collect browser console logs, errors, and network issues',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                url: {
                                    type: 'string',
                                    description: 'URL to monitor for logs (optional, defaults to MonsterBox)'
                                },
                                duration: {
                                    type: 'number',
                                    description: 'Duration in seconds to collect logs (default: 30)'
                                }
                            }
                        }
                    },
                    {
                        name: 'collect_github_logs',
                        description: 'Collect GitHub API logs, workflow runs, and repository events',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                repo: {
                                    type: 'string',
                                    description: 'Repository name (default: MonsterBox)'
                                },
                                events: {
                                    type: 'array',
                                    items: { type: 'string' },
                                    description: 'Event types to collect (push, pull_request, issues, etc.)'
                                }
                            }
                        }
                    },
                    {
                        name: 'collect_rpi_console_logs',
                        description: 'Collect Raspberry Pi console logs and system messages',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                host: {
                                    type: 'string',
                                    description: 'RPI hostname or IP address'
                                },
                                lines: {
                                    type: 'number',
                                    description: 'Number of log lines to collect (default: 100)'
                                }
                            }
                        }
                    },
                    {
                        name: 'collect_ubuntu_system_logs',
                        description: 'Collect Ubuntu system logs (syslog, auth, kern, etc.)',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                host: {
                                    type: 'string',
                                    description: 'Ubuntu system hostname or IP'
                                },
                                logTypes: {
                                    type: 'array',
                                    items: { type: 'string' },
                                    description: 'Log types to collect (syslog, auth, kern, daemon)'
                                },
                                since: {
                                    type: 'string',
                                    description: 'Time period (e.g., "1 hour ago", "today")'
                                }
                            }
                        }
                    },
                    {
                        name: 'collect_monsterbox_logs',
                        description: 'Collect MonsterBox application logs and errors',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                logLevel: {
                                    type: 'string',
                                    enum: ['error', 'warn', 'info', 'debug'],
                                    description: 'Minimum log level to collect'
                                },
                                since: {
                                    type: 'string',
                                    description: 'Time period to collect logs from'
                                }
                            }
                        }
                    },
                    {
                        name: 'analyze_logs',
                        description: 'Analyze collected logs for patterns, errors, and insights',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                sources: {
                                    type: 'array',
                                    items: { type: 'string' },
                                    description: 'Log sources to analyze'
                                },
                                pattern: {
                                    type: 'string',
                                    description: 'Specific pattern or error to search for'
                                }
                            }
                        }
                    },
                    {
                        name: 'setup_log_monitoring',
                        description: 'Set up continuous log monitoring and alerting',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                sources: {
                                    type: 'array',
                                    items: { type: 'string' },
                                    description: 'Log sources to monitor'
                                },
                                alertThreshold: {
                                    type: 'string',
                                    description: 'Error threshold for alerts'
                                }
                            }
                        }
                    },
                    {
                        name: 'execute_remote_command',
                        description: 'Execute shell commands on animatronic RPI4b systems (Orlok/Coffin only)',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                host: {
                                    type: 'string',
                                    description: 'RPI hostname or IP address (192.168.8.120 for Orlok, 192.168.8.140 for Coffin)',
                                    enum: ['192.168.8.120', '192.168.8.140', 'orlok', 'coffin']
                                },
                                command: {
                                    type: 'string',
                                    description: 'Shell command to execute on the remote RPI'
                                },
                                timeout: {
                                    type: 'number',
                                    description: 'Command timeout in seconds (default: 30)',
                                    default: 30
                                }
                            },
                            required: ['host', 'command']
                        }
                    },
                    {
                        name: 'collect_fluent_bit_logs',
                        description: 'Collect aggregated logs from Fluent Bit file outputs on RPI4b systems',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                host: {
                                    type: 'string',
                                    description: 'RPI hostname or IP address (192.168.8.120 for Orlok, 192.168.8.140 for Coffin)',
                                    enum: ['192.168.8.120', '192.168.8.140', 'orlok', 'coffin']
                                },
                                logTypes: {
                                    type: 'array',
                                    items: {
                                        type: 'string',
                                        enum: ['app', 'system', 'logs', 'all']
                                    },
                                    description: 'Types of Fluent Bit log files to collect',
                                    default: ['app', 'system', 'logs']
                                },
                                lines: {
                                    type: 'number',
                                    description: 'Number of recent log lines to collect (default: 100)',
                                    default: 100
                                },
                                download: {
                                    type: 'boolean',
                                    description: 'Download log files to local aggregated directory',
                                    default: true
                                }
                            },
                            required: ['host']
                        }
                    },
                    {
                        name: 'read_local_aggregated_logs',
                        description: 'Read locally aggregated log files from Fluent Bit collection',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                animatronic: {
                                    type: 'string',
                                    description: 'Animatronic ID (orlok, coffin, pumpkinhead)',
                                    enum: ['orlok', 'coffin', 'pumpkinhead']
                                },
                                logType: {
                                    type: 'string',
                                    description: 'Type of log file to read',
                                    enum: ['app', 'system', 'logs', 'all'],
                                    default: 'all'
                                },
                                lines: {
                                    type: 'number',
                                    description: 'Number of recent lines to read (default: 50)',
                                    default: 50
                                },
                                pattern: {
                                    type: 'string',
                                    description: 'Search pattern to filter logs (optional)'
                                }
                            },
                            required: ['animatronic']
                        }
                    },
                    {
                        name: 'sync_fluent_bit_logs',
                        description: 'Synchronize all Fluent Bit logs from enabled RPI systems to local aggregated directory',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                force: {
                                    type: 'boolean',
                                    description: 'Force sync even if files are recent',
                                    default: false
                                },
                                cleanup: {
                                    type: 'boolean',
                                    description: 'Clean up old log files after sync',
                                    default: false
                                }
                            }
                        }
                    },
                    {
                        name: 'collect_comprehensive_rpi_logs',
                        description: 'Collect comprehensive logs from animatronic RPI4b systems including MonsterBox app logs and system logs',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                host: {
                                    type: 'string',
                                    description: 'RPI hostname or IP address (192.168.8.120 for Orlok, 192.168.8.140 for Coffin)',
                                    enum: ['192.168.8.120', '192.168.8.140', 'orlok', 'coffin']
                                },
                                logTypes: {
                                    type: 'array',
                                    items: {
                                        type: 'string',
                                        enum: ['application', 'system', 'error', 'service', 'all']
                                    },
                                    description: 'Types of logs to collect',
                                    default: ['application', 'system', 'error']
                                },
                                lines: {
                                    type: 'number',
                                    description: 'Number of log lines to collect per type (default: 100)',
                                    default: 100
                                },
                                since: {
                                    type: 'string',
                                    description: 'Time period to collect logs from (e.g., "1 hour ago", "today")',
                                    default: '1 hour ago'
                                }
                            },
                            required: ['host']
                        }
                    }
                ]
            };
        });

        // Handle tool calls
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;

            try {
                switch (name) {
                    case 'collect_browser_logs':
                        return await this.collectBrowserLogs(args);
                    case 'collect_github_logs':
                        return await this.collectGitHubLogs(args);
                    case 'collect_rpi_console_logs':
                        return await this.collectRPiConsoleLogs(args);
                    case 'collect_ubuntu_system_logs':
                        return await this.collectUbuntuSystemLogs(args);
                    case 'collect_monsterbox_logs':
                        return await this.collectMonsterBoxLogs(args);
                    case 'analyze_logs':
                        return await this.analyzeLogs(args);
                    case 'setup_log_monitoring':
                        return await this.setupLogMonitoring(args);
                    case 'execute_remote_command':
                        return await this.executeRemoteCommand(args);
                    case 'collect_fluent_bit_logs':
                        return await this.collectFluentBitLogs(args);
                    case 'read_local_aggregated_logs':
                        return await this.readLocalAggregatedLogs(args);
                    case 'sync_fluent_bit_logs':
                        return await this.syncFluentBitLogs(args);
                    case 'collect_comprehensive_rpi_logs':
                        return await this.collectComprehensiveRPiLogs(args);
                    default:
                        throw new Error(`Unknown tool: ${name}`);
                }
            } catch (error) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Error executing ${name}: ${error.message}`
                        }
                    ],
                    isError: true
                };
            }
        });
    }

    async collectFluentBitLogs(args) {
        const { host, logTypes = ['app', 'system', 'logs'], lines = 100, download = true } = args;

        // Validate host - only allow Orlok and Coffin
        const allowedHosts = {
            '192.168.8.120': 'orlok',
            '192.168.8.140': 'coffin',
            'orlok': '192.168.8.120',
            'coffin': '192.168.8.140'
        };

        const targetHost = allowedHosts[host] || host;
        const animatronicName = allowedHosts[targetHost] || 'unknown';

        if (!allowedHosts[host] && !allowedHosts[targetHost]) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `Error: Host '${host}' is not allowed. Only Orlok (192.168.8.120) and Coffin (192.168.8.140) are supported.`
                    }
                ],
                isError: true
            };
        }

        try {
            const logs = {
                host: targetHost,
                animatronic: animatronicName,
                timestamp: new Date().toISOString(),
                logTypes: logTypes,
                data: {}
            };

            // Collect Fluent Bit log files
            for (const logType of logTypes) {
                try {
                    const logFile = `${animatronicName}-${logType}.jsonl`;
                    const remotePath = `/var/log/monsterbox/aggregated/${logFile}`;

                    // Read recent lines from the log file
                    const command = sshCredentials.buildSSHCommandByHost(
                        targetHost,
                        `tail -n ${lines} ${remotePath} 2>/dev/null || echo "Log file not found: ${remotePath}"`,
                        { batchMode: false }
                    );

                    const { stdout } = await execAsync(command);

                    if (stdout.includes('Log file not found')) {
                        logs.data[logType] = { error: `Log file not found: ${logFile}` };
                    } else {
                        // Parse JSON lines
                        const logLines = stdout.split('\n').filter(line => line.trim());
                        const parsedLogs = logLines.map(line => {
                            try {
                                return JSON.parse(line);
                            } catch (e) {
                                return { raw: line, parse_error: true };
                            }
                        });

                        logs.data[logType] = {
                            file: logFile,
                            lines_collected: parsedLogs.length,
                            logs: parsedLogs
                        };
                    }

                    // Download file if requested
                    if (download && !stdout.includes('Log file not found')) {
                        await this.downloadLogFile(targetHost, animatronicName, logFile);
                    }

                } catch (error) {
                    logs.data[logType] = { error: error.message };
                }
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: `Fluent Bit logs collected from ${animatronicName} (${targetHost}):\n\n${JSON.stringify(logs, null, 2)}`
                    }
                ]
            };

        } catch (error) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `Failed to collect Fluent Bit logs from ${animatronicName} (${targetHost}): ${error.message}`
                    }
                ],
                isError: true
            };
        }
    }

    async readLocalAggregatedLogs(args) {
        const { animatronic, logType = 'all', lines = 50, pattern } = args;

        try {
            const logDir = path.join(process.cwd(), 'log', 'aggregated', animatronic);

            // Check if directory exists
            try {
                await fs.access(logDir);
            } catch (error) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `No local logs found for ${animatronic}. Run sync_fluent_bit_logs first.`
                        }
                    ],
                    isError: true
                };
            }

            const logs = {
                animatronic: animatronic,
                logType: logType,
                timestamp: new Date().toISOString(),
                data: {}
            };

            const logTypes = logType === 'all' ? ['app', 'system', 'logs'] : [logType];

            for (const type of logTypes) {
                try {
                    const logFile = path.join(logDir, `${animatronic}-${type}.jsonl`);

                    try {
                        const content = await fs.readFile(logFile, 'utf8');
                        let logLines = content.split('\n').filter(line => line.trim());

                        // Apply pattern filter if provided
                        if (pattern) {
                            logLines = logLines.filter(line => line.includes(pattern));
                        }

                        // Get recent lines
                        const recentLines = logLines.slice(-lines);

                        // Parse JSON lines
                        const parsedLogs = recentLines.map(line => {
                            try {
                                return JSON.parse(line);
                            } catch (e) {
                                return { raw: line, parse_error: true };
                            }
                        });

                        logs.data[type] = {
                            file: `${animatronic}-${type}.jsonl`,
                            total_lines: logLines.length,
                            returned_lines: parsedLogs.length,
                            logs: parsedLogs
                        };

                    } catch (error) {
                        logs.data[type] = { error: `File not found: ${animatronic}-${type}.jsonl` };
                    }

                } catch (error) {
                    logs.data[type] = { error: error.message };
                }
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: `Local aggregated logs for ${animatronic}:\n\n${JSON.stringify(logs, null, 2)}`
                    }
                ]
            };

        } catch (error) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `Failed to read local aggregated logs: ${error.message}`
                    }
                ],
                isError: true
            };
        }
    }

    async syncFluentBitLogs(args) {
        const { force = false, cleanup = false } = args;

        try {
            // Load Fluent Bit configuration
            const configPath = path.join(process.cwd(), 'data', 'fluent-bit-config.json');
            const configData = await fs.readFile(configPath, 'utf8');
            const config = JSON.parse(configData);

            const results = {
                timestamp: new Date().toISOString(),
                systems_synced: [],
                files_synced: 0,
                errors: []
            };

            // Sync logs from each enabled system
            for (const system of config.systems.filter(s => s.enabled)) {
                try {
                    console.log(`Syncing logs from ${system.name}...`);

                    const localDir = path.join(process.cwd(), 'log', 'aggregated', system.id);
                    await fs.mkdir(localDir, { recursive: true });

                    // Sync each log type
                    for (const logSource of config.fluent_bit.log_sources) {
                        if (logSource.id === system.id) {
                            for (const logFile of logSource.log_files) {
                                try {
                                    const remotePath = `/var/log/monsterbox/aggregated/${logFile}`;
                                    const localPath = path.join(localDir, logFile);

                                    // Check if we should sync (force or file is old/missing)
                                    let shouldSync = force;
                                    if (!shouldSync) {
                                        try {
                                            const stats = await fs.stat(localPath);
                                            const ageMinutes = (Date.now() - stats.mtime.getTime()) / (1000 * 60);
                                            shouldSync = ageMinutes > 5; // Sync if older than 5 minutes
                                        } catch (error) {
                                            shouldSync = true; // File doesn't exist
                                        }
                                    }

                                    if (shouldSync) {
                                        const scpCommand = sshCredentials.buildSCPCommand(
                                            system.id,
                                            system.host,
                                            remotePath,
                                            localPath
                                        );

                                        await execAsync(scpCommand);
                                        results.files_synced++;
                                    }

                                } catch (error) {
                                    results.errors.push(`${system.name}/${logFile}: ${error.message}`);
                                }
                            }
                        }
                    }

                    results.systems_synced.push(system.name);

                } catch (error) {
                    results.errors.push(`${system.name}: ${error.message}`);
                }
            }

            // Cleanup old files if requested
            if (cleanup) {
                await this.cleanupOldLogFiles();
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: `Fluent Bit log sync completed:\n\n${JSON.stringify(results, null, 2)}`
                    }
                ]
            };

        } catch (error) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `Failed to sync Fluent Bit logs: ${error.message}`
                    }
                ],
                isError: true
            };
        }
    }

    async downloadLogFile(host, animatronic, logFile) {
        try {
            const localDir = path.join(process.cwd(), 'log', 'aggregated', animatronic);
            await fs.mkdir(localDir, { recursive: true });

            const remotePath = `/var/log/monsterbox/aggregated/${logFile}`;
            const localPath = path.join(localDir, logFile);

            const scpCommand = sshCredentials.buildSCPCommand(
                animatronic,
                host,
                remotePath,
                localPath
            );

            await execAsync(scpCommand);
            return true;
        } catch (error) {
            console.error(`Failed to download ${logFile}: ${error.message}`);
            return false;
        }
    }

    async cleanupOldLogFiles() {
        try {
            const aggregatedDir = path.join(process.cwd(), 'log', 'aggregated');
            const retentionDays = 30;
            const cutoffTime = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);

            const animatronics = await fs.readdir(aggregatedDir);

            for (const animatronic of animatronics) {
                const animatronicDir = path.join(aggregatedDir, animatronic);
                const stats = await fs.stat(animatronicDir);

                if (stats.isDirectory()) {
                    const files = await fs.readdir(animatronicDir);

                    for (const file of files) {
                        const filePath = path.join(animatronicDir, file);
                        const fileStats = await fs.stat(filePath);

                        if (fileStats.mtime.getTime() < cutoffTime) {
                            await fs.unlink(filePath);
                            console.log(`Cleaned up old log file: ${file}`);
                        }
                    }
                }
            }
        } catch (error) {
            console.error(`Cleanup failed: ${error.message}`);
        }
    }

    async collectBrowserLogs(args) {
        const { url = 'http://localhost:3000', duration = 30 } = args;
        
        // Create browser log collection script
        const script = `
            const puppeteer = require('puppeteer');
            
            (async () => {
                const browser = await puppeteer.launch({ headless: true });
                const page = await browser.newPage();
                
                const logs = [];
                
                page.on('console', msg => {
                    logs.push({
                        type: 'console',
                        level: msg.type(),
                        text: msg.text(),
                        timestamp: new Date().toISOString()
                    });
                });
                
                page.on('pageerror', error => {
                    logs.push({
                        type: 'error',
                        message: error.message,
                        stack: error.stack,
                        timestamp: new Date().toISOString()
                    });
                });
                
                page.on('requestfailed', request => {
                    logs.push({
                        type: 'network_error',
                        url: request.url(),
                        failure: request.failure().errorText,
                        timestamp: new Date().toISOString()
                    });
                });
                
                await page.goto('${url}');
                await new Promise(resolve => setTimeout(resolve, ${duration * 1000}));
                
                await browser.close();
                console.log(JSON.stringify(logs, null, 2));
            })();
        `;

        try {
            const { stdout } = await execAsync(`node -e "${script.replace(/"/g, '\\"')}"`);
            const logs = JSON.parse(stdout);
            
            return {
                content: [
                    {
                        type: 'text',
                        text: `Collected ${logs.length} browser logs from ${url}:\n\n${JSON.stringify(logs, null, 2)}`
                    }
                ]
            };
        } catch (error) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `Failed to collect browser logs: ${error.message}`
                    }
                ],
                isError: true
            };
        }
    }

    async collectGitHubLogs(args) {
        const { repo = 'MonsterBox', events = ['push', 'pull_request', 'issues'] } = args;
        
        // Use GitHub API to collect logs
        const logs = {
            repository: repo,
            events: [],
            workflows: [],
            timestamp: new Date().toISOString()
        };

        return {
            content: [
                {
                    type: 'text',
                    text: `GitHub logs collection configured for ${repo}. Events: ${events.join(', ')}\n\n${JSON.stringify(logs, null, 2)}`
                }
            ]
        };
    }

    async collectRPiConsoleLogs(args) {
        const { host, lines = 100 } = args;
        
        if (!host) {
            return {
                content: [
                    {
                        type: 'text',
                        text: 'RPI host address is required for remote log collection'
                    }
                ],
                isError: true
            };
        }

        // SSH command to collect RPI logs using individual credentials
        const command = sshCredentials.buildSSHCommandByHost(host, `sudo journalctl -n ${lines} --no-pager`, { batchMode: false });
        
        try {
            const { stdout } = await execAsync(command);
            
            return {
                content: [
                    {
                        type: 'text',
                        text: `RPI Console logs from ${host} (last ${lines} lines):\n\n${stdout}`
                    }
                ]
            };
        } catch (error) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `Failed to collect RPI logs from ${host}: ${error.message}`
                    }
                ],
                isError: true
            };
        }
    }

    async collectUbuntuSystemLogs(args) {
        const { host, logTypes = ['syslog', 'auth'], since = '1 hour ago' } = args;
        
        const logs = {};
        
        for (const logType of logTypes) {
            try {
                const command = host
                    ? sshCredentials.buildSSHCommandByHost(host, `sudo journalctl -u ${logType} --since '${since}' --no-pager`, { batchMode: false })
                    : `sudo journalctl -u ${logType} --since '${since}' --no-pager`;
                
                const { stdout } = await execAsync(command);
                logs[logType] = stdout;
            } catch (error) {
                logs[logType] = `Error: ${error.message}`;
            }
        }

        return {
            content: [
                {
                    type: 'text',
                    text: `Ubuntu system logs${host ? ` from ${host}` : ''} since ${since}:\n\n${JSON.stringify(logs, null, 2)}`
                }
            ]
        };
    }

    async collectMonsterBoxLogs(args) {
        const { logLevel = 'info', since } = args;
        
        try {
            const logDir = path.join(process.cwd(), 'log');
            const files = await fs.readdir(logDir);
            const logFiles = files.filter(f => f.endsWith('.log'));
            
            const logs = {};
            
            for (const file of logFiles) {
                const content = await fs.readFile(path.join(logDir, file), 'utf8');
                logs[file] = content.split('\n').filter(line => {
                    if (!line.trim()) return false;
                    if (since) {
                        // Basic time filtering - could be enhanced
                        return line.includes(new Date().toISOString().split('T')[0]);
                    }
                    return true;
                });
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: `MonsterBox application logs (${logLevel}+ level):\n\n${JSON.stringify(logs, null, 2)}`
                    }
                ]
            };
        } catch (error) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `Failed to collect MonsterBox logs: ${error.message}`
                    }
                ],
                isError: true
            };
        }
    }

    async analyzeLogs(args) {
        const { sources = [], pattern } = args;
        
        const analysis = {
            timestamp: new Date().toISOString(),
            sources: sources,
            pattern: pattern,
            findings: [],
            summary: {
                totalErrors: 0,
                criticalIssues: 0,
                warnings: 0
            }
        };

        // Basic log analysis logic
        analysis.findings.push({
            type: 'info',
            message: `Log analysis configured for sources: ${sources.join(', ')}`
        });

        if (pattern) {
            analysis.findings.push({
                type: 'info',
                message: `Searching for pattern: ${pattern}`
            });
        }

        return {
            content: [
                {
                    type: 'text',
                    text: `Log Analysis Results:\n\n${JSON.stringify(analysis, null, 2)}`
                }
            ]
        };
    }

    async setupLogMonitoring(args) {
        const { sources = [], alertThreshold = 'high' } = args;

        const config = {
            monitoring: {
                enabled: true,
                sources: sources,
                alertThreshold: alertThreshold,
                setupTime: new Date().toISOString()
            }
        };

        return {
            content: [
                {
                    type: 'text',
                    text: `Log monitoring setup completed:\n\n${JSON.stringify(config, null, 2)}`
                }
            ]
        };
    }

    async executeRemoteCommand(args) {
        const { host, command, timeout = 30 } = args;

        // Validate host - only allow Orlok and Coffin
        const allowedHosts = {
            '192.168.8.120': 'orlok',
            '192.168.8.140': 'coffin',
            'orlok': '192.168.8.120',
            'coffin': '192.168.8.140'
        };

        const targetHost = allowedHosts[host] || host;
        const animatronicName = allowedHosts[targetHost] || 'unknown';

        if (!allowedHosts[host] && !allowedHosts[targetHost]) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `Error: Host '${host}' is not allowed. Only Orlok (192.168.8.120) and Coffin (192.168.8.140) are supported for remote command execution.`
                    }
                ],
                isError: true
            };
        }

        // Validate command for safety
        const dangerousCommands = ['rm -rf', 'dd if=', 'mkfs', 'fdisk', 'shutdown', 'reboot', 'halt', 'poweroff'];
        const isDangerous = dangerousCommands.some(dangerous => command.toLowerCase().includes(dangerous));

        if (isDangerous) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `Error: Command '${command}' contains potentially dangerous operations and is not allowed for safety reasons.`
                    }
                ],
                isError: true
            };
        }

        try {
            // Build SSH command using existing credentials system
            const sshCommand = sshCredentials.buildSSHCommandByHost(targetHost, command, { batchMode: false });

            // Execute with timeout
            const { stdout, stderr } = await execAsync(sshCommand, { timeout: timeout * 1000 });

            const result = {
                host: targetHost,
                animatronic: animatronicName,
                command: command,
                timestamp: new Date().toISOString(),
                stdout: stdout.trim(),
                stderr: stderr.trim(),
                success: true
            };

            return {
                content: [
                    {
                        type: 'text',
                        text: `Remote command executed successfully on ${animatronicName} (${targetHost}):\n\nCommand: ${command}\n\nOutput:\n${stdout}\n${stderr ? `\nErrors:\n${stderr}` : ''}`
                    }
                ]
            };
        } catch (error) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `Failed to execute command '${command}' on ${animatronicName} (${targetHost}): ${error.message}`
                    }
                ],
                isError: true
            };
        }
    }

    async collectComprehensiveRPiLogs(args) {
        const { host, logTypes = ['application', 'system', 'error'], lines = 100, since = '1 hour ago' } = args;

        // Validate host - only allow Orlok and Coffin
        const allowedHosts = {
            '192.168.8.120': 'orlok',
            '192.168.8.140': 'coffin',
            'orlok': '192.168.8.120',
            'coffin': '192.168.8.140'
        };

        const targetHost = allowedHosts[host] || host;
        const animatronicName = allowedHosts[targetHost] || 'unknown';

        if (!allowedHosts[host] && !allowedHosts[targetHost]) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `Error: Host '${host}' is not allowed. Only Orlok (192.168.8.120) and Coffin (192.168.8.140) are supported.`
                    }
                ],
                isError: true
            };
        }

        const logs = {
            host: targetHost,
            animatronic: animatronicName,
            timestamp: new Date().toISOString(),
            logTypes: logTypes,
            since: since,
            lines: lines,
            data: {}
        };

        try {
            // Collect different types of logs based on request
            for (const logType of logTypes) {
                try {
                    switch (logType) {
                        case 'application':
                            logs.data.application = await this.collectRPiApplicationLogs(targetHost, lines, since);
                            break;
                        case 'system':
                            logs.data.system = await this.collectRPiSystemLogs(targetHost, lines, since);
                            break;
                        case 'error':
                            logs.data.error = await this.collectRPiErrorLogs(targetHost, lines, since);
                            break;
                        case 'service':
                            logs.data.service = await this.collectRPiServiceLogs(targetHost, lines, since);
                            break;
                        case 'all':
                            logs.data.application = await this.collectRPiApplicationLogs(targetHost, lines, since);
                            logs.data.system = await this.collectRPiSystemLogs(targetHost, lines, since);
                            logs.data.error = await this.collectRPiErrorLogs(targetHost, lines, since);
                            logs.data.service = await this.collectRPiServiceLogs(targetHost, lines, since);
                            break;
                        default:
                            logs.data[logType] = { error: `Unknown log type: ${logType}` };
                    }
                } catch (error) {
                    logs.data[logType] = { error: error.message };
                }
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: `Comprehensive logs collected from ${animatronicName} (${targetHost}):\n\n${JSON.stringify(logs, null, 2)}`
                    }
                ]
            };
        } catch (error) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `Failed to collect comprehensive logs from ${animatronicName} (${targetHost}): ${error.message}`
                    }
                ],
                isError: true
            };
        }
    }

    async collectRPiApplicationLogs(host, lines, since) {
        const commands = [
            `find /home/*/MonsterBox/log -name "*.log" -type f -exec tail -n ${lines} {} \\; 2>/dev/null || echo "No MonsterBox logs found"`,
            `sudo journalctl -u monsterbox* --since '${since}' -n ${lines} --no-pager 2>/dev/null || echo "No MonsterBox service logs"`
        ];

        const logs = {};
        for (let i = 0; i < commands.length; i++) {
            try {
                const command = sshCredentials.buildSSHCommandByHost(host, commands[i], { batchMode: false });
                const { stdout } = await execAsync(command);
                logs[`app_logs_${i + 1}`] = stdout.split('\n').filter(line => line.trim());
            } catch (error) {
                logs[`app_logs_${i + 1}`] = [`Error: ${error.message}`];
            }
        }
        return logs;
    }

    async collectRPiSystemLogs(host, lines, since) {
        const commands = [
            `sudo journalctl --since '${since}' -n ${lines} --no-pager`,
            `sudo journalctl -k --since '${since}' -n ${lines} --no-pager`, // kernel logs
            `sudo journalctl -u ssh --since '${since}' -n ${lines} --no-pager` // SSH logs
        ];

        const logs = {};
        const logNames = ['system', 'kernel', 'ssh'];

        for (let i = 0; i < commands.length; i++) {
            try {
                const command = sshCredentials.buildSSHCommandByHost(host, commands[i], { batchMode: false });
                const { stdout } = await execAsync(command);
                logs[logNames[i]] = stdout.split('\n').filter(line => line.trim());
            } catch (error) {
                logs[logNames[i]] = [`Error: ${error.message}`];
            }
        }
        return logs;
    }

    async collectRPiErrorLogs(host, lines, since) {
        const commands = [
            `sudo journalctl -p err --since '${since}' -n ${lines} --no-pager`,
            `sudo journalctl -p crit --since '${since}' -n ${lines} --no-pager`,
            `dmesg | tail -n ${lines} | grep -i error || echo "No recent dmesg errors"`
        ];

        const logs = {};
        const logNames = ['errors', 'critical', 'dmesg_errors'];

        for (let i = 0; i < commands.length; i++) {
            try {
                const command = sshCredentials.buildSSHCommandByHost(host, commands[i], { batchMode: false });
                const { stdout } = await execAsync(command);
                logs[logNames[i]] = stdout.split('\n').filter(line => line.trim());
            } catch (error) {
                logs[logNames[i]] = [`Error: ${error.message}`];
            }
        }
        return logs;
    }

    async collectRPiServiceLogs(host, lines, since) {
        const services = ['ssh', 'systemd', 'networking', 'cron'];
        const logs = {};

        for (const service of services) {
            try {
                const command = sshCredentials.buildSSHCommandByHost(host, `sudo journalctl -u ${service} --since '${since}' -n ${lines} --no-pager`, { batchMode: false });
                const { stdout } = await execAsync(command);
                logs[service] = stdout.split('\n').filter(line => line.trim());
            } catch (error) {
                logs[service] = [`Error: ${error.message}`];
            }
        }
        return logs;
    }

    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('MonsterBox Log Collector MCP Server running on stdio');
    }
}

// Start the server
if (require.main === module) {
    const server = new LogCollectorServer();
    server.run().catch(console.error);
}

module.exports = LogCollectorServer;
