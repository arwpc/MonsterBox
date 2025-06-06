#!/usr/bin/env node

/**
 * MonsterBox Sematext Agent Setup
 * 
 * Installs and configures Sematext agents on RPI4b systems for:
 * - System log collection (journalctl, syslog)
 * - Application log monitoring (MonsterBox services)
 * - Hardware metrics (CPU, memory, GPIO status)
 * - Service monitoring (nginx, ssh, bluetooth, etc.)
 * 
 * Replaces SSH-based MCP log collection with proper monitoring infrastructure.
 */

const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const fs = require('fs').promises;
const path = require('path');
const inquirer = require('inquirer');

class SematextSetup {
    constructor() {
        this.configPath = path.join(process.cwd(), 'data', 'sematext-config.json');
        this.charactersPath = path.join(process.cwd(), 'data', 'characters.json');
        this.rpiConfigPath = path.join(process.cwd(), 'data', 'rpi-config.json');
    }

    async run() {
        console.log('🎃 MonsterBox Sematext Agent Setup\n');
        console.log('This will replace SSH-based MCP log collection with Sematext monitoring.\n');
        
        try {
            // Get Sematext credentials
            const sematextConfig = await this.promptForSematextConfig();
            
            // Load RPI systems from existing config
            const rpiSystems = await this.loadRPISystems();
            
            // Install agents on enabled systems
            for (const system of rpiSystems.filter(s => s.enabled)) {
                console.log(`\n📡 Setting up Sematext agent on ${system.name} (${system.host})`);
                await this.installSematextAgent(system, sematextConfig);
                await this.configureSematextAgent(system, sematextConfig);
            }
            
            // Save configuration
            await this.saveSematextConfig(sematextConfig, rpiSystems);
            
            // Create MCP server integration
            await this.createSematextMCPServer(sematextConfig);
            
            console.log('\n✅ Sematext setup complete!');
            console.log('\n🚀 Next steps:');
            console.log('   npm run test:sematext     # Test Sematext log collection');
            console.log('   npm run start:sematext-mcp # Start Sematext MCP server');
            console.log('\n📊 Access your logs at: https://apps.sematext.com/ui/logs');
            
        } catch (error) {
            console.error('❌ Sematext setup failed:', error.message);
            process.exit(1);
        }
    }

    async promptForSematextConfig() {
        console.log('📝 Sematext Configuration\n');
        console.log('You\'ll need a Sematext account. Sign up at: https://sematext.com/\n');
        
        const questions = [
            {
                type: 'input',
                name: 'apiKey',
                message: 'Enter your Sematext API Key:',
                validate: (input) => input.length > 0 || 'API Key is required'
            },
            {
                type: 'input',
                name: 'logsToken',
                message: 'Enter your Sematext Logs Token:',
                validate: (input) => input.length > 0 || 'Logs Token is required'
            },
            {
                type: 'input',
                name: 'appName',
                message: 'Application name for logs:',
                default: 'MonsterBox-Animatronics'
            },
            {
                type: 'checkbox',
                name: 'logSources',
                message: 'Which log sources should we monitor?',
                choices: [
                    { name: 'System logs (journalctl)', value: 'system', checked: true },
                    { name: 'MonsterBox application logs', value: 'monsterbox', checked: true },
                    { name: 'Nginx web server logs', value: 'nginx', checked: true },
                    { name: 'SSH authentication logs', value: 'ssh', checked: true },
                    { name: 'GPIO/Hardware logs', value: 'gpio', checked: true },
                    { name: 'Bluetooth service logs', value: 'bluetooth', checked: false },
                    { name: 'Custom application logs', value: 'custom', checked: false }
                ]
            },
            {
                type: 'confirm',
                name: 'enableMetrics',
                message: 'Enable system metrics monitoring (CPU, memory, disk)?',
                default: true
            },
            {
                type: 'confirm',
                name: 'enableAlerts',
                message: 'Set up basic alerting for critical errors?',
                default: true
            }
        ];

        return await inquirer.prompt(questions);
    }

