/**
 * Console Error Monitoring System for MonsterBox Webcam Operations
 * Captures JavaScript errors, network failures, and webcam-specific errors
 */

class ConsoleErrorMonitor {
    constructor(options = {}) {
        this.options = {
            enableConsoleCapture: true,
            enableNetworkCapture: true,
            enableWebcamSpecific: true,
            maxErrors: 100,
            reportingEndpoint: '/api/logs/browser-errors',
            autoReport: true,
            reportInterval: 30000, // 30 seconds
            ...options
        };

        this.errors = [];
        this.warnings = [];
        this.networkErrors = [];
        this.webcamErrors = [];
        this.isInitialized = false;
        this.reportTimer = null;

        this.init();
    }

    init() {
        if (this.isInitialized) return;

        console.log('🔍 Initializing Console Error Monitor for Webcam Operations');

        // Capture console errors and warnings
        if (this.options.enableConsoleCapture) {
            this.setupConsoleCapture();
        }

        // Capture network errors
        if (this.options.enableNetworkCapture) {
            this.setupNetworkCapture();
        }

        // Setup webcam-specific error monitoring
        if (this.options.enableWebcamSpecific) {
            this.setupWebcamErrorCapture();
        }

        // Setup automatic reporting
        if (this.options.autoReport) {
            this.startAutoReporting();
        }

        // Setup page unload reporting
        this.setupUnloadReporting();

        this.isInitialized = true;
        console.log('✅ Console Error Monitor initialized');
    }

    setupConsoleCapture() {
        // Store original console methods
        this.originalConsole = {
            error: console.error,
            warn: console.warn,
            log: console.log
        };

        // Override console.error
        console.error = (...args) => {
            this.captureError('console.error', args.join(' '), {
                stack: new Error().stack,
                timestamp: new Date().toISOString(),
                url: window.location.href
            });
            this.originalConsole.error.apply(console, args);
        };

        // Override console.warn
        console.warn = (...args) => {
            this.captureWarning('console.warn', args.join(' '), {
                timestamp: new Date().toISOString(),
                url: window.location.href
            });
            this.originalConsole.warn.apply(console, args);
        };

        // Capture unhandled errors
        window.addEventListener('error', (event) => {
            this.captureError('unhandled_error', event.message, {
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                stack: event.error?.stack,
                timestamp: new Date().toISOString(),
                url: window.location.href
            });
        });

        // Capture unhandled promise rejections
        window.addEventListener('unhandledrejection', (event) => {
            this.captureError('unhandled_promise_rejection', event.reason?.message || event.reason, {
                stack: event.reason?.stack,
                timestamp: new Date().toISOString(),
                url: window.location.href
            });
        });
    }

    setupNetworkCapture() {
        // Override fetch to capture network errors
        const originalFetch = window.fetch;
        window.fetch = async (...args) => {
            try {
                const response = await originalFetch.apply(window, args);
                
                // Log failed requests
                if (!response.ok) {
                    this.captureNetworkError('fetch_error', {
                        url: args[0],
                        status: response.status,
                        statusText: response.statusText,
                        timestamp: new Date().toISOString()
                    });
                }
                
                return response;
            } catch (error) {
                this.captureNetworkError('fetch_exception', {
                    url: args[0],
                    error: error.message,
                    stack: error.stack,
                    timestamp: new Date().toISOString()
                });
                throw error;
            }
        };

        // Monitor XMLHttpRequest errors
        const originalXHROpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(...args) {
            this.addEventListener('error', (event) => {
                window.consoleErrorMonitor?.captureNetworkError('xhr_error', {
                    url: args[1],
                    method: args[0],
                    timestamp: new Date().toISOString()
                });
            });

            this.addEventListener('load', () => {
                if (this.status >= 400) {
                    window.consoleErrorMonitor?.captureNetworkError('xhr_http_error', {
                        url: args[1],
                        method: args[0],
                        status: this.status,
                        statusText: this.statusText,
                        timestamp: new Date().toISOString()
                    });
                }
            });

            return originalXHROpen.apply(this, args);
        };
    }

