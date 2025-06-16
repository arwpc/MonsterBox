#!/usr/bin/env node

/**
 * MonsterBox Enhanced Log Collection Agents
 * Task 4.2: Implement Log Collection Agents
 * 
 * MCP-compliant log collection agents for distributed monitoring
 * across all MonsterBox Raspberry Pi 4B devices
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const fs = require('fs').promises;
const path = require('path');
const { spawn, exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const WebSocket = require('ws');
const sshCredentials = require('../scripts/ssh-credentials');

// Load environment variables
require('dotenv').config();

class EnhancedLogCollectionAgents {
    constructor() {
        this.server = new Server(
            {
                name: 'monsterbox-enhanced-log-agents',
                version: '2.0.0',
            },
            {
                capabilities: {
                    tools: {},
                },
            }
        );

        this.activeStreams = new Map();
        this.logBuffer = new Map();
        this.setupToolHandlers();
    }

    setupToolHandlers() {
        // List available tools
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: [
                    {
                        name: 'start_realtime_log_stream',
                        description: 'Start real-time log streaming from WebSocket services on RPi4B devices',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                host: {
                                    type: 'string',
                                    description: 'RPI hostname or IP address',
                                    enum: ['192.168.8.120', '192.168.8.140', 'orlok', 'coffin']
                                },
                                services: {
                                    type: 'array',
                                    items: { type: 'string' },
                                    description: 'WebSocket services to monitor (registry, motor, light, jaw, ai, main)',
                                    default: ['registry', 'main']
                                },
                                duration: {
                                    type: 'number',
                                    description: 'Stream duration in seconds (default: 300)',
                                    default: 300
                                }
                            },
                            required: ['host']
                        }
                    },
                    {
                        name: 'collect_websocket_service_logs',
                        description: 'Collect logs from specific WebSocket services (ports 8765-8780)',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                host: {
                                    type: 'string',
                                    description: 'RPI hostname or IP address',
                                    enum: ['192.168.8.120', '192.168.8.140', 'orlok', 'coffin']
                                },
                                service: {
                                    type: 'string',
                                    description: 'WebSocket service to collect logs from',
                                    enum: ['jaw', 'ai', 'registry', 'motor', 'light', 'main']
                                },
                                lines: {
                                    type: 'number',
                                    description: 'Number of log lines to collect (default: 100)',
                                    default: 100
                                }
                            },
                            required: ['host', 'service']
                        }
                    },
                    {
                        name: 'collect_hardware_script_logs',
                        description: 'Collect logs from Python hardware control scripts',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                host: {
                                    type: 'string',
                                    description: 'RPI hostname or IP address',
                                    enum: ['192.168.8.120', '192.168.8.140', 'orlok', 'coffin']
                                },
                                scriptType: {
                                    type: 'string',
                                    description: 'Type of hardware script',
                                    enum: ['gpio', 'servo', 'motor', 'light', 'sensor', 'camera', 'all']
                                },
                                since: {
                                    type: 'string',
                                    description: 'Time period to collect logs from',
                                    default: '1 hour ago'
                                }
                            },
                            required: ['host']
                        }
                    },
                    {
                        name: 'collect_performance_metrics',
                        description: 'Collect real-time performance metrics from RPi4B devices',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                host: {
                                    type: 'string',
                                    description: 'RPI hostname or IP address',
                                    enum: ['192.168.8.120', '192.168.8.140', 'orlok', 'coffin']
                                },
                                metrics: {
                                    type: 'array',
                                    items: { type: 'string' },
                                    description: 'Metrics to collect',
                                    enum: ['cpu', 'memory', 'disk', 'network', 'temperature', 'gpio', 'all'],
                                    default: ['cpu', 'memory', 'temperature']
                                },
                                interval: {
                                    type: 'number',
                                    description: 'Collection interval in seconds (default: 30)',
                                    default: 30
                                }
                            },
                            required: ['host']
                        }
                    },
                    {
                        name: 'setup_distributed_log_agent',
                        description: 'Deploy and configure log collection agent on RPi4B device',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                host: {
                                    type: 'string',
                                    description: 'RPI hostname or IP address',
                                    enum: ['192.168.8.120', '192.168.8.140', 'orlok', 'coffin']
                                },
                                agentConfig: {
                                    type: 'object',
                                    description: 'Agent configuration options',
                                    properties: {
                                        fluentBit: { type: 'boolean', default: true },
                                        realTimeStreaming: { type: 'boolean', default: true },
                                        localBuffering: { type: 'boolean', default: true },
                                        compressionEnabled: { type: 'boolean', default: true }
                                    }
                                }
                            },
                            required: ['host']
                        }
                    },
                    {
                        name: 'monitor_service_health',
                        description: 'Monitor health of all WebSocket services and log collection agents',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                hosts: {
                                    type: 'array',
                                    items: { type: 'string' },
                                    description: 'RPI hosts to monitor',
                                    default: ['192.168.8.120', '192.168.8.140']
                                },
                                checkInterval: {
                                    type: 'number',
                                    description: 'Health check interval in seconds (default: 60)',
                                    default: 60
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
                    case 'start_realtime_log_stream':
                        return await this.startRealtimeLogStream(args);
                    case 'collect_websocket_service_logs':
                        return await this.collectWebSocketServiceLogs(args);
                    case 'collect_hardware_script_logs':
                        return await this.collectHardwareScriptLogs(args);
                    case 'collect_performance_metrics':
                        return await this.collectPerformanceMetrics(args);
                    case 'setup_distributed_log_agent':
                        return await this.setupDistributedLogAgent(args);
                    case 'monitor_service_health':
                        return await this.monitorServiceHealth(args);
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

    async startRealtimeLogStream(args) {
        const { host, services = ['registry', 'main'], duration = 300 } = args;

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
                        text: `Error: Host '${host}' is not allowed. Only Orlok and Coffin are supported.`
                    }
                ],
                isError: true
            };
        }

        try {
            const streamId = `${animatronicName}-${Date.now()}`;
            const logStream = {
                id: streamId,
                host: targetHost,
                animatronic: animatronicName,
                services: services,
                startTime: new Date().toISOString(),
                duration: duration,
                logs: []
            };

            // Service port mapping
            const servicePorts = {
                'jaw': 8765,
                'ai': 8766,
                'registry': 8770,
                'motor': 8771,
                'light': 8772,
                'main': 8780
            };

            // Start log collection for each service
            for (const service of services) {
                const port = servicePorts[service];
                if (port) {
                    await this.startServiceLogStream(streamId, targetHost, service, port);
                }
            }

            this.activeStreams.set(streamId, logStream);

            // Set timeout to stop stream
            setTimeout(() => {
                this.stopLogStream(streamId);
            }, duration * 1000);

            return {
                content: [
                    {
                        type: 'text',
                        text: `Real-time log stream started for ${animatronicName} (${targetHost})\nStream ID: ${streamId}\nServices: ${services.join(', ')}\nDuration: ${duration} seconds`
                    }
                ]
            };

        } catch (error) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `Failed to start real-time log stream: ${error.message}`
                    }
                ],
                isError: true
            };
        }
    }

    async startServiceLogStream(streamId, host, service, port) {
        try {
            // Use SSH to monitor service logs in real-time
            const command = sshCredentials.buildSSHCommandByHost(
                host,
                `journalctl -u monsterbox-${service} -f --no-pager`,
                { batchMode: false }
            );

            const process = spawn('bash', ['-c', command]);

            process.stdout.on('data', (data) => {
                const logEntry = {
                    service: service,
                    port: port,
                    timestamp: new Date().toISOString(),
                    data: data.toString()
                };

                if (this.activeStreams.has(streamId)) {
                    this.activeStreams.get(streamId).logs.push(logEntry);
                }
            });

            process.stderr.on('data', (data) => {
                const errorEntry = {
                    service: service,
                    port: port,
                    timestamp: new Date().toISOString(),
                    error: data.toString()
                };

                if (this.activeStreams.has(streamId)) {
                    this.activeStreams.get(streamId).logs.push(errorEntry);
                }
            });

            // Store process reference for cleanup
            if (!this.logBuffer.has(streamId)) {
                this.logBuffer.set(streamId, []);
            }
            this.logBuffer.get(streamId).push(process);

        } catch (error) {
            console.error(`Failed to start log stream for ${service}: ${error.message}`);
        }
    }

    async stopLogStream(streamId) {
        if (this.activeStreams.has(streamId)) {
            const stream = this.activeStreams.get(streamId);
            stream.endTime = new Date().toISOString();

            // Kill all processes for this stream
            if (this.logBuffer.has(streamId)) {
                const processes = this.logBuffer.get(streamId);
                processes.forEach(process => {
                    try {
                        process.kill('SIGTERM');
                    } catch (error) {
                        console.error(`Error killing process: ${error.message}`);
                    }
                });
                this.logBuffer.delete(streamId);
            }

            // Save stream data to file
            await this.saveStreamData(stream);
            this.activeStreams.delete(streamId);
        }
    }

    async saveStreamData(stream) {
        try {
            const outputDir = path.join(process.cwd(), 'log', 'streams', stream.animatronic);
            await fs.mkdir(outputDir, { recursive: true });

            const filename = `stream-${stream.id}.jsonl`;
            const filepath = path.join(outputDir, filename);

            const streamData = stream.logs.map(log => JSON.stringify(log)).join('\n');
            await fs.writeFile(filepath, streamData);

            console.log(`Stream data saved to: ${filepath}`);
        } catch (error) {
            console.error(`Failed to save stream data: ${error.message}`);
        }
    }

    async collectWebSocketServiceLogs(args) {
        const { host, service, lines = 100 } = args;

        const allowedHosts = {
            '192.168.8.120': 'orlok',
            '192.168.8.140': 'coffin',
            'orlok': '192.168.8.120',
            'coffin': '192.168.8.140'
        };

        const targetHost = allowedHosts[host] || host;
        const animatronicName = allowedHosts[targetHost] || 'unknown';

        const servicePorts = {
            'jaw': 8765,
            'ai': 8766,
            'registry': 8770,
            'motor': 8771,
            'light': 8772,
            'main': 8780
        };

        const port = servicePorts[service];
        if (!port) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `Error: Unknown service '${service}'. Available services: ${Object.keys(servicePorts).join(', ')}`
                    }
                ],
                isError: true
            };
        }

        try {
            // Collect service logs via SSH
            const command = sshCredentials.buildSSHCommandByHost(
                targetHost,
                `journalctl -u monsterbox-${service} -n ${lines} --no-pager`,
                { batchMode: false }
            );

            const { stdout } = await execAsync(command);

            const logs = {
                host: targetHost,
                animatronic: animatronicName,
                service: service,
                port: port,
                timestamp: new Date().toISOString(),
                lines_collected: lines,
                logs: stdout.split('\n').filter(line => line.trim())
            };

            return {
                content: [
                    {
                        type: 'text',
                        text: `WebSocket service logs collected from ${animatronicName} (${service}:${port}):\n\n${JSON.stringify(logs, null, 2)}`
                    }
                ]
            };

        } catch (error) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `Failed to collect WebSocket service logs: ${error.message}`
                    }
                ],
                isError: true
            };
        }
    }

    async collectHardwareScriptLogs(args) {
        const { host, scriptType = 'all', since = '1 hour ago' } = args;

        const allowedHosts = {
            '192.168.8.120': 'orlok',
            '192.168.8.140': 'coffin',
            'orlok': '192.168.8.120',
            'coffin': '192.168.8.140'
        };

        const targetHost = allowedHosts[host] || host;
        const animatronicName = allowedHosts[targetHost] || 'unknown';

        try {
            const logs = {
                host: targetHost,
                animatronic: animatronicName,
                scriptType: scriptType,
                since: since,
                timestamp: new Date().toISOString(),
                scripts: {}
            };

            const scriptPaths = {
                'gpio': '/home/remote/MonsterBox/scripts/python/*gpio*.py',
                'servo': '/home/remote/MonsterBox/scripts/python/*servo*.py',
                'motor': '/home/remote/MonsterBox/scripts/python/*motor*.py',
                'light': '/home/remote/MonsterBox/scripts/python/*light*.py',
                'sensor': '/home/remote/MonsterBox/scripts/python/*sensor*.py',
                'camera': '/home/remote/MonsterBox/scripts/python/*camera*.py'
            };

            const scriptsToCheck = scriptType === 'all' ? Object.keys(scriptPaths) : [scriptType];

            for (const script of scriptsToCheck) {
                try {
                    const command = sshCredentials.buildSSHCommandByHost(
                        targetHost,
                        `find /home/remote/MonsterBox/scripts/log -name "*${script}*" -type f -newermt "${since}" -exec tail -50 {} \\; 2>/dev/null || echo "No ${script} logs found"`,
                        { batchMode: false }
                    );

                    const { stdout } = await execAsync(command);
                    logs.scripts[script] = stdout.split('\n').filter(line => line.trim());

                } catch (error) {
                    logs.scripts[script] = { error: error.message };
                }
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: `Hardware script logs collected from ${animatronicName}:\n\n${JSON.stringify(logs, null, 2)}`
                    }
                ]
            };

        } catch (error) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `Failed to collect hardware script logs: ${error.message}`
                    }
                ],
                isError: true
            };
        }
    }

    async collectPerformanceMetrics(args) {
        const { host, metrics = ['cpu', 'memory', 'temperature'], interval = 30 } = args;

        const allowedHosts = {
            '192.168.8.120': 'orlok',
            '192.168.8.140': 'coffin',
            'orlok': '192.168.8.120',
            'coffin': '192.168.8.140'
        };

        const targetHost = allowedHosts[host] || host;
        const animatronicName = allowedHosts[targetHost] || 'unknown';

        try {
            const performanceData = {
                host: targetHost,
                animatronic: animatronicName,
                timestamp: new Date().toISOString(),
                interval: interval,
                metrics: {}
            };

            const metricCommands = {
                'cpu': "top -bn1 | grep 'Cpu(s)' | awk '{print $2}' | cut -d'%' -f1",
                'memory': "free -m | awk 'NR==2{printf \"%.2f\", $3*100/$2}'",
                'disk': "df -h / | awk 'NR==2{print $5}' | cut -d'%' -f1",
                'temperature': "vcgencmd measure_temp | cut -d'=' -f2 | cut -d\"'\" -f1",
                'network': "cat /proc/net/dev | grep eth0 | awk '{print $2,$10}'",
                'gpio': "gpio readall | grep -c '1'"
            };

            for (const metric of metrics) {
                if (metricCommands[metric]) {
                    try {
                        const command = sshCredentials.buildSSHCommandByHost(
                            targetHost,
                            metricCommands[metric],
                            { batchMode: false }
                        );

                        const { stdout } = await execAsync(command);
                        performanceData.metrics[metric] = stdout.trim();

                    } catch (error) {
                        performanceData.metrics[metric] = { error: error.message };
                    }
                }
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: `Performance metrics collected from ${animatronicName}:\n\n${JSON.stringify(performanceData, null, 2)}`
                    }
                ]
            };

        } catch (error) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `Failed to collect performance metrics: ${error.message}`
                    }
                ],
                isError: true
            };
        }
    }

    async setupDistributedLogAgent(args) {
        const { host, agentConfig = {} } = args;

        const allowedHosts = {
            '192.168.8.120': 'orlok',
            '192.168.8.140': 'coffin',
            'orlok': '192.168.8.120',
            'coffin': '192.168.8.140'
        };

        const targetHost = allowedHosts[host] || host;
        const animatronicName = allowedHosts[targetHost] || 'unknown';

        const config = {
            fluentBit: agentConfig.fluentBit !== false,
            realTimeStreaming: agentConfig.realTimeStreaming !== false,
            localBuffering: agentConfig.localBuffering !== false,
            compressionEnabled: agentConfig.compressionEnabled !== false
        };

        try {
            const setupResult = {
                host: targetHost,
                animatronic: animatronicName,
                timestamp: new Date().toISOString(),
                config: config,
                steps: []
            };

            // Step 1: Create log directories
            const createDirsCommand = sshCredentials.buildSSHCommandByHost(
                targetHost,
                'mkdir -p /home/remote/log_export /var/log/monsterbox/aggregated /tmp/flb-storage',
                { batchMode: false }
            );

            await execAsync(createDirsCommand);
            setupResult.steps.push('Created log directories');

            // Step 2: Deploy Fluent Bit configuration if enabled
            if (config.fluentBit) {
                const configPath = path.join(process.cwd(), 'data', `fluent-bit-${animatronicName}-fixed.conf`);

                try {
                    await fs.access(configPath);
                    const scpCommand = sshCredentials.buildSCPCommand(
                        animatronicName,
                        targetHost,
                        configPath,
                        '/tmp/fluent-bit.conf'
                    );

                    await execAsync(scpCommand);

                    const installCommand = sshCredentials.buildSSHCommandByHost(
                        targetHost,
                        'sudo cp /tmp/fluent-bit.conf /etc/fluent-bit/fluent-bit.conf && sudo systemctl restart fluent-bit',
                        { batchMode: false }
                    );

                    await execAsync(installCommand);
                    setupResult.steps.push('Deployed and restarted Fluent Bit');
                } catch (error) {
                    setupResult.steps.push(`Fluent Bit setup failed: ${error.message}`);
                }
            }

            // Step 3: Setup log rotation
            const logrotateCommand = sshCredentials.buildSSHCommandByHost(
                targetHost,
                `echo '/home/remote/log_export/*.jsonl {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 644 remote remote
}' | sudo tee /etc/logrotate.d/monsterbox-logs`,
                { batchMode: false }
            );

            await execAsync(logrotateCommand);
            setupResult.steps.push('Configured log rotation');

            // Step 4: Setup systemd service for log agent
            const serviceContent = `[Unit]
Description=MonsterBox Log Collection Agent
After=network.target

[Service]
Type=simple
User=remote
WorkingDirectory=/home/remote/MonsterBox
ExecStart=/usr/bin/python3 /home/remote/MonsterBox/scripts/log-agent.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target`;

            const serviceCommand = sshCredentials.buildSSHCommandByHost(
                targetHost,
                `echo '${serviceContent}' | sudo tee /etc/systemd/system/monsterbox-log-agent.service && sudo systemctl daemon-reload && sudo systemctl enable monsterbox-log-agent`,
                { batchMode: false }
            );

            await execAsync(serviceCommand);
            setupResult.steps.push('Created and enabled log agent service');

            return {
                content: [
                    {
                        type: 'text',
                        text: `Distributed log agent setup completed for ${animatronicName}:\n\n${JSON.stringify(setupResult, null, 2)}`
                    }
                ]
            };

        } catch (error) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `Failed to setup distributed log agent: ${error.message}`
                    }
                ],
                isError: true
            };
        }
    }

    async monitorServiceHealth(args) {
        const { hosts = ['192.168.8.120', '192.168.8.140'], checkInterval = 60 } = args;

        try {
            const healthReport = {
                timestamp: new Date().toISOString(),
                checkInterval: checkInterval,
                hosts: {}
            };

            for (const host of hosts) {
                const allowedHosts = {
                    '192.168.8.120': 'orlok',
                    '192.168.8.140': 'coffin',
                    'orlok': '192.168.8.120',
                    'coffin': '192.168.8.140'
                };

                const targetHost = allowedHosts[host] || host;
                const animatronicName = allowedHosts[targetHost] || 'unknown';

                healthReport.hosts[animatronicName] = {
                    host: targetHost,
                    services: {},
                    system: {}
                };

                // Check WebSocket services
                const servicePorts = [8765, 8766, 8770, 8771, 8772, 8780];

                for (const port of servicePorts) {
                    try {
                        const command = sshCredentials.buildSSHCommandByHost(
                            targetHost,
                            `netstat -tln | grep :${port} && echo "LISTENING" || echo "NOT_LISTENING"`,
                            { batchMode: false }
                        );

                        const { stdout } = await execAsync(command);
                        healthReport.hosts[animatronicName].services[`port_${port}`] = {
                            status: stdout.includes('LISTENING') ? 'healthy' : 'down',
                            port: port
                        };
                    } catch (error) {
                        healthReport.hosts[animatronicName].services[`port_${port}`] = {
                            status: 'error',
                            error: error.message,
                            port: port
                        };
                    }
                }

                // Check system health
                try {
                    const systemCommand = sshCredentials.buildSSHCommandByHost(
                        targetHost,
                        'uptime && free -m | head -2 && df -h / | tail -1',
                        { batchMode: false }
                    );

                    const { stdout } = await execAsync(systemCommand);
                    healthReport.hosts[animatronicName].system = {
                        status: 'healthy',
                        details: stdout.split('\n').filter(line => line.trim())
                    };
                } catch (error) {
                    healthReport.hosts[animatronicName].system = {
                        status: 'error',
                        error: error.message
                    };
                }
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: `Service health monitoring report:\n\n${JSON.stringify(healthReport, null, 2)}`
                    }
                ]
            };

        } catch (error) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `Failed to monitor service health: ${error.message}`
                    }
                ],
                isError: true
            };
        }
    }

    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('MonsterBox Enhanced Log Collection Agents running on stdio');
    }
}

// Start the server if run directly
if (require.main === module) {
    const server = new EnhancedLogCollectionAgents();
    server.run().catch(console.error);
}

module.exports = EnhancedLogCollectionAgents;