    async loadRPISystems() {
        try {
            const rpiConfigData = await fs.readFile(this.rpiConfigPath, 'utf8');
            const rpiConfig = JSON.parse(rpiConfigData);
            return rpiConfig.rpi_systems || [];
        } catch (error) {
            console.warn('⚠️  Could not load RPI config, using character data');
            
            // Fallback to characters.json
            const charactersData = await fs.readFile(this.charactersPath, 'utf8');
            const characters = JSON.parse(charactersData);
            
            return characters
                .filter(char => char.animatronic && char.animatronic.enabled)
                .map(char => ({
                    name: char.char_name.toLowerCase(),
                    host: char.animatronic.rpi_config.host,
                    user: char.animatronic.rpi_config.user,
                    password_env: char.animatronic.rpi_config.password_env,
                    enabled: char.animatronic.enabled,
                    services: char.animatronic.services || [],
                    description: `${char.char_name} animatronic RPI4b`
                }));
        }
    }

    async installSematextAgent(system, config) {
        console.log(`  📦 Installing Sematext agent on ${system.name}...`);
        
        const installCommands = [
            // Download and install Sematext agent
            'curl -L https://pub-repo.sematext.com/debian/sematext.gpg.key | sudo apt-key add -',
            'echo "deb https://pub-repo.sematext.com/debian sematext main" | sudo tee /etc/apt/sources.list.d/sematext.list',
            'sudo apt-get update',
            'sudo apt-get install -y spm-client st-agent',
            
            // Install log shipper
            'sudo apt-get install -y logagent'
        ];

        for (const command of installCommands) {
            try {
                const sshCommand = this.buildSSHCommand(system, command);
                await execAsync(sshCommand);
                console.log(`    ✅ ${command.split(' ').slice(0, 3).join(' ')}`);
            } catch (error) {
                console.warn(`    ⚠️  Warning: ${command.split(' ').slice(0, 3).join(' ')} - ${error.message}`);
            }
        }
    }

    async configureSematextAgent(system, config) {
        console.log(`  ⚙️  Configuring Sematext agent on ${system.name}...`);
        
        // Create Sematext configuration
        const sematextConfig = this.generateSematextConfig(system, config);
        const logagentConfig = this.generateLogagentConfig(system, config);
        
        // Write configs to temporary files
        const tempDir = '/tmp/sematext-setup';
        await fs.mkdir(tempDir, { recursive: true });
        
        const sematextConfigPath = path.join(tempDir, `sematext-${system.name}.yml`);
        const logagentConfigPath = path.join(tempDir, `logagent-${system.name}.yml`);
        
        await fs.writeFile(sematextConfigPath, sematextConfig);
        await fs.writeFile(logagentConfigPath, logagentConfig);
        
        // Copy configs to RPI
        try {
            const scpCommands = [
                `scp ${sematextConfigPath} ${system.user}@${system.host}:/tmp/sematext.yml`,
                `scp ${logagentConfigPath} ${system.user}@${system.host}:/tmp/logagent.yml`
            ];
            
            for (const command of scpCommands) {
                await execAsync(command);
            }
            
            // Install configs on RPI
            const installConfigCommands = [
                'sudo mv /tmp/sematext.yml /opt/spm/properties/agent.properties',
                'sudo mv /tmp/logagent.yml /etc/sematext/logagent.conf',
                'sudo systemctl enable spm-monitor',
                'sudo systemctl enable logagent',
                'sudo systemctl restart spm-monitor',
                'sudo systemctl restart logagent'
            ];
            
            for (const command of installConfigCommands) {
                const sshCommand = this.buildSSHCommand(system, command);
                await execAsync(sshCommand);
            }
            
            console.log(`    ✅ Configuration installed and services started`);
            
        } catch (error) {
            console.error(`    ❌ Configuration failed: ${error.message}`);
            throw error;
        }
    }

