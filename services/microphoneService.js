const fs = require('fs').promises;
const path = require('path');
const EventEmitter = require('events');
const logger = require('../scripts/logger');

class MicrophoneService extends EventEmitter {
    constructor() {
        super();
        this.microphonesPath = path.join(__dirname, '../data/microphones.json');
        this.defaultConfig = {
            enabled: true,
            sensitivity: 1.0,
            sampleRate: 16000,
            channels: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            voiceActivation: false,
            voiceActivationThreshold: 0.1,
            bufferSize: 1024,
            format: 'float32'
        };

        // Real-time monitoring state
        this.activeMicrophones = new Map(); // microphoneId -> status info
        this.monitoringClients = new Set(); // WebSocket clients for real-time updates

        // Configuration presets
        this.configPresets = {
            'speech-recognition': {
                sampleRate: 16000,
                channels: 1,
                sensitivity: 1.2,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                voiceActivation: true,
                voiceActivationThreshold: 0.15
            },
            'high-quality-recording': {
                sampleRate: 44100,
                channels: 2,
                sensitivity: 1.0,
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
                voiceActivation: false,
                voiceActivationThreshold: 0.1
            },
            'noise-reduction': {
                sampleRate: 16000,
                channels: 1,
                sensitivity: 0.8,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                voiceActivation: true,
                voiceActivationThreshold: 0.2
            },
            'low-latency': {
                sampleRate: 16000,
                channels: 1,
                sensitivity: 1.0,
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
                voiceActivation: false,
                bufferSize: 512
            }
        };
    }

