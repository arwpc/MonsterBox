/**
 * Video Player Component for MonsterBox
 * Provides a complete video player interface with WebRTC streaming capabilities
 */

import StreamClient from './StreamClient.js';

class VideoPlayerComponent {
    constructor(container, options = {}) {
        this.container = container;
        this.characterId = options.characterId;
        this.autoStart = options.autoStart || false;
        this.showControls = options.showControls !== false;
        this.showStats = options.showStats || false;
        
        // Components
        this.streamClient = null;
        this.videoElement = null;
        this.controlsElement = null;
        this.statsElement = null;
        
        // State
        this.isPlaying = false;
        this.isFullscreen = false;
        this.volume = 1.0;
        this.muted = false;
        
        // Initialize
        this.initialize();
    }

    /**
     * Initialize the video player component
     */
    initialize() {
        this.createPlayerHTML();
        this.setupEventListeners();
        
        if (this.characterId && this.autoStart) {
            this.startStream();
        }
    }

    /**
     * Create the player HTML structure
     */
    createPlayerHTML() {
        this.container.innerHTML = `
            <div class="video-player-wrapper">
                <div class="video-container">
                    <video class="video-element" playsinline muted>
                        Your browser does not support video playback.
                    </video>
                    <div class="video-overlay">
                        <div class="loading-indicator" style="display: none;">
                            <div class="spinner"></div>
                            <span>Connecting to stream...</span>
                        </div>
                        <div class="error-message" style="display: none;">
                            <span class="error-text">Connection failed</span>
                            <button class="retry-button">Retry</button>
                        </div>
                        <div class="connection-status">
                            <span class="status-indicator"></span>
                            <span class="status-text">Disconnected</span>
                        </div>
                    </div>
                </div>
                ${this.showControls ? this.createControlsHTML() : ''}
                ${this.showStats ? this.createStatsHTML() : ''}
            </div>
        `;
        
        // Get references
        this.videoElement = this.container.querySelector('.video-element');
        this.controlsElement = this.container.querySelector('.video-controls');
        this.statsElement = this.container.querySelector('.stats-panel');
        
        // Apply styles
        this.applyStyles();
    }

    /**
     * Create controls HTML
     */
    createControlsHTML() {
        return `
            <div class="video-controls">
                <button class="control-button play-pause-btn" title="Play/Pause">
                    <span class="play-icon">▶</span>
                    <span class="pause-icon" style="display: none;">⏸</span>
                </button>
                <button class="control-button stop-btn" title="Stop">⏹</button>
                <div class="volume-control">
                    <button class="control-button volume-btn" title="Mute/Unmute">🔊</button>
                    <input type="range" class="volume-slider" min="0" max="1" step="0.1" value="1">
                </div>
                <div class="time-display">
                    <span class="current-time">00:00</span>
                </div>
                <div class="spacer"></div>
                <button class="control-button quality-btn" title="Quality">HD</button>
                <button class="control-button fullscreen-btn" title="Fullscreen">⛶</button>
            </div>
        `;
    }

