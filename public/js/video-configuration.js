/**
 * Video Configuration Component JavaScript Module
 * Handles video configuration UI interactions and API calls
 */

class VideoConfigurationComponent {
    constructor(containerElement) {
        this.container = containerElement;
        this.characterId = containerElement.dataset.characterId;
        this.streamStatusInterval = null;
        this.isInitialized = false;
        
        this.init();
    }

    /**
     * Initialize the component
     */
    init() {
        if (this.isInitialized) return;
        
        this.setupEventListeners();
        this.updateStreamStatus();
        
        // Start periodic status updates if webcam exists
        if (this.characterId) {
            this.streamStatusInterval = setInterval(() => {
                this.updateStreamStatus();
            }, 10000); // Every 10 seconds
        }
        
        this.isInitialized = true;
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Refresh video
        const refreshBtn = this.container.querySelector('#refreshVideoBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.refreshVideo());
        }

        // Fullscreen
        const fullscreenBtn = this.container.querySelector('#fullscreenBtn');
        if (fullscreenBtn) {
            fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());
        }

        // Configure webcam
        const configureBtn = this.container.querySelector('#configureWebcamBtn');
        if (configureBtn) {
            configureBtn.addEventListener('click', () => this.openWebcamConfig());
        }

        // Stream controls
        const startStreamBtn = this.container.querySelector('#startStreamBtn');
        if (startStreamBtn) {
            startStreamBtn.addEventListener('click', () => this.startStream());
        }

        const stopStreamBtn = this.container.querySelector('#stopStreamBtn');
        if (stopStreamBtn) {
            stopStreamBtn.addEventListener('click', () => this.stopStream());
        }

        const restartStreamBtn = this.container.querySelector('#restartStreamBtn');
        if (restartStreamBtn) {
            restartStreamBtn.addEventListener('click', () => this.restartStream());
        }

        const testCameraBtn = this.container.querySelector('#testCameraBtn');
        if (testCameraBtn) {
            testCameraBtn.addEventListener('click', () => this.testCamera());
        }

        const assignWebcamBtn = this.container.querySelector('#assignWebcamBtn');
        if (assignWebcamBtn) {
            assignWebcamBtn.addEventListener('click', () => this.assignWebcam());
        }

        // Modal controls
        const closeModalBtn = this.container.querySelector('#closeConfigModal');
        if (closeModalBtn) {
            closeModalBtn.addEventListener('click', () => this.closeWebcamConfig());
        }

