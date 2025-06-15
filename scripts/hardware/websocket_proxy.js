/**
 * WebSocket Proxy for Hardware Services
 * Bridges browser WebSocket connections to Python hardware services
 * Fixes browser compatibility issues with Python websockets library
 */

const WebSocket = require('ws');
const http = require('http');
const logger = require('../logger');

class HardwareWebSocketProxy {
    constructor() {
        this.servers = new Map();
        this.pythonServices = {
            main: { port: 8780, proxy: null },
            registry: { port: 8770, proxy: null },
            motor: { port: 8771, proxy: null },
            light: { port: 8772, proxy: null }
        };
        this.proxyPorts = {
            main: 8790,
            registry: 8791,
            motor: 8792,
            light: 8793
        };
    }

    async start() {
        logger.info('🚀 Starting Hardware WebSocket Proxy...');
        
        try {
            // Start proxy servers for each service
            for (const [serviceName, config] of Object.entries(this.pythonServices)) {
                await this.startProxyServer(serviceName, config.port, this.proxyPorts[serviceName]);
            }
            
            logger.info('✅ All Hardware WebSocket Proxies started successfully');
            return true;
        } catch (error) {
            logger.error('❌ Failed to start Hardware WebSocket Proxy:', error);
            return false;
        }
    }

    async startProxyServer(serviceName, pythonPort, proxyPort) {
        return new Promise((resolve, reject) => {
            try {
                const server = http.createServer((req, res) => {
                    // Handle HTTP requests (for health checks, etc.)
                    res.writeHead(200, { 'Content-Type': 'text/plain' });
                    res.end(`${serviceName} WebSocket Proxy Server`);
                });

                const wss = new WebSocket.Server({
                    server,
                    perMessageDeflate: false,
                    clientTracking: true
                });

                wss.on('connection', (browserWs, request) => {
                    this.handleBrowserConnection(browserWs, request, serviceName, pythonPort);
                });

                wss.on('error', (error) => {
                    logger.error(`❌ ${serviceName} WebSocket server error:`, error);
                });

                server.listen(proxyPort, '0.0.0.0', () => {
                    logger.info(`✅ ${serviceName} proxy running on ws://0.0.0.0:${proxyPort} -> ws://localhost:${pythonPort}`);
                    this.servers.set(serviceName, { server, wss });
                    resolve();
                });

                server.on('error', (error) => {
                    logger.error(`❌ ${serviceName} proxy server error:`, error);
                    reject(error);
                });

            } catch (error) {
                logger.error(`❌ Failed to start ${serviceName} proxy:`, error);
                reject(error);
            }
        });
    }

    handleBrowserConnection(browserWs, request, serviceName, pythonPort) {
        const clientId = `${serviceName}_proxy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        logger.info(`🔌 Browser connected to ${serviceName} proxy: ${clientId}`);
        logger.debug(`Connection details - Origin: ${request.headers.origin}, User-Agent: ${request.headers['user-agent']}`);

        // Connect to Python service with retry logic
        const pythonWs = new WebSocket(`ws://localhost:${pythonPort}`, {
            perMessageDeflate: false
        });

        let connectionEstablished = false;

        pythonWs.on('open', () => {
            logger.info(`✅ Connected to Python ${serviceName} service for ${clientId}`);
            connectionEstablished = true;
        });

        pythonWs.on('message', (data) => {
            // Forward messages from Python service to browser
            try {
                if (browserWs.readyState === WebSocket.OPEN) {
                    browserWs.send(data);
                }
            } catch (error) {
                logger.error(`❌ Error forwarding message to browser for ${clientId}:`, error);
            }
        });

        pythonWs.on('close', (code, reason) => {
            logger.warn(`🔌 Python ${serviceName} connection closed for ${clientId}: ${code} ${reason}`);
            if (browserWs.readyState === WebSocket.OPEN) {
                browserWs.close(1000, 'Python service disconnected');
            }
        });

        pythonWs.on('error', (error) => {
            logger.error(`❌ Python ${serviceName} connection error for ${clientId}:`, error);
            if (browserWs.readyState === WebSocket.OPEN) {
                browserWs.close(1011, 'Python service error');
            }
        });

        // Handle browser messages
        browserWs.on('message', (data) => {
            try {
                // Forward messages from browser to Python service
                if (pythonWs.readyState === WebSocket.OPEN) {
                    pythonWs.send(data);
                } else {
                    logger.warn(`Cannot forward message - Python ${serviceName} not connected for ${clientId}`);
                }
            } catch (error) {
                logger.error(`❌ Error forwarding message to Python for ${clientId}:`, error);
            }
        });

        browserWs.on('close', (code, reason) => {
            logger.info(`🔌 Browser disconnected from ${serviceName} proxy: ${clientId} (${code} ${reason})`);
            if (pythonWs.readyState === WebSocket.OPEN) {
                pythonWs.close();
            }
        });

        browserWs.on('error', (error) => {
            logger.error(`❌ Browser ${serviceName} connection error for ${clientId}:`, error);
            if (pythonWs.readyState === WebSocket.OPEN) {
                pythonWs.close();
            }
        });

        // Set up connection timeout
        setTimeout(() => {
            if (!connectionEstablished && pythonWs.readyState !== WebSocket.OPEN) {
                logger.error(`❌ Connection timeout for ${serviceName} service (${clientId})`);
                pythonWs.close();
                if (browserWs.readyState === WebSocket.OPEN) {
                    browserWs.close(1011, 'Connection timeout');
                }
            }
        }, 10000); // 10 second timeout
    }

    async stop() {
        logger.info('🛑 Stopping Hardware WebSocket Proxy...');
        
        for (const [serviceName, { server, wss }] of this.servers) {
            try {
                wss.close();
                server.close();
                logger.info(`✅ ${serviceName} proxy stopped`);
            } catch (error) {
                logger.error(`❌ Error stopping ${serviceName} proxy:`, error);
            }
        }
        
        this.servers.clear();
        logger.info('✅ Hardware WebSocket Proxy stopped');
    }

    getProxyPorts() {
        return this.proxyPorts;
    }
}

module.exports = HardwareWebSocketProxy;

// If run directly, start the proxy
if (require.main === module) {
    const proxy = new HardwareWebSocketProxy();
    
    proxy.start().then((success) => {
        if (success) {
            logger.info('🎉 Hardware WebSocket Proxy is running!');
            
            // Handle shutdown
            process.on('SIGINT', async () => {
                logger.info('⚠️ Received SIGINT, shutting down...');
                await proxy.stop();
                process.exit(0);
            });
            
            process.on('SIGTERM', async () => {
                logger.info('⚠️ Received SIGTERM, shutting down...');
                await proxy.stop();
                process.exit(0);
            });
        } else {
            logger.error('❌ Failed to start Hardware WebSocket Proxy');
            process.exit(1);
        }
    });
}
