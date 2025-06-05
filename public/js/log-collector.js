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
}

// Auto-initialize when script loads
document.addEventListener('DOMContentLoaded', () => {
    window.monsterBoxLogCollector = new MonsterBoxLogCollector();
    
    // Add some MonsterBox-specific event tracking
    document.addEventListener('click', (event) => {
        if (event.target.matches('.scene-button, .character-button, .part-control')) {
            window.monsterBoxLogCollector.logUserAction('click', event.target);
        }
    });
    
    // Track scene changes
    if (window.location.pathname.includes('/scene')) {
        window.monsterBoxLogCollector.logEvent('scene_view', {
            sceneId: new URLSearchParams(window.location.search).get('id')
        });
    }
});

// Export for manual use
window.MonsterBoxLogCollector = MonsterBoxLogCollector;
