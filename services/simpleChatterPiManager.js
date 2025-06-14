/**
 * Simple ChatterPi Service Manager
 * Minimal service management focused on getting jaw animation working
 */

const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs').promises;
const logger = require('../scripts/logger');

class SimpleChatterPiManager {
    constructor() {
        this.jawProcess = null;
        this.jawWebSocket = null;
        this.isInitialized = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        
        logger.info('Simple ChatterPi Manager initialized');
    }
    
    /**
     * Initialize ChatterPi services
     */
    async initialize() {
        if (this.isInitialized) {
            logger.info('ChatterPi services already initialized');
            return true;
        }

        // Skip ChatterPi initialization in test environment
        if (process.env.NODE_ENV === 'test') {
            logger.info('Skipping ChatterPi initialization in test environment');
            this.isInitialized = true;
            return true;
        }

        try {
            logger.info('🚀 Starting ChatterPi jaw animation service...');
            
            // Start the GPIO jaw server
            const success = await this.startJawServer();
            
            if (success) {
                // Wait a bit then connect WebSocket
                await this.delay(3000);
                await this.connectJawWebSocket();
                
                this.isInitialized = true;
                logger.info('✅ ChatterPi services initialized successfully');
                return true;
            } else {
                logger.warn('⚠️ Jaw server failed to start, but system will continue');
                this.isInitialized = true; // Still consider initialized
                return true;
            }
            
        } catch (error) {
            logger.error('❌ Failed to initialize ChatterPi services:', error);
            return false;
        }
    }
    
    /**
     * Start the GPIO jaw server
     */
    async startJawServer() {
        try {
            const scriptPath = path.join(process.cwd(), 'scripts/chatterpi/gpio_jaw_server_robust.py');

            // Check if script exists
            try {
                await fs.access(scriptPath);
            } catch {
                logger.error(`Jaw server script not found: ${scriptPath}`);
                return false;
            }

            // Run simple process cleanup first
            logger.info('🧹 Running process cleanup...');
            await this.runSimpleCleanup();

            logger.info('🔄 Starting GPIO jaw server...');
            
            this.jawProcess = spawn('python3', [
                scriptPath,
                '--host', '0.0.0.0',
                '--port', '8765',
                '--servo-pin', '18'
            ], {
                cwd: process.cwd(),
                stdio: ['pipe', 'pipe', 'pipe']
            });
            
            // Setup process monitoring with intelligent log level detection
            this.jawProcess.stdout.on('data', (data) => {
                const output = data.toString().trim();
                if (output) {
                    this.logPythonOutput(output, 'stdout');
                }
            });

            this.jawProcess.stderr.on('data', (data) => {
                const output = data.toString().trim();
                if (output) {
                    this.logPythonOutput(output, 'stderr');
                }
            });
            
            this.jawProcess.on('close', (code) => {
                logger.warn(`Jaw server process exited with code ${code}`);
                this.jawProcess = null;
                
                // Auto-restart if needed
                if (this.isInitialized && code !== 0) {
                    logger.info('🔄 Auto-restarting jaw server...');
                    setTimeout(() => this.startJawServer(), 5000);
                }
            });
            
            this.jawProcess.on('error', (error) => {
                logger.error('Jaw server process error:', error);
                this.jawProcess = null;
            });
            
            // Wait a bit to see if it starts successfully
            await this.delay(2000);
            
            if (this.jawProcess && !this.jawProcess.killed) {
                logger.info(`✅ GPIO jaw server started (PID: ${this.jawProcess.pid})`);
                return true;
            } else {
                logger.error('❌ GPIO jaw server failed to start');
                return false;
            }
            
        } catch (error) {
            logger.error('❌ Failed to start jaw server:', error);
            return false;
        }
    }
    
    /**
     * Connect to jaw WebSocket
     */
    async connectJawWebSocket() {
        try {
            logger.info('🔌 Connecting to jaw WebSocket...');
            
            this.jawWebSocket = new WebSocket('ws://127.0.0.1:8765');
            
            this.jawWebSocket.on('open', () => {
                logger.info('✅ Connected to jaw animation WebSocket');
                this.reconnectAttempts = 0;
            });
            
            this.jawWebSocket.on('error', (error) => {
                logger.error('❌ Jaw WebSocket error:', error.message);
            });
            
            this.jawWebSocket.on('close', () => {
                logger.warn('🔌 Jaw WebSocket disconnected');
                this.jawWebSocket = null;
                
                // Auto-reconnect
                if (this.isInitialized && this.reconnectAttempts < this.maxReconnectAttempts) {
                    this.reconnectAttempts++;
                    logger.info(`🔄 Reconnecting to jaw WebSocket (attempt ${this.reconnectAttempts})...`);
                    setTimeout(() => this.connectJawWebSocket(), 3000);
                }
            });
            
            // Wait for connection
            await this.waitForWebSocketConnection();
            
        } catch (error) {
            logger.error('Failed to connect jaw WebSocket:', error);
        }
    }
    
