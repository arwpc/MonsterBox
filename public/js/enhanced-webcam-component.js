/**
 * Enhanced Webcam Component for MonsterBox
 * Replaces legacy webcam functionality with improved error handling,
 * better settings management, and comprehensive logging integration
 */

class EnhancedWebcamComponent {
    constructor(options = {}) {
        this.options = {
            characterId: null,
            autoDetect: true,
            retryAttempts: 3,
            retryDelay: 2000,
            timeout: 30000,
            enableLogging: true,
            enableErrorReporting: true,
            ...options
        };

        this.state = {
            isInitialized: false,
            isDetecting: false,
            isTesting: false,
            isStreaming: false,
            cameras: [],
            selectedCamera: null,
            currentSettings: {},
            errors: []
        };

        this.elements = {};
        this.eventListeners = [];
        this.intervals = [];
        this.testStream = null;

        this.init();
    }

    async init() {
        try {
            this.log('info', 'Initializing Enhanced Webcam Component');
            
            // Find and cache DOM elements
            this.cacheElements();
            
            // Validate required elements
            this.validateElements();
            
            // Setup event listeners
            this.setupEventListeners();
            
            // Initialize camera controls
            this.initializeCameraControls();
            
            // Auto-detect cameras if enabled
            if (this.options.autoDetect && this.options.characterId) {
                await this.detectCameras();
            }
            
            this.state.isInitialized = true;
            this.log('info', 'Enhanced Webcam Component initialized successfully');
            
        } catch (error) {
            this.handleError('initialization_failed', error);
        }
    }

    cacheElements() {
        const elementIds = [
            'characterId', 'deviceId', 'devicePath', 'resolution', 'fps',
            'detectionStatus', 'refreshCamerasBtn', 'testCameraBtn', 'stopTestBtn',
            'webcamPreview', 'startStreamBtn', 'stopStreamBtn', 'streamStatus',
            'applyControlsBtn', 'resetControlsBtn'
        ];

        elementIds.forEach(id => {
            this.elements[id] = document.getElementById(id);
        });

        // Cache camera control elements
        const controlIds = [
            'brightness', 'contrast', 'saturation', 'hue', 'gamma', 'gain',
            'sharpness', 'backlight_compensation', 'white_balance_temperature',
            'exposure_time_absolute', 'white_balance_automatic', 
            'exposure_dynamic_framerate', 'auto_exposure', 'power_line_frequency'
        ];

        controlIds.forEach(id => {
            this.elements[id] = document.getElementById(id);
        });
    }

    validateElements() {
        const requiredElements = ['characterId', 'deviceId', 'detectionStatus'];
        const missingElements = requiredElements.filter(id => !this.elements[id]);
        
        if (missingElements.length > 0) {
            throw new Error(`Missing required elements: ${missingElements.join(', ')}`);
        }

        // Set character ID from element if not provided in options
        if (!this.options.characterId && this.elements.characterId) {
            this.options.characterId = this.elements.characterId.value;
        }
    }

    setupEventListeners() {
        // Refresh cameras button
        if (this.elements.refreshCamerasBtn) {
            this.addEventListener(this.elements.refreshCamerasBtn, 'click', () => {
                this.detectCameras(true);
            });
        }

        // Device selection change
        if (this.elements.deviceId) {
            this.addEventListener(this.elements.deviceId, 'change', (event) => {
                this.handleDeviceSelection(event.target.value);
            });
        }

        // Camera test buttons
        if (this.elements.testCameraBtn) {
            this.addEventListener(this.elements.testCameraBtn, 'click', () => {
                this.testCamera();
            });
        }

        if (this.elements.stopTestBtn) {
            this.addEventListener(this.elements.stopTestBtn, 'click', () => {
                this.stopCameraTest();
            });
        }

        // Streaming buttons
        if (this.elements.startStreamBtn) {
            this.addEventListener(this.elements.startStreamBtn, 'click', () => {
                this.startStreaming();
            });
        }

        if (this.elements.stopStreamBtn) {
            this.addEventListener(this.elements.stopStreamBtn, 'click', () => {
                this.stopStreaming();
            });
        }

        // Camera controls
        if (this.elements.applyControlsBtn) {
            this.addEventListener(this.elements.applyControlsBtn, 'click', () => {
                this.applyCameraControls();
            });
        }

        if (this.elements.resetControlsBtn) {
            this.addEventListener(this.elements.resetControlsBtn, 'click', () => {
                this.resetCameraControls();
            });
        }
    }

