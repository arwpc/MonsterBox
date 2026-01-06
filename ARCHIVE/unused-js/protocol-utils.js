/**
 * Protocol Detection and URL Generation Utilities for MonsterBox
 * Provides automatic HTTP/HTTPS and WS/WSS protocol detection and URL generation
 */

class ProtocolUtils {
    constructor() {
        this.isHttps = window.location.protocol === 'https:';
        this.hostname = window.location.hostname;
        this.httpPort = this.isHttps ? 3443 : 3000;
        this.basePort = parseInt(window.location.port) || (this.isHttps ? 3443 : 3000);
        
        // SSL port mappings for WebSocket services
        this.sslPortMappings = {
            8765: 8765, // Jaw WebSocket Server (WSS uses same port)
            8766: 8766, // AI Bridge WebSocket (WSS uses same port)
            8767: 8767, // Chat WebSocket (WSS uses same port)
            8768: 8768, // Video Stream WebSocket (WSS uses same port)
            8769: 8769, // Audio Stream WebSocket (WSS uses same port)
            8770: 8770, // Service Registry (WSS uses same port)
            8771: 8771, // Motor Service (WSS uses same port)
            8772: 8772, // Light Service (WSS uses same port)
            8776: 8776, // Microphone Service (WSS uses same port)
            8777: 8777, // Audio Stream Service (WSS uses same port)
            8778: 8778, // Head Tracking Service (WSS uses same port)
            8780: 8780, // Main Hardware Server (WSS uses same port)
            8781: 8781, // Log Aggregation Service (WSS uses same port)
            8790: 8790, // Hardware Proxy Services (WSS uses same port)
            8791: 8791,
            8792: 8792,
            8793: 8793,
            8794: 8794,
            8795: 8795
        };
        
        console.log(`🔗 Protocol Utils initialized: ${this.isHttps ? 'HTTPS' : 'HTTP'} mode`);
        console.log(`🏠 Hostname: ${this.hostname}, Base Port: ${this.basePort}`);
    }
    
    /**
     * Get the appropriate HTTP protocol (http or https)
     */
    getHttpProtocol() {
        return this.isHttps ? 'https:' : 'http:';
    }
    
    /**
     * Get the appropriate WebSocket protocol (ws or wss)
     */
    getWebSocketProtocol() {
        return this.isHttps ? 'wss:' : 'ws:';
    }
    
    /**
     * Generate HTTP URL with automatic protocol detection
     * @param {string} path - The path (e.g., '/api/status')
     * @param {number} port - Optional port override
     * @param {string} hostname - Optional hostname override
     */
    getHttpUrl(path = '', port = null, hostname = null) {
        const protocol = this.getHttpProtocol();
        const host = hostname || this.hostname;
        const targetPort = port || this.httpPort;
        
        // Remove leading slash if present in path
        const cleanPath = path.startsWith('/') ? path : `/${path}`;
        
        return `${protocol}//${host}:${targetPort}${cleanPath}`;
    }
    
    /**
     * Generate WebSocket URL with automatic protocol detection
     * @param {number} port - WebSocket port
     * @param {string} path - Optional path (e.g., '/ws')
     * @param {string} hostname - Optional hostname override
     */
    getWebSocketUrl(port, path = '', hostname = null) {
        const protocol = this.getWebSocketProtocol();
        const host = hostname || this.hostname;
        
        // Use SSL port mapping if in HTTPS mode
        const targetPort = this.isHttps ? (this.sslPortMappings[port] || port) : port;
        
        // Remove leading slash if present in path
        const cleanPath = path.startsWith('/') ? path : (path ? `/${path}` : '');
        
        return `${protocol}//${host}:${targetPort}${cleanPath}`;
    }
    
    /**
     * Generate WebSocket URL for the current page's server
     * @param {string} path - WebSocket path (e.g., '/ws', '/audiostream')
     */
    getPageWebSocketUrl(path = '') {
        const protocol = this.getWebSocketProtocol();
        const cleanPath = path.startsWith('/') ? path : (path ? `/${path}` : '');
        
        return `${protocol}//${this.hostname}:${this.basePort}${cleanPath}`;
    }
    