    setupWebcamErrorCapture() {
        // Monitor webcam-specific operations
        this.webcamOperations = [
            'detectCameras',
            'testCamera',
            'startStream',
            'stopStream',
            'applyControls',
            'validateDevice'
        ];

        // Create a global webcam error reporter
        window.reportWebcamError = (operation, error, context = {}) => {
            this.captureWebcamError(operation, error, context);
        };

        // Monitor for webcam-related DOM errors
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        // Check for error messages in webcam preview
                        if (node.id === 'webcamPreview' || node.closest('#webcamPreview')) {
                            const errorText = node.textContent;
                            if (errorText && (errorText.includes('❌') || errorText.includes('Error') || errorText.includes('failed'))) {
                                this.captureWebcamError('preview_error', errorText, {
                                    element: node.tagName,
                                    timestamp: new Date().toISOString()
                                });
                            }
                        }

                        // Check for detection status errors
                        if (node.classList?.contains('detection-error')) {
                            this.captureWebcamError('detection_error', node.textContent, {
                                timestamp: new Date().toISOString()
                            });
                        }
                    }
                });
            });
        });

        // Only observe if document.body exists
        if (document.body) {
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        } else {
            // Wait for DOM to be ready
            document.addEventListener('DOMContentLoaded', () => {
                if (document.body) {
                    observer.observe(document.body, {
                        childList: true,
                        subtree: true
                    });
                }
            });
        }
    }

    captureError(type, message, metadata = {}) {
        const error = {
            type,
            message,
            metadata,
            id: this.generateId(),
            category: 'error'
        };

        this.errors.push(error);
        this.trimArray(this.errors);

        console.log('🚨 Error captured:', error);
    }

    captureWarning(type, message, metadata = {}) {
        const warning = {
            type,
            message,
            metadata,
            id: this.generateId(),
            category: 'warning'
        };

        this.warnings.push(warning);
        this.trimArray(this.warnings);
    }

    captureNetworkError(type, metadata = {}) {
        const networkError = {
            type,
            metadata,
            id: this.generateId(),
            category: 'network'
        };

        this.networkErrors.push(networkError);
        this.trimArray(this.networkErrors);

        console.log('🌐 Network error captured:', networkError);
    }

    captureWebcamError(operation, error, context = {}) {
        const webcamError = {
            operation,
            error: typeof error === 'string' ? error : error.message,
            context,
            id: this.generateId(),
            category: 'webcam',
            timestamp: new Date().toISOString()
        };

        this.webcamErrors.push(webcamError);
        this.trimArray(this.webcamErrors);

        console.log('📹 Webcam error captured:', webcamError);
    }

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    trimArray(array) {
        if (array.length > this.options.maxErrors) {
            array.splice(0, array.length - this.options.maxErrors);
        }
    }

    getErrorSummary() {
        return {
            totalErrors: this.errors.length,
            totalWarnings: this.warnings.length,
            totalNetworkErrors: this.networkErrors.length,
            totalWebcamErrors: this.webcamErrors.length,
            errors: this.errors,
            warnings: this.warnings,
            networkErrors: this.networkErrors,
            webcamErrors: this.webcamErrors,
            timestamp: new Date().toISOString(),
            url: window.location.href
        };
    }

    async reportErrors() {
        const summary = this.getErrorSummary();
        
        if (summary.totalErrors === 0 && summary.totalNetworkErrors === 0 && summary.totalWebcamErrors === 0) {
            return; // No errors to report
        }

        try {
            await fetch(this.options.reportingEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(summary)
            });

            console.log('📊 Error report sent successfully');
            
            // Clear reported errors
            this.errors = [];
            this.networkErrors = [];
            this.webcamErrors = [];
            
        } catch (error) {
            console.error('Failed to report errors:', error);
        }
    }

    startAutoReporting() {
        this.reportTimer = setInterval(() => {
            this.reportErrors();
        }, this.options.reportInterval);
    }

    setupUnloadReporting() {
        window.addEventListener('beforeunload', () => {
            // Send final error report before page unload
            if (navigator.sendBeacon) {
                const summary = this.getErrorSummary();
                if (summary.totalErrors > 0 || summary.totalNetworkErrors > 0 || summary.totalWebcamErrors > 0) {
                    navigator.sendBeacon(
                        this.options.reportingEndpoint,
                        JSON.stringify(summary)
                    );
                }
            }
        });
    }

    destroy() {
        if (this.reportTimer) {
            clearInterval(this.reportTimer);
        }

        // Restore original console methods
        if (this.originalConsole) {
            console.error = this.originalConsole.error;
            console.warn = this.originalConsole.warn;
            console.log = this.originalConsole.log;
        }

        this.isInitialized = false;
        console.log('🔍 Console Error Monitor destroyed');
    }
}

// Initialize global error monitor for webcam pages
if (window.location.pathname.includes('/webcam') || window.location.pathname.includes('/parts')) {
    window.consoleErrorMonitor = new ConsoleErrorMonitor({
        enableWebcamSpecific: true,
        autoReport: true,
        reportInterval: 15000 // Report every 15 seconds for webcam pages
    });
}

// Export for use in tests
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ConsoleErrorMonitor;
}
