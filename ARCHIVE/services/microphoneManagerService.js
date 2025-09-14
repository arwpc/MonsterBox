const EventEmitter = require('events');
const WebSocket = require('ws');
const logger = require('../scripts/logger');
const MicrophoneService = require('./microphoneService');
const CharacterMicrophoneService = require('./characterMicrophoneService');

/**
 * Microphone Manager Service
 * 
 * This service acts as a central manager for all microphone operations,
 * allowing multiple services (STT, Audio Stream, etc.) to consume microphone data
 * without directly controlling the microphones.
 */
class MicrophoneManagerService extends EventEmitter {
    constructor() {
        super();
        this.microphoneService = new MicrophoneService();
        this.characterMicrophoneService = new CharacterMicrophoneService();
        
        // WebSocket connection to hardware service
        this.microphoneWS = null;
        this.isInitialized = false;
        
        // Consumer services that want microphone data
        this.consumers = new Map(); // consumerId -> { service, config, active }
        
        // Active microphone sessions
        this.activeSessions = new Map(); // microphoneId -> { consumers: Set, config, status }
        
        // Reconnection settings
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 5000;
    }

    /**
     * Initialize the microphone manager service
     */
    async initialize() {
        try {
            logger.info('🎤📋 Initializing Microphone Manager Service...');

            // Initialize microphone service
            await this.microphoneService.getAllMicrophones();
            
            // Connect to microphone hardware service
            await this.connectToMicrophoneHardware();

            this.isInitialized = true;
            logger.info('✅ Microphone Manager Service initialized');
            return true;

        } catch (error) {
            logger.error('❌ Failed to initialize Microphone Manager Service:', error);
            return false;
        }
    }