    addEventListener(element, event, handler) {
        if (element) {
            element.addEventListener(event, handler);
            this.eventListeners.push({ element, event, handler });
        }
    }

    initializeCameraControls() {
        // Setup range input value displays
        const ranges = document.querySelectorAll('input[type="range"]');
        ranges.forEach(range => {
            const valueDisplay = document.getElementById(range.id + 'Value');
            if (valueDisplay) {
                this.addEventListener(range, 'input', () => {
                    valueDisplay.textContent = range.value;
                });
            }
        });
    }

    async detectCameras(isRefresh = false) {
        if (this.state.isDetecting) {
            this.log('warn', 'Camera detection already in progress');
            return;
        }

        try {
            this.state.isDetecting = true;
            this.updateDetectionStatus('detecting', 'Detecting cameras...');
            
            if (this.elements.refreshCamerasBtn) {
                this.elements.refreshCamerasBtn.disabled = true;
                this.elements.refreshCamerasBtn.textContent = '🔄 Detecting...';
            }

            this.log('info', 'Starting camera detection', { isRefresh, characterId: this.options.characterId });

            // Try remote detection first, then local
            let cameras = await this.detectCamerasWithFallback();
            
            if (cameras && cameras.length > 0) {
                this.state.cameras = cameras;
                this.populateDeviceOptions(cameras);
                this.updateDetectionStatus('success', `Found ${cameras.length} camera(s)`);
                this.log('info', 'Camera detection successful', { cameraCount: cameras.length });
            } else {
                this.updateDetectionStatus('error', 'No cameras detected');
                this.log('warn', 'No cameras found during detection');
            }

        } catch (error) {
            this.handleError('camera_detection_failed', error);
            this.updateDetectionStatus('error', `Detection failed: ${error.message}`);
        } finally {
            this.state.isDetecting = false;
            if (this.elements.refreshCamerasBtn) {
                this.elements.refreshCamerasBtn.disabled = false;
                this.elements.refreshCamerasBtn.textContent = '🔄 Refresh Camera List';
            }
        }
    }

    async detectCamerasWithFallback() {
        const attempts = [
            { remote: true, label: 'remote' },
            { remote: false, label: 'local' }
        ];

        for (const attempt of attempts) {
            try {
                this.log('info', `Attempting ${attempt.label} camera detection`);
                
                const response = await this.fetchWithTimeout(
                    `/api/webcam/detect?characterId=${this.options.characterId}&remote=${attempt.remote}`,
                    { timeout: this.options.timeout }
                );
                
                const data = await response.json();
                
                if (data.success && data.cameras && data.cameras.length > 0) {
                    this.log('info', `${attempt.label} detection successful`, { cameras: data.cameras });
                    return data.cameras;
                }
                
                this.log('warn', `${attempt.label} detection returned no cameras`, data);
                
            } catch (error) {
                this.log('error', `${attempt.label} detection failed`, { error: error.message });
            }
        }

        return [];
    }

