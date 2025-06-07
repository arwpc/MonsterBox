/**
 * MonsterBox Browser Log Collector
 * 
 * Collects browser console logs, errors, and network issues
 * and sends them to the MonsterBox log collection system
 */

class MonsterBoxLogCollector {
    constructor(options = {}) {
        this.options = {
            endpoint: '/logs/browser',
            batchSize: 10,
            flushInterval: 5000, // 5 seconds
            maxRetries: 3,
            ...options
        };
        
        this.logs = [];
        this.isCollecting = false;
        this.retryCount = 0;
        
        this.init();
    }

    init() {
        this.setupConsoleInterception();
        this.setupErrorHandling();
        this.setupNetworkMonitoring();
        this.setupPerformanceMonitoring();
        this.startBatchFlush();
        
        console.log('🎃 MonsterBox Log Collector initialized');
    }

    setupConsoleInterception() {
        const originalConsole = { ...console };
        
        ['log', 'info', 'warn', 'error', 'debug'].forEach(level => {
            console[level] = (...args) => {
                // Call original console method
                originalConsole[level](...args);
                
                // Collect the log
                this.addLog({
                    type: 'console',
                    level: level,
                    message: args.map(arg => 
                        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
                    ).join(' '),
                    timestamp: new Date().toISOString(),
                    url: window.location.href,
                    userAgent: navigator.userAgent
                });
            };
        });
    }

    setupErrorHandling() {
        // Global error handler
        window.addEventListener('error', (event) => {
            this.addLog({
                type: 'javascript_error',
                message: event.message,
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                stack: event.error ? event.error.stack : null,
                timestamp: new Date().toISOString(),
                url: window.location.href
            });
        });

        // Unhandled promise rejection handler
        window.addEventListener('unhandledrejection', (event) => {
            this.addLog({
                type: 'promise_rejection',
                message: event.reason ? event.reason.toString() : 'Unhandled promise rejection',
                stack: event.reason && event.reason.stack ? event.reason.stack : null,
                timestamp: new Date().toISOString(),
                url: window.location.href
            });
        });
    }

    setupNetworkMonitoring() {
        // Monitor fetch requests
        const originalFetch = window.fetch;
        window.fetch = async (...args) => {
            const startTime = performance.now();
            const url = args[0];
            
            try {
                const response = await originalFetch(...args);
                const endTime = performance.now();
                
                this.addLog({
                    type: 'network_request',
                    method: args[1]?.method || 'GET',
                    url: url,
                    status: response.status,
                    statusText: response.statusText,
                    duration: endTime - startTime,
                    timestamp: new Date().toISOString(),
                    success: response.ok
                });
                
                return response;
            } catch (error) {
                const endTime = performance.now();
                
                this.addLog({
                    type: 'network_error',
                    method: args[1]?.method || 'GET',
                    url: url,
                    error: error.message,
                    duration: endTime - startTime,
                    timestamp: new Date().toISOString(),
                    success: false
                });
                
                throw error;
            }
        };

        // Monitor XMLHttpRequest
        const originalXHR = window.XMLHttpRequest;
        window.XMLHttpRequest = function() {
            const xhr = new originalXHR();
            const originalOpen = xhr.open;
            const originalSend = xhr.send;
            
            let method, url, startTime;
            
            xhr.open = function(m, u, ...args) {
                method = m;
                url = u;
                return originalOpen.call(this, m, u, ...args);
            };
            
            xhr.send = function(...args) {
                startTime = performance.now();
                
                xhr.addEventListener('loadend', () => {
                    const endTime = performance.now();
                    
                    window.monsterBoxLogCollector.addLog({
                        type: 'xhr_request',
                        method: method,
                        url: url,
                        status: xhr.status,
                        statusText: xhr.statusText,
                        duration: endTime - startTime,
                        timestamp: new Date().toISOString(),
                        success: xhr.status >= 200 && xhr.status < 300
                    });
                });
                
                return originalSend.call(this, ...args);
            };
            
            return xhr;
        };
    }