    /**
     * Create stats HTML
     */
    createStatsHTML() {
        return `
            <div class="stats-panel" style="display: none;">
                <div class="stats-header">
                    <span>Stream Statistics</span>
                    <button class="stats-close">×</button>
                </div>
                <div class="stats-content">
                    <div class="stat-item">
                        <span class="stat-label">Connection:</span>
                        <span class="stat-value" data-stat="connection">Disconnected</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Duration:</span>
                        <span class="stat-value" data-stat="duration">00:00</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Quality:</span>
                        <span class="stat-value" data-stat="quality">-</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Reconnects:</span>
                        <span class="stat-value" data-stat="reconnects">0</span>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Apply component styles
     */
    applyStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .video-player-wrapper {
                position: relative;
                background: #000;
                border-radius: 8px;
                overflow: hidden;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            }
            
            .video-container {
                position: relative;
                width: 100%;
                padding-bottom: 56.25%; /* 16:9 aspect ratio */
                background: #000;
            }
            
            .video-element {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                object-fit: contain;
            }
            
            .video-overlay {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                pointer-events: none;
                z-index: 10;
            }
            
            .loading-indicator {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                text-align: center;
                color: white;
                pointer-events: auto;
            }
            
            .spinner {
                width: 40px;
                height: 40px;
                border: 4px solid rgba(255,255,255,0.3);
                border-top: 4px solid #fff;
                border-radius: 50%;
                animation: spin 1s linear infinite;
                margin: 0 auto 10px;
            }
            
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            
            .error-message {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                text-align: center;
                color: #ff6b6b;
                pointer-events: auto;
            }
            
            .retry-button {
                margin-top: 10px;
                padding: 8px 16px;
                background: #ff6b6b;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
            }
            
            .connection-status {
                position: absolute;
                top: 10px;
                right: 10px;
                background: rgba(0,0,0,0.7);
                color: white;
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 12px;
                display: flex;
                align-items: center;
                gap: 5px;
            }
            
            .status-indicator {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: #ff6b6b;
            }
            
            .status-indicator.connected {
                background: #51cf66;
            }
            
            .video-controls {
                display: flex;
                align-items: center;
                padding: 10px;
                background: rgba(0,0,0,0.8);
                color: white;
                gap: 10px;
            }
            
            .control-button {
                background: none;
                border: none;
                color: white;
                cursor: pointer;
                padding: 8px;
                border-radius: 4px;
                transition: background 0.2s;
            }
            
            .control-button:hover {
                background: rgba(255,255,255,0.1);
            }
            
            .volume-control {
                display: flex;
                align-items: center;
                gap: 5px;
            }
            
            .volume-slider {
                width: 60px;
            }
            
            .spacer {
                flex: 1;
            }
            
            .stats-panel {
                position: absolute;
                top: 10px;
                left: 10px;
                background: rgba(0,0,0,0.9);
                color: white;
                padding: 10px;
                border-radius: 4px;
                font-size: 12px;
                min-width: 200px;
                z-index: 20;
            }
            
            .stats-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 10px;
                font-weight: bold;
            }
            
            .stats-close {
                background: none;
                border: none;
                color: white;
                cursor: pointer;
                font-size: 16px;
            }
            
            .stat-item {
                display: flex;
                justify-content: space-between;
                margin-bottom: 5px;
            }
            
            .stat-label {
                opacity: 0.7;
            }
        `;
        
        document.head.appendChild(style);
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Play/Pause button
        const playPauseBtn = this.container.querySelector('.play-pause-btn');
        if (playPauseBtn) {
            playPauseBtn.addEventListener('click', () => this.togglePlayPause());
        }
        
        // Stop button
        const stopBtn = this.container.querySelector('.stop-btn');
        if (stopBtn) {
            stopBtn.addEventListener('click', () => this.stopStream());
        }
        
        // Volume controls
        const volumeBtn = this.container.querySelector('.volume-btn');
        const volumeSlider = this.container.querySelector('.volume-slider');
        
        if (volumeBtn) {
            volumeBtn.addEventListener('click', () => this.toggleMute());
        }
        
        if (volumeSlider) {
            volumeSlider.addEventListener('input', (e) => this.setVolume(e.target.value));
        }
        
        // Fullscreen button
        const fullscreenBtn = this.container.querySelector('.fullscreen-btn');
        if (fullscreenBtn) {
            fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());
        }
        
        // Retry button
        const retryBtn = this.container.querySelector('.retry-button');
        if (retryBtn) {
            retryBtn.addEventListener('click', () => this.startStream());
        }
        
        // Stats panel
        const statsClose = this.container.querySelector('.stats-close');
        if (statsClose) {
            statsClose.addEventListener('click', () => this.hideStats());
        }
        