    async fetchWithTimeout(url, options = {}) {
        const { timeout = this.options.timeout, ...fetchOptions } = options;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        try {
            const response = await fetch(url, {
                ...fetchOptions,
                signal: controller.signal
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            return response;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    populateDeviceOptions(cameras) {
        if (!this.elements.deviceId) return;

        // Clear existing options except the first one
        this.elements.deviceId.innerHTML = '<option value="">Select a camera device...</option>';

        cameras.forEach(camera => {
            const option = document.createElement('option');
            option.value = camera.id;

            let cameraInfo = '';
            if (camera.width && camera.height) {
                cameraInfo += ` (${camera.width}x${camera.height})`;
            }

            let statusInfo = '';
            if (camera.in_use) {
                statusInfo = ' - Currently in use';
            } else if (!camera.available) {
                statusInfo = ' - Unavailable';
            }

            option.textContent = `Camera ${camera.id}${cameraInfo}${statusInfo}`;
            option.dataset.inUse = camera.in_use || false;
            option.dataset.available = camera.available || false;
            option.dataset.note = camera.note || '';

            this.elements.deviceId.appendChild(option);
        });
    }

    handleDeviceSelection(deviceId) {
        if (this.elements.devicePath) {
            this.elements.devicePath.value = deviceId ? `/dev/video${deviceId}` : '';
        }

        if (!deviceId) {
            this.updateDetectionStatus('info', 'Please select a camera device');
            return;
        }

        // Check device status
        const selectedOption = this.elements.deviceId.options[this.elements.deviceId.selectedIndex];
        if (selectedOption) {
            if (selectedOption.dataset.inUse === 'true') {
                this.updateDetectionStatus('warning', 
                    `Camera ${deviceId} is currently in use. Configuration available but testing may not work.`);
            } else if (selectedOption.dataset.available === 'false') {
                this.updateDetectionStatus('error', 
                    `Camera ${deviceId} is not available. ${selectedOption.dataset.note || 'Device may be disconnected.'}`);
            } else {
                this.updateDetectionStatus('success', `Camera ${deviceId} is available for configuration.`);
            }
        }

        this.state.selectedCamera = deviceId;
        this.log('info', 'Camera device selected', { deviceId });
    }

    updateDetectionStatus(type, message) {
        if (!this.elements.detectionStatus) return;

        this.elements.detectionStatus.style.display = 'block';
        this.elements.detectionStatus.className = `detection-status detection-${type}`;
        this.elements.detectionStatus.textContent = message;
    }

    log(level, message, metadata = {}) {
        if (!this.options.enableLogging) return;

        const logEntry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            component: 'EnhancedWebcamComponent',
            characterId: this.options.characterId,
            ...metadata
        };

        console[level] || console.log(`[${level.toUpperCase()}] ${message}`, metadata);

        // Send to error monitoring if available
        if (window.consoleErrorMonitor && level === 'error') {
            window.consoleErrorMonitor.captureWebcamError('component_error', message, metadata);
        }
    }

    handleError(operation, error, context = {}) {
        const errorInfo = {
            operation,
            error: error.message,
            stack: error.stack,
            context,
            timestamp: new Date().toISOString()
        };

        this.state.errors.push(errorInfo);
        this.log('error', `Webcam operation failed: ${operation}`, errorInfo);

        // Report to global error monitoring
        if (this.options.enableErrorReporting && window.reportWebcamError) {
            window.reportWebcamError(operation, error, context);
        }
    }

    async testCamera() {
        if (this.state.isTesting) {
            this.log('warn', 'Camera test already in progress');
            return;
        }

        if (!this.state.selectedCamera) {
            this.updateDetectionStatus('error', 'Please select a camera device first');
            return;
        }

        try {
            this.state.isTesting = true;
            this.updateUIForTesting(true);

            const deviceId = this.state.selectedCamera;
            const resolution = this.elements.resolution?.value || '1280x720';
            const fps = this.elements.fps?.value || '30';

            this.log('info', 'Starting camera test', { deviceId, resolution, fps });

            const response = await this.fetchWithTimeout(
                `/api/webcam/test?characterId=${this.options.characterId}&deviceId=${deviceId}&resolution=${resolution}&fps=${fps}`
            );

            const data = await response.json();

            if (data.success) {
                this.displayTestResult(data);
                this.log('info', 'Camera test successful', data);
            } else {
                throw new Error(data.message || 'Camera test failed');
            }

        } catch (error) {
            this.handleError('camera_test_failed', error);
            this.displayTestError(error.message);
        }
    }

    stopCameraTest() {
        if (!this.state.isTesting) return;

        try {
            this.log('info', 'Stopping camera test');

            // Stop any active test stream
            if (this.testStream) {
                this.testStream.getTracks().forEach(track => track.stop());
                this.testStream = null;
            }

            this.updateUIForTesting(false);
            this.clearTestResult();

            this.state.isTesting = false;
            this.log('info', 'Camera test stopped');

        } catch (error) {
            this.handleError('stop_camera_test_failed', error);
        }
    }

    updateUIForTesting(isTesting) {
        if (this.elements.testCameraBtn) {
            this.elements.testCameraBtn.style.display = isTesting ? 'none' : 'inline-block';
            this.elements.testCameraBtn.disabled = isTesting;
        }

        if (this.elements.stopTestBtn) {
            this.elements.stopTestBtn.style.display = isTesting ? 'inline-block' : 'none';
            this.elements.stopTestBtn.disabled = !isTesting;
        }
    }

    displayTestResult(data) {
        if (!this.elements.webcamPreview) return;

        if (data.imageUrl) {
            this.elements.webcamPreview.innerHTML = `
                <img src="${data.imageUrl}" alt="Camera Test" style="max-width: 100%; max-height: 100%;">
                <div style="position: absolute; bottom: 10px; left: 10px; background: rgba(0,0,0,0.7); color: white; padding: 5px; border-radius: 3px; font-size: 12px;">
                    ✅ Test successful - ${data.resolution || 'Unknown resolution'}
                </div>
            `;
        } else {
            this.elements.webcamPreview.innerHTML = `
                <span style="color: #00ff00;">✅ Camera test successful</span>
            `;
        }
    }

    displayTestError(errorMessage) {
        if (!this.elements.webcamPreview) return;

        this.elements.webcamPreview.innerHTML = `
            <span style="color: #ff0000;">❌ Error: ${errorMessage}</span>
        `;
    }

    clearTestResult() {
        if (!this.elements.webcamPreview) return;

        this.elements.webcamPreview.innerHTML = `
            <span style="color: #6c757d; font-style: italic;">Click "Test Camera" to preview</span>
        `;
    }

    async startStreaming() {
        if (this.state.isStreaming) {
            this.log('warn', 'Streaming already in progress');
            return;
        }

        if (!this.state.selectedCamera) {
            this.updateDetectionStatus('error', 'Please select a camera device first');
            return;
        }

        try {
            this.state.isStreaming = true;
            this.updateUIForStreaming(true);

            this.log('info', 'Starting streaming', { characterId: this.options.characterId });

            const response = await this.fetchWithTimeout(
                `/api/streaming/start/${this.options.characterId}`,
                { method: 'POST' }
            );

            const data = await response.json();

            if (data.success) {
                this.displayStreamingStatus(data);
                this.log('info', 'Streaming started successfully', data);
            } else {
                throw new Error(data.message || 'Failed to start streaming');
            }

        } catch (error) {
            this.handleError('start_streaming_failed', error);
            this.state.isStreaming = false;
            this.updateUIForStreaming(false);
        }
    }

    async stopStreaming() {
        if (!this.state.isStreaming) return;

        try {
            this.log('info', 'Stopping streaming', { characterId: this.options.characterId });

            const response = await this.fetchWithTimeout(
                `/api/streaming/stop/${this.options.characterId}`,
                { method: 'POST' }
            );

            const data = await response.json();

            if (data.success) {
                this.log('info', 'Streaming stopped successfully', data);
            } else {
                this.log('warn', 'Streaming stop returned error', data);
            }

        } catch (error) {
            this.handleError('stop_streaming_failed', error);
        } finally {
            this.state.isStreaming = false;
            this.updateUIForStreaming(false);
            this.clearStreamingStatus();
        }
    }

    updateUIForStreaming(isStreaming) {
        if (this.elements.startStreamBtn) {
            this.elements.startStreamBtn.style.display = isStreaming ? 'none' : 'inline-block';
            this.elements.startStreamBtn.disabled = isStreaming;
        }

        if (this.elements.stopStreamBtn) {
            this.elements.stopStreamBtn.style.display = isStreaming ? 'inline-block' : 'none';
            this.elements.stopStreamBtn.disabled = !isStreaming;
        }
    }

    displayStreamingStatus(data) {
        if (!this.elements.streamStatus) return;

        this.elements.streamStatus.style.display = 'block';
        this.elements.streamStatus.innerHTML = `
            <h4>🔴 Streaming Active</h4>
            <div class="stream-status-item">
                <span class="stream-status-label">Status:</span>
                <span class="stream-status-value">${data.status || 'Active'}</span>
            </div>
            <div class="stream-status-item">
                <span class="stream-status-label">Stream URL:</span>
                <span class="stream-status-value">${data.streamUrl || 'N/A'}</span>
            </div>
            <div class="stream-status-item">
                <span class="stream-status-label">Started:</span>
                <span class="stream-status-value">${new Date().toLocaleTimeString()}</span>
            </div>
        `;
    }

    clearStreamingStatus() {
        if (this.elements.streamStatus) {
            this.elements.streamStatus.style.display = 'none';
            this.elements.streamStatus.innerHTML = '';
        }
    }

    async applyCameraControls() {
        if (!this.state.selectedCamera) {
            this.updateDetectionStatus('error', 'Please select a camera device first');
            return;
        }

        try {
            this.log('info', 'Applying camera controls');

            const controls = this.gatherCameraControls();

            if (this.elements.applyControlsBtn) {
                this.elements.applyControlsBtn.disabled = true;
                this.elements.applyControlsBtn.textContent = 'Applying...';
            }

            const response = await this.fetchWithTimeout('/api/webcam/set-controls', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    characterId: this.options.characterId,
                    deviceId: this.state.selectedCamera,
                    controls: controls
                })
            });

            const data = await response.json();

            if (data.success) {
                this.updateDetectionStatus('success', 'Camera controls applied successfully');
                this.log('info', 'Camera controls applied', {
                    appliedControls: data.appliedControls,
                    failedControls: data.failedControls
                });

                if (data.failedControls && data.failedControls.length > 0) {
                    this.log('warn', 'Some controls failed to apply', { failedControls: data.failedControls });
                }
            } else {
                throw new Error(data.message || 'Failed to apply camera controls');
            }

        } catch (error) {
            this.handleError('apply_camera_controls_failed', error);
            this.updateDetectionStatus('error', `Failed to apply controls: ${error.message}`);
        } finally {
            if (this.elements.applyControlsBtn) {
                this.elements.applyControlsBtn.disabled = false;
                this.elements.applyControlsBtn.textContent = 'Apply Controls';
            }
        }
    }