    setupPerformanceMonitoring() {
        // Monitor page load performance
        window.addEventListener('load', () => {
            setTimeout(() => {
                const perfData = performance.getEntriesByType('navigation')[0];
                
                this.addLog({
                    type: 'performance',
                    metric: 'page_load',
                    loadTime: perfData.loadEventEnd - perfData.loadEventStart,
                    domContentLoaded: perfData.domContentLoadedEventEnd - perfData.domContentLoadedEventStart,
                    firstPaint: performance.getEntriesByType('paint').find(p => p.name === 'first-paint')?.startTime,
                    firstContentfulPaint: performance.getEntriesByType('paint').find(p => p.name === 'first-contentful-paint')?.startTime,
                    timestamp: new Date().toISOString(),
                    url: window.location.href
                });
            }, 1000);
        });

        // Monitor resource loading
        const observer = new PerformanceObserver((list) => {
            list.getEntries().forEach((entry) => {
                if (entry.entryType === 'resource') {
                    this.addLog({
                        type: 'resource_timing',
                        name: entry.name,
                        duration: entry.duration,
                        size: entry.transferSize,
                        timestamp: new Date().toISOString()
                    });
                }
            });
        });
        
        observer.observe({ entryTypes: ['resource'] });
    }

    addLog(logEntry) {
        this.logs.push(logEntry);
        
        // Flush immediately for errors
        if (logEntry.type.includes('error') || logEntry.level === 'error') {
            this.flush();
        }
        
        // Flush if batch size reached
        if (this.logs.length >= this.options.batchSize) {
            this.flush();
        }
    }

    startBatchFlush() {
        setInterval(() => {
            if (this.logs.length > 0) {
                this.flush();
            }
        }, this.options.flushInterval);
    }

    async flush() {
        if (this.logs.length === 0 || this.isCollecting) {
            return;
        }

        this.isCollecting = true;
        const logsToSend = [...this.logs];
        this.logs = [];

        try {
            const response = await fetch(this.options.endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    logs: logsToSend,
                    session: this.getSessionInfo(),
                    timestamp: new Date().toISOString()
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            this.retryCount = 0;
            console.debug(`📤 Sent ${logsToSend.length} logs to MonsterBox`);
            
        } catch (error) {
            console.error('Failed to send logs to MonsterBox:', error);
            
            // Retry logic
            if (this.retryCount < this.options.maxRetries) {
                this.retryCount++;
                this.logs.unshift(...logsToSend); // Put logs back
                setTimeout(() => this.flush(), 1000 * this.retryCount);
            }
        } finally {
            this.isCollecting = false;
        }
    }

    getSessionInfo() {
        return {
            sessionId: this.getOrCreateSessionId(),
            url: window.location.href,
            userAgent: navigator.userAgent,
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight
            },
            screen: {
                width: screen.width,
                height: screen.height
            },
            timestamp: new Date().toISOString()
        };
    }

    getOrCreateSessionId() {
        let sessionId = sessionStorage.getItem('monsterbox-session-id');
        if (!sessionId) {
            sessionId = 'mb-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
            sessionStorage.setItem('monsterbox-session-id', sessionId);
        }
        return sessionId;
    }

    // Manual log collection methods
    logEvent(eventName, data = {}) {
        this.addLog({
            type: 'custom_event',
            event: eventName,
            data: data,
            timestamp: new Date().toISOString(),
            url: window.location.href
        });
    }

    logUserAction(action, element = null) {
        this.addLog({
            type: 'user_action',
            action: action,
            element: element ? {
                tagName: element.tagName,
                id: element.id,
                className: element.className,
                textContent: element.textContent?.substring(0, 100)
            } : null,
            timestamp: new Date().toISOString(),
            url: window.location.href
        });
    }

    // Get current logs (for debugging)
    getCurrentLogs() {
        return [...this.logs];
    }

    // Clear logs
    clearLogs() {
        this.logs = [];
    }

