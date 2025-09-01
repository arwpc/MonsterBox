/**
 * WebSocket Client for Servo Service Communication
 * Provides interface between MonsterBox routes and unified servo WebSocket service
 */

const WebSocket = require('ws');
const EventEmitter = require('events');
const logger = require('../scripts/logger');
const { getInstance: getServiceDiscovery } = require('./serviceDiscovery');

class ServoWebSocketClient extends EventEmitter {
    constructor(options = {}) {
        super();

        this.host = options.host || '127.0.0.1';
        this.port = options.port || null; // Will be discovered dynamically
        this.url = null; // Will be set after service discovery

        this.ws = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;

        this.pendingRequests = new Map();
        this.requestId = 0;

        // Auto-discover and connect
        this.discoverServoService();
    }

    connect() {
        try {
            // Discover servo service if URL not set
            if (!this.url) {
                this.discoverServoService();
                return;
            }

            logger.info(`🔌 Connecting to servo WebSocket service at ${this.url}`);

            this.ws = new WebSocket(this.url);

            this.ws.on('open', () => {
                logger.info('✅ Connected to servo WebSocket service');
                this.isConnected = true;
                this.reconnectAttempts = 0;
                this.emit('connected');
            });

            this.ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    this.handleMessage(message);
                } catch (error) {
                    logger.error('Error parsing WebSocket message:', error);
                }
            });

            this.ws.on('close', () => {
                logger.warn('🔌 Servo WebSocket connection closed');
                this.isConnected = false;
                this.emit('disconnected');
                this.scheduleReconnect();
            });

            this.ws.on('error', (error) => {
                logger.error('Servo WebSocket error:', error);
                this.isConnected = false;
                // Don't emit error to prevent uncaught exceptions
                // this.emit('error', error);
            });

        } catch (error) {
            logger.error('Failed to create servo WebSocket connection:', error);
            this.scheduleReconnect();
        }
    }

    discoverServoService() {
        try {
            const serviceDiscovery = getServiceDiscovery();
            const servoService = serviceDiscovery.findService('servoService');

            if (servoService) {
                // Use proxy endpoint if available, otherwise direct
                const connection = serviceDiscovery.getServiceConnection('servoService', false); // Use direct connection
                if (connection) {
                    this.url = connection.url;
                    this.port = connection.port;
                    logger.info(`🔍 Discovered servo service at ${this.url}`);
                    this.connect();
                    return;
                }
            }

            // Fallback to default port if service discovery fails
            logger.warn('⚠️ Could not discover servo service, using fallback port 8779');
            this.port = 8779;
            this.url = `ws://${this.host}:${this.port}`;
            this.connect();

        } catch (error) {
            logger.error('Error discovering servo service:', error);
            // Fallback to default port
            this.port = 8779;
            this.url = `ws://${this.host}:${this.port}`;
            this.connect();
        }
    }

    scheduleReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = this.reconnectDelay * this.reconnectAttempts;

            logger.info(`🔄 Scheduling servo WebSocket reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);

            setTimeout(() => {
                this.connect();
            }, delay);
        } else {
            logger.error('❌ Max servo WebSocket reconnect attempts reached');
            this.emit('maxReconnectAttemptsReached');
        }
    }

    handleMessage(message) {
        // Handle response to pending request
        if (message.request_id && this.pendingRequests.has(message.request_id)) {
            const { resolve, reject } = this.pendingRequests.get(message.request_id);
            this.pendingRequests.delete(message.request_id);

            if (message.status === 'success') {
                resolve(message);
            } else {
                reject(new Error(message.message || 'Unknown error'));
            }
            return;
        }

        // Handle broadcast messages
        this.emit('message', message);
    }

    async sendMessage(message, timeout = 10000) {
        return new Promise((resolve, reject) => {
            if (!this.isConnected) {
                reject(new Error('Servo WebSocket not connected'));
                return;
            }

            const requestId = `req_${++this.requestId}`;
            const messageWithId = {
                ...message,
                request_id: requestId
            };

            // Store the promise handlers
            this.pendingRequests.set(requestId, { resolve, reject });

            // Set timeout
            const timeoutId = setTimeout(() => {
                if (this.pendingRequests.has(requestId)) {
                    this.pendingRequests.delete(requestId);
                    reject(new Error('Request timeout'));
                }
            }, timeout);

            // Clear timeout when request completes
            const originalResolve = resolve;
            const originalReject = reject;

            this.pendingRequests.set(requestId, {
                resolve: (result) => {
                    clearTimeout(timeoutId);
                    originalResolve(result);
                },
                reject: (error) => {
                    clearTimeout(timeoutId);
                    originalReject(error);
                }
            });

            // Send the message
            try {
                this.ws.send(JSON.stringify(messageWithId));
            } catch (error) {
                this.pendingRequests.delete(requestId);
                clearTimeout(timeoutId);
                reject(error);
            }
        });
    }

    async sendRequest(type, data = {}, timeout = 10000) {
        return new Promise((resolve, reject) => {
            if (!this.isConnected) {
                reject(new Error('Servo WebSocket not connected'));
                return;
            }

            const requestId = ++this.requestId;
            const message = {
                type,
                request_id: requestId,
                ...data
            };

            // Store pending request
            this.pendingRequests.set(requestId, { resolve, reject });

            // Set timeout
            const timeoutId = setTimeout(() => {
                if (this.pendingRequests.has(requestId)) {
                    this.pendingRequests.delete(requestId);
                    reject(new Error('Request timeout'));
                }
            }, timeout);

            // Clear timeout when request completes
            const originalResolve = resolve;
            const originalReject = reject;

            this.pendingRequests.set(requestId, {
                resolve: (result) => {
                    clearTimeout(timeoutId);
                    originalResolve(result);
                },
                reject: (error) => {
                    clearTimeout(timeoutId);
                    originalReject(error);
                }
            });

            // Send message
            try {
                this.ws.send(JSON.stringify(message));
            } catch (error) {
                this.pendingRequests.delete(requestId);
                clearTimeout(timeoutId);
                reject(error);
            }
        });
    }

    // Servo control methods
    async moveServo(servoId, angle, duration = 0.5) {
        return this.sendRequest('servo_move', {
            servo_id: servoId,
            angle: angle,
            duration: duration
        });
    }

    async testServo(servoId, testAngles = [0, 90, 180], duration = 1.0) {
        return this.sendRequest('servo_test', {
            servo_id: servoId,
            test_angles: testAngles,
            duration: duration
        });
    }

    async stopServo(servoId) {
        return this.sendRequest('servo_stop', {
            servo_id: servoId
        });
    }

    async getServoStatus(servoId = null) {
        return this.sendRequest('get_servo_status', {
            servo_id: servoId
        });
    }

    async getServoConfigs() {
        return this.sendRequest('get_servo_configs');
    }

    async updateServoConfig(servoId, updates, jawAnimationUpdates = null) {
        const data = {
            servo_id: servoId,
            updates: updates
        };

        if (jawAnimationUpdates) {
            data.jaw_animation_updates = jawAnimationUpdates;
        }

        return this.sendRequest('update_servo_config', data);
    }



    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.isConnected = false;
        this.pendingRequests.clear();
    }
}

// Singleton instance
let servoClient = null;

function getServoClient() {
    if (!servoClient) {
        servoClient = new ServoWebSocketClient();
    }
    return servoClient;
}

module.exports = {
    ServoWebSocketClient,
    getServoClient
};
