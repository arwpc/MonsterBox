/**
 * ElevenLabs WebSocket SSL Proxy
 * Provides secure WebSocket (WSS) proxy for ElevenLabs Conversational AI service
 * Allows HTTPS pages to connect to the ElevenLabs WebSocket service
 */

const WebSocket = require('ws');
const https = require('https');
const fs = require('fs');
const logger = require('../scripts/logger');

class ElevenLabsWebSocketProxy {
    constructor(options = {}) {
        this.proxyServer = null;
        this.proxyPort = options.proxyPort || 8872; // Secure proxy port for ElevenLabs
        this.targetPort = options.targetPort || 8771; // ElevenLabs service port
        this.serviceName = options.serviceName || 'ElevenLabs Conversational';
        this.activeConnections = new Map();
        this.isRunning = false;

        // SSL configuration
        this.sslConfig = null;
        this.loadSSLConfig();
    }
    
    /**
     * Load SSL configuration
     */
    loadSSLConfig() {
        try {
            const sslConfigPath = '/etc/ssl/monsterbox/ssl-config.json';
            if (fs.existsSync(sslConfigPath)) {
                const sslConfigData = fs.readFileSync(sslConfigPath, 'utf8');
                this.sslConfig = JSON.parse(sslConfigData);
                logger.info('🔐 SSL configuration loaded for ElevenLabs proxy');
            } else {
                logger.warn('⚠️ SSL configuration not found, proxy will not start');
            }
        } catch (error) {
            logger.error('❌ Failed to load SSL configuration:', error.message);
        }
    }
    
    /**
     * Start the secure WebSocket proxy
     */
    async start() {
        if (this.isRunning) {
            logger.warn('ElevenLabs WebSocket proxy is already running');
            return;
        }
        
        if (!this.sslConfig) {
            logger.warn(`⚠️ SSL not configured, skipping ${this.serviceName} secure proxy`);
            return;
        }
        
        try {
            // Load SSL certificates
            const privateKey = fs.readFileSync(this.sslConfig.certificates.key, 'utf8');
            const certificate = fs.readFileSync(this.sslConfig.certificates.cert, 'utf8');
            
            const credentials = {
                key: privateKey,
                cert: certificate
            };
            
            // Create HTTPS server
            const httpsServer = https.createServer(credentials, (req, res) => {
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end(`${this.serviceName} WebSocket SSL Proxy Server`);
            });
            
            // Create secure WebSocket server
            this.proxyServer = new WebSocket.Server({
                server: httpsServer,
                perMessageDeflate: false,
                clientTracking: true
            });
            
            // Handle WebSocket connections
            this.proxyServer.on('connection', (browserWs, request) => {
                this.handleBrowserConnection(browserWs, request);
            });
            
            this.proxyServer.on('error', (error) => {
                logger.error('❌ ElevenLabs proxy WebSocket server error:', error);
            });
            
            // Start listening
            await new Promise((resolve, reject) => {
                httpsServer.listen(this.proxyPort, () => {
                    this.isRunning = true;
                    logger.info(`🔐 ${this.serviceName} secure WebSocket proxy listening on port ${this.proxyPort}`);
                    logger.info(`🔗 Proxy: wss://localhost:${this.proxyPort} → ws://localhost:${this.targetPort}`);
                    resolve();
                });
                
                httpsServer.on('error', (error) => {
                    logger.error('❌ ElevenLabs proxy HTTPS server error:', error);
                    reject(error);
                });
            });
            
        } catch (error) {
            logger.error('❌ Failed to start ElevenLabs WebSocket proxy:', error);
            throw error;
        }
    }
    
    /**
     * Handle browser WebSocket connection
     */
    handleBrowserConnection(browserWs, request) {
        const connectionId = `elevenlabs_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        logger.debug(`🔌 Browser connected to ElevenLabs proxy: ${connectionId}`);
        
        // Create connection to ElevenLabs service
        const targetWs = new WebSocket(`ws://127.0.0.1:${this.targetPort}`, {
            perMessageDeflate: false
        });
        
        const connectionInfo = {
            browserWs,
            targetWs,
            connectionId,
            connectedAt: new Date(),
            messageCount: 0
        };
        
        this.activeConnections.set(connectionId, connectionInfo);
        
        // Set up connection timeout
        const connectionTimeout = setTimeout(() => {
            if (targetWs.readyState === WebSocket.CONNECTING) {
                logger.warn(`Connection timeout for ElevenLabs proxy: ${connectionId}`);
                targetWs.close();
                browserWs.close(1008, 'Connection timeout');
            }
        }, 10000);
        
        // Handle target WebSocket events
        targetWs.on('open', () => {
            clearTimeout(connectionTimeout);
            logger.debug(`✅ Connected to ElevenLabs service: ${connectionId}`);
        });
        
        targetWs.on('message', (data) => {
            if (browserWs.readyState === WebSocket.OPEN) {
                browserWs.send(data);
                connectionInfo.messageCount++;
            }
        });
        
        targetWs.on('close', (code, reason) => {
            logger.debug(`🔌 ElevenLabs service connection closed: ${connectionId} (${code})`);
            if (browserWs.readyState === WebSocket.OPEN) {
                browserWs.close(code, reason);
            }
            this.activeConnections.delete(connectionId);
        });
        
        targetWs.on('error', (error) => {
            logger.error(`❌ ElevenLabs service connection error: ${connectionId}`, error);
            if (browserWs.readyState === WebSocket.OPEN) {
                browserWs.close(1011, 'Service error');
            }
            this.activeConnections.delete(connectionId);
        });
        
        // Handle browser WebSocket events
        browserWs.on('message', (data) => {
            if (targetWs.readyState === WebSocket.OPEN) {
                targetWs.send(data);
            }
        });
        
        browserWs.on('close', (code, reason) => {
            logger.debug(`🔌 Browser connection closed: ${connectionId} (${code})`);
            if (targetWs.readyState === WebSocket.OPEN) {
                targetWs.close();
            }
            this.activeConnections.delete(connectionId);
        });
        
        browserWs.on('error', (error) => {
            logger.error(`❌ Browser connection error: ${connectionId}`, error);
            if (targetWs.readyState === WebSocket.OPEN) {
                targetWs.close();
            }
            this.activeConnections.delete(connectionId);
        });
    }
    
    /**
     * Stop the proxy server
     */
    async stop() {
        if (!this.isRunning) {
            return;
        }
        
        logger.info('🛑 Stopping ElevenLabs WebSocket proxy...');
        
        // Close all active connections
        for (const [connectionId, connection] of this.activeConnections) {
            try {
                connection.browserWs.close();
                connection.targetWs.close();
            } catch (error) {
                logger.debug(`Error closing connection ${connectionId}:`, error.message);
            }
        }
        this.activeConnections.clear();
        
        // Close proxy server
        if (this.proxyServer) {
            this.proxyServer.close();
            this.proxyServer = null;
        }
        
        this.isRunning = false;
        logger.info('✅ ElevenLabs WebSocket proxy stopped');
    }
    
    /**
     * Get proxy status
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            proxyPort: this.proxyPort,
            targetPort: this.targetPort,
            activeConnections: this.activeConnections.size,
            sslConfigured: !!this.sslConfig
        };
    }
}

module.exports = ElevenLabsWebSocketProxy;