    // Enhanced streaming debugging methods for MCP integration
    enableStreamingDebugMode() {
        this.streamingDebugMode = true;
        console.log('🎥 Streaming debug mode enabled for MCP collection');

        // Monitor video elements
        this.monitorVideoElements();

        // Monitor WebRTC connections
        this.monitorWebRTCConnections();

        // Monitor streaming API calls
        this.monitorStreamingAPIs();
    }

    monitorVideoElements() {
        const videos = document.querySelectorAll('video, img[src*="streaming"]');
        videos.forEach((element, index) => {
            const elementId = `video_${index}`;

            if (element.tagName === 'VIDEO') {
                element.addEventListener('loadstart', () => {
                    this.addLog({
                        type: 'video_event',
                        event: 'loadstart',
                        elementId: elementId,
                        src: element.src,
                        timestamp: new Date().toISOString()
                    });
                });

                element.addEventListener('error', (e) => {
                    this.addLog({
                        type: 'video_error',
                        event: 'error',
                        elementId: elementId,
                        error: e.message || 'Video load error',
                        src: element.src,
                        timestamp: new Date().toISOString()
                    });
                });

                element.addEventListener('canplay', () => {
                    this.addLog({
                        type: 'video_event',
                        event: 'canplay',
                        elementId: elementId,
                        videoWidth: element.videoWidth,
                        videoHeight: element.videoHeight,
                        timestamp: new Date().toISOString()
                    });
                });
            }

            if (element.tagName === 'IMG' && element.src.includes('streaming')) {
                element.addEventListener('load', () => {
                    this.addLog({
                        type: 'stream_image_event',
                        event: 'load',
                        elementId: elementId,
                        src: element.src,
                        naturalWidth: element.naturalWidth,
                        naturalHeight: element.naturalHeight,
                        timestamp: new Date().toISOString()
                    });
                });

                element.addEventListener('error', () => {
                    this.addLog({
                        type: 'stream_image_error',
                        event: 'error',
                        elementId: elementId,
                        src: element.src,
                        timestamp: new Date().toISOString()
                    });
                });
            }
        });
    }

    monitorWebRTCConnections() {
        // Monitor RTCPeerConnection if available
        if (window.RTCPeerConnection) {
            const originalRTCPeerConnection = window.RTCPeerConnection;
            window.RTCPeerConnection = function(...args) {
                const pc = new originalRTCPeerConnection(...args);
                const connectionId = 'rtc_' + Date.now();

                pc.addEventListener('connectionstatechange', () => {
                    window.monsterBoxLogCollector.addLog({
                        type: 'webrtc_connection',
                        event: 'connectionstatechange',
                        connectionId: connectionId,
                        state: pc.connectionState,
                        timestamp: new Date().toISOString()
                    });
                });

                pc.addEventListener('iceconnectionstatechange', () => {
                    window.monsterBoxLogCollector.addLog({
                        type: 'webrtc_ice',
                        event: 'iceconnectionstatechange',
                        connectionId: connectionId,
                        state: pc.iceConnectionState,
                        timestamp: new Date().toISOString()
                    });
                });

                return pc;
            };
        }
    }

    monitorStreamingAPIs() {
        // Monitor streaming-specific API calls
        const streamingEndpoints = [
            '/api/streaming/start',
            '/api/streaming/stop',
            '/api/streaming/stream',
            '/api/streaming/status',
            '/api/streaming/health'
        ];

        // Enhanced fetch monitoring for streaming
        const originalFetch = window.fetch;
        window.fetch = async (...args) => {
            const url = args[0];
            const isStreamingAPI = streamingEndpoints.some(endpoint =>
                url.toString().includes(endpoint)
            );

            if (isStreamingAPI && this.streamingDebugMode) {
                const startTime = performance.now();

                try {
                    const response = await originalFetch(...args);
                    const endTime = performance.now();

                    // Log detailed streaming API response
                    this.addLog({
                        type: 'streaming_api_call',
                        method: args[1]?.method || 'GET',
                        url: url,
                        status: response.status,
                        statusText: response.statusText,
                        duration: endTime - startTime,
                        headers: Object.fromEntries(response.headers.entries()),
                        timestamp: new Date().toISOString(),
                        success: response.ok
                    });

                    return response;
                } catch (error) {
                    const endTime = performance.now();

                    this.addLog({
                        type: 'streaming_api_error',
                        method: args[1]?.method || 'GET',
                        url: url,
                        error: error.message,
                        duration: endTime - startTime,
                        timestamp: new Date().toISOString(),
                        success: false
                    });

                    throw error;
                }
            }

            return originalFetch(...args);
        };
    }

