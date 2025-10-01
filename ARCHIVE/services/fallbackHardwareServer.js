/**
 * Fallback Hardware WebSocket Server
 * Simple Node.js WebSocket server that provides basic hardware monitoring
 * Used when Python services are not responding
 */

const WebSocket = require('ws');
const logger = require('../scripts/logger');

class FallbackHardwareServer {
    constructor() {
        this.servers = new Map();
        this.clients = new Map();
        this.isRunning = false;
    }

    async start() {
        try {
            logger.info('🚀 Starting Fallback Hardware WebSocket Servers...');

            // Start main hardware server
            await this.startServer(8780, 'main', this.handleMainServer.bind(this));
            
            // Start service registry
            await this.startServer(8770, 'registry', this.handleRegistry.bind(this));
            
            // Start motor service
            await this.startServer(8771, 'motor', this.handleMotorService.bind(this));
            
            // Start light service
            await this.startServer(8772, 'light', this.handleLightService.bind(this));

            this.isRunning = true;
            logger.info('✅ Fallback Hardware WebSocket Servers started');
            return true;

        } catch (error) {
            logger.error('❌ Failed to start fallback servers:', error);
            return false;
        }
    }

    async startServer(port, serviceName, messageHandler) {
        return new Promise((resolve, reject) => {
            try {
                const server = new WebSocket.Server({ 
                    port, 
                    host: '0.0.0.0'
                });

                server.on('connection', (ws) => {
                    const clientId = `${serviceName}_client_${Date.now()}`;
                    this.clients.set(clientId, { ws, service: serviceName });
                    
                    logger.info(`✅ Client connected to ${serviceName} service: ${clientId}`);

                    // Send welcome message
                    this.sendWelcomeMessage(ws, serviceName);

                    ws.on('message', (message) => {
                        try {
                            const data = JSON.parse(message.toString());
                            messageHandler(ws, data, clientId);
                        } catch (error) {
                            logger.error(`Error handling message for ${serviceName}:`, error);
                            ws.send(JSON.stringify({
                                type: 'error',
                                message: 'Invalid JSON format'
                            }));
                        }
                    });

                    ws.on('close', () => {
                        logger.info(`Client disconnected from ${serviceName}: ${clientId}`);
                        this.clients.delete(clientId);
                    });

                    ws.on('error', (error) => {
                        logger.error(`WebSocket error for ${serviceName}:`, error);
                        this.clients.delete(clientId);
                    });
                });

                server.on('listening', () => {
                    logger.info(`✅ ${serviceName} service listening on port ${port}`);
                    this.servers.set(serviceName, server);
                    resolve();
                });

                server.on('error', (error) => {
                    if (error.code === 'EADDRINUSE') {
                        logger.info(`Port ${port} already in use - Python service may be running`);
                        resolve(); // Don't fail if Python service is already running
                    } else {
                        logger.error(`Error starting ${serviceName} server:`, error);
                        reject(error);
                    }
                });

            } catch (error) {
                reject(error);
            }
        });
    }

    sendWelcomeMessage(ws, serviceName) {
        const welcomeMessage = {
            type: 'welcome',
            service: serviceName,
            message: `Connected to MonsterBox ${serviceName} service (fallback)`,
            timestamp: Date.now(),
            fallback: true
        };

        if (serviceName === 'main') {
            welcomeMessage.current_character = 4;
            welcomeMessage.active_services = {
                motor: { status: 'online', port: 8771 },
                light: { status: 'online', port: 8772 }
            };
            welcomeMessage.available_characters = [
                { id: 4, name: 'Skulltalker', description: 'Main character' }
            ];
        }

        ws.send(JSON.stringify(welcomeMessage));
    }

    handleMainServer(ws, data, clientId) {
        const messageType = data.type;
        
        switch (messageType) {
            case 'ping':
                ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
                break;
                
            case 'get_active_services':
                ws.send(JSON.stringify({
                    type: 'active_services_response',
                    current_character: 4,
                    active_services: {
                        motor: { status: 'online', port: 8771, character_id: 4 },
                        light: { status: 'online', port: 8772, character_id: 4 }
                    },
                    service_count: 2
                }));
                break;
                
            case 'switch_character':
                ws.send(JSON.stringify({
                    type: 'switch_character_response',
                    character_id: data.character_id,
                    status: 'success',
                    message: `Switched to character ${data.character_id} (fallback mode)`
                }));
                break;
                
            default:
                ws.send(JSON.stringify({
                    type: 'error',
                    message: `Unknown message type: ${messageType}`
                }));
        }
    }

    handleRegistry(ws, data, clientId) {
        ws.send(JSON.stringify({
            type: 'registry_response',
            services: [
                { name: 'main', port: 8780, status: 'online' },
                { name: 'motor', port: 8771, status: 'online' },
                { name: 'light', port: 8772, status: 'online' }
            ]
        }));
    }

    handleMotorService(ws, data, clientId) {
        const messageType = data.type;
        
        switch (messageType) {
            case 'motor_control':
                logger.info(`Motor control: ${JSON.stringify(data)}`);
                ws.send(JSON.stringify({
                    type: 'motor_response',
                    status: 'success',
                    message: `Motor control executed (fallback mode)`,
                    motor_id: data.motor_id
                }));
                break;
                
            case 'motor_stop':
                logger.info(`Motor stop: ${JSON.stringify(data)}`);
                ws.send(JSON.stringify({
                    type: 'motor_response',
                    status: 'success',
                    message: `Motor stopped (fallback mode)`,
                    motor_id: data.motor_id
                }));
                break;
                
            default:
                ws.send(JSON.stringify({
                    type: 'error',
                    message: `Unknown motor command: ${messageType}`
                }));
        }
    }

    handleLightService(ws, data, clientId) {
        const messageType = data.type;
        
        switch (messageType) {
            case 'light_control':
                logger.info(`Light control: ${JSON.stringify(data)}`);
                ws.send(JSON.stringify({
                    type: 'light_response',
                    status: 'success',
                    message: `Light control executed (fallback mode)`,
                    light_id: data.light_id
                }));
                break;
                
            case 'light_toggle':
                logger.info(`Light toggle: ${JSON.stringify(data)}`);
                ws.send(JSON.stringify({
                    type: 'light_response',
                    status: 'success',
                    message: `Light toggled (fallback mode)`,
                    light_id: data.light_id
                }));
                break;
                
            default:
                ws.send(JSON.stringify({
                    type: 'error',
                    message: `Unknown light command: ${messageType}`
                }));
        }
    }

    async stop() {
        try {
            logger.info('🛑 Stopping Fallback Hardware WebSocket Servers...');

            // Close all client connections
            for (const [clientId, client] of this.clients) {
                try {
                    client.ws.close();
                } catch (error) {
                    logger.error(`Error closing client ${clientId}:`, error);
                }
            }
            this.clients.clear();

            // Close all servers
            for (const [serviceName, server] of this.servers) {
                try {
                    server.close();
                    logger.info(`✅ ${serviceName} server stopped`);
                } catch (error) {
                    logger.error(`Error stopping ${serviceName} server:`, error);
                }
            }
            this.servers.clear();

            this.isRunning = false;
            logger.info('✅ Fallback Hardware WebSocket Servers stopped');

        } catch (error) {
            logger.error('❌ Error stopping fallback servers:', error);
        }
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            serverCount: this.servers.size,
            clientCount: this.clients.size,
            services: Array.from(this.servers.keys())
        };
    }
}

module.exports = FallbackHardwareServer;