    /**
     * Test WebSocket connection with fallback
     * @param {number} primaryPort - Primary WebSocket port to try
     * @param {number} fallbackPort - Fallback port if primary fails
     * @param {string} path - Optional path
     * @param {number} timeout - Connection timeout in milliseconds
     */
    async testWebSocketConnection(primaryPort, fallbackPort = null, path = '', timeout = 5000) {
        const primaryUrl = this.getWebSocketUrl(primaryPort, path);
        
        try {
            console.log(`🔍 Testing WebSocket connection: ${primaryUrl}`);
            const ws = await this.createWebSocketWithTimeout(primaryUrl, timeout);
            console.log(`✅ WebSocket connection successful: ${primaryUrl}`);
            return { websocket: ws, url: primaryUrl, port: primaryPort };
        } catch (error) {
            console.warn(`⚠️ Primary WebSocket connection failed: ${error.message}`);
            
            if (fallbackPort && fallbackPort !== primaryPort) {
                const fallbackUrl = this.getWebSocketUrl(fallbackPort, path);
                try {
                    console.log(`🔄 Trying fallback WebSocket connection: ${fallbackUrl}`);
                    const ws = await this.createWebSocketWithTimeout(fallbackUrl, timeout);
                    console.log(`✅ Fallback WebSocket connection successful: ${fallbackUrl}`);
                    return { websocket: ws, url: fallbackUrl, port: fallbackPort };
                } catch (fallbackError) {
                    console.error(`❌ Fallback WebSocket connection failed: ${fallbackError.message}`);
                    throw new Error(`Both primary (${primaryPort}) and fallback (${fallbackPort}) WebSocket connections failed`);
                }
            } else {
                throw error;
            }
        }
    }
    
    /**
     * Create WebSocket connection with timeout
     * @param {string} url - WebSocket URL
     * @param {number} timeout - Timeout in milliseconds
     */
    createWebSocketWithTimeout(url, timeout = 5000) {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(url);
            let timeoutId;
            
            const cleanup = () => {
                if (timeoutId) {
                    clearTimeout(timeoutId);
                }
            };
            
            timeoutId = setTimeout(() => {
                cleanup();
                ws.close();
                reject(new Error(`WebSocket connection timeout after ${timeout}ms`));
            }, timeout);
            
            ws.onopen = () => {
                cleanup();
                resolve(ws);
            };
            
            ws.onerror = (error) => {
                cleanup();
                reject(new Error(`WebSocket connection error: ${error.message || 'Unknown error'}`));
            };
            
            ws.onclose = (event) => {
                cleanup();
                if (event.code !== 1000) { // Not a normal closure
                    reject(new Error(`WebSocket connection closed unexpectedly: ${event.code} ${event.reason}`));
                }
            };
        });
    }
    
    /**
     * Get streaming URL for video/audio content
     * @param {string} characterId - Character ID
     * @param {string} streamType - Stream type ('video', 'audio', 'mjpeg')
     */
    getStreamingUrl(characterId, streamType = 'mjpeg') {
        const path = `/api/streaming/stream/${characterId}`;
        const timestamp = Date.now();
        return this.getHttpUrl(`${path}?type=${streamType}&t=${timestamp}`);
    }
    
    /**
     * Get API URL with automatic protocol detection
     * @param {string} endpoint - API endpoint (e.g., 'status', 'config')
     * @param {object} params - Query parameters
     */
    getApiUrl(endpoint, params = {}) {
        const path = `/api/${endpoint}`;
        const queryString = Object.keys(params).length > 0 
            ? '?' + new URLSearchParams(params).toString()
            : '';
        
        return this.getHttpUrl(`${path}${queryString}`);
    }
    
    /**
     * Check if SSL/HTTPS is available by testing the HTTPS endpoint
     */
    async checkHttpsAvailability() {
        if (!this.isHttps) {
            try {
                const httpsUrl = `https://${this.hostname}:3443/health`;
                const response = await fetch(httpsUrl, { 
                    method: 'GET',
                    timeout: 3000,
                    // Accept self-signed certificates
                    mode: 'cors'
                });
                return response.ok;
            } catch (error) {
                console.log('HTTPS not available:', error.message);
                return false;
            }
        }
        return true;
    }
    
    /**
     * Get connection info for debugging
     */
    getConnectionInfo() {
        return {
            protocol: this.getHttpProtocol(),
            wsProtocol: this.getWebSocketProtocol(),
            hostname: this.hostname,
            httpPort: this.httpPort,
            basePort: this.basePort,
            isHttps: this.isHttps,
            sslPortMappings: this.sslPortMappings
        };
    }
    
    /**
     * Log connection info to console
     */
    logConnectionInfo() {
        const info = this.getConnectionInfo();
        console.group('🔗 MonsterBox Connection Info');
        console.log('Protocol:', info.protocol);
        console.log('WebSocket Protocol:', info.wsProtocol);
        console.log('Hostname:', info.hostname);
        console.log('HTTP Port:', info.httpPort);
        console.log('Base Port:', info.basePort);
        console.log('HTTPS Mode:', info.isHttps);
        console.log('SSL Port Mappings:', info.sslPortMappings);
        console.groupEnd();
    }
}

// Create global instance
window.protocolUtils = new ProtocolUtils();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProtocolUtils;
}

// Log connection info on load
document.addEventListener('DOMContentLoaded', () => {
    window.protocolUtils.logConnectionInfo();
});

console.log('🔗 Protocol Utils loaded successfully');
