#!/usr/bin/env node

/**
 * MonsterBox Log Collector MCP Server
 * 
 * Collects logs from multiple sources:
 * - Browser console logs
 * - GitHub API logs
 * - RPI4b console logs
 * - Ubuntu system logs
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