    generateSematextConfig(system, config) {
        return `# Sematext Agent Configuration for ${system.name}
# MonsterBox RPI4b System: ${system.description}

# API Configuration
SPM_TOKEN=${config.apiKey}
LOGS_TOKEN=${config.logsToken}

# System Information
SPM_MONITOR_TAGS=monsterbox,rpi4b,${system.name},animatronic
SPM_MONITOR_HOSTNAME=${system.name}-${system.host}

# Monitoring Configuration
SPM_MONITOR_COLLECT_INTERVAL=30
SPM_MONITOR_SEND_INTERVAL=60

# Enable specific monitors
SPM_MONITOR_OS=true
SPM_MONITOR_PROCESS=true
SPM_MONITOR_NETWORK=true
SPM_MONITOR_DISK=true

# MonsterBox specific processes
SPM_MONITOR_PROCESS_MATCH=monsterbox,nginx,ssh,gpio-control,servo-control
`;
    }

    generateLogagentConfig(system, config) {
        const logSources = config.logSources.map(source => {
            switch (source) {
                case 'system':
                    return `
  # System logs via journalctl
  - module: command
    command: journalctl -f --output=json
    sourceName: ${system.name}-system
    tags:
      system: ${system.name}
      type: system
      source: journalctl`;
                
                case 'monsterbox':
                    return `
  # MonsterBox application logs
  - module: files
    patterns:
      - '/var/log/monsterbox/*.log'
      - '/home/*/monsterbox/logs/*.log'
    sourceName: ${system.name}-monsterbox
    tags:
      system: ${system.name}
      type: application
      app: monsterbox`;
                
                case 'nginx':
                    return `
  # Nginx web server logs
  - module: files
    patterns:
      - '/var/log/nginx/access.log'
      - '/var/log/nginx/error.log'
    sourceName: ${system.name}-nginx
    tags:
      system: ${system.name}
      type: webserver
      app: nginx`;
                
                case 'ssh':
                    return `
  # SSH authentication logs
  - module: command
    command: journalctl -u ssh -f --output=json
    sourceName: ${system.name}-ssh
    tags:
      system: ${system.name}
      type: auth
      service: ssh`;
                
                case 'gpio':
                    return `
  # GPIO and hardware logs
  - module: files
    patterns:
      - '/var/log/gpio/*.log'
      - '/home/*/gpio-control/logs/*.log'
    sourceName: ${system.name}-gpio
    tags:
      system: ${system.name}
      type: hardware
      component: gpio`;
                
                default:
                    return '';
            }
        }).filter(config => config.length > 0).join('\n');

        return `# Logagent Configuration for ${system.name}
# MonsterBox RPI4b Log Collection

# Global settings
options:
  suppress: true
  geoipEnabled: false
  diskBufferDir: /tmp/sematext-logagent

# Output configuration
output:
  logsene:
    module: elasticsearch
    url: https://logsene-receiver.sematext.com
    index: ${config.logsToken}

# Input sources
input:${logSources}

# Global tags for all logs
globalTransform:
  - module: add-tags
    tags:
      monsterbox_system: ${system.name}
      rpi_host: ${system.host}
      environment: production
      project: MonsterBox
`;
    }

    buildSSHCommand(system, command) {
        // Use environment variable for password
        const sshpass = process.env[system.password_env];
        if (!sshpass) {
            throw new Error(`SSH password not found in environment variable: ${system.password_env}`);
        }

        return `sshpass -p "${sshpass}" ssh -o StrictHostKeyChecking=no ${system.user}@${system.host} "${command}"`;
    }

    async saveSematextConfig(sematextConfig, rpiSystems) {
        const config = {
            sematext: {
                api_key: sematextConfig.apiKey,
                logs_token: sematextConfig.logsToken,
                app_name: sematextConfig.appName,
                log_sources: sematextConfig.logSources,
                metrics_enabled: sematextConfig.enableMetrics,
                alerts_enabled: sematextConfig.enableAlerts
            },
            systems: rpiSystems.map(system => ({
                name: system.name,
                host: system.host,
                enabled: system.enabled,
                agent_status: 'installed',
                last_updated: new Date().toISOString()
            })),
            created_at: new Date().toISOString(),
            version: '1.0.0'
        };

        await fs.mkdir(path.dirname(this.configPath), { recursive: true });
        await fs.writeFile(this.configPath, JSON.stringify(config, null, 2));
        console.log('✅ Sematext configuration saved');
    }