        // Quality button (toggle stats for now)
        const qualityBtn = this.container.querySelector('.quality-btn');
        if (qualityBtn) {
            qualityBtn.addEventListener('click', () => this.toggleStats());
        }
    }

    /**
     * Start streaming
     */
    async startStream() {
        if (!this.characterId) {
            this.showError('No character ID specified');
            return false;
        }
        
        this.showLoading(true);
        this.hideError();
        
        // Create stream client if not exists
        if (!this.streamClient) {
            this.streamClient = new StreamClient({
                characterId: this.characterId,
                autoReconnect: true
            });
            
            // Setup stream client event listeners
            this.setupStreamClientEvents();
        }
        
        try {
            const success = await this.streamClient.connect(this.videoElement);
            if (success) {
                this.isPlaying = true;
                this.updatePlayPauseButton();
                this.updateConnectionStatus('Connected', true);
            }
            return success;
        } catch (error) {
            this.showError('Failed to start stream: ' + error.message);
            return false;
        } finally {
            this.showLoading(false);
        }
    }

    /**
     * Stop streaming
     */
    stopStream() {
        if (this.streamClient) {
            this.streamClient.disconnect();
        }
        
        this.isPlaying = false;
        this.updatePlayPauseButton();
        this.updateConnectionStatus('Disconnected', false);
    }

    /**
     * Toggle play/pause
     */
    togglePlayPause() {
        if (this.isPlaying) {
            this.stopStream();
        } else {
            this.startStream();
        }
    }

    /**
     * Setup stream client event listeners
     */
    setupStreamClientEvents() {
        this.streamClient.on('connected', (data) => {
            console.log('Stream connected:', data);
            this.updateConnectionStatus('Connected', true);
            this.showLoading(false);
        });
        
        this.streamClient.on('disconnected', (data) => {
            console.log('Stream disconnected:', data);
            this.updateConnectionStatus('Disconnected', false);
            this.isPlaying = false;
            this.updatePlayPauseButton();
        });
        
        this.streamClient.on('reconnecting', (data) => {
            console.log('Stream reconnecting:', data);
            this.updateConnectionStatus(`Reconnecting (${data.attempt}/${data.maxAttempts})`, false);
        });
        
        this.streamClient.on('connectionFailed', (data) => {
            console.error('Stream connection failed:', data);
            this.showError('Connection failed: ' + data.error);
            this.updateConnectionStatus('Failed', false);
        });
        
        this.streamClient.on('stats', (stats) => {
            this.updateStats(stats);
        });
    }

    /**
     * Update connection status display
     */
    updateConnectionStatus(text, connected) {
        const statusText = this.container.querySelector('.status-text');
        const statusIndicator = this.container.querySelector('.status-indicator');
        
        if (statusText) statusText.textContent = text;
        if (statusIndicator) {
            statusIndicator.classList.toggle('connected', connected);
        }
    }

    /**
     * Show/hide loading indicator
     */
    showLoading(show) {
        const loading = this.container.querySelector('.loading-indicator');
        if (loading) {
            loading.style.display = show ? 'block' : 'none';
        }
    }

    /**
     * Show error message
     */
    showError(message) {
        const errorElement = this.container.querySelector('.error-message');
        const errorText = this.container.querySelector('.error-text');
        
        if (errorElement && errorText) {
            errorText.textContent = message;
            errorElement.style.display = 'block';
        }
    }

    /**
     * Hide error message
     */
    hideError() {
        const errorElement = this.container.querySelector('.error-message');
        if (errorElement) {
            errorElement.style.display = 'none';
        }
    }

    /**
     * Update play/pause button
     */
    updatePlayPauseButton() {
        const playIcon = this.container.querySelector('.play-icon');
        const pauseIcon = this.container.querySelector('.pause-icon');
        
        if (playIcon && pauseIcon) {
            playIcon.style.display = this.isPlaying ? 'none' : 'inline';
            pauseIcon.style.display = this.isPlaying ? 'inline' : 'none';
        }
    }

    /**
     * Toggle mute
     */
    toggleMute() {
        this.muted = !this.muted;
        if (this.videoElement) {
            this.videoElement.muted = this.muted;
        }
        
        const volumeBtn = this.container.querySelector('.volume-btn');
        if (volumeBtn) {
            volumeBtn.textContent = this.muted ? '🔇' : '🔊';
        }
    }

    /**
     * Set volume
     */
    setVolume(volume) {
        this.volume = parseFloat(volume);
        if (this.videoElement) {
            this.videoElement.volume = this.volume;
        }
    }

    /**
     * Toggle fullscreen
     */
    toggleFullscreen() {
        if (!this.isFullscreen) {
            if (this.container.requestFullscreen) {
                this.container.requestFullscreen();
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
        this.isFullscreen = !this.isFullscreen;
    }

    /**
     * Toggle stats panel
     */
    toggleStats() {
        if (this.statsElement) {
            const isVisible = this.statsElement.style.display !== 'none';
            this.statsElement.style.display = isVisible ? 'none' : 'block';
        }
    }

    /**
     * Hide stats panel
     */
    hideStats() {
        if (this.statsElement) {
            this.statsElement.style.display = 'none';
        }
    }

    /**
     * Update statistics display
     */
    updateStats(stats) {
        if (!this.statsElement) return;
        
        const updateStat = (name, value) => {
            const element = this.statsElement.querySelector(`[data-stat="${name}"]`);
            if (element) element.textContent = value;
        };
        
        updateStat('connection', stats.isConnected ? 'Connected' : 'Disconnected');
        updateStat('duration', this.formatDuration(stats.sessionDuration));
        updateStat('quality', stats.connectionType || 'MJPEG');
        updateStat('reconnects', stats.reconnectAttempts || 0);
    }

    /**
     * Format duration in MM:SS format
     */
    formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    /**
     * Set character ID and restart stream if playing
     */
    setCharacter(characterId) {
        const wasPlaying = this.isPlaying;
        
        if (wasPlaying) {
            this.stopStream();
        }
        
        this.characterId = characterId;
        
        if (this.streamClient) {
            this.streamClient.characterId = characterId;
        }
        
        if (wasPlaying) {
            this.startStream();
        }
    }

    /**
     * Destroy the component
     */
    destroy() {
        if (this.streamClient) {
            this.streamClient.disconnect();
        }
        
        this.container.innerHTML = '';
    }
}

export default VideoPlayerComponent;
