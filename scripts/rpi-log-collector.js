#!/usr/bin/env node

/**
 * MonsterBox RPI4b Log Collector
 * 
 * Collects system logs from Raspberry Pi 4b systems including:
 * - System logs (journalctl)
 * - Service-specific logs
 * - Hardware logs (GPIO, sensors)
 * - Performance metrics
 * - Error tracking
 */

const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const logger = require('./logger');
const fs = require('fs').promises;
const path = require('path');
const ConfigAdapter = require('./config-adapter');

class RPiLogCollector {
    constructor(options = {}) {
        this.options = {
            logDir: path.join(process.cwd(), 'log'),
            ...options
        };

        this.config = null;
        this.configAdapter = new ConfigAdapter();
    }

    async loadConfig() {
        try {
            this.config = await this.configAdapter.getEnabledRpiSystems();
            logger.info('RPI configuration loaded from unified character config', {
                rpiSystems: this.config.rpi_systems.length,
                ubuntuSystems: this.config.ubuntu_systems.length
            });
        } catch (error) {
            logger.error('Failed to load RPI configuration', { error: error.message });
            throw error;
        }
    }

    async collectAllLogs() {
        if (!this.config) {
            await this.loadConfig();
        }

        logger.info('Starting RPI log collection');

        const results = {
            timestamp: new Date().toISOString(),
            rpi_logs: [],
            ubuntu_logs: [],
            errors: []
        };

        // Collect from enabled RPI systems only
        const enabledRpiSystems = this.config.rpi_systems.filter(system => system.enabled !== false);
        logger.info('Processing RPI systems', {
            total: this.config.rpi_systems.length,
            enabled: enabledRpiSystems.length,
            disabled: this.config.rpi_systems.length - enabledRpiSystems.length
        });

        for (const rpiSystem of enabledRpiSystems) {
            try {
                logger.info('Collecting logs from enabled RPI system', {
                    name: rpiSystem.name,
                    host: rpiSystem.host,
                    status: rpiSystem.status
                });
                const logs = await this.collectRPiLogs(rpiSystem);
                results.rpi_logs.push(logs);
            } catch (error) {
                logger.error('Failed to collect RPI logs', {
                    system: rpiSystem.name,
                    error: error.message
                });
                results.errors.push({
                    system: rpiSystem.name,
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        }

        // Collect from enabled Ubuntu systems only
        const enabledUbuntuSystems = this.config.ubuntu_systems.filter(system => system.enabled !== false);
        logger.info('Processing Ubuntu systems', {
            total: this.config.ubuntu_systems.length,
            enabled: enabledUbuntuSystems.length,
            disabled: this.config.ubuntu_systems.length - enabledUbuntuSystems.length
        });

        for (const ubuntuSystem of enabledUbuntuSystems) {
            try {
                logger.info('Collecting logs from enabled Ubuntu system', {
                    name: ubuntuSystem.name,
                    host: ubuntuSystem.host,
                    status: ubuntuSystem.status
                });
                const logs = await this.collectUbuntuLogs(ubuntuSystem);
                results.ubuntu_logs.push(logs);
            } catch (error) {
                logger.error('Failed to collect Ubuntu logs', {
                    system: ubuntuSystem.name,
                    error: error.message
                });
                results.errors.push({
                    system: ubuntuSystem.name,
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        }

        // Store results
        await this.storeLogs(results);

        logger.info('RPI log collection completed', {
            rpiSystems: results.rpi_logs.length,
            ubuntuSystems: results.ubuntu_logs.length,
            errors: results.errors.length
        });

        return results;
    }

    async collectRPiLogs(system) {
        logger.info('Collecting RPI logs', { system: system.name, host: system.host });

        const logs = {
            system: system.name,
            host: system.host,
            timestamp: new Date().toISOString(),
            system_logs: {},
            service_logs: {},
            hardware_logs: {},
            performance: {}
        };

        // Test SSH connectivity first
        await this.testSSHConnection(system);

        // Collect system logs
        for (const logType of system.log_types) {
            try {
                logs.system_logs[logType] = await this.collectSystemLogs(system, logType);
            } catch (error) {
                logger.warn('Failed to collect system log type', { 
                    system: system.name, 
                    logType, 
                    error: error.message 
                });
                logs.system_logs[logType] = { error: error.message };
            }
        }

        // Collect service-specific logs
        for (const service of system.services) {
            try {
                logs.service_logs[service] = await this.collectServiceLogs(system, service);
            } catch (error) {
                logger.warn('Failed to collect service logs', { 
                    system: system.name, 
                    service, 
                    error: error.message 
                });
                logs.service_logs[service] = { error: error.message };
            }
        }

        // Collect hardware information
        try {
            logs.hardware_logs = await this.collectHardwareLogs(system);
        } catch (error) {
            logger.warn('Failed to collect hardware logs', { 
                system: system.name, 
                error: error.message 
            });
            logs.hardware_logs = { error: error.message };
        }

        // Collect performance metrics
        try {
            logs.performance = await this.collectPerformanceMetrics(system);
        } catch (error) {
            logger.warn('Failed to collect performance metrics', { 
                system: system.name, 
                error: error.message 
            });
            logs.performance = { error: error.message };
        }

        return logs;
    }

    async collectUbuntuLogs(system) {
        logger.info('Collecting Ubuntu logs', { system: system.name, host: system.host });

        const logs = {
            system: system.name,
            host: system.host,
            timestamp: new Date().toISOString(),
            system_logs: {},
            service_logs: {}
        };

        // Test SSH connectivity
        await this.testSSHConnection(system);

        // Collect system logs
        for (const logType of system.log_types) {
            try {
                logs.system_logs[logType] = await this.collectSystemLogs(system, logType);
            } catch (error) {
                logs.system_logs[logType] = { error: error.message };
            }
        }

        // Collect service logs
        for (const service of system.services) {
            try {
                logs.service_logs[service] = await this.collectServiceLogs(system, service);
            } catch (error) {
                logs.service_logs[service] = { error: error.message };
            }
        }

        return logs;
    }

    async testSSHConnection(system) {
        const command = `ssh -o ConnectTimeout=10 -o BatchMode=yes ${system.user}@${system.host} "echo 'SSH connection test successful'"`;
        
        try {
            const { stdout } = await execAsync(command);
            if (!stdout.includes('SSH connection test successful')) {
                throw new Error('SSH test command failed');
            }
            logger.debug('SSH connection test passed', { system: system.name });
        } catch (error) {
            throw new Error(`SSH connection failed to ${system.host}: ${error.message}`);
        }
    }

    async collectSystemLogs(system, logType) {
        const settings = this.config.collection_settings;
        let command;

        switch (logType) {
            case 'system':
                command = `ssh ${system.user}@${system.host} "sudo journalctl -n ${settings.default_lines} --no-pager --since '${settings.default_since}'"`;
                break;
            case 'auth':
                command = `ssh ${system.user}@${system.host} "sudo journalctl -u ssh -n ${settings.default_lines} --no-pager --since '${settings.default_since}'"`;
                break;
            case 'kernel':
                command = `ssh ${system.user}@${system.host} "sudo journalctl -k -n ${settings.default_lines} --no-pager --since '${settings.default_since}'"`;
                break;
            case 'daemon':
                command = `ssh ${system.user}@${system.host} "sudo journalctl --system -n ${settings.default_lines} --no-pager --since '${settings.default_since}'"`;
                break;
            default:
                command = `ssh ${system.user}@${system.host} "sudo journalctl -p ${logType} -n ${settings.default_lines} --no-pager --since '${settings.default_since}'"`;
        }

        const { stdout } = await execAsync(command);
        return {
            type: logType,
            lines: stdout.split('\n').filter(line => line.trim()),
            collected_at: new Date().toISOString()
        };
    }

    async collectServiceLogs(system, service) {
        const settings = this.config.collection_settings;
        const command = `ssh ${system.user}@${system.host} "sudo journalctl -u ${service} -n ${settings.default_lines} --no-pager --since '${settings.default_since}'"`;
        
        const { stdout } = await execAsync(command);
        return {
            service: service,
            lines: stdout.split('\n').filter(line => line.trim()),
            collected_at: new Date().toISOString()
        };
    }

    async collectHardwareLogs(system) {
        const commands = {
            temperature: `ssh ${system.user}@${system.host} "vcgencmd measure_temp"`,
            memory: `ssh ${system.user}@${system.host} "free -h"`,
            disk: `ssh ${system.user}@${system.host} "df -h"`,
            gpio: `ssh ${system.user}@${system.host} "gpio readall 2>/dev/null || echo 'GPIO tools not available'"`,
            usb: `ssh ${system.user}@${system.host} "lsusb"`
        };

        const hardware = {};
        
        for (const [key, command] of Object.entries(commands)) {
            try {
                const { stdout } = await execAsync(command);
                hardware[key] = stdout.trim();
            } catch (error) {
                hardware[key] = `Error: ${error.message}`;
            }
        }

        return hardware;
    }

    async collectPerformanceMetrics(system) {
        const commands = {
            uptime: `ssh ${system.user}@${system.host} "uptime"`,
            load: `ssh ${system.user}@${system.host} "cat /proc/loadavg"`,
            processes: `ssh ${system.user}@${system.host} "ps aux --sort=-%cpu | head -10"`,
            network: `ssh ${system.user}@${system.host} "ss -tuln | wc -l"`
        };

        const performance = {};
        
        for (const [key, command] of Object.entries(commands)) {
            try {
                const { stdout } = await execAsync(command);
                performance[key] = stdout.trim();
            } catch (error) {
                performance[key] = `Error: ${error.message}`;
            }
        }

        return performance;
    }

    async storeLogs(results) {
        try {
            await fs.mkdir(this.options.logDir, { recursive: true });
            
            const filename = `rpi-logs-${new Date().toISOString().split('T')[0]}.log`;
            const filepath = path.join(this.options.logDir, filename);
            
            const logEntry = {
                timestamp: new Date().toISOString(),
                source: 'rpi-systems',
                data: results
            };

            await fs.appendFile(filepath, JSON.stringify(logEntry) + '\n');
            
            logger.info('RPI logs stored', { filepath, filename });

        } catch (error) {
            logger.error('Failed to store RPI logs', { error: error.message });
        }
    }

    async updateRPiIP(systemName, newIP) {
        if (!this.config) {
            await this.loadConfig();
        }

        const system = this.config.rpi_systems.find(s => s.name === systemName);
        if (system) {
            system.host = newIP;
            await fs.writeFile(this.options.configFile, JSON.stringify(this.config, null, 2));
            logger.info('RPI IP updated', { system: systemName, newIP });
        }
    }
}

// CLI usage
if (require.main === module) {
    const collector = new RPiLogCollector();
    
    collector.collectAllLogs()
        .then(results => {
            console.log('✅ RPI logs collected successfully');
            console.log(`📊 Summary: ${results.rpi_logs.length} RPI systems, ${results.ubuntu_logs.length} Ubuntu systems, ${results.errors.length} errors`);
        })
        .catch(error => {
            console.error('❌ RPI log collection failed:', error.message);
            process.exit(1);
        });
}

module.exports = RPiLogCollector;
