/**
 * MonsterBox Shared Streaming Service
 * Manages persistent video streaming across the entire application
 * Ensures streams stay active and are shared between components
 */

class SharedStreamingService {
    constructor() {
        this.activeStreams = new Map();
        this.streamHealthInterval = null;
        this.healthCheckInterval = 15000; // 15 seconds
        this.maxRetries = 3;
        this.retryDelay = 5000; // 5 seconds
        
        this.init();
    }

    init() {
        console.log('🎥 SharedStreamingService initialized');
        
        // Start health monitoring
        this.startHealthMonitoring();
        
        // Listen for page visibility changes
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                // Page became visible, check stream health
                this.checkAllStreamsHealth();
            }
        });
        
        // Cleanup on page unload
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });
    }

    // Start health monitoring for all active streams
    startHealthMonitoring() {
        if (this.streamHealthInterval) {
            clearInterval(this.streamHealthInterval);
        }
        
        this.streamHealthInterval = setInterval(() => {
            this.checkAllStreamsHealth();
        }, this.healthCheckInterval);
    }

    // Register a character stream
    async registerStream(characterId, options = {}) {
        const streamInfo = {
            characterId: characterId,
            isActive: false,
            retryCount: 0,
            lastHealthCheck: null,
            options: {
                autoRestart: true,
                quality: 'high',
                ...options
            }
        };

        this.activeStreams.set(characterId, streamInfo);
        
        // Ensure stream is started
        await this.ensureStreamActive(characterId);
        
        console.log(`📹 Registered stream for character ${characterId}`);
        return streamInfo;
    }

    // Unregister a character stream
    unregisterStream(characterId) {
        if (this.activeStreams.has(characterId)) {
            this.activeStreams.delete(characterId);
            console.log(`📹 Unregistered stream for character ${characterId}`);
        }
    }

    // Ensure a specific stream is active
    async ensureStreamActive(characterId) {
        const streamInfo = this.activeStreams.get(characterId);
        if (!streamInfo) return false;

        try {
            // Check current stream health
            const health = await this.checkStreamHealth(characterId);
            
            if (!health.streamActive) {
                console.log(`🔄 Starting stream for character ${characterId}`);
                const started = await this.startStream(characterId);
                
                if (started) {
                    streamInfo.isActive = true;
                    streamInfo.retryCount = 0;
                    streamInfo.lastHealthCheck = Date.now();
                    
                    // Notify components about stream start
                    this.notifyStreamEvent(characterId, 'started');
                    
                    return true;
                } else {
                    streamInfo.retryCount++;
                    return false;
                }
            } else {
                streamInfo.isActive = true;
                streamInfo.lastHealthCheck = Date.now();
                return true;
            }
        } catch (error) {
            console.error(`Error ensuring stream active for character ${characterId}:`, error);
            streamInfo.retryCount++;
            return false;
        }
    }

    // Start a stream
    async startStream(characterId) {
        try {
            const response = await fetch(`/api/streaming/start/${characterId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            const data = await response.json();
            
            if (data.success) {
                console.log(`✅ Stream started successfully for character ${characterId}`);
                return true;
            } else {
                console.error(`❌ Failed to start stream for character ${characterId}:`, data.error);
                return false;
            }
        } catch (error) {
            console.error(`❌ Error starting stream for character ${characterId}:`, error);
            return false;
        }
    }

    // Check stream health
    async checkStreamHealth(characterId) {
        try {
            const response = await fetch(`/api/streaming/health/${characterId}`);
            const data = await response.json();
            
            if (data.success) {
                return data.health;
            } else {
                return { streamActive: false, healthy: false };
            }
        } catch (error) {
            console.error(`Error checking stream health for character ${characterId}:`, error);
            return { streamActive: false, healthy: false };
        }
    }

    // Check health of all registered streams
    async checkAllStreamsHealth() {
        const promises = Array.from(this.activeStreams.keys()).map(async (characterId) => {
            const streamInfo = this.activeStreams.get(characterId);
            
            try {
                const health = await this.checkStreamHealth(characterId);
                
                if (!health.streamActive && streamInfo.options.autoRestart) {
                    if (streamInfo.retryCount < this.maxRetries) {
                        console.log(`🔄 Auto-restarting stream for character ${characterId} (attempt ${streamInfo.retryCount + 1})`);
                        await this.ensureStreamActive(characterId);
                    } else {
                        console.warn(`⚠️ Max retries reached for character ${characterId} stream`);
                        streamInfo.isActive = false;
                        this.notifyStreamEvent(characterId, 'failed');
                    }
                } else if (health.streamActive) {
                    streamInfo.isActive = true;
                    streamInfo.retryCount = 0;
                }
                
                streamInfo.lastHealthCheck = Date.now();
            } catch (error) {
                console.error(`Error in health check for character ${characterId}:`, error);
            }
        });

        await Promise.all(promises);
    }

    // Get stream URL for a character
    getStreamUrl(characterId, includeTimestamp = true) {
        const baseUrl = `/api/streaming/stream/${characterId}`;
        return includeTimestamp ? `${baseUrl}?t=${Date.now()}` : baseUrl;
    }

    // Get stream status for a character
    getStreamStatus(characterId) {
        const streamInfo = this.activeStreams.get(characterId);
        if (!streamInfo) {
            return { registered: false, active: false };
        }

        return {
            registered: true,
            active: streamInfo.isActive,
            retryCount: streamInfo.retryCount,
            lastHealthCheck: streamInfo.lastHealthCheck,
            options: streamInfo.options
        };
    }

    // Refresh a specific stream
    refreshStream(characterId) {
        const streamInfo = this.activeStreams.get(characterId);
        if (streamInfo) {
            // Notify components to refresh their video elements
            this.notifyStreamEvent(characterId, 'refresh');
            
            // Force health check
            this.ensureStreamActive(characterId);
        }
    }

    // Notify components about stream events
    notifyStreamEvent(characterId, eventType) {
        const event = new CustomEvent('monsterbox-stream-event', {
            detail: {
                characterId: characterId,
                eventType: eventType,
                timestamp: Date.now()
            }
        });
        
        document.dispatchEvent(event);
        
        // Also log to MCP if available
        if (window.monsterBoxLogCollector) {
            window.monsterBoxLogCollector.logEvent('shared_stream_event', {
                characterId: characterId,
                eventType: eventType,
                timestamp: Date.now()
            });
        }
    }

    // Get all active streams
    getAllStreams() {
        const streams = {};
        this.activeStreams.forEach((streamInfo, characterId) => {
            streams[characterId] = this.getStreamStatus(characterId);
        });
        return streams;
    }

    // Cleanup
    cleanup() {
        if (this.streamHealthInterval) {
            clearInterval(this.streamHealthInterval);
            this.streamHealthInterval = null;
        }
        
        console.log('🧹 SharedStreamingService cleaned up');
    }
}

// Create global instance
window.sharedStreamingService = new SharedStreamingService();

// Auto-register streams for characters found on the page
document.addEventListener('DOMContentLoaded', () => {
    // Look for video configuration components
    const videoComponents = document.querySelectorAll('.video-configuration-component[data-character-id]');
    
    videoComponents.forEach(component => {
        const characterId = component.dataset.characterId;
        if (characterId && characterId !== '') {
            window.sharedStreamingService.registerStream(parseInt(characterId));
        }
    });
    
    // Listen for stream events and update video elements
    document.addEventListener('monsterbox-stream-event', (event) => {
        const { characterId, eventType } = event.detail;
        
        if (eventType === 'refresh' || eventType === 'started') {
            // Find and refresh video elements for this character
            const videoElements = document.querySelectorAll(`img[src*="/api/streaming/stream/${characterId}"]`);
            videoElements.forEach(video => {
                const newSrc = window.sharedStreamingService.getStreamUrl(characterId);
                if (video.src !== newSrc) {
                    video.src = newSrc;
                }
            });
        }
    });
});

// Export for manual use
window.SharedStreamingService = SharedStreamingService;