    // MCP Chrome Extension integration
    connectToMCPExtension() {
        try {
            // Check if Chrome extension APIs are available
            if (typeof chrome !== 'undefined' && chrome.runtime) {
                this.addLog({
                    type: 'mcp_extension',
                    event: 'attempting_connection',
                    extensionId: this.mcpExtensionId,
                    timestamp: new Date().toISOString()
                });

                // Send message to MCP extension
                chrome.runtime.sendMessage(this.mcpExtensionId, {
                    type: 'MONSTERBOX_DEBUG_INIT',
                    data: {
                        sessionId: this.getOrCreateSessionId(),
                        url: window.location.href,
                        debugMode: this.streamingDebugMode
                    }
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        this.addLog({
                            type: 'mcp_extension_error',
                            error: chrome.runtime.lastError.message,
                            timestamp: new Date().toISOString()
                        });
                    } else {
                        this.mcpConnected = true;
                        this.addLog({
                            type: 'mcp_extension',
                            event: 'connected',
                            response: response,
                            timestamp: new Date().toISOString()
                        });
                    }
                });
            }
        } catch (error) {
            this.addLog({
                type: 'mcp_extension_error',
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    // Send debug data to MCP extension
    sendToMCPExtension(data) {
        if (this.mcpConnected && typeof chrome !== 'undefined' && chrome.runtime) {
            try {
                chrome.runtime.sendMessage(this.mcpExtensionId, {
                    type: 'MONSTERBOX_DEBUG_DATA',
                    data: data,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                console.debug('MCP Extension communication error:', error);
            }
        }
    }
}

// Auto-initialize when script loads
document.addEventListener('DOMContentLoaded', () => {
    window.monsterBoxLogCollector = new MonsterBoxLogCollector();

    // Enable streaming debug mode for streaming-related pages
    const streamingPages = ['/webrtc-test.html', '/stream-test.html', '/streaming'];
    if (streamingPages.some(page => window.location.pathname.includes(page))) {
        window.monsterBoxLogCollector.enableStreamingDebugMode();
        console.log('🎥 Streaming debug mode auto-enabled for', window.location.pathname);
    }

    // Connect to MCP Chrome Extension
    setTimeout(() => {
        window.monsterBoxLogCollector.connectToMCPExtension();
    }, 1000);

    // Add some MonsterBox-specific event tracking
    document.addEventListener('click', (event) => {
        if (event.target.matches('.scene-button, .character-button, .part-control, .btn, button')) {
            window.monsterBoxLogCollector.logUserAction('click', event.target);

            // Send to MCP extension for streaming-related buttons
            if (event.target.textContent.toLowerCase().includes('stream') ||
                event.target.id.toLowerCase().includes('stream')) {
                window.monsterBoxLogCollector.sendToMCPExtension({
                    type: 'streaming_button_click',
                    button: event.target.textContent,
                    id: event.target.id,
                    className: event.target.className
                });
            }
        }
    });

    // Track scene changes
    if (window.location.pathname.includes('/scene')) {
        window.monsterBoxLogCollector.logEvent('scene_view', {
            sceneId: new URLSearchParams(window.location.search).get('id')
        });
    }

    // Track streaming page visits
    if (window.location.pathname.includes('stream') || window.location.pathname.includes('webrtc')) {
        window.monsterBoxLogCollector.logEvent('streaming_page_visit', {
            page: window.location.pathname,
            search: window.location.search
        });
    }
});

// Export for manual use
window.MonsterBoxLogCollector = MonsterBoxLogCollector;