        // Click outside modal to close
        const modal = this.container.querySelector('#webcamConfigModal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeWebcamConfig();
                }
            });
        }
    }

    /**
     * Refresh video stream
     */
    refreshVideo() {
        const videoStream = this.container.querySelector('#videoStream');
        if (videoStream && this.characterId) {
            const timestamp = Date.now();
            videoStream.src = `/api/streaming/stream/${this.characterId}?t=${timestamp}`;
            
            // Show loading state
            this.showVideoLoading();
            
            videoStream.onload = () => {
                this.hideVideoLoading();
            };
            
            videoStream.onerror = () => {
                this.hideVideoLoading();
                this.showVideoError('Failed to load video stream');
            };
        }
    }

    /**
     * Toggle fullscreen mode
     */
    toggleFullscreen() {
        const videoPreview = this.container.querySelector('#videoPreview');
        if (videoPreview) {
            if (document.fullscreenElement) {
                document.exitFullscreen();
            } else {
                videoPreview.requestFullscreen().catch(err => {
                    console.error('Error attempting to enable fullscreen:', err);
                });
            }
        }
    }

    /**
     * Open webcam configuration modal
     */
    async openWebcamConfig() {
        const modal = this.container.querySelector('#webcamConfigModal');
        const content = this.container.querySelector('#webcamConfigContent');
        
        if (modal && content && this.characterId) {
            // Show modal with loading state
            content.innerHTML = '<div class="loading">Loading configuration...</div>';
            modal.style.display = 'flex';
            
            try {
                // Load the webcam form content
                const response = await fetch(`/parts/webcam/new?characterId=${this.characterId}`);
                const html = await response.text();
                
                // Extract just the form content
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                const form = doc.querySelector('form');
                
                if (form) {
                    content.innerHTML = form.outerHTML;
                    
                    // Setup form submission handling
                    const newForm = content.querySelector('form');
                    if (newForm) {
                        newForm.addEventListener('submit', (e) => {
                            e.preventDefault();
                            this.handleWebcamConfigSubmit(newForm);
                        });
                    }
                } else {
                    content.innerHTML = '<div class="error">Failed to load configuration form</div>';
                }
            } catch (error) {
                content.innerHTML = `<div class="error">Error loading configuration: ${error.message}</div>`;
            }
        }
    }

    /**
     * Handle webcam configuration form submission
     */
    async handleWebcamConfigSubmit(form) {
        try {
            const formData = new FormData(form);
            const response = await fetch(form.action, {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                // Close modal and refresh component
                this.closeWebcamConfig();
                window.location.reload(); // Reload to show updated webcam
            } else {
                const errorText = await response.text();
                throw new Error(`Server error: ${response.status} - ${errorText}`);
            }
        } catch (error) {
            const content = this.container.querySelector('#webcamConfigContent');
            if (content) {
                content.innerHTML = `<div class="error">Error saving configuration: ${error.message}</div>`;
            }
        }
    }

    /**
     * Close webcam configuration modal
     */
    closeWebcamConfig() {
        const modal = this.container.querySelector('#webcamConfigModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    /**
     * Start video stream
     */
    async startStream() {
        if (!this.characterId) return;
        
        const startBtn = this.container.querySelector('#startStreamBtn');
        if (startBtn) {
            startBtn.disabled = true;
            startBtn.textContent = '🔄 Starting...';
        }
        
        try {
            const response = await fetch(`/api/streaming/start/${this.characterId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            const data = await response.json();
            if (data.success) {
                this.updateStreamControls(true);
                this.updateStreamStatus();
                this.refreshVideo();
            } else {
                this.showError('Failed to start stream: ' + data.error);
            }
        } catch (error) {
            this.showError('Error starting stream: ' + error.message);
        } finally {
            if (startBtn) {
                startBtn.disabled = false;
                startBtn.textContent = '▶️ Start Stream';
            }
        }
    }

    /**
     * Stop video stream
     */
    async stopStream() {
        if (!this.characterId) return;
        
        const stopBtn = this.container.querySelector('#stopStreamBtn');
        if (stopBtn) {
            stopBtn.disabled = true;
            stopBtn.textContent = '🔄 Stopping...';
        }
        
        try {
            const response = await fetch(`/api/streaming/stop/${this.characterId}`, {
                method: 'POST'
            });
            
            const data = await response.json();
            if (data.success) {
                this.updateStreamControls(false);
                this.updateStreamStatus();
                this.showVideoPlaceholder();
            } else {
                this.showError('Failed to stop stream: ' + data.error);
            }
        } catch (error) {
            this.showError('Error stopping stream: ' + error.message);
        } finally {
            if (stopBtn) {
                stopBtn.disabled = false;
                stopBtn.textContent = '⏹️ Stop Stream';
            }
        }
    }

    /**
     * Restart video stream
     */
    async restartStream() {
        if (!this.characterId) return;
        
        const restartBtn = this.container.querySelector('#restartStreamBtn');
        if (restartBtn) {
            restartBtn.disabled = true;
            restartBtn.textContent = '🔄 Restarting...';
        }
        
        try {
            const response = await fetch(`/api/streaming/restart/${this.characterId}`, {
                method: 'POST'
            });
            
            const data = await response.json();
            if (data.success) {
                this.updateStreamStatus();
                this.refreshVideo();
            } else {
                this.showError('Failed to restart stream: ' + data.error);
            }
        } catch (error) {
            this.showError('Error restarting stream: ' + error.message);
        } finally {
            if (restartBtn) {
                restartBtn.disabled = false;
                restartBtn.textContent = '🔄 Restart Stream';
            }
        }
    }

    /**
     * Test camera functionality
     */
    testCamera() {
        if (this.characterId) {
            const testUrl = `/api/webcam/test-stream?characterId=${this.characterId}&deviceId=0&width=640&height=480&fps=30`;
            window.open(testUrl, '_blank', 'width=800,height=600');
        }
    }

    /**
     * Navigate to webcam assignment
     */
    assignWebcam() {
        if (this.characterId) {
            window.location.href = `/parts/webcam/new?characterId=${this.characterId}`;
        }
    }

    /**
     * Update stream control buttons
     */
    updateStreamControls(isStreaming) {
        const startBtn = this.container.querySelector('#startStreamBtn');
        const stopBtn = this.container.querySelector('#stopStreamBtn');
        
        if (startBtn && stopBtn) {
            if (isStreaming) {
                startBtn.style.display = 'none';
                stopBtn.style.display = 'inline-block';
            } else {
                startBtn.style.display = 'inline-block';
                stopBtn.style.display = 'none';
            }
        }
    }

    /**
     * Update stream status display
     */
    async updateStreamStatus() {
        if (!this.characterId) return;
        
        try {
            const response = await fetch(`/api/streaming/status/${this.characterId}`);
            const data = await response.json();
            
            if (data.success) {
                this.updateStatusDisplay(data);
                this.updateStreamControls(data.hasStream);
            }
        } catch (error) {
            console.error('Error updating stream status:', error);
        }
    }

    /**
     * Update status display elements
     */
    updateStatusDisplay(data) {
        const statusElement = this.container.querySelector('#streamStatus');
        const statusValueElement = this.container.querySelector('#streamStatusValue');
        const clientsValueElement = this.container.querySelector('#streamClientsValue');
        const urlLinkElement = this.container.querySelector('#streamUrlLink');
        
        if (statusElement && statusValueElement && clientsValueElement && urlLinkElement) {
            statusElement.style.display = 'block';
            statusValueElement.textContent = data.hasStream ? 'Active' : 'Inactive';
            clientsValueElement.textContent = data.clientCount || 0;
            
            if (data.hasStream) {
                urlLinkElement.href = `/api/streaming/stream/${this.characterId}`;
                urlLinkElement.textContent = 'View Stream';
            } else {
                urlLinkElement.href = '#';
                urlLinkElement.textContent = 'No stream';
            }
        }
    }

    /**
     * Show video loading state
     */
    showVideoLoading() {
        const preview = this.container.querySelector('#videoPreview');
        if (preview) {
            preview.innerHTML = `
                <div class="no-video-placeholder">
                    <span class="placeholder-icon">🔄</span>
                    <span class="placeholder-text">Loading video...</span>
                </div>
            `;
        }
    }

    /**
     * Hide video loading state
     */
    hideVideoLoading() {
        // Loading state will be replaced by video or error
    }

    /**
     * Show video error state
     */
    showVideoError(message) {
        const preview = this.container.querySelector('#videoPreview');
        if (preview) {
            preview.innerHTML = `
                <div class="no-video-placeholder">
                    <span class="placeholder-icon">❌</span>
                    <span class="placeholder-text">${message}</span>
                </div>
            `;
        }
    }

    /**
     * Show video placeholder
     */
    showVideoPlaceholder() {
        const preview = this.container.querySelector('#videoPreview');
        if (preview) {
            preview.innerHTML = `
                <div class="no-video-placeholder">
                    <span class="placeholder-icon">📹</span>
                    <span class="placeholder-text">No video available</span>
                </div>
            `;
        }
    }

    /**
     * Show error message
     */
    showError(message) {
        // You can implement a toast notification or alert here
        alert(message);
    }

    /**
     * Cleanup component
     */
    destroy() {
        if (this.streamStatusInterval) {
            clearInterval(this.streamStatusInterval);
            this.streamStatusInterval = null;
        }
        this.isInitialized = false;
    }
}

// Auto-initialize components when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    const components = document.querySelectorAll('.video-configuration-component');
    components.forEach(component => {
        new VideoConfigurationComponent(component);
    });
});

// Cleanup on page unload
window.addEventListener('beforeunload', function() {
    const components = document.querySelectorAll('.video-configuration-component');
    components.forEach(component => {
        if (component.videoConfigComponent) {
            component.videoConfigComponent.destroy();
        }
    });
});

// Export for manual initialization
window.VideoConfigurationComponent = VideoConfigurationComponent;
