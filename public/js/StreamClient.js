/**
 * WebRTC Stream Client for MonsterBox
 * Handles client-side WebRTC streaming with automatic recovery and stats monitoring
 */

// Import webrtc-adapter for cross-browser compatibility
// Note: Using script tag instead of ES6 import for webrtc-adapter
// The adapter will be available globally as 'adapter'

class StreamClient extends EventEmitter {
    constructor(options = {}) {
        super();
        
        // Configuration
        this.characterId = options.characterId;
        this.streamUrl = options.streamUrl;
        this.autoReconnect = options.autoReconnect !== false;
        this.reconnectDelay = options.reconnectDelay || 3000;
        this.maxReconnectAttempts = options.maxReconnectAttempts || 10;
        this.statsInterval = options.statsInterval || 5000;
        
        // State management
        this.isConnected = false;
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.connectionId = null;
        this.startTime = null;
        
        // WebRTC components
        this.peerConnection = null;
        this.localStream = null;
        this.remoteStream = null;
        this.dataChannel = null;
        
        // Statistics
        this.stats = {
            bytesReceived: 0,
            packetsReceived: 0,
            packetsLost: 0,
            framesReceived: 0,
            framesDropped: 0,
            currentRoundTripTime: 0,
            availableIncomingBitrate: 0
        };
        
        // Timers
        this.reconnectTimer = null;
        this.statsTimer = null;
        this.heartbeatTimer = null;
        
        // Initialize
        this.initializeWebRTC();
    }

    /**
     * Initialize WebRTC configuration
     */
    initializeWebRTC() {
        // ICE servers configuration
        this.iceServers = [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ];
        
        // WebRTC configuration
        this.rtcConfiguration = {
            iceServers: this.iceServers,
            iceCandidatePoolSize: 10,
            bundlePolicy: 'max-bundle',
            rtcpMuxPolicy: 'require'
        };
        
        console.log('StreamClient initialized with adapter:', adapter.browserDetails);
    }

    /**
     * Connect to stream
     * @param {HTMLVideoElement} videoElement - Video element to attach stream
     * @returns {Promise<boolean>} Connection success
     */
    async connect(videoElement) {
        if (this.isConnecting || this.isConnected) {
            console.warn('Already connecting or connected');
            return false;
        }
        
        this.isConnecting = true;
        this.videoElement = videoElement;
        this.startTime = new Date();
        
        try {
            // For now, use MJPEG fallback since full WebRTC requires signaling server
            // This provides immediate functionality while WebRTC infrastructure is built
            await this.connectMJPEG();
            
            this.isConnected = true;
            this.isConnecting = false;
            this.reconnectAttempts = 0;
            
            this.startStatsMonitoring();
            this.startHeartbeat();
            
            this.emit('connected', {
                connectionId: this.connectionId,
                characterId: this.characterId
            });
            
            return true;
            
        } catch (error) {
            console.error('Connection failed:', error);
            this.isConnecting = false;
            
            if (this.autoReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
                this.scheduleReconnect();
            } else {
                this.emit('connectionFailed', { error: error.message });
            }
            
            return false;
        }
    }

    /**
     * Connect using MJPEG stream (fallback method)
     */
    async connectMJPEG() {
        return new Promise((resolve, reject) => {
            if (!this.videoElement) {
                reject(new Error('No video element provided'));
                return;
            }
            
            // Generate connection ID
            this.connectionId = `mjpeg_${this.characterId}_${Date.now()}`;
            
            // Create image element for MJPEG stream
            const img = document.createElement('img');
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'contain';
            
            // Set up stream URL with cache busting
            const streamUrl = `/api/streaming/stream/${this.characterId}?t=${Date.now()}`;
            
            img.onload = () => {
                // Replace video element content with image
                this.videoElement.style.display = 'none';
                this.videoElement.parentNode.insertBefore(img, this.videoElement);
                this.streamImage = img;
                
                console.log(`MJPEG stream connected for character ${this.characterId}`);
                resolve();
            };
            
            img.onerror = (error) => {
                console.error('MJPEG stream failed:', error);
                reject(new Error('Failed to load MJPEG stream'));
            };
            
            img.src = streamUrl;
        });
    }