    /**
     * Connect to the microphone hardware service
     */
    async connectToMicrophoneHardware() {
        try {
            if (this.microphoneWS) {
                this.microphoneWS.close();
            }

            // Use IPv4 localhost to match the hardware service
            this.microphoneWS = new WebSocket('ws://127.0.0.1:8776');
            
            this.microphoneWS.on('open', () => {
                logger.info('🎤 Connected to Microphone Hardware Service');
                this.reconnectAttempts = 0;
                
                // Register as manager service
                this.microphoneWS.send(JSON.stringify({
                    type: 'register_manager',
                    client_id: 'microphone_manager_service'
                }));

                // Restore active sessions
                this.restoreActiveSessions();
            });

            this.microphoneWS.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    this.handleHardwareMessage(message);
                } catch (error) {
                    logger.error('Error parsing hardware message:', error);
                }
            });

            this.microphoneWS.on('error', (error) => {
                logger.error('Microphone hardware WebSocket error:', error);
            });

            this.microphoneWS.on('close', () => {
                logger.warn('🎤 Disconnected from Microphone Hardware Service');
                this.scheduleReconnect();
            });

        } catch (error) {
            logger.error('Failed to connect to microphone hardware:', error);
            this.scheduleReconnect();
        }
    }

    /**
     * Schedule reconnection to hardware service
     */
    scheduleReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = this.reconnectDelay * this.reconnectAttempts;
            
            logger.info(`Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
            
            setTimeout(() => {
                this.connectToMicrophoneHardware();
            }, delay);
        } else {
            logger.error('Max reconnection attempts reached. Manual intervention required.');
        }
    }

    /**
     * Handle messages from hardware service
     */
    handleHardwareMessage(message) {
        try {
            switch (message.type) {
                case 'microphone_audio_data':
                    this.distributeAudioData(message);
                    break;
                    
                case 'microphone_status_update':
                    this.handleStatusUpdate(message);
                    break;
                    
                case 'microphones_discovered':
                    this.handleMicrophonesDiscovered(message);
                    break;
                    
                case 'microphone_levels':
                    this.handleAudioLevels(message);
                    break;
                    
                default:
                    logger.debug('Unknown hardware message type:', message.type);
            }
        } catch (error) {
            logger.error('Error handling hardware message:', error);
        }
    }

    /**
     * Register a consumer service for microphone data
     * @param {string} consumerId - Unique identifier for the consumer
     * @param {Object} consumerConfig - Configuration for the consumer
     * @returns {boolean} Success status
     */
    registerConsumer(consumerId, consumerConfig) {
        try {
            this.consumers.set(consumerId, {
                ...consumerConfig,
                active: false,
                registeredAt: new Date().toISOString()
            });

            logger.info(`📝 Registered microphone consumer: ${consumerId}`);
            this.emit('consumer_registered', { consumerId, config: consumerConfig });
            return true;

        } catch (error) {
            logger.error(`Error registering consumer ${consumerId}:`, error);
            return false;
        }
    }

    /**
     * Unregister a consumer service
     * @param {string} consumerId - Consumer identifier
     * @returns {boolean} Success status
     */
    unregisterConsumer(consumerId) {
        try {
            const consumer = this.consumers.get(consumerId);
            if (!consumer) {
                return false;
            }

            // Stop any active sessions for this consumer
            this.stopConsumerSessions(consumerId);

            this.consumers.delete(consumerId);
            logger.info(`🗑️ Unregistered microphone consumer: ${consumerId}`);
            this.emit('consumer_unregistered', { consumerId });
            return true;

        } catch (error) {
            logger.error(`Error unregistering consumer ${consumerId}:`, error);
            return false;
        }
    }

    /**
     * Start microphone session for a consumer
     * @param {string} consumerId - Consumer identifier
     * @param {number} microphoneId - Microphone ID
     * @param {Object} sessionConfig - Session configuration
     * @returns {boolean} Success status
     */
    async startMicrophoneSession(consumerId, microphoneId, sessionConfig = {}) {
        try {
            const consumer = this.consumers.get(consumerId);
            if (!consumer) {
                throw new Error(`Consumer ${consumerId} not registered`);
            }

            const microphone = await this.microphoneService.getMicrophoneById(microphoneId);
            if (!microphone) {
                throw new Error(`Microphone ${microphoneId} not found`);
            }

            // Get or create session for this microphone
            let session = this.activeSessions.get(microphoneId);
            if (!session) {
                session = {
                    consumers: new Set(),
                    config: { ...microphone.config, ...sessionConfig },
                    status: 'starting',
                    startedAt: new Date().toISOString()
                };
                this.activeSessions.set(microphoneId, session);
            }

            // Add consumer to session
            session.consumers.add(consumerId);
            consumer.active = true;

            // Start microphone if this is the first consumer
            if (session.consumers.size === 1) {
                await this.startMicrophoneHardware(microphoneId, session.config);
            }

            // Update microphone status
            await this.microphoneService.updateMicrophoneStatus(microphoneId, 'active', {
                consumers: Array.from(session.consumers),
                sessionConfig: session.config
            });

            logger.info(`🎤▶️ Started microphone session: ${consumerId} -> microphone ${microphoneId}`);
            this.emit('session_started', { consumerId, microphoneId, sessionConfig });
            return true;

        } catch (error) {
            logger.error(`Error starting microphone session for ${consumerId}:`, error);
            return false;
        }
    }

    /**
     * Stop microphone session for a consumer
     * @param {string} consumerId - Consumer identifier
     * @param {number} microphoneId - Microphone ID
     * @returns {boolean} Success status
     */
    async stopMicrophoneSession(consumerId, microphoneId) {
        try {
            const session = this.activeSessions.get(microphoneId);
            if (!session || !session.consumers.has(consumerId)) {
                return false; // Session not found or consumer not in session
            }

            // Remove consumer from session
            session.consumers.delete(consumerId);

            const consumer = this.consumers.get(consumerId);
            if (consumer) {
                consumer.active = false;
            }

            // Stop microphone if no more consumers
            if (session.consumers.size === 0) {
                await this.stopMicrophoneHardware(microphoneId);
                this.activeSessions.delete(microphoneId);
                
                // Update microphone status
                await this.microphoneService.updateMicrophoneStatus(microphoneId, 'available');
            } else {
                // Update microphone status with remaining consumers
                await this.microphoneService.updateMicrophoneStatus(microphoneId, 'active', {
                    consumers: Array.from(session.consumers),
                    sessionConfig: session.config
                });
            }

            logger.info(`🎤⏹️ Stopped microphone session: ${consumerId} -> microphone ${microphoneId}`);
            this.emit('session_stopped', { consumerId, microphoneId });
            return true;

        } catch (error) {
            logger.error(`Error stopping microphone session for ${consumerId}:`, error);
            return false;
        }
    }

    /**
     * Start microphone hardware
     */
    async startMicrophoneHardware(microphoneId, config) {
        if (this.microphoneWS && this.microphoneWS.readyState === WebSocket.OPEN) {
            this.microphoneWS.send(JSON.stringify({
                type: 'start_microphone',
                microphone_id: `microphone_${microphoneId}`,
                config: config
            }));
            
            logger.debug(`🎤🔛 Started microphone hardware: ${microphoneId}`);
        } else {
            throw new Error('Hardware service not connected');
        }
    }

    /**
     * Stop microphone hardware
     */
    async stopMicrophoneHardware(microphoneId) {
        if (this.microphoneWS && this.microphoneWS.readyState === WebSocket.OPEN) {
            this.microphoneWS.send(JSON.stringify({
                type: 'stop_microphone',
                microphone_id: `microphone_${microphoneId}`
            }));
            
            logger.debug(`🎤🔚 Stopped microphone hardware: ${microphoneId}`);
        }
    }

    /**
     * Distribute audio data to consumers
     */
    distributeAudioData(message) {
        try {
            const microphoneId = this.extractMicrophoneId(message.microphone_id);
            const session = this.activeSessions.get(microphoneId);
            
            if (!session) {
                return; // No active session
            }

            // Send audio data to all consumers in the session
            for (const consumerId of session.consumers) {
                const consumer = this.consumers.get(consumerId);
                if (consumer && consumer.active) {
                    this.emit('audio_data', {
                        consumerId,
                        microphoneId,
                        audioData: message.audio_data,
                        timestamp: message.timestamp,
                        metadata: message.metadata
                    });
                }
            }

        } catch (error) {
            logger.error('Error distributing audio data:', error);
        }
    }

    /**
     * Handle status updates from hardware
     */
    handleStatusUpdate(message) {
        const microphoneId = this.extractMicrophoneId(message.microphone_id);
        
        this.emit('status_update', {
            microphoneId,
            status: message.status,
            timestamp: message.timestamp
        });
    }

    /**
     * Handle audio levels from hardware
     */
    handleAudioLevels(message) {
        const microphoneId = this.extractMicrophoneId(message.microphone_id);
        
        this.emit('audio_levels', {
            microphoneId,
            level: message.level,
            peak: message.peak,
            timestamp: message.timestamp
        });
    }

    /**
     * Handle discovered microphones
     */
    handleMicrophonesDiscovered(message) {
        logger.info(`🎤🔍 Discovered ${message.microphones.length} microphones`);
        this.emit('microphones_discovered', message.microphones);
    }

    /**
     * Extract numeric microphone ID from string
     */
    extractMicrophoneId(microphoneIdString) {
        return parseInt(microphoneIdString.replace('microphone_', '')) || 1;
    }

    /**
     * Stop all sessions for a consumer
     */
    stopConsumerSessions(consumerId) {
        for (const [microphoneId, session] of this.activeSessions) {
            if (session.consumers.has(consumerId)) {
                this.stopMicrophoneSession(consumerId, microphoneId);
            }
        }
    }

    /**
     * Restore active sessions after reconnection
     */
    restoreActiveSessions() {
        for (const [microphoneId, session] of this.activeSessions) {
            if (session.consumers.size > 0) {
                this.startMicrophoneHardware(microphoneId, session.config)
                    .catch(error => {
                        logger.error(`Error restoring session for microphone ${microphoneId}:`, error);
                    });
            }
        }
    }

    /**
     * Get manager status
     */
    getStatus() {
        return {
            initialized: this.isInitialized,
            hardwareConnected: this.microphoneWS && this.microphoneWS.readyState === WebSocket.OPEN,
            consumers: Array.from(this.consumers.keys()),
            activeSessions: Object.fromEntries(
                Array.from(this.activeSessions.entries()).map(([id, session]) => [
                    id, {
                        consumers: Array.from(session.consumers),
                        status: session.status,
                        startedAt: session.startedAt
                    }
                ])
            ),
            reconnectAttempts: this.reconnectAttempts
        };
    }

    /**
     * Get microphone assignments (which services are using which microphones)
     * @param {number} microphoneId - Microphone ID
     * @returns {Object} Assignment information
     */
    async getMicrophoneAssignments(microphoneId) {
        try {
            const session = this.activeSessions.get(microphoneId);
            if (!session) {
                return {
                    microphoneId,
                    active: false,
                    consumers: [],
                    totalConsumers: 0
                };
            }

            const consumerDetails = Array.from(session.consumers).map(consumerId => {
                const consumer = this.consumers.get(consumerId);
                return {
                    id: consumerId,
                    type: consumer?.type || 'unknown',
                    description: consumer?.description || '',
                    priority: consumer?.priority || 'normal',
                    registeredAt: consumer?.registeredAt
                };
            });

            return {
                microphoneId,
                active: true,
                consumers: consumerDetails,
                totalConsumers: session.consumers.size,
                sessionConfig: session.config,
                startedAt: session.startedAt,
                status: session.status
            };

        } catch (error) {
            logger.error(`Error getting microphone assignments for ${microphoneId}:`, error);
            return {
                microphoneId,
                active: false,
                consumers: [],
                totalConsumers: 0,
                error: error.message
            };
        }
    }

    /**
     * Assign a service to a microphone
     * @param {number} microphoneId - Microphone ID
     * @param {string} serviceId - Service identifier
     * @param {Object} serviceConfig - Service-specific configuration
     * @returns {boolean} Success status
     */
    async assignServiceToMicrophone(microphoneId, serviceId, serviceConfig = {}) {
        try {
            // Check if service is registered as a consumer
            if (!this.consumers.has(serviceId)) {
                throw new Error(`Service ${serviceId} is not registered as a consumer`);
            }

            // Start microphone session for this service
            const sessionStarted = await this.startMicrophoneSession(serviceId, microphoneId, serviceConfig);

            if (sessionStarted) {
                logger.info(`🔗 Assigned service ${serviceId} to microphone ${microphoneId}`);
                this.emit('service_assigned', { serviceId, microphoneId, serviceConfig });
                return true;
            }

            return false;

        } catch (error) {
            logger.error(`Error assigning service ${serviceId} to microphone ${microphoneId}:`, error);
            return false;
        }
    }

    /**
     * Unassign a service from a microphone
     * @param {number} microphoneId - Microphone ID
     * @param {string} serviceId - Service identifier
     * @returns {boolean} Success status
     */
    async unassignServiceFromMicrophone(microphoneId, serviceId) {
        try {
            // Stop microphone session for this service
            const sessionStopped = await this.stopMicrophoneSession(serviceId, microphoneId);

            if (sessionStopped) {
                logger.info(`🔗❌ Unassigned service ${serviceId} from microphone ${microphoneId}`);
                this.emit('service_unassigned', { serviceId, microphoneId });
                return true;
            }

            return false;

        } catch (error) {
            logger.error(`Error unassigning service ${serviceId} from microphone ${microphoneId}:`, error);
            return false;
        }
    }

    /**
     * Get all service assignments across all microphones
     * @returns {Object} Complete assignment map
     */
    getAllServiceAssignments() {
        const assignments = {};

        for (const [microphoneId, session] of this.activeSessions) {
            assignments[microphoneId] = {
                consumers: Array.from(session.consumers),
                config: session.config,
                status: session.status,
                startedAt: session.startedAt
            };
        }

        return assignments;
    }

    /**
     * Get assignments for a specific service
     * @param {string} serviceId - Service identifier
     * @returns {Array} Array of microphone IDs assigned to this service
     */
    getServiceAssignments(serviceId) {
        const assignments = [];

        for (const [microphoneId, session] of this.activeSessions) {
            if (session.consumers.has(serviceId)) {
                assignments.push({
                    microphoneId,
                    config: session.config,
                    status: session.status,
                    startedAt: session.startedAt
                });
            }
        }

        return assignments;
    }

    /**
     * Update session configuration for a microphone
     * @param {number} microphoneId - Microphone ID
     * @param {Object} newConfig - New configuration
     * @returns {boolean} Success status
     */
    async updateSessionConfig(microphoneId, newConfig) {
        try {
            const session = this.activeSessions.get(microphoneId);
            if (!session) {
                return false;
            }

            // Update session config
            session.config = { ...session.config, ...newConfig };

            // If microphone is active, restart with new config
            if (session.consumers.size > 0) {
                await this.stopMicrophoneHardware(microphoneId);
                await this.startMicrophoneHardware(microphoneId, session.config);
            }

            logger.info(`🔧 Updated session config for microphone ${microphoneId}`);
            this.emit('session_config_updated', { microphoneId, config: session.config });
            return true;

        } catch (error) {
            logger.error(`Error updating session config for microphone ${microphoneId}:`, error);
            return false;
        }
    }

    /**
     * Get detailed status of all microphones and their assignments
     * @returns {Object} Detailed status information
     */
    getDetailedStatus() {
        const status = this.getStatus();

        // Add assignment details
        status.assignments = this.getAllServiceAssignments();

        // Add consumer details
        status.consumerDetails = Object.fromEntries(
            Array.from(this.consumers.entries()).map(([id, consumer]) => [
                id, {
                    type: consumer.type,
                    description: consumer.description,
                    priority: consumer.priority,
                    active: consumer.active,
                    registeredAt: consumer.registeredAt
                }
            ])
        );

        return status;
    }

    /**
     * Cleanup and shutdown
     */
    async shutdown() {
        try {
            logger.info('🛑 Shutting down Microphone Manager Service...');

            // Stop all active sessions
            for (const microphoneId of this.activeSessions.keys()) {
                await this.stopMicrophoneHardware(microphoneId);
            }
            this.activeSessions.clear();

            // Clear consumers
            this.consumers.clear();

            // Close hardware connection
            if (this.microphoneWS) {
                this.microphoneWS.close();
                this.microphoneWS = null;
            }

            this.isInitialized = false;
            logger.info('✅ Microphone Manager Service shutdown complete');

        } catch (error) {
            logger.error('Error during shutdown:', error);
        }
    }
}

module.exports = MicrophoneManagerService;