    /**
     * Load all microphones
     * @returns {Array} Array of microphones
     */
    async loadMicrophones() {
        try {
            const data = await fs.readFile(this.microphonesPath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            if (error.code === 'ENOENT') {
                // File doesn't exist, create with default microphones
                const defaultMicrophones = await this.createDefaultMicrophones();
                await this.saveMicrophones(defaultMicrophones);
                return defaultMicrophones;
            }
            throw error;
        }
    }

    /**
     * Save microphones to file
     * @param {Array} microphones - Array of microphones
     */
    async saveMicrophones(microphones) {
        await fs.writeFile(this.microphonesPath, JSON.stringify(microphones, null, 2));
    }

    /**
     * Create default microphones configuration
     * @returns {Array} Default microphones
     */
    async createDefaultMicrophones() {
        return [
            {
                id: 1,
                name: "Default System Microphone",
                deviceId: "default",
                type: "system",
                status: "available",
                characterId: null,
                config: { ...this.defaultConfig },
                capabilities: {
                    sttIntegration: true,
                    audioStreaming: true,
                    realTimeProcessing: true,
                    voiceActivationDetection: true
                },
                created: new Date().toISOString(),
                lastModified: new Date().toISOString()
            }
        ];
    }

    /**
     * Get all microphones
     * @returns {Array} Array of microphones
     */
    async getAllMicrophones() {
        try {
            return await this.loadMicrophones();
        } catch (error) {
            logger.error('Error loading microphones:', error);
            return [];
        }
    }

    /**
     * Get microphone by ID
     * @param {number} id - Microphone ID
     * @returns {Object|null} Microphone object or null
     */
    async getMicrophoneById(id) {
        try {
            const microphones = await this.loadMicrophones();
            return microphones.find(mic => mic.id === parseInt(id)) || null;
        } catch (error) {
            logger.error(`Error getting microphone ${id}:`, error);
            return null;
        }
    }

    /**
     * Create a new microphone
     * @param {Object} microphoneData - Microphone data
     * @returns {Object} Created microphone
     */
    async createMicrophone(microphoneData) {
        try {
            const microphones = await this.loadMicrophones();
            
            const newMicrophone = {
                id: microphones.length > 0 ? Math.max(...microphones.map(m => m.id)) + 1 : 1,
                name: microphoneData.name || 'New Microphone',
                deviceId: microphoneData.deviceId || 'default',
                type: microphoneData.type || 'system',
                status: 'available',
                characterId: null,
                config: {
                    ...this.defaultConfig,
                    ...microphoneData.config
                },
                capabilities: {
                    sttIntegration: true,
                    audioStreaming: true,
                    realTimeProcessing: true,
                    voiceActivationDetection: true,
                    ...microphoneData.capabilities
                },
                created: new Date().toISOString(),
                lastModified: new Date().toISOString()
            };

            microphones.push(newMicrophone);
            await this.saveMicrophones(microphones);
            
            logger.info(`Created microphone: ${newMicrophone.name} (ID: ${newMicrophone.id})`);
            return newMicrophone;
        } catch (error) {
            logger.error('Error creating microphone:', error);
            throw new Error(`Failed to create microphone: ${error.message}`);
        }
    }

    /**
     * Update microphone
     * @param {number} id - Microphone ID
     * @param {Object} updateData - Update data
     * @returns {Object|null} Updated microphone or null
     */
    async updateMicrophone(id, updateData) {
        try {
            const microphones = await this.loadMicrophones();
            const index = microphones.findIndex(mic => mic.id === parseInt(id));
            
            if (index === -1) {
                return null;
            }

            // Preserve certain fields
            const preservedFields = ['id', 'created'];
            const updatedMicrophone = {
                ...microphones[index],
                ...updateData,
                lastModified: new Date().toISOString()
            };

            // Restore preserved fields
            preservedFields.forEach(field => {
                if (microphones[index][field] !== undefined) {
                    updatedMicrophone[field] = microphones[index][field];
                }
            });

            microphones[index] = updatedMicrophone;
            await this.saveMicrophones(microphones);
            
            logger.info(`Updated microphone: ${updatedMicrophone.name} (ID: ${id})`);
            return updatedMicrophone;
        } catch (error) {
            logger.error(`Error updating microphone ${id}:`, error);
            throw new Error(`Failed to update microphone: ${error.message}`);
        }
    }

    /**
     * Delete microphone
     * @param {number} id - Microphone ID
     * @returns {boolean} Success status
     */
    async deleteMicrophone(id) {
        try {
            const microphones = await this.loadMicrophones();
            const initialLength = microphones.length;
            const filteredMicrophones = microphones.filter(mic => mic.id !== parseInt(id));
            
            if (filteredMicrophones.length === initialLength) {
                return false; // Microphone not found
            }

            await this.saveMicrophones(filteredMicrophones);
            logger.info(`Deleted microphone with ID: ${id}`);
            return true;
        } catch (error) {
            logger.error(`Error deleting microphone ${id}:`, error);
            throw new Error(`Failed to delete microphone: ${error.message}`);
        }
    }

    /**
     * Get available microphones (not assigned to characters)
     * @returns {Array} Available microphones
     */
    async getAvailableMicrophones() {
        try {
            const microphones = await this.loadMicrophones();
            return microphones.filter(mic => mic.characterId === null && mic.status === 'available');
        } catch (error) {
            logger.error('Error getting available microphones:', error);
            return [];
        }
    }

    /**
     * Get microphones assigned to characters
     * @returns {Array} Assigned microphones
     */
    async getAssignedMicrophones() {
        try {
            const microphones = await this.loadMicrophones();
            return microphones.filter(mic => mic.characterId !== null);
        } catch (error) {
            logger.error('Error getting assigned microphones:', error);
            return [];
        }
    }

    /**
     * Test microphone functionality
     * @param {number} id - Microphone ID
     * @returns {Object} Test result
     */
    async testMicrophone(id) {
        try {
            const microphone = await this.getMicrophoneById(id);
            if (!microphone) {
                return {
                    success: false,
                    error: 'Microphone not found'
                };
            }

            // Basic test - check if device exists and is accessible
            // In a real implementation, this would test actual audio capture
            return {
                success: true,
                microphone: microphone,
                testResults: {
                    deviceAccessible: true,
                    sampleRate: microphone.config.sampleRate,
                    channels: microphone.config.channels,
                    latency: 'low',
                    timestamp: new Date().toISOString()
                }
            };
        } catch (error) {
            logger.error(`Error testing microphone ${id}:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get configuration presets
     * @returns {Object} Available configuration presets
     */
    getConfigPresets() {
        return this.configPresets;
    }

    /**
     * Apply configuration preset to microphone
     * @param {number} id - Microphone ID
     * @param {string} presetName - Name of the preset to apply
     * @returns {Object|null} Updated microphone or null
     */
    async applyConfigPreset(id, presetName) {
        try {
            const preset = this.configPresets[presetName];
            if (!preset) {
                throw new Error(`Unknown preset: ${presetName}`);
            }

            const microphone = await this.getMicrophoneById(id);
            if (!microphone) {
                return null;
            }

            const updatedConfig = {
                ...microphone.config,
                ...preset
            };

            return await this.updateMicrophone(id, { config: updatedConfig });
        } catch (error) {
            logger.error(`Error applying preset ${presetName} to microphone ${id}:`, error);
            throw error;
        }
    }

    /**
     * Update microphone status
     * @param {number} id - Microphone ID
     * @param {string} status - New status
     * @param {Object} additionalInfo - Additional status information
     */
    async updateMicrophoneStatus(id, status, additionalInfo = {}) {
        try {
            const statusInfo = {
                status,
                timestamp: new Date().toISOString(),
                ...additionalInfo
            };

            this.activeMicrophones.set(id, statusInfo);

            // Update microphone in database
            await this.updateMicrophone(id, { status });

            // Emit status update event
            this.emit('statusUpdate', { microphoneId: id, ...statusInfo });

            // Notify monitoring clients
            this.notifyMonitoringClients('status_update', { microphoneId: id, ...statusInfo });

            logger.debug(`Updated microphone ${id} status to: ${status}`);
        } catch (error) {
            logger.error(`Error updating microphone ${id} status:`, error);
        }
    }

    /**
     * Get real-time status of a microphone
     * @param {number} id - Microphone ID
     * @returns {Object|null} Status information
     */
    getMicrophoneStatus(id) {
        return this.activeMicrophones.get(id) || null;
    }

    /**
     * Get real-time status of all microphones
     * @returns {Object} Map of microphone statuses
     */
    getAllMicrophoneStatuses() {
        return Object.fromEntries(this.activeMicrophones);
    }

    /**
     * Add monitoring client for real-time updates
     * @param {WebSocket} client - WebSocket client
     */
    addMonitoringClient(client) {
        this.monitoringClients.add(client);
        logger.debug(`Added monitoring client. Total clients: ${this.monitoringClients.size}`);

        // Send current status to new client
        const statuses = this.getAllMicrophoneStatuses();
        client.send(JSON.stringify({
            type: 'initial_status',
            data: statuses
        }));
    }

    /**
     * Remove monitoring client
     * @param {WebSocket} client - WebSocket client
     */
    removeMonitoringClient(client) {
        this.monitoringClients.delete(client);
        logger.debug(`Removed monitoring client. Total clients: ${this.monitoringClients.size}`);
    }

    /**
     * Notify all monitoring clients of updates
     * @param {string} type - Message type
     * @param {Object} data - Message data
     */
    notifyMonitoringClients(type, data) {
        const message = JSON.stringify({ type, data });

        for (const client of this.monitoringClients) {
            try {
                if (client.readyState === 1) { // WebSocket.OPEN
                    client.send(message);
                }
            } catch (error) {
                logger.error('Error sending message to monitoring client:', error);
                this.monitoringClients.delete(client);
            }
        }
    }

    /**
     * Bulk operations for multiple microphones
     * @param {Array} microphoneIds - Array of microphone IDs
     * @param {string} operation - Operation to perform ('start', 'stop', 'delete', 'update')
     * @param {Object} operationData - Data for the operation
     * @returns {Object} Results of bulk operation
     */
    async bulkOperation(microphoneIds, operation, operationData = {}) {
        const results = {
            success: [],
            failed: [],
            total: microphoneIds.length
        };

        for (const id of microphoneIds) {
            try {
                let result;
                switch (operation) {
                    case 'delete':
                        result = await this.deleteMicrophone(id);
                        break;
                    case 'update':
                        result = await this.updateMicrophone(id, operationData);
                        break;
                    case 'start':
                        await this.updateMicrophoneStatus(id, 'active', operationData);
                        result = true;
                        break;
                    case 'stop':
                        await this.updateMicrophoneStatus(id, 'inactive', operationData);
                        result = true;
                        break;
                    default:
                        throw new Error(`Unknown operation: ${operation}`);
                }

                if (result) {
                    results.success.push(id);
                } else {
                    results.failed.push({ id, error: 'Operation returned false' });
                }
            } catch (error) {
                results.failed.push({ id, error: error.message });
                logger.error(`Bulk operation ${operation} failed for microphone ${id}:`, error);
            }
        }

        logger.info(`Bulk operation ${operation} completed: ${results.success.length}/${results.total} successful`);
        return results;
    }

    /**
     * Calibrate microphone
     * @param {number} id - Microphone ID
     * @param {string} calibrationType - Type of calibration ('sensitivity', 'noise_floor', 'frequency_response')
     * @param {number} duration - Calibration duration in seconds
     * @returns {Object} Calibration result
     */
    async calibrateMicrophone(id, calibrationType = 'sensitivity', duration = 10) {
        try {
            const microphone = await this.getMicrophoneById(id);
            if (!microphone) {
                return {
                    success: false,
                    error: 'Microphone not found'
                };
            }

            logger.info(`🎤🔧 Starting ${calibrationType} calibration for microphone ${id}`);

            // Simulate calibration process
            const calibrationData = {
                type: calibrationType,
                duration: duration,
                startTime: new Date().toISOString(),
                status: 'in_progress'
            };

            // Update microphone status
            await this.updateMicrophoneStatus(id, 'calibrating', calibrationData);

            // Simulate calibration delay
            await new Promise(resolve => setTimeout(resolve, duration * 1000));

            // Generate calibration results based on type
            let calibrationResults;
            switch (calibrationType) {
                case 'sensitivity':
                    calibrationResults = {
                        optimalSensitivity: 1.2,
                        currentSensitivity: microphone.config.sensitivity,
                        recommendedAdjustment: 0.2,
                        noiseFloor: -45,
                        dynamicRange: 85
                    };
                    break;
                case 'noise_floor':
                    calibrationResults = {
                        noiseFloor: -42,
                        ambientNoise: -38,
                        recommendedThreshold: 0.15,
                        qualityScore: 8.5
                    };
                    break;
                case 'frequency_response':
                    calibrationResults = {
                        frequencyResponse: [
                            { frequency: 100, amplitude: -3 },
                            { frequency: 1000, amplitude: 0 },
                            { frequency: 5000, amplitude: -1 },
                            { frequency: 10000, amplitude: -5 }
                        ],
                        flatnessScore: 7.8,
                        recommendedEQ: { low: 0, mid: 0, high: 2 }
                    };
                    break;
                default:
                    throw new Error(`Unknown calibration type: ${calibrationType}`);
            }

            const finalResult = {
                success: true,
                calibrationType,
                duration,
                completedAt: new Date().toISOString(),
                results: calibrationResults,
                recommendations: this.generateCalibrationRecommendations(calibrationType, calibrationResults)
            };

            // Update microphone status back to available
            await this.updateMicrophoneStatus(id, 'available', {
                lastCalibration: finalResult
            });

            logger.info(`✅ Calibration completed for microphone ${id}`);
            return finalResult;

        } catch (error) {
            logger.error(`Error calibrating microphone ${id}:`, error);
            await this.updateMicrophoneStatus(id, 'available');
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Generate calibration recommendations
     * @param {string} calibrationType - Type of calibration
     * @param {Object} results - Calibration results
     * @returns {Array} Array of recommendations
     */
    generateCalibrationRecommendations(calibrationType, results) {
        const recommendations = [];

        switch (calibrationType) {
            case 'sensitivity':
                if (Math.abs(results.recommendedAdjustment) > 0.1) {
                    recommendations.push({
                        type: 'adjustment',
                        message: `Adjust sensitivity by ${results.recommendedAdjustment > 0 ? '+' : ''}${results.recommendedAdjustment}`,
                        priority: 'medium'
                    });
                }
                if (results.noiseFloor > -40) {
                    recommendations.push({
                        type: 'environment',
                        message: 'Consider reducing ambient noise in the environment',
                        priority: 'high'
                    });
                }
                break;
            case 'noise_floor':
                if (results.qualityScore < 7) {
                    recommendations.push({
                        type: 'quality',
                        message: 'Audio quality is below optimal. Check microphone placement and environment',
                        priority: 'high'
                    });
                }
                break;
            case 'frequency_response':
                if (results.flatnessScore < 8) {
                    recommendations.push({
                        type: 'eq',
                        message: 'Apply recommended EQ settings to improve frequency response',
                        priority: 'medium'
                    });
                }
                break;
        }

        return recommendations;
    }

    /**
     * Get microphone analytics
     * @param {string} timeRange - Time range for analytics ('1h', '24h', '7d', '30d')
     * @param {Array} microphoneIds - Optional array of microphone IDs to filter
     * @returns {Object} Analytics data
     */
    async getMicrophoneAnalytics(timeRange = '24h', microphoneIds = null) {
        try {
            const microphones = await this.getAllMicrophones();
            const filteredMicrophones = microphoneIds
                ? microphones.filter(mic => microphoneIds.includes(mic.id))
                : microphones;

            // Generate mock analytics data
            const analytics = {
                timeRange,
                generatedAt: new Date().toISOString(),
                summary: {
                    totalMicrophones: filteredMicrophones.length,
                    activeMicrophones: filteredMicrophones.filter(mic => mic.status === 'active').length,
                    averageUsage: 65.4,
                    totalRecordingTime: 1247, // minutes
                    qualityScore: 8.2
                },
                usage: {
                    byHour: Array.from({ length: 24 }, (_, i) => ({
                        hour: i,
                        usage: Math.random() * 100,
                        activeCount: Math.floor(Math.random() * filteredMicrophones.length)
                    })),
                    byMicrophone: filteredMicrophones.map(mic => ({
                        id: mic.id,
                        name: mic.name,
                        usage: Math.random() * 100,
                        recordingTime: Math.floor(Math.random() * 300),
                        qualityScore: 7 + Math.random() * 3
                    }))
                },
                performance: {
                    averageLatency: 12.5,
                    dropoutRate: 0.02,
                    errorRate: 0.001,
                    peakConcurrentUsers: Math.floor(Math.random() * 10) + 1
                },
                issues: [
                    {
                        microphoneId: filteredMicrophones[0]?.id,
                        type: 'quality',
                        message: 'Intermittent audio quality issues detected',
                        severity: 'medium',
                        timestamp: new Date(Date.now() - 3600000).toISOString()
                    }
                ].filter(issue => issue.microphoneId) // Remove if no microphones
            };

            return analytics;

        } catch (error) {
            logger.error('Error generating microphone analytics:', error);
            throw error;
        }
    }

    /**
     * Get microphone health status
     * @param {number} id - Microphone ID
     * @returns {Object} Health status
     */
    async getMicrophoneHealth(id) {
        try {
            const microphone = await this.getMicrophoneById(id);
            if (!microphone) {
                return null;
            }

            const status = this.getMicrophoneStatus(id);

            // Generate health metrics
            const health = {
                overall: 'good', // good, fair, poor
                score: 85, // 0-100
                metrics: {
                    connectivity: { status: 'good', score: 95 },
                    audioQuality: { status: 'good', score: 88 },
                    latency: { status: 'good', score: 92 },
                    stability: { status: 'fair', score: 78 }
                },
                recommendations: [
                    'Consider updating microphone drivers',
                    'Check for environmental noise sources'
                ],
                lastChecked: new Date().toISOString()
            };

            // Adjust based on current status
            if (status?.status === 'error') {
                health.overall = 'poor';
                health.score = 25;
                health.metrics.connectivity.status = 'poor';
                health.metrics.connectivity.score = 10;
            }

            return health;

        } catch (error) {
            logger.error(`Error getting microphone health for ${id}:`, error);
            return null;
        }
    }

    /**
     * Export microphone configuration
     * @param {number} id - Microphone ID
     * @returns {Object} Exportable configuration
     */
    async exportMicrophoneConfig(id) {
        try {
            const microphone = await this.getMicrophoneById(id);
            if (!microphone) {
                return null;
            }

            return {
                version: '1.0',
                exportedAt: new Date().toISOString(),
                microphone: {
                    name: microphone.name,
                    deviceId: microphone.deviceId,
                    type: microphone.type,
                    config: microphone.config,
                    capabilities: microphone.capabilities
                }
            };

        } catch (error) {
            logger.error(`Error exporting microphone config for ${id}:`, error);
            return null;
        }
    }

    /**
     * Import microphone configuration
     * @param {Object} configData - Configuration data to import
     * @returns {Object} Import result
     */
    async importMicrophoneConfig(configData) {
        try {
            if (!configData.microphone) {
                throw new Error('Invalid configuration data');
            }

            const microphoneData = {
                ...configData.microphone,
                name: `${configData.microphone.name} (Imported)`,
                created: new Date().toISOString()
            };

            const newMicrophone = await this.createMicrophone(microphoneData);

            return {
                success: true,
                microphone: newMicrophone,
                message: 'Configuration imported successfully'
            };

        } catch (error) {
            logger.error('Error importing microphone config:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get service status
     * @returns {Object} Service status information
     */
    async getServiceStatus() {
        try {
            const WebSocket = require('ws');

            // Check microphone service (use IPv4 to avoid connection issues)
            const micServiceStatus = await this.checkWebSocketService('ws://127.0.0.1:8776');

            // Check audio stream service (use IPv4 to avoid connection issues)
            const audioServiceStatus = await this.checkWebSocketService('ws://127.0.0.1:8777');

            return {
                microphoneService: {
                    port: 8776,
                    status: micServiceStatus ? 'connected' : 'disconnected',
                    lastChecked: new Date().toISOString()
                },
                audioStreamService: {
                    port: 8777,
                    status: audioServiceStatus ? 'connected' : 'disconnected',
                    lastChecked: new Date().toISOString()
                }
            };
        } catch (error) {
            logger.error('Error getting service status:', error);
            return {
                microphoneService: { status: 'error', error: error.message },
                audioStreamService: { status: 'error', error: error.message }
            };
        }
    }

    /**
     * Check WebSocket service availability
     * @param {string} url - WebSocket URL
     * @returns {boolean} Service availability
     */
    async checkWebSocketService(url) {
        return new Promise((resolve) => {
            try {
                // Use IPv4 address to avoid IPv6 connection issues
                const ipv4Url = url.replace('localhost', '127.0.0.1');
                const ws = new (require('ws'))(ipv4Url);
                const timeout = setTimeout(() => {
                    ws.close();
                    resolve(false);
                }, 2000);

                ws.on('open', () => {
                    clearTimeout(timeout);
                    ws.close();
                    resolve(true);
                });

                ws.on('error', () => {
                    clearTimeout(timeout);
                    resolve(false);
                });
            } catch (error) {
                resolve(false);
            }
        });
    }

    /**
     * Test microphone functionality
     * @param {number} microphoneId - Microphone ID
     * @param {string} testType - Type of test to perform
     * @param {number} duration - Test duration in seconds
     * @returns {Object} Test results
     */
    async testMicrophone(microphoneId, testType = 'basic', duration = 5) {
        try {
            const microphone = await this.getMicrophoneById(microphoneId);
            if (!microphone) {
                throw new Error('Microphone not found');
            }

            logger.info(`🧪 Testing microphone ${microphoneId} (${testType} test)`);

            const testResult = {
                microphoneId,
                testType,
                duration,
                startTime: new Date().toISOString(),
                success: false,
                results: {}
            };

            switch (testType) {
                case 'basic':
                    testResult.results = await this.performBasicTest(microphone, duration);
                    break;
                case 'comprehensive':
                    testResult.results = await this.performComprehensiveTest(microphone, duration);
                    break;
                case 'ambient':
                    testResult.results = await this.performAmbientTest(microphone, duration);
                    break;
                default:
                    throw new Error(`Unknown test type: ${testType}`);
            }

            testResult.success = true;
            testResult.endTime = new Date().toISOString();

            logger.info(`✅ Microphone test completed for ${microphoneId}`);
            return testResult;

        } catch (error) {
            logger.error(`❌ Microphone test failed for ${microphoneId}:`, error);
            return {
                microphoneId,
                testType,
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Perform basic microphone test
     * @param {Object} microphone - Microphone configuration
     * @param {number} duration - Test duration
     * @returns {Object} Test results
     */
    async performBasicTest(microphone, duration) {
        logger.info(`🧪 Running basic test for ${duration} seconds...`);

        // Actually wait for the specified duration to simulate real testing
        await new Promise(resolve => setTimeout(resolve, duration * 1000));

        // Simulate basic test results after waiting
        return {
            deviceDetected: true,
            audioLevelDetected: Math.random() > 0.1,
            averageLevel: Math.random() * 100,
            peakLevel: Math.random() * 100,
            noiseFloor: -45 + Math.random() * 10,
            testDuration: duration,
            sampleRate: microphone.config?.sampleRate || 16000,
            channels: microphone.config?.channels || 1
        };
    }

    /**
     * Perform comprehensive microphone test
     * @param {Object} microphone - Microphone configuration
     * @param {number} duration - Test duration
     * @returns {Object} Test results
     */
    async performComprehensiveTest(microphone, duration) {
        logger.info(`🧪 Running comprehensive test for ${duration} seconds...`);

        // Actually wait for the specified duration to simulate real testing
        await new Promise(resolve => setTimeout(resolve, duration * 1000));

        // Generate comprehensive test results after waiting
        const basicResults = {
            deviceDetected: true,
            audioLevelDetected: Math.random() > 0.1,
            averageLevel: Math.random() * 100,
            peakLevel: Math.random() * 100,
            noiseFloor: -45 + Math.random() * 10,
            testDuration: duration,
            sampleRate: microphone.config?.sampleRate || 16000,
            channels: microphone.config?.channels || 1
        };

        return {
            ...basicResults,
            frequencyResponse: this.generateFrequencyResponse(),
            latency: 5 + Math.random() * 10,
            signalToNoise: 40 + Math.random() * 20,
            dynamicRange: 80 + Math.random() * 15,
            distortion: Math.random() * 0.5,
            stability: 95 + Math.random() * 5
        };
    }

    /**
     * Perform ambient sound test
     * @param {Object} microphone - Microphone configuration
     * @param {number} duration - Test duration
     * @returns {Object} Test results
     */
    async performAmbientTest(microphone, duration) {
        logger.info(`🧪 Running ambient test for ${duration} seconds...`);

        // Actually wait for the specified duration to simulate real testing
        await new Promise(resolve => setTimeout(resolve, duration * 1000));

        // Generate ambient test results after waiting
        return {
            ambientDetected: true,
            ambientLevel: 20 + Math.random() * 30,
            backgroundNoise: -40 + Math.random() * 15,
            voiceActivityDetected: Math.random() > 0.3,
            testDuration: duration,
            recommendation: 'Environment suitable for voice recording'
        };
    }

    /**
     * Generate frequency response data
     * @returns {Array} Frequency response data
     */
    generateFrequencyResponse() {
        const frequencies = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
        return frequencies.map(freq => ({
            frequency: freq,
            response: -3 + Math.random() * 6 // ±3dB variation
        }));
    }

    /**
     * Start monitoring a microphone
     * @param {number} microphoneId - Microphone ID
     * @returns {boolean} Success status
     */
    async startMonitoring(microphoneId) {
        try {
            const microphone = await this.getMicrophoneById(microphoneId);
            if (!microphone) {
                throw new Error('Microphone not found');
            }

            // Set monitoring status
            this.activeMicrophones.set(microphoneId, {
                status: 'monitoring',
                level: 0,
                startTime: Date.now(),
                lastActivity: Date.now()
            });

            logger.info(`👁️ Started monitoring microphone ${microphoneId}`);
            return true;
        } catch (error) {
            logger.error(`Error starting monitoring for microphone ${microphoneId}:`, error);
            return false;
        }
    }

    /**
     * Stop monitoring a microphone
     * @param {number} microphoneId - Microphone ID
     * @returns {boolean} Success status
     */
    async stopMonitoring(microphoneId) {
        try {
            this.activeMicrophones.delete(microphoneId);
            logger.info(`🛑 Stopped monitoring microphone ${microphoneId}`);
            return true;
        } catch (error) {
            logger.error(`Error stopping monitoring for microphone ${microphoneId}:`, error);
            return false;
        }
    }

    /**
     * Discover available audio devices
     * @returns {Array} Available audio devices
     */
    async discoverDevices() {
        try {
            // This would typically interface with the hardware service
            // For now, return mock data
            return [
                { id: 'default', name: 'Default Audio Device', type: 'system' },
                { id: 'usb-mic-1', name: 'USB Microphone', type: 'usb' },
                { id: 'built-in', name: 'Built-in Microphone', type: 'internal' }
            ];
        } catch (error) {
            logger.error('Error discovering audio devices:', error);
            return [];
        }
    }
}

module.exports = MicrophoneService;
