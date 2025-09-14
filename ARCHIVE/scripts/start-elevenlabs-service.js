#!/usr/bin/env node
/**
 * ElevenLabs Service Standalone Runner
 * Starts the ElevenLabs Conversational Service for testing
 */

require('dotenv').config();
const ElevenLabsConversationalService = require('../services/elevenLabsConversationalService');

class ElevenLabsServiceRunner {
    constructor() {
        this.service = null;
        this.isRunning = false;
    }

    /**
     * Start the service
     */
    async start() {
        try {
            console.log('🚀 Starting ElevenLabs Conversational Service...');
            
            this.service = new ElevenLabsConversationalService();
            await this.service.initialize();
            
            this.isRunning = true;
            
            // Setup graceful shutdown
            this.setupGracefulShutdown();
            
            // Display status
            this.displayStatus();
            
            console.log('\n✅ ElevenLabs Service is running!');
            console.log('Press Ctrl+C to stop the service');
            
        } catch (error) {
            console.error('❌ Failed to start ElevenLabs service:', error.message);
            process.exit(1);
        }
    }

    /**
     * Display service status
     */
    displayStatus() {
        const status = this.service.getStatus();
        
        console.log('\n📊 Service Status');
        console.log('=================');
        console.log(`Port: ${status.port}`);
        console.log(`Active Connections: ${status.activeConnections}`);
        console.log(`Available Agents: ${status.availableAgents}`);
        
        console.log('\nAvailable Characters:');
        status.agents.forEach(agent => {
            console.log(`  ${agent.characterId}: ${agent.name} (${agent.agentId})`);
        });
        
        console.log('\nWebSocket Endpoints:');
        console.log(`  ElevenLabs Service: ws://localhost:${status.port}`);
        console.log(`  Jaw Animation: ws://localhost:8765 (existing)`);
    }

    /**
     * Setup graceful shutdown
     */
    setupGracefulShutdown() {
        const shutdown = async (signal) => {
            console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
            
            if (this.service) {
                await this.service.shutdown();
            }
            
            console.log('✅ Shutdown complete');
            process.exit(0);
        };

        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));
        
        process.on('uncaughtException', (error) => {
            console.error('💥 Uncaught Exception:', error);
            shutdown('uncaughtException');
        });
        
        process.on('unhandledRejection', (reason, promise) => {
            console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
            shutdown('unhandledRejection');
        });
    }

    /**
     * Get service status
     */
    getStatus() {
        if (!this.service) {
            return { isRunning: false };
        }
        
        return {
            isRunning: this.isRunning,
            ...this.service.getStatus()
        };
    }
}

// Run if called directly
if (require.main === module) {
    const runner = new ElevenLabsServiceRunner();
    runner.start();
}

module.exports = ElevenLabsServiceRunner;