    /**
     * Wait for WebSocket connection
     */
    async waitForWebSocketConnection() {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('WebSocket connection timeout'));
            }, 5000);
            
            if (this.jawWebSocket.readyState === WebSocket.OPEN) {
                clearTimeout(timeout);
                resolve();
                return;
            }
            
            this.jawWebSocket.on('open', () => {
                clearTimeout(timeout);
                resolve();
            });
            
            this.jawWebSocket.on('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
        });
    }
    
    /**
     * Send command to jaw animation system
     */
    sendJawCommand(command) {
        if (this.jawWebSocket && this.jawWebSocket.readyState === WebSocket.OPEN) {
            try {
                this.jawWebSocket.send(JSON.stringify(command));
                return true;
            } catch (error) {
                logger.error('Error sending jaw command:', error);
                return false;
            }
        } else {
            logger.warn('Jaw WebSocket not available');
            return false;
        }
    }
    
    /**
     * Get WebSocket connection
     */
    getWebSocket(connectionId) {
        if (connectionId === 'jawAnimator') {
            return (this.jawWebSocket && this.jawWebSocket.readyState === WebSocket.OPEN) ? this.jawWebSocket : null;
        }
        return null;
    }
    
    /**
     * Get service status
     */
    getServiceStatus() {
        return {
            initialized: this.isInitialized,
            services: {
                jawServer: {
                    name: 'GPIO Jaw Server',
                    status: this.jawProcess ? 'running' : 'stopped',
                    pid: this.jawProcess ? this.jawProcess.pid : null
                }
            },
            webSockets: {
                jawAnimator: {
                    connected: this.jawWebSocket && this.jawWebSocket.readyState === WebSocket.OPEN,
                    readyState: this.jawWebSocket ? this.jawWebSocket.readyState : null
                }
            },
            timestamp: new Date().toISOString()
        };
    }
    
    /**
     * Cleanup all services
     */
    async cleanup() {
        logger.info('🧹 Cleaning up ChatterPi services...');
        
        this.isInitialized = false;
        
        // Close WebSocket
        if (this.jawWebSocket) {
            try {
                this.jawWebSocket.close();
            } catch (error) {
                logger.error('Error closing jaw WebSocket:', error);
            }
            this.jawWebSocket = null;
        }
        
        // Stop jaw process
        if (this.jawProcess && !this.jawProcess.killed) {
            try {
                this.jawProcess.kill('SIGTERM');
                
                // Force kill after timeout
                setTimeout(() => {
                    if (this.jawProcess && !this.jawProcess.killed) {
                        this.jawProcess.kill('SIGKILL');
                    }
                }, 3000);
            } catch (error) {
                logger.error('Error stopping jaw process:', error);
            }
        }
        
        logger.info('✅ ChatterPi services cleaned up');
    }
    
    /**
     * Run simple process cleanup to resolve conflicts
     */
    async runSimpleCleanup() {
        try {
            // Simple process cleanup - just kill conflicting processes
            logger.info('Killing processes using port 8765...');

            try {
                const { spawn } = require('child_process');

                // Kill processes using port 8765
                const lsofProcess = spawn('lsof', ['-ti:8765'], { stdio: ['pipe', 'pipe', 'pipe'] });

                let pids = '';
                lsofProcess.stdout.on('data', (data) => {
                    pids += data.toString();
                });

                await new Promise((resolve) => {
                    lsofProcess.on('close', (code) => {
                        if (code === 0 && pids.trim()) {
                            const pidList = pids.trim().split('\n').filter(pid => pid.trim());
                            for (const pid of pidList) {
                                try {
                                    process.kill(parseInt(pid), 'SIGTERM');
                                    logger.info(`Killed process ${pid} using port 8765`);
                                } catch (e) {
                                    // Process might already be dead
                                }
                            }
                        }
                        resolve();
                    });

                    lsofProcess.on('error', () => {
                        resolve(); // lsof might not be available
                    });
                });

                // Wait a moment for processes to die
                await this.delay(1000);

            } catch (error) {
                logger.warn('Process cleanup failed:', error.message);
            }

            logger.info('✅ Simple cleanup completed');

        } catch (error) {
            logger.error('Error running simple cleanup:', error);
            // Don't fail startup if cleanup fails
        }
    }

    /**
     * Intelligently log Python subprocess output based on content
     * @param {string} output - The output message from Python process
     * @param {string} stream - Either 'stdout' or 'stderr'
     */
    logPythonOutput(output, stream) {
        // Parse Python logging format: YYYY-MM-DD HH:MM:SS,mmm - LEVEL - message
        const pythonLogPattern = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3} - (\w+) - (.+)$/;
        const match = output.match(pythonLogPattern);

        if (match) {
            const [, level, message] = match;
            const logMessage = `[Jaw Server] ${message}`;

            // Map Python log levels to Winston log levels
            switch (level.toUpperCase()) {
                case 'DEBUG':
                    logger.debug(logMessage);
                    break;
                case 'INFO':
                    logger.info(logMessage);
                    break;
                case 'WARNING':
                case 'WARN':
                    logger.warn(logMessage);
                    break;
                case 'ERROR':
                    logger.error(logMessage);
                    break;
                case 'CRITICAL':
                case 'FATAL':
                    logger.error(logMessage);
                    break;
                default:
                    // Unknown level, use info for stderr, debug for stdout
                    if (stream === 'stderr') {
                        logger.info(logMessage);
                    } else {
                        logger.debug(logMessage);
                    }
            }
        } else {
            // Non-standard format - check for common patterns
            const lowerOutput = output.toLowerCase();
            const logMessage = `[Jaw Server] ${output}`;

            if (lowerOutput.includes('error') || lowerOutput.includes('failed') || lowerOutput.includes('exception')) {
                logger.error(logMessage);
            } else if (lowerOutput.includes('warning') || lowerOutput.includes('warn')) {
                logger.warn(logMessage);
            } else if (lowerOutput.includes('✅') || lowerOutput.includes('success') || lowerOutput.includes('started') || lowerOutput.includes('initialized')) {
                logger.info(logMessage);
            } else if (stream === 'stderr') {
                // For stderr without clear indicators, use info level (not error)
                logger.info(logMessage);
            } else {
                // For stdout, use debug level for general output
                logger.debug(logMessage);
            }
        }
    }

    /**
     * Utility delay function
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = SimpleChatterPiManager;