    async createSematextMCPServer(config) {
        console.log('🔧 Creating Sematext MCP Server integration...');

        const mcpServerContent = this.generateSematextMCPServer(config);
        const mcpServerPath = path.join(process.cwd(), 'mcp-servers', 'sematext-server.js');

        await fs.mkdir(path.dirname(mcpServerPath), { recursive: true });
        await fs.writeFile(mcpServerPath, mcpServerContent);

        // Update package.json scripts
        await this.updatePackageScripts();

        console.log('✅ Sematext MCP Server created');
    }

    generateSematextMCPServer(config) {
        return `#!/usr/bin/env node

/**
 * MonsterBox Sematext MCP Server
 *
 * Provides MCP tools to query Sematext logs and metrics for MonsterBox RPI4b systems.
 * Replaces SSH-based log collection with proper API-based monitoring.
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

// Load environment variables
require('dotenv').config();

class SematextMCPServer {
    constructor() {
        this.server = new Server(
            {
                name: 'monsterbox-sematext',
                version: '1.0.0',
            },
            {
                capabilities: {
                    tools: {},
                },
            }
        );

        this.configPath = path.join(process.cwd(), 'data', 'sematext-config.json');
        this.setupToolHandlers();
    }

    async loadConfig() {
        try {
            const configData = await fs.readFile(this.configPath, 'utf8');
            return JSON.parse(configData);
        } catch (error) {
            throw new Error('Sematext configuration not found. Run: npm run setup:sematext');
        }
    }

    setupToolHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: [
                    {
                        name: 'query_sematext_logs',
                        description: 'Query logs from MonsterBox RPI4b systems via Sematext',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                system: {
                                    type: 'string',
                                    description: 'RPI system name (orlok, coffin, pumpkinhead)',
                                    enum: ['orlok', 'coffin', 'pumpkinhead', 'all']
                                },
                                log_type: {
                                    type: 'string',
                                    description: 'Type of logs to query',
                                    enum: ['system', 'monsterbox', 'nginx', 'ssh', 'gpio', 'all']
                                },
                                time_range: {
                                    type: 'string',
                                    description: 'Time range for logs',
                                    enum: ['1h', '6h', '24h', '7d'],
                                    default: '1h'
                                },
                                query: {
                                    type: 'string',
                                    description: 'Search query for log content (optional)'
                                },
                                limit: {
                                    type: 'number',
                                    description: 'Maximum number of log entries to return',
                                    default: 100
                                }
                            },
                            required: ['system', 'log_type']
                        }
                    },
                    {
                        name: 'get_sematext_metrics',
                        description: 'Get system metrics from MonsterBox RPI4b systems',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                system: {
                                    type: 'string',
                                    description: 'RPI system name (orlok, coffin, pumpkinhead)',
                                    enum: ['orlok', 'coffin', 'pumpkinhead', 'all']
                                },
                                metric_type: {
                                    type: 'string',
                                    description: 'Type of metrics to retrieve',
                                    enum: ['cpu', 'memory', 'disk', 'network', 'all']
                                },
                                time_range: {
                                    type: 'string',
                                    description: 'Time range for metrics',
                                    enum: ['1h', '6h', '24h', '7d'],
                                    default: '1h'
                                }
                            },
                            required: ['system', 'metric_type']
                        }
                    },
                    {
                        name: 'check_sematext_alerts',
                        description: 'Check active alerts for MonsterBox systems',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                system: {
                                    type: 'string',
                                    description: 'RPI system name (orlok, coffin, pumpkinhead)',
                                    enum: ['orlok', 'coffin', 'pumpkinhead', 'all']
                                },
                                severity: {
                                    type: 'string',
                                    description: 'Alert severity level',
                                    enum: ['critical', 'warning', 'info', 'all'],
                                    default: 'all'
                                }
                            },
                            required: ['system']
                        }
                    },
                    {
                        name: 'get_system_status',
                        description: 'Get overall status of MonsterBox RPI4b systems',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                include_metrics: {
                                    type: 'boolean',
                                    description: 'Include basic system metrics in status',
                                    default: true
                                }
                            }
                        }
                    }
                ]
            };
        });

        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;

            try {
                switch (name) {
                    case 'query_sematext_logs':
                        return await this.querySematextLogs(args);
                    case 'get_sematext_metrics':
                        return await this.getSematextMetrics(args);
                    case 'check_sematext_alerts':
                        return await this.checkSematextAlerts(args);
                    case 'get_system_status':
                        return await this.getSystemStatus(args);
                    default:
                        throw new Error(\`Unknown tool: \${name}\`);
                }
            } catch (error) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: \`Error executing \${name}: \${error.message}\`
                        }
                    ]
                };
            }
        });
    }

    async querySematextLogs(args) {
        const config = await this.loadConfig();
        const { system, log_type, time_range = '1h', query, limit = 100 } = args;

        const searchQuery = this.buildLogQuery(system, log_type, query);
        const timeFilter = this.getTimeFilter(time_range);

        try {
            const response = await axios.post(
                \`https://logsene-receiver.sematext.com/\${config.sematext.logs_token}/_search\`,
                {
                    query: {
                        bool: {
                            must: [
                                { query_string: { query: searchQuery } },
                                { range: { '@timestamp': timeFilter } }
                            ]
                        }
                    },
                    size: limit,
                    sort: [{ '@timestamp': { order: 'desc' } }]
                },
                {
                    headers: {
                        'Authorization': \`Bearer \${config.sematext.api_key}\`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            const logs = response.data.hits.hits.map(hit => ({
                timestamp: hit._source['@timestamp'],
                system: hit._source.monsterbox_system,
                type: hit._source.type,
                message: hit._source.message || hit._source.log,
                source: hit._source.sourceName,
                tags: hit._source.tags || {}
            }));

            return {
                content: [
                    {
                        type: 'text',
                        text: \`Found \${logs.length} log entries for \${system} (\${log_type}):\\n\\n\` +
                              logs.map(log =>
                                  \`[\${log.timestamp}] \${log.system} - \${log.type}: \${log.message}\`
                              ).join('\\n')
                    }
                ]
            };

        } catch (error) {
            throw new Error(\`Failed to query Sematext logs: \${error.message}\`);
        }
    }

    async getSematextMetrics(args) {
        const config = await this.loadConfig();
        const { system, metric_type, time_range = '1h' } = args;

        // Sematext SPM API endpoint for metrics
        const timeFilter = this.getTimeFilter(time_range);

        try {
            const response = await axios.get(
                \`https://spm-receiver.sematext.com/receivers/v1/_search\`,
                {
                    params: {
                        token: config.sematext.api_key,
                        from: timeFilter.gte,
                        to: timeFilter.lte,
                        tags: \`monsterbox_system:\${system}\`,
                        metrics: this.getMetricNames(metric_type)
                    }
                }
            );

            const metrics = this.formatMetrics(response.data, system, metric_type);

            return {
                content: [
                    {
                        type: 'text',
                        text: \`System metrics for \${system} (\${metric_type}):\\n\\n\` +
                              JSON.stringify(metrics, null, 2)
                    }
                ]
            };

        } catch (error) {
            throw new Error(\`Failed to get Sematext metrics: \${error.message}\`);
        }
    }

    async checkSematextAlerts(args) {
        const config = await this.loadConfig();
        const { system, severity = 'all' } = args;

        try {
            // Query Sematext alerts API
            const response = await axios.get(
                'https://apps.sematext.com/api/v3/alerts',
                {
                    headers: {
                        'Authorization': \`Bearer \${config.sematext.api_key}\`
                    },
                    params: {
                        appToken: config.sematext.logs_token,
                        state: 'active'
                    }
                }
            );

            const alerts = response.data.data
                .filter(alert => system === 'all' || alert.tags?.includes(system))
                .filter(alert => severity === 'all' || alert.severity === severity);

            return {
                content: [
                    {
                        type: 'text',
                        text: alerts.length > 0
                            ? \`Active alerts for \${system}:\\n\\n\` +
                              alerts.map(alert =>
                                  \`[\${alert.severity.toUpperCase()}] \${alert.name}: \${alert.description}\`
                              ).join('\\n')
                            : \`No active alerts for \${system}\`
                    }
                ]
            };

        } catch (error) {
            throw new Error(\`Failed to check Sematext alerts: \${error.message}\`);
        }
    }

    async getSystemStatus(args) {
        const config = await this.loadConfig();
        const { include_metrics = true } = args;

        try {
            const systems = config.systems.filter(s => s.enabled);
            const statusPromises = systems.map(async (system) => {
                const status = {
                    name: system.name,
                    host: system.host,
                    agent_status: system.agent_status,
                    last_updated: system.last_updated
                };

                if (include_metrics) {
                    try {
                        const metricsResponse = await this.getSematextMetrics({
                            system: system.name,
                            metric_type: 'all',
                            time_range: '1h'
                        });
                        status.metrics = 'available';
                    } catch (error) {
                        status.metrics = 'unavailable';
                    }
                }

                return status;
            });

            const systemStatuses = await Promise.all(statusPromises);

            return {
                content: [
                    {
                        type: 'text',
                        text: \`MonsterBox Systems Status:\\n\\n\` +
                              systemStatuses.map(status =>
                                  \`\${status.name} (\${status.host}): \${status.agent_status}\` +
                                  (include_metrics ? \` - Metrics: \${status.metrics}\` : '')
                              ).join('\\n')
                    }
                ]
            };

        } catch (error) {
            throw new Error(\`Failed to get system status: \${error.message}\`);
        }
    }

    buildLogQuery(system, log_type, query) {
        let baseQuery = '';

        if (system !== 'all') {
            baseQuery += \`monsterbox_system:\${system}\`;
        }

        if (log_type !== 'all') {
            baseQuery += baseQuery ? \` AND type:\${log_type}\` : \`type:\${log_type}\`;
        }

        if (query) {
            baseQuery += baseQuery ? \` AND (\${query})\` : query;
        }

        return baseQuery || '*';
    }

    getTimeFilter(time_range) {
        const now = new Date();
        const ranges = {
            '1h': new Date(now.getTime() - 60 * 60 * 1000),
            '6h': new Date(now.getTime() - 6 * 60 * 60 * 1000),
            '24h': new Date(now.getTime() - 24 * 60 * 60 * 1000),
            '7d': new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        };

        return {
            gte: ranges[time_range].toISOString(),
            lte: now.toISOString()
        };
    }

    getMetricNames(metric_type) {
        const metrics = {
            cpu: ['cpu.usage', 'cpu.load'],
            memory: ['memory.usage', 'memory.free'],
            disk: ['disk.usage', 'disk.free'],
            network: ['network.rx', 'network.tx'],
            all: ['cpu.usage', 'memory.usage', 'disk.usage', 'network.rx', 'network.tx']
        };

        return metrics[metric_type] || metrics.all;
    }

    formatMetrics(data, system, metric_type) {
        // Format metrics data for display
        return {
            system: system,
            metric_type: metric_type,
            timestamp: new Date().toISOString(),
            data: data
        };
    }

    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('MonsterBox Sematext MCP Server running on stdio');
    }
}

// Start the server
if (require.main === module) {
    const server = new SematextMCPServer();
    server.run().catch(console.error);
}

module.exports = SematextMCPServer;
\`;
    }

    async updatePackageScripts() {
        const packagePath = path.join(process.cwd(), 'package.json');

        try {
            const packageData = await fs.readFile(packagePath, 'utf8');
            const packageJson = JSON.parse(packageData);

            // Add Sematext-related scripts
            packageJson.scripts = packageJson.scripts || {};
            packageJson.scripts['setup:sematext'] = 'node scripts/setup-sematext-agent.js';
            packageJson.scripts['test:sematext'] = 'node scripts/test-sematext.js';
            packageJson.scripts['start:sematext-mcp'] = 'node mcp-servers/sematext-server.js';

            await fs.writeFile(packagePath, JSON.stringify(packageJson, null, 2));
            console.log('✅ Package.json scripts updated');

        } catch (error) {
            console.warn('⚠️  Could not update package.json scripts:', error.message);
        }
    }
}

// Start the setup if run directly
if (require.main === module) {
    const setup = new SematextSetup();
    setup.run().catch(console.error);
}

module.exports = SematextSetup;