    gatherCameraControls() {
        const controls = {};

        const controlMappings = {
            brightness: 'brightness',
            contrast: 'contrast',
            saturation: 'saturation',
            hue: 'hue',
            gamma: 'gamma',
            gain: 'gain',
            sharpness: 'sharpness',
            backlight_compensation: 'backlight_compensation',
            white_balance_temperature: 'white_balance_temperature',
            exposure_time_absolute: 'exposure_time_absolute',
            auto_exposure: 'auto_exposure',
            power_line_frequency: 'power_line_frequency'
        };

        // Gather range and select controls
        Object.entries(controlMappings).forEach(([elementId, controlName]) => {
            const element = this.elements[elementId];
            if (element) {
                const value = element.type === 'range' || element.type === 'select-one'
                    ? parseInt(element.value, 10)
                    : element.value;
                controls[controlName] = value;
            }
        });

        // Gather checkbox controls
        const checkboxMappings = {
            white_balance_automatic: 'white_balance_automatic',
            exposure_dynamic_framerate: 'exposure_dynamic_framerate'
        };

        Object.entries(checkboxMappings).forEach(([elementId, controlName]) => {
            const element = this.elements[elementId];
            if (element) {
                controls[controlName] = element.checked;
            }
        });

        return controls;
    }

    resetCameraControls() {
        try {
            this.log('info', 'Resetting camera controls to defaults');

            const defaultValues = {
                brightness: 0,
                contrast: 32,
                saturation: 64,
                hue: 0,
                gamma: 100,
                gain: 0,
                sharpness: 10,
                backlight_compensation: 80,
                white_balance_temperature: 4600,
                exposure_time_absolute: 157,
                auto_exposure: 3,
                power_line_frequency: 1,
                white_balance_automatic: true,
                exposure_dynamic_framerate: false
            };

            // Reset range and select controls
            Object.entries(defaultValues).forEach(([controlName, defaultValue]) => {
                const element = this.elements[controlName];
                if (element) {
                    if (element.type === 'checkbox') {
                        element.checked = defaultValue;
                    } else {
                        element.value = defaultValue;
                    }

                    // Update value display for range inputs
                    const valueDisplay = document.getElementById(controlName + 'Value');
                    if (valueDisplay && element.type === 'range') {
                        valueDisplay.textContent = defaultValue;
                    }

                    // Trigger change event
                    element.dispatchEvent(new Event('change'));
                }
            });

            this.updateDetectionStatus('info', 'Camera controls reset to default values');
            this.log('info', 'Camera controls reset successfully');

        } catch (error) {
            this.handleError('reset_camera_controls_failed', error);
            this.updateDetectionStatus('error', `Failed to reset controls: ${error.message}`);
        }
    }

    destroy() {
        // Remove event listeners
        this.eventListeners.forEach(({ element, event, handler }) => {
            element.removeEventListener(event, handler);
        });

        // Clear intervals
        this.intervals.forEach(intervalId => clearInterval(intervalId));

        // Stop any active streams
        if (this.testStream) {
            this.stopCameraTest();
        }

        if (this.state.isStreaming) {
            this.stopStreaming();
        }

        this.log('info', 'Enhanced Webcam Component destroyed');
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EnhancedWebcamComponent;
} else {
    window.EnhancedWebcamComponent = EnhancedWebcamComponent;
}
