#!/usr/bin/env node

/**
 * AI System Startup Script
 * 
 * Initializes and starts all AI-related services including:
 * - AI Integration Service
 * - AI WebSocket Service  
 * - AI Jaw Integration Service
 * - Jaw Animation System
 * 
 * This script provides a unified entry point for the complete
 * AI conversation and jaw animation system.
 */

require('dotenv').config();
const logger = require('../logger');
const aiIntegrationService = require('../../services/ai/aiIntegrationService');
const AIWebSocketService = require('../../services/ai/aiWebSocketService');
const aiJawIntegrationService = require('../../services/ai/aiJawIntegrationService');
const JawAnimationSystem = require('../jaw-animation/jawAnimationSystem');

class AISystemManager {
    constructor(options = {}) {
        this.config = {
            aiWebSocketPort: options.aiWebSocketPort || 8766,
            jawWebSocketPort: options.jawWebSocketPort || 8765,
            enableJawAnimation: options.enableJawAnimation !== false,
            enableAIWebSocket: options.enableAIWebSocket !== false,
            autoStart: options.autoStart !== false,
            ...options
        };
        
        // Service instances
        this.aiWebSocketService = null;
        this.jawAnimationSystem = null;
        this.isRunning = false;
        this.startTime = null;
        
        // Service status tracking
        this.serviceStatus = {
            aiIntegration: 'stopped',
            aiWebSocket: 'stopped',
            jawAnimation: 'stopped',
            aiJawIntegration: 'stopped'
        };
        
        logger.info('AI System Manager initialized');
        logger.info(`Configuration:`, this.config);
    }
    
    /**
     * Start all AI services
     */
    async start() {
        try {
            logger.info('🚀 Starting MonsterBox AI System...');
            this.startTime = new Date();
            
            // Validate environment
            await this.validateEnvironment();
            
            // Start AI Integration Service (already initialized as singleton)
            await this.startAIIntegrationService();
            
            // Start Jaw Animation System if enabled
            if (this.config.enableJawAnimation) {
                await this.startJawAnimationSystem();
            }
            
            // Start AI Jaw Integration Service
            await this.startAIJawIntegrationService();
            
            // Start AI WebSocket Service if enabled
            if (this.config.enableAIWebSocket) {
                await this.startAIWebSocketService();
            }
            
            // Setup graceful shutdown
            this.setupGracefulShutdown();
            
            this.isRunning = true;
            
            logger.info('✅ MonsterBox AI System started successfully');
            this.logSystemStatus();
            
        } catch (error) {
            logger.error('❌ Failed to start AI System:', error);
            await this.shutdown();
            throw error;
        }
    }
    
    /**
     * Validate environment and dependencies
     */
    async validateEnvironment() {
        logger.info('🔍 Validating environment...');
        
        // Check required environment variables
        const requiredEnvVars = ['OPENAI_API_KEY'];
        const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
        
        if (missingVars.length > 0) {
            throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
        }
        
        // Check optional environment variables
        const optionalEnvVars = ['TOPMEDIAI_API_KEY'];
        const missingOptional = optionalEnvVars.filter(varName => !process.env[varName]);
        
        if (missingOptional.length > 0) {
            logger.warn(`Optional environment variables not set: ${missingOptional.join(', ')}`);
            logger.warn('Some features may be disabled');
        }
        
        logger.info('✅ Environment validation complete');
    }
    
    /**
     * Start AI Integration Service
     */
    async startAIIntegrationService() {
        try {
            logger.info('🧠 Starting AI Integration Service...');
            
            // Service is already initialized as singleton
            if (!aiIntegrationService.isInitialized) {
                await aiIntegrationService.initialize();
            }
            
            this.serviceStatus.aiIntegration = 'running';
            logger.info('✅ AI Integration Service started');
            
        } catch (error) {
            this.serviceStatus.aiIntegration = 'error';
            logger.error('❌ Failed to start AI Integration Service:', error);
            throw error;
        }
    }
    
    /**
     * Start Jaw Animation System
     */
    async startJawAnimationSystem() {
        try {
            logger.info('🦷 Starting Jaw Animation System...');
            
            this.jawAnimationSystem = new JawAnimationSystem({
                enabled: true,
                autoStart: false
            });
            
            await this.jawAnimationSystem.initialize();
            
            this.serviceStatus.jawAnimation = 'running';
            logger.info('✅ Jaw Animation System started');
            
        } catch (error) {
            this.serviceStatus.jawAnimation = 'error';
            logger.error('❌ Failed to start Jaw Animation System:', error);
            throw error;
        }
    }
    
    /**
     * Start AI Jaw Integration Service
     */
    async startAIJawIntegrationService() {
        try {
            logger.info('🔗 Starting AI Jaw Integration Service...');
            
            // Service is already initialized as singleton
            if (!aiJawIntegrationService.isInitialized) {
                await aiJawIntegrationService.initialize();
            }
            
            // Connect jaw animation system if available
            if (this.jawAnimationSystem) {
                aiJawIntegrationService.setJawAnimationSystem(this.jawAnimationSystem);
            }
            
            this.serviceStatus.aiJawIntegration = 'running';
            logger.info('✅ AI Jaw Integration Service started');
            
        } catch (error) {
            this.serviceStatus.aiJawIntegration = 'error';
            logger.error('❌ Failed to start AI Jaw Integration Service:', error);
            throw error;
        }
    }
    
