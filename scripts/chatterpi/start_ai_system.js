#!/usr/bin/env node

/**
 * ChatterPi AI System Startup Script
 * 
 * Starts the complete ChatterPi AI system including:
 * - AI WebSocket Bridge (port 8766)
 * - Jaw Control WebSocket Server (port 8765)
 * - Chat HTTP Server (port 8080)
 */

require('dotenv').config();
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class ChatterPiSystemManager {
    constructor(options = {}) {
        this.config = {
            characterId: options.characterId || 'orlok',
            enableTTS: options.enableTTS !== false,
            enableJawSync: options.enableJawSync !== false,
            aiPort: options.aiPort || 8766,
            jawPort: options.jawPort || 8765,
            chatPort: options.chatPort || 8080,
            ...options
        };
        
        this.processes = new Map();
        this.isRunning = false;
        
        console.log(`🎭 ChatterPi AI System Manager initialized`);
        console.log(`   Character: ${this.config.characterId}`);
        console.log(`   TTS: ${this.config.enableTTS ? 'enabled' : 'disabled'}`);
        console.log(`   Jaw Sync: ${this.config.enableJawSync ? 'enabled' : 'disabled'}`);
    }
    
    /**
     * Start all system components
     */
    async start() {
        try {
            console.log('\n🚀 Starting ChatterPi AI System...\n');
            
            // Check prerequisites
            await this.checkPrerequisites();
            
            // Start components in order
            await this.startJawControlServer();
            await this.startAIBridge();
            await this.startChatServer();
            
            this.isRunning = true;
            
            console.log('\n✅ ChatterPi AI System started successfully!');
            console.log('\n📱 Access the chat interface at:');
            console.log(`   🌐 http://localhost:${this.config.chatPort}/chatterpi-ai-chat.html`);
            console.log(`   🌐 http://192.168.8.130:${this.config.chatPort}/chatterpi-ai-chat.html`);
            console.log('\n🔧 WebSocket endpoints:');
            console.log(`   🤖 AI Service: ws://localhost:${this.config.aiPort}`);
            console.log(`   🦴 Jaw Control: ws://localhost:${this.config.jawPort}`);
            
            this.setupGracefulShutdown();
            
        } catch (error) {
            console.error('❌ Failed to start ChatterPi AI System:', error.message);
            await this.stop();
            process.exit(1);
        }
    }
    
    /**
     * Check system prerequisites
     */
    async checkPrerequisites() {
        console.log('🔍 Checking prerequisites...');
        
        // Check API keys
        if (!process.env.OPENAI_API_KEY) {
            throw new Error('OpenAI API key not found in environment variables');
        }
        
        if (!process.env.TOPMEDIAI_API_KEY) {
            console.warn('⚠️ TopMediai API key not found - TTS will be disabled');
            this.config.enableTTS = false;
        }
        
        // Check required files
        const requiredFiles = [
            path.join(__dirname, 'ai_integration.js'),
            path.join(__dirname, 'ai_websocket_bridge.js'),
            path.join(__dirname, 'jaw_websocket_server.py'),
            path.join(__dirname, 'chat_server.py')
        ];
        
        for (const file of requiredFiles) {
            if (!fs.existsSync(file)) {
                throw new Error(`Required file not found: ${file}`);
            }
        }
        
        console.log('✅ Prerequisites check passed');
    }
    
    /**
     * Start jaw control WebSocket server
     */
    async startJawControlServer() {
        return new Promise((resolve, reject) => {
            console.log('🦴 Starting Jaw Control WebSocket Server...');
            
            const jawProcess = spawn('python3', [
                path.join(__dirname, 'jaw_websocket_server.py'),
                '--host', '0.0.0.0',
                '--port', this.config.jawPort.toString(),
                '--servo-pin', '18'
            ], {
                stdio: ['pipe', 'pipe', 'pipe'],
                cwd: __dirname
            });
            
            this.processes.set('jaw', jawProcess);
            
            jawProcess.stdout.on('data', (data) => {
                const output = data.toString().trim();
                if (output) {
                    console.log(`[JAW] ${output}`);
                    if (output.includes('running on')) {
                        resolve();
                    }
                }
            });
            
            jawProcess.stderr.on('data', (data) => {
                const error = data.toString().trim();
                if (error) {
                    console.error(`[JAW ERROR] ${error}`);
                }
            });
            
            jawProcess.on('close', (code) => {
                console.log(`🦴 Jaw Control Server exited with code ${code}`);
                this.processes.delete('jaw');
            });
            
            jawProcess.on('error', (error) => {
                console.error('❌ Failed to start Jaw Control Server:', error.message);
                reject(error);
            });
            
            // Timeout after 10 seconds
            setTimeout(() => {
                if (this.processes.has('jaw')) {
                    console.log('✅ Jaw Control Server started (timeout)');
                    resolve();
                }
            }, 10000);
        });
    }
    
    /**
     * Start AI WebSocket bridge
     */
    async startAIBridge() {
        return new Promise((resolve, reject) => {
            console.log('🤖 Starting AI WebSocket Bridge...');
            
            const aiProcess = spawn('node', [
                path.join(__dirname, 'ai_websocket_bridge.js'),
                this.config.characterId
            ], {
                stdio: ['pipe', 'pipe', 'pipe'],
                cwd: __dirname,
                env: {
                    ...process.env,
                    AI_PORT: this.config.aiPort.toString(),
                    JAW_PORT: this.config.jawPort.toString(),
                    ENABLE_TTS: this.config.enableTTS.toString(),
                    ENABLE_JAW_SYNC: this.config.enableJawSync.toString()
                }
            });
            
            this.processes.set('ai', aiProcess);
            
            aiProcess.stdout.on('data', (data) => {
                const output = data.toString().trim();
                if (output) {
                    console.log(`[AI] ${output}`);
                    if (output.includes('started successfully')) {
                        resolve();
                    }
                }
            });
            
            aiProcess.stderr.on('data', (data) => {
                const error = data.toString().trim();
                if (error) {
                    console.error(`[AI ERROR] ${error}`);
                }
            });
            
            aiProcess.on('close', (code) => {
                console.log(`🤖 AI Bridge exited with code ${code}`);
                this.processes.delete('ai');
            });
            
            aiProcess.on('error', (error) => {
                console.error('❌ Failed to start AI Bridge:', error.message);
                reject(error);
            });
            
            // Timeout after 15 seconds
            setTimeout(() => {
                if (this.processes.has('ai')) {
                    console.log('✅ AI Bridge started (timeout)');
                    resolve();
                }
            }, 15000);
        });
    }
    
    /**
     * Start chat HTTP server
     */
    async startChatServer() {
        return new Promise((resolve, reject) => {
            console.log('🌐 Starting Chat HTTP Server...');
            
            const chatProcess = spawn('python3', [
                path.join(__dirname, 'chat_server.py'),
                '--host', '0.0.0.0',
                '--port', this.config.chatPort.toString()
            ], {
                stdio: ['pipe', 'pipe', 'pipe'],
                cwd: __dirname
            });
            
            this.processes.set('chat', chatProcess);
            
            chatProcess.stdout.on('data', (data) => {
                const output = data.toString().trim();
                if (output) {
                    console.log(`[CHAT] ${output}`);
                    if (output.includes('started successfully')) {
                        resolve();
                    }
                }
            });
            
            chatProcess.stderr.on('data', (data) => {
                const error = data.toString().trim();
                if (error) {
                    console.error(`[CHAT ERROR] ${error}`);
                }
            });
            
            chatProcess.on('close', (code) => {
                console.log(`🌐 Chat Server exited with code ${code}`);
                this.processes.delete('chat');
            });
            
            chatProcess.on('error', (error) => {
                console.error('❌ Failed to start Chat Server:', error.message);
                reject(error);
            });
            
            // Timeout after 10 seconds
            setTimeout(() => {
                if (this.processes.has('chat')) {
                    console.log('✅ Chat Server started (timeout)');
                    resolve();
                }
            }, 10000);
        });
    }
    
    /**
     * Stop all system components
     */
    async stop() {
        console.log('\n🛑 Stopping ChatterPi AI System...');
        
        for (const [name, process] of this.processes) {
            try {
                console.log(`   Stopping ${name}...`);
                process.kill('SIGTERM');
                
                // Force kill after 5 seconds
                setTimeout(() => {
                    if (!process.killed) {
                        process.kill('SIGKILL');
                    }
                }, 5000);
                
            } catch (error) {
                console.error(`   Error stopping ${name}:`, error.message);
            }
        }
        
        this.processes.clear();
        this.isRunning = false;
        
        console.log('✅ ChatterPi AI System stopped');
    }
    
    /**
     * Setup graceful shutdown handlers
     */
    setupGracefulShutdown() {
        const shutdown = async (signal) => {
            console.log(`\n📡 Received ${signal}, shutting down gracefully...`);
            await this.stop();
            process.exit(0);
        };
        
        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));
        
        process.on('uncaughtException', async (error) => {
            console.error('💥 Uncaught Exception:', error);
            await this.stop();
            process.exit(1);
        });
        
        process.on('unhandledRejection', async (reason, promise) => {
            console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
            await this.stop();
            process.exit(1);
        });
    }
    
    /**
     * Get system status
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            config: this.config,
            processes: Array.from(this.processes.keys()),
            processCount: this.processes.size
        };
    }
}

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);
    const characterId = args[0] || 'orlok';
    
    const manager = new ChatterPiSystemManager({
        characterId: characterId,
        enableTTS: true,
        enableJawSync: true
    });
    
    manager.start().catch(error => {
        console.error('💥 System startup failed:', error.message);
        process.exit(1);
    });
}

module.exports = ChatterPiSystemManager;
