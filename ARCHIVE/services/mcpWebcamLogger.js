/**
 * MCP (Model Context Protocol) Integration for Webcam Testing
 * Provides detailed system-level debugging and performance monitoring for webcam operations
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class MCPWebcamLogger {
    constructor(options = {}) {
        this.options = {
            logLevel: 'info',
            enableSystemMetrics: true,
            enableHardwareMonitoring: true,
            enablePerformanceTracking: true,
            logDirectory: path.join(__dirname, '..', 'logs', 'mcp-webcam'),
            maxLogFiles: 50,
            maxLogSizeBytes: 10 * 1024 * 1024, // 10MB
            ...options
        };

        this.sessionId = this.generateSessionId();
        this.startTime = Date.now();
        this.metrics = {
            operations: [],
            systemStats: [],
            hardwareEvents: [],
            performanceData: []
        };

        this.init();
    }

    async init() {
        try {
            // Ensure log directory exists
            await fs.mkdir(this.options.logDirectory, { recursive: true });

            // Start system monitoring if enabled
            if (this.options.enableSystemMetrics) {
                this.startSystemMonitoring();
            }

            // Log session start
            await this.logOperation('session_start', {
                sessionId: this.sessionId,
                timestamp: new Date().toISOString(),
                system: await this.getSystemInfo(),
                webcamDevices: await this.getWebcamDevices()
            });

            console.log(`🔍 MCP Webcam Logger initialized - Session: ${this.sessionId}`);
        } catch (error) {
            console.error('Failed to initialize MCP Webcam Logger:', error);
        }
    }

    generateSessionId() {
        return `mcp-webcam-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    async getSystemInfo() {
        try {
            const systemInfo = {
                platform: os.platform(),
                arch: os.arch(),
                release: os.release(),
                hostname: os.hostname(),
                uptime: os.uptime(),
                loadavg: os.loadavg(),
                totalmem: os.totalmem(),
                freemem: os.freemem(),
                cpus: os.cpus().length,
                nodeVersion: process.version,
                pid: process.pid
            };

            // Add Linux-specific information
            if (os.platform() === 'linux') {
                try {
                    const { stdout: kernelVersion } = await execAsync('uname -r');
                    systemInfo.kernelVersion = kernelVersion.trim();

                    const { stdout: distribution } = await execAsync('lsb_release -d 2>/dev/null || cat /etc/os-release | grep PRETTY_NAME | cut -d= -f2 | tr -d \'"\'');
                    systemInfo.distribution = distribution.trim();
                } catch (error) {
                    // Ignore errors for optional system info
                }
            }

            return systemInfo;
        } catch (error) {
            return { error: error.message };
        }
    }

    async getWebcamDevices() {
        try {
            const devices = [];

            // List video devices
            try {
                const { stdout } = await execAsync('ls -la /dev/video* 2>/dev/null || echo "No video devices found"');
                devices.push({
                    type: 'video_devices',
                    data: stdout.trim()
                });
            } catch (error) {
                devices.push({
                    type: 'video_devices',
                    error: error.message
                });
            }

            // Get USB devices (cameras often show up here)
            try {
                const { stdout } = await execAsync('lsusb 2>/dev/null | grep -i camera || lsusb 2>/dev/null | grep -i video || echo "No USB cameras found"');
                devices.push({
                    type: 'usb_cameras',
                    data: stdout.trim()
                });
            } catch (error) {
                devices.push({
                    type: 'usb_cameras',
                    error: error.message
                });
            }

            // Get V4L2 device information
            try {
                const { stdout } = await execAsync('v4l2-ctl --list-devices 2>/dev/null || echo "v4l2-ctl not available"');
                devices.push({
                    type: 'v4l2_devices',
                    data: stdout.trim()
                });
            } catch (error) {
                devices.push({
                    type: 'v4l2_devices',
                    error: error.message
                });
            }

            return devices;
        } catch (error) {
            return [{ type: 'error', error: error.message }];
        }
    }

    async logOperation(operation, data = {}, level = 'info') {
        const logEntry = {
            sessionId: this.sessionId,
            timestamp: new Date().toISOString(),
            operation,
            level,
            data,
            systemMetrics: this.options.enableSystemMetrics ? await this.getCurrentSystemMetrics() : null,
            duration: Date.now() - this.startTime
        };

        this.metrics.operations.push(logEntry);

        // Write to log file
        await this.writeLogEntry(logEntry);

        // Console output based on level
        const logMethod = console[level] || console.log;
        logMethod(`[MCP-WEBCAM] ${operation}:`, data);
    }

    async getCurrentSystemMetrics() {
        try {
            const metrics = {
                timestamp: new Date().toISOString(),
                memory: {
                    total: os.totalmem(),
                    free: os.freemem(),
                    used: os.totalmem() - os.freemem(),
                    usage: ((os.totalmem() - os.freemem()) / os.totalmem() * 100).toFixed(2)
                },
                cpu: {
                    loadavg: os.loadavg(),
                    uptime: os.uptime()
                },
                process: {
                    memoryUsage: process.memoryUsage(),
                    cpuUsage: process.cpuUsage()
                }
            };

            // Add Linux-specific metrics
            if (os.platform() === 'linux') {
                try {
                    // Get CPU temperature (if available)
                    const { stdout: temp } = await execAsync('cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null || echo "0"');
                    metrics.cpu.temperature = parseInt(temp.trim()) / 1000; // Convert from millidegrees

                    // Get disk usage for log directory
                    const { stdout: df } = await execAsync(`df -h ${this.options.logDirectory} 2>/dev/null | tail -1`);
                    metrics.disk = {
                        usage: df.trim()
                    };
                } catch (error) {
                    // Ignore errors for optional metrics
                }
            }

            return metrics;
        } catch (error) {
            return { error: error.message };
        }
    }

    async writeLogEntry(logEntry) {
        try {
            const logFileName = `mcp-webcam-${new Date().toISOString().split('T')[0]}.jsonl`;
            const logFilePath = path.join(this.options.logDirectory, logFileName);

            const logLine = JSON.stringify(logEntry) + '\n';
            await fs.appendFile(logFilePath, logLine);

            // Check file size and rotate if necessary
            await this.rotateLogsIfNeeded(logFilePath);
        } catch (error) {
            console.error('Failed to write MCP log entry:', error);
        }
    }

    async rotateLogsIfNeeded(logFilePath) {
        try {
            const stats = await fs.stat(logFilePath);

            if (stats.size > this.options.maxLogSizeBytes) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const rotatedPath = logFilePath.replace('.jsonl', `-${timestamp}.jsonl`);

                await fs.rename(logFilePath, rotatedPath);
                console.log(`📋 Rotated MCP log file: ${rotatedPath}`);

                // Clean up old log files
                await this.cleanupOldLogs();
            }
        } catch (error) {
            console.error('Failed to rotate MCP logs:', error);
        }
    }

    async cleanupOldLogs() {
        try {
            const files = await fs.readdir(this.options.logDirectory);
            const logFiles = files
                .filter(file => file.startsWith('mcp-webcam-') && file.endsWith('.jsonl'))
                .map(file => ({
                    name: file,
                    path: path.join(this.options.logDirectory, file)
                }));

            if (logFiles.length > this.options.maxLogFiles) {
                // Sort by modification time and remove oldest files
                const filesWithStats = await Promise.all(
                    logFiles.map(async file => ({
                        ...file,
                        stats: await fs.stat(file.path)
                    }))
                );

                filesWithStats.sort((a, b) => a.stats.mtime - b.stats.mtime);

                const filesToDelete = filesWithStats.slice(0, filesWithStats.length - this.options.maxLogFiles);

                for (const file of filesToDelete) {
                    await fs.unlink(file.path);
                    console.log(`🗑️ Deleted old MCP log file: ${file.name}`);
                }
            }
        } catch (error) {
            console.error('Failed to cleanup old MCP logs:', error);
        }
    }

    startSystemMonitoring() {
        // Monitor system metrics every 30 seconds
        this.systemMonitorInterval = setInterval(async () => {
            const metrics = await this.getCurrentSystemMetrics();
            this.metrics.systemStats.push(metrics);

            // Keep only last 100 system stats in memory
            if (this.metrics.systemStats.length > 100) {
                this.metrics.systemStats.shift();
            }
        }, 30000);
    }

    async logWebcamOperation(operation, characterId, deviceId, data = {}) {
        await this.logOperation('webcam_operation', {
            operation,
            characterId,
            deviceId,
            ...data
        });
    }

    async logWebcamError(operation, error, context = {}) {
        await this.logOperation('webcam_error', {
            operation,
            error: error.message,
            stack: error.stack,
            context
        }, 'error');
    }

    async logPerformanceMetric(metric, value, unit = 'ms', context = {}) {
        const perfData = {
            metric,
            value,
            unit,
            context,
            timestamp: new Date().toISOString()
        };

        this.metrics.performanceData.push(perfData);

        await this.logOperation('performance_metric', perfData);
    }

    async generateReport() {
        const report = {
            sessionId: this.sessionId,
            startTime: new Date(this.startTime).toISOString(),
            endTime: new Date().toISOString(),
            duration: Date.now() - this.startTime,
            summary: {
                totalOperations: this.metrics.operations.length,
                errorCount: this.metrics.operations.filter(op => op.level === 'error').length,
                systemStatsCollected: this.metrics.systemStats.length,
                performanceMetrics: this.metrics.performanceData.length
            },
            metrics: this.metrics
        };

        const reportPath = path.join(this.options.logDirectory, `mcp-report-${this.sessionId}.json`);
        await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

        console.log(`📊 MCP Webcam Report generated: ${reportPath}`);
        return report;
    }

    async destroy() {
        try {
            // Stop system monitoring
            if (this.systemMonitorInterval) {
                clearInterval(this.systemMonitorInterval);
            }

            // Log session end
            await this.logOperation('session_end', {
                sessionId: this.sessionId,
                duration: Date.now() - this.startTime
            });

            // Generate final report
            await this.generateReport();

            console.log(`🔍 MCP Webcam Logger session ended: ${this.sessionId}`);
        } catch (error) {
            console.error('Error destroying MCP Webcam Logger:', error);
        }
    }
}

module.exports = MCPWebcamLogger;