    /**
     * Disconnect from stream
     */
    disconnect() {
        this.isConnected = false;
        this.isConnecting = false;
        
        // Clear timers
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        
        if (this.statsTimer) {
            clearInterval(this.statsTimer);
            this.statsTimer = null;
        }
        
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
        
        // Clean up MJPEG stream
        if (this.streamImage) {
            this.streamImage.remove();
            this.streamImage = null;
        }
        
        // Show video element again
        if (this.videoElement) {
            this.videoElement.style.display = 'block';
        }
        
        // Clean up WebRTC (for future implementation)
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        
        this.emit('disconnected', {
            connectionId: this.connectionId,
            characterId: this.characterId,
            sessionDuration: this.startTime ? new Date() - this.startTime : 0
        });
        
        console.log(`Stream disconnected for character ${this.characterId}`);
    }

    /**
     * Schedule reconnection attempt
     */
    scheduleReconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }
        
        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1); // Exponential backoff
        
        console.log(`Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
        
        this.reconnectTimer = setTimeout(() => {
            if (this.videoElement) {
                this.connect(this.videoElement);
            }
        }, delay);
        
        this.emit('reconnecting', {
            attempt: this.reconnectAttempts,
            maxAttempts: this.maxReconnectAttempts,
            delay: delay
        });
    }

    /**
     * Start statistics monitoring
     */
    startStatsMonitoring() {
        if (this.statsTimer) {
            clearInterval(this.statsTimer);
        }
        
        this.statsTimer = setInterval(() => {
            this.updateStats();
        }, this.statsInterval);
    }

    /**
     * Update connection statistics
     */
    updateStats() {
        // For MJPEG, we'll track basic metrics
        const now = new Date();
        const sessionDuration = this.startTime ? now - this.startTime : 0;
        
        const currentStats = {
            connectionId: this.connectionId,
            characterId: this.characterId,
            isConnected: this.isConnected,
            sessionDuration: sessionDuration,
            reconnectAttempts: this.reconnectAttempts,
            connectionType: 'mjpeg',
            timestamp: now
        };
        
        this.emit('stats', currentStats);
    }

    /**
     * Start heartbeat monitoring
     */
    startHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
        }
        
        this.heartbeatTimer = setInterval(() => {
            if (this.isConnected) {
                // Check if stream is still alive
                this.checkStreamHealth();
            }
        }, 10000); // Check every 10 seconds
    }

    /**
     * Check stream health
     */
    async checkStreamHealth() {
        try {
            const response = await fetch(`/api/streaming/health/${this.characterId}`);
            const health = await response.json();
            
            if (!health.success || !health.health.streamActive) {
                console.warn('Stream health check failed, attempting reconnect');
                this.disconnect();
                if (this.autoReconnect) {
                    this.scheduleReconnect();
                }
            }
        } catch (error) {
            console.error('Health check failed:', error);
        }
    }

    /**
     * Get current connection statistics
     * @returns {Object} Current statistics
     */
    getStats() {
        return {
            ...this.stats,
            isConnected: this.isConnected,
            connectionId: this.connectionId,
            sessionDuration: this.startTime ? new Date() - this.startTime : 0,
            reconnectAttempts: this.reconnectAttempts
        };
    }

    /**
     * Set auto-reconnect behavior
     * @param {boolean} enabled - Enable auto-reconnect
     */
    setAutoReconnect(enabled) {
        this.autoReconnect = enabled;
        console.log(`Auto-reconnect ${enabled ? 'enabled' : 'disabled'}`);
    }
}

// Simple EventEmitter implementation for browser
class EventEmitter {
    constructor() {
        this.events = {};
    }
    
    on(event, listener) {
        if (!this.events[event]) {
            this.events[event] = [];
        }
        this.events[event].push(listener);
    }
    
    emit(event, data) {
        if (this.events[event]) {
            this.events[event].forEach(listener => listener(data));
        }
    }
    
    off(event, listener) {
        if (this.events[event]) {
            this.events[event] = this.events[event].filter(l => l !== listener);
        }
    }
}

export default StreamClient;