    /**
     * Start AI WebSocket Service
     */
    async startAIWebSocketService() {
        try {
            logger.info('🌐 Starting AI WebSocket Service...');
            
            this.aiWebSocketService = new AIWebSocketService({
                port: this.config.aiWebSocketPort
            });
            
            await this.aiWebSocketService.start();
            
            this.serviceStatus.aiWebSocket = 'running';
            logger.info(`✅ AI WebSocket Service started on port ${this.config.aiWebSocketPort}`);
            
        } catch (error) {
            this.serviceStatus.aiWebSocket = 'error';
            logger.error('❌ Failed to start AI WebSocket Service:', error);
            throw error;
        }
    }
    
    /**
     * Setup graceful shutdown handlers
     */
    setupGracefulShutdown() {
        const shutdownHandler = async (signal) => {
            logger.info(`📴 Received ${signal}, shutting down gracefully...`);
            await this.shutdown();
            process.exit(0);
        };
        
        process.on('SIGINT', shutdownHandler);
        process.on('SIGTERM', shutdownHandler);
        process.on('SIGUSR2', shutdownHandler); // For nodemon
        
        // Handle uncaught exceptions
        process.on('uncaughtException', async (error) => {
            logger.error('💥 Uncaught Exception:', error);
            await this.shutdown();
            process.exit(1);
        });
        
        process.on('unhandledRejection', async (reason, promise) => {
            logger.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
            await this.shutdown();
            process.exit(1);
        });
    }
    
    /**
     * Log current system status
     */
    logSystemStatus() {
        logger.info('📊 AI System Status:');
        logger.info(`   AI Integration: ${this.serviceStatus.aiIntegration}`);
        logger.info(`   AI WebSocket: ${this.serviceStatus.aiWebSocket}`);
        logger.info(`   Jaw Animation: ${this.serviceStatus.jawAnimation}`);
        logger.info(`   AI Jaw Integration: ${this.serviceStatus.aiJawIntegration}`);
        
        if (this.config.enableAIWebSocket) {
            logger.info(`   AI WebSocket URL: ws://localhost:${this.config.aiWebSocketPort}`);
        }
        
        if (this.config.enableJawAnimation) {
            logger.info(`   Jaw Animation: Enabled`);
        }
        
        logger.info(`   Uptime: ${this.getUptime()}`);
    }
    
    /**
     * Get system uptime
     */
    getUptime() {
        if (!this.startTime) return '0s';
        
        const uptimeMs = Date.now() - this.startTime.getTime();
        const uptimeSeconds = Math.floor(uptimeMs / 1000);
        const uptimeMinutes = Math.floor(uptimeSeconds / 60);
        const uptimeHours = Math.floor(uptimeMinutes / 60);
        
        if (uptimeHours > 0) {
            return `${uptimeHours}h ${uptimeMinutes % 60}m ${uptimeSeconds % 60}s`;
        } else if (uptimeMinutes > 0) {
            return `${uptimeMinutes}m ${uptimeSeconds % 60}s`;
        } else {
            return `${uptimeSeconds}s`;
        }
    }
    
    /**
     * Get system statistics
     */
    getStatistics() {
        return {
            isRunning: this.isRunning,
            uptime: this.getUptime(),
            startTime: this.startTime,
            serviceStatus: { ...this.serviceStatus },
            config: { ...this.config },
            services: {
                aiIntegration: aiIntegrationService.getStatistics(),
                aiWebSocket: this.aiWebSocketService ? this.aiWebSocketService.getStatistics() : null,
                jawAnimation: this.jawAnimationSystem ? this.jawAnimationSystem.getStatus() : null,
                aiJawIntegration: aiJawIntegrationService.getStatistics()
            }
        };
    }
    
    /**
     * Shutdown all services
     */
    async shutdown() {
        if (!this.isRunning) return;
        
        logger.info('🛑 Shutting down AI System...');
        
        try {
            // Stop AI WebSocket Service
            if (this.aiWebSocketService) {
                await this.aiWebSocketService.stop();
                this.serviceStatus.aiWebSocket = 'stopped';
            }
            
            // Stop AI Jaw Integration Service
            await aiJawIntegrationService.shutdown();
            this.serviceStatus.aiJawIntegration = 'stopped';
            
            // Stop Jaw Animation System
            if (this.jawAnimationSystem) {
                await this.jawAnimationSystem.shutdown();
                this.serviceStatus.jawAnimation = 'stopped';
            }
            
            // Stop AI Integration Service
            await aiIntegrationService.shutdown();
            this.serviceStatus.aiIntegration = 'stopped';
            
            this.isRunning = false;
            
            logger.info('✅ AI System shutdown complete');
            
        } catch (error) {
            logger.error('❌ Error during shutdown:', error);
        }
    }
    
    /**
     * Restart the system
     */
    async restart() {
        logger.info('🔄 Restarting AI System...');
        await this.shutdown();
        await this.start();
    }
}

// CLI execution
if (require.main === module) {
    const manager = new AISystemManager({
        aiWebSocketPort: process.env.AI_WEBSOCKET_PORT || 8766,
        jawWebSocketPort: process.env.JAW_WEBSOCKET_PORT || 8765,
        enableJawAnimation: process.env.ENABLE_JAW_ANIMATION !== 'false',
        enableAIWebSocket: process.env.ENABLE_AI_WEBSOCKET !== 'false'
    });
    
    manager.start().catch(error => {
        logger.error('Failed to start AI System:', error);
        process.exit(1);
    });
}

module.exports = AISystemManager;
