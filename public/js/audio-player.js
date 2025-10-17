/**
 * Advanced Audio Player with WaveSurfer.js
 * Professional audio player with waveform visualization and editing capabilities
 */

class AdvancedAudioPlayer {
    constructor(containerId) {
        this.containerId = containerId;
        this.wavesurfer = null;
        this.currentAudio = null;
        this.isPlaying = false;
        this.currentCharacter = null;
        this.regions = [];
        
        this.init();
    }

    async init() {
        await this.loadCurrentCharacter();
        this.createPlayerHTML();
        this.setupEventListeners();
    }

    async loadCurrentCharacter() {
        try {
            const response = await fetch('/setup/characters/api/current');
            const data = await response.json();

            if (data.success && data.selectedCharacter) {
                // Get character details
                const charResponse = await fetch(`/setup/characters/api/characters/${data.selectedCharacter}`);
                const charData = await charResponse.json();

                if (charData.success && charData.character) {
                    this.currentCharacter = charData.character;
                } else {
                    this.currentCharacter = { id: data.selectedCharacter, name: `Character ${data.selectedCharacter}` };
                }
            } else {
                this.currentCharacter = { id: 1, name: 'Default' };
            }
        } catch (error) {
            console.error('Error loading current character:', error);
            this.currentCharacter = { id: 1, name: 'Default' };
        }
    }

    createPlayerHTML() {
        const container = document.getElementById(this.containerId);
        container.innerHTML = `
            <div class="advanced-audio-player">
                <!-- Audio Info -->
                <div class="audio-info mb-3">
                    <div class="row">
                        <div class="col-md-8">
                            <h5 id="audioTitle" class="mb-1">No audio loaded</h5>
                            <p id="audioDescription" class="text-muted mb-0">Select an audio file to play</p>
                        </div>
                        <div class="col-md-4 text-end">
                            <div class="audio-metadata">
                                <small class="text-muted">
                                    <span id="audioFormat">--</span> • 
                                    <span id="audioDuration">--:--</span> • 
                                    <span id="audioSize">-- MB</span>
                                </small>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Waveform Container -->
                <div class="waveform-section mb-3">
                    <div id="waveform" class="waveform-container"></div>
                    <div class="waveform-controls mt-2">
                        <div class="row align-items-center">
                            <div class="col-md-6">
                                <div class="time-display">
                                    <span id="currentTime">0:00</span> / <span id="totalTime">0:00</span>
                                </div>
                            </div>
                            <div class="col-md-6 text-end">
                                <div class="zoom-controls">
                                    <button class="btn btn-sm btn-outline-secondary" id="zoomOut">
                                        <i class="bi bi-zoom-out"></i>
                                    </button>
                                    <button class="btn btn-sm btn-outline-secondary" id="zoomIn">
                                        <i class="bi bi-zoom-in"></i>
                                    </button>
                                    <button class="btn btn-sm btn-outline-secondary" id="zoomReset">
                                        <i class="bi bi-arrows-angle-contract"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Player Controls -->
                <div class="player-controls mb-3">
                    <div class="row align-items-center">
                        <div class="col-md-6">
                            <div class="playback-controls">
                                <button class="btn btn-primary" id="playPauseBtn" disabled>
                                    <i class="bi bi-play-fill"></i>
                                </button>
                                <button class="btn btn-outline-secondary" id="stopBtn" disabled>
                                    <i class="bi bi-stop-fill"></i>
                                </button>
                                <button class="btn btn-outline-secondary" id="skipBackBtn" disabled>
                                    <i class="bi bi-skip-backward-fill"></i>
                                </button>
                                <button class="btn btn-outline-secondary" id="skipForwardBtn" disabled>
                                    <i class="bi bi-skip-forward-fill"></i>
                                </button>
                            </div>
                        </div>
                        <div class="col-md-6">
                            <div class="volume-controls d-flex align-items-center">
                                <i class="bi bi-volume-up me-2"></i>
                                <input type="range" class="form-range" id="volumeSlider" 
                                       min="0" max="100" value="80" style="width: 120px;">
                                <span class="ms-2 small" id="volumeDisplay">80%</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Character Playback Controls -->
                <div class="character-controls mb-3">
                    <div class="card">
                        <div class="card-body">
                            <h6 class="card-title">
                                <i class="bi bi-robot"></i>
                                Character Playback
                            </h6>
                            <div class="row align-items-center">
                                <div class="col-md-6">
                                    <div class="character-info">
                                        <strong id="characterName">Loading...</strong>
                                        <br>
                                        <small class="text-muted">Current character</small>
                                    </div>
                                </div>
                                <div class="col-md-6 text-end">
                                    <button class="btn btn-success" id="playOnCharacterBtn" disabled>
                                        <i class="bi bi-speaker-fill"></i>
                                        Play on Character Speaker
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Basic Editing Tools -->
                <div class="editing-tools">
                    <div class="card">
                        <div class="card-header">
                            <h6 class="mb-0">
                                <i class="bi bi-scissors"></i>
                                Basic Editing Tools
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6">
                                    <div class="trim-controls">
                                        <h6 class="small">Trim Audio</h6>
                                        <div class="btn-group" role="group">
                                            <button class="btn btn-sm btn-outline-primary" id="setStartBtn" disabled>
                                                <i class="bi bi-skip-start"></i> Set Start
                                            </button>
                                            <button class="btn btn-sm btn-outline-primary" id="setEndBtn" disabled>
                                                <i class="bi bi-skip-end"></i> Set End
                                            </button>
                                            <button class="btn btn-sm btn-outline-success" id="previewTrimBtn" disabled>
                                                <i class="bi bi-play"></i> Preview
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <div class="fade-controls">
                                        <h6 class="small">Fade Effects</h6>
                                        <div class="btn-group" role="group">
                                            <button class="btn btn-sm btn-outline-info" id="fadeInBtn" disabled>
                                                <i class="bi bi-arrow-up-right"></i> Fade In
                                            </button>
                                            <button class="btn btn-sm btn-outline-info" id="fadeOutBtn" disabled>
                                                <i class="bi bi-arrow-down-right"></i> Fade Out
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="row mt-3">
                                <div class="col-12">
                                    <div class="selection-info">
                                        <small class="text-muted">
                                            Selection: <span id="selectionInfo">No selection</span>
                                        </small>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <style>
                .advanced-audio-player {
                    max-width: 100%;
                }
                
                .waveform-container {
                    height: 120px;
                    border: 1px solid var(--bs-border-color);
                    border-radius: 8px;
                    background: var(--bs-body-bg);
                }
                
                .playback-controls .btn {
                    margin-right: 8px;
                }
                
                .playback-controls .btn:last-child {
                    margin-right: 0;
                }
                
                .time-display {
                    font-family: 'Courier New', monospace;
                    font-weight: bold;
                }
                
                .character-controls .card {
                    background: rgba(13, 110, 253, 0.1);
                    border-color: rgba(13, 110, 253, 0.3);
                }
                
                .editing-tools .card {
                    background: rgba(25, 135, 84, 0.1);
                    border-color: rgba(25, 135, 84, 0.3);
                }
                
                .volume-controls .form-range {
                    background: transparent;
                }
                
                .zoom-controls .btn {
                    margin-left: 4px;
                }
            </style>
        `;

        // Update character name
        if (this.currentCharacter) {
            document.getElementById('characterName').textContent = 
                this.currentCharacter.name || `Character ${this.currentCharacter.id}`;
        }
    }

    setupEventListeners() {
        // Playback controls
        document.getElementById('playPauseBtn').addEventListener('click', () => this.togglePlayPause());
        document.getElementById('stopBtn').addEventListener('click', () => this.stop());
        document.getElementById('skipBackBtn').addEventListener('click', () => this.skipBackward());
        document.getElementById('skipForwardBtn').addEventListener('click', () => this.skipForward());

        // Volume control
        const volumeSlider = document.getElementById('volumeSlider');
        volumeSlider.addEventListener('input', (e) => {
            const volume = e.target.value / 100;
            if (this.wavesurfer) {
                this.wavesurfer.setVolume(volume);
            }
            document.getElementById('volumeDisplay').textContent = e.target.value + '%';
        });

        // Zoom controls
        document.getElementById('zoomIn').addEventListener('click', () => this.zoomIn());
        document.getElementById('zoomOut').addEventListener('click', () => this.zoomOut());
        document.getElementById('zoomReset').addEventListener('click', () => this.zoomReset());

        // Character playback
        document.getElementById('playOnCharacterBtn').addEventListener('click', () => this.playOnCharacter());

        // Editing tools
        document.getElementById('setStartBtn').addEventListener('click', () => this.setTrimStart());
        document.getElementById('setEndBtn').addEventListener('click', () => this.setTrimEnd());
        document.getElementById('previewTrimBtn').addEventListener('click', () => this.previewTrim());
        document.getElementById('fadeInBtn').addEventListener('click', () => this.applyFadeIn());
        document.getElementById('fadeOutBtn').addEventListener('click', () => this.applyFadeOut());
    }

    async loadAudio(audioData) {
        this.currentAudio = audioData;

        // Update audio info (safely handle missing elements)
        const audioTitle = document.getElementById('audioTitle');
        if (audioTitle) audioTitle.textContent = audioData.title;

        const audioDescription = document.getElementById('audioDescription');
        if (audioDescription) audioDescription.textContent = audioData.description || 'No description';

        const audioFormat = document.getElementById('audioFormat');
        if (audioFormat) audioFormat.textContent = audioData.format.toUpperCase();

        const audioDuration = document.getElementById('audioDuration');
        if (audioDuration) audioDuration.textContent = this.formatDuration(audioData.duration);

        const audioSize = document.getElementById('audioSize');
        if (audioSize) audioSize.textContent = this.formatFileSize(audioData.fileSize);

        // Wait for DOM to be fully rendered
        await new Promise(resolve => setTimeout(resolve, 100));

        // Initialize WaveSurfer
        await this.initWaveSurfer();

        // Load the audio file if WaveSurfer was successfully initialized
        if (this.wavesurfer) {
            const audioUrl = `/audio-library/api/audio/${audioData.id}/download`;
            this.wavesurfer.load(audioUrl);
        }

        // Enable controls
        this.enableControls();
    }

    async initWaveSurfer() {
        // Destroy existing instance
        if (this.wavesurfer) {
            this.wavesurfer.destroy();
        }

        // Check if waveform container exists
        const waveformContainer = document.getElementById('waveform');
        if (!waveformContainer) {
            console.error('Waveform container not found. Make sure createPlayerHTML() was called first.');
            return;
        }

        // Import WaveSurfer dynamically
        const WaveSurfer = await import('https://cdn.jsdelivr.net/npm/wavesurfer.js@7/dist/wavesurfer.esm.js');

        // Create new WaveSurfer instance
        // Use MediaElement backend instead of WebAudio to support MP3 files
        // WebAudio cannot decode MP3 - it only supports WAV, OGG, etc.
        // MediaElement uses HTML5 audio element which natively supports MP3
        this.wavesurfer = WaveSurfer.default.create({
            container: '#waveform',
            waveColor: '#0d6efd',
            progressColor: '#6610f2',
            cursorColor: '#ffc107',
            barWidth: 2,
            barRadius: 3,
            responsive: true,
            height: 100,
            normalize: true,
            backend: 'MediaElement'
        });

        // Set up WaveSurfer event listeners
        this.wavesurfer.on('ready', () => {
            const duration = this.wavesurfer.getDuration();
            document.getElementById('totalTime').textContent = this.formatDuration(duration);
            this.enableControls();
        });

        this.wavesurfer.on('audioprocess', () => {
            const currentTime = this.wavesurfer.getCurrentTime();
            document.getElementById('currentTime').textContent = this.formatDuration(currentTime);
        });

        this.wavesurfer.on('play', () => {
            this.isPlaying = true;
            this.updatePlayButton();
        });

        this.wavesurfer.on('pause', () => {
            this.isPlaying = false;
            this.updatePlayButton();
        });

        this.wavesurfer.on('finish', () => {
            this.isPlaying = false;
            this.updatePlayButton();
        });
    }

    togglePlayPause() {
        if (!this.wavesurfer) return;

        if (this.isPlaying) {
            this.wavesurfer.pause();
        } else {
            this.wavesurfer.play();
        }
    }

    stop() {
        if (!this.wavesurfer) return;
        this.wavesurfer.stop();
        this.isPlaying = false;
        this.updatePlayButton();
    }

    skipBackward() {
        if (!this.wavesurfer) return;
        const currentTime = this.wavesurfer.getCurrentTime();
        this.wavesurfer.seekTo(Math.max(0, currentTime - 10) / this.wavesurfer.getDuration());
    }

    skipForward() {
        if (!this.wavesurfer) return;
        const currentTime = this.wavesurfer.getCurrentTime();
        const duration = this.wavesurfer.getDuration();
        this.wavesurfer.seekTo(Math.min(duration, currentTime + 10) / duration);
    }

    zoomIn() {
        if (!this.wavesurfer) return;
        this.wavesurfer.zoom(this.wavesurfer.params.minPxPerSec * 1.5);
    }

    zoomOut() {
        if (!this.wavesurfer) return;
        this.wavesurfer.zoom(this.wavesurfer.params.minPxPerSec * 0.75);
    }

    zoomReset() {
        if (!this.wavesurfer) return;
        this.wavesurfer.zoom(50); // Default zoom level
    }

    async playOnCharacter() {
        if (!this.currentAudio) return;

        try {
            const response = await fetch(`/audio-library/api/audio/${this.currentAudio.id}/play`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    characterId: this.currentCharacter.id,
                    volume: document.getElementById('volumeSlider').value
                })
            });

            const data = await response.json();

            if (data.success) {
                this.showSuccess(`Playing "${data.audio.title}" on ${this.currentCharacter.name || 'Character ' + this.currentCharacter.id}`);
            } else {
                this.showError(data.error || 'Failed to play audio');
            }
        } catch (error) {
            console.error('Error playing audio on character:', error);
            this.showError('Failed to play audio on character');
        }
    }

    // Basic editing methods (placeholders for now)
    setTrimStart() {
        if (!this.wavesurfer) return;
        const currentTime = this.wavesurfer.getCurrentTime();
        this.trimStart = currentTime;
        this.updateSelectionInfo();
        alert(`Trim start set to ${this.formatDuration(currentTime)}`);
    }

    setTrimEnd() {
        if (!this.wavesurfer) return;
        const currentTime = this.wavesurfer.getCurrentTime();
        this.trimEnd = currentTime;
        this.updateSelectionInfo();
        alert(`Trim end set to ${this.formatDuration(currentTime)}`);
    }

    previewTrim() {
        if (!this.wavesurfer || !this.trimStart || !this.trimEnd) return;

        const duration = this.wavesurfer.getDuration();
        const startRatio = this.trimStart / duration;
        const endRatio = this.trimEnd / duration;

        this.wavesurfer.seekTo(startRatio);
        this.wavesurfer.play();

        // Stop at trim end
        setTimeout(() => {
            if (this.wavesurfer && this.isPlaying) {
                this.wavesurfer.pause();
            }
        }, (this.trimEnd - this.trimStart) * 1000);
    }

    applyFadeIn() {
        alert('Fade in effect would be applied here (advanced feature)');
    }

    applyFadeOut() {
        alert('Fade out effect would be applied here (advanced feature)');
    }

    updateSelectionInfo() {
        const info = document.getElementById('selectionInfo');
        if (this.trimStart !== undefined && this.trimEnd !== undefined) {
            const duration = this.trimEnd - this.trimStart;
            info.textContent = `${this.formatDuration(this.trimStart)} - ${this.formatDuration(this.trimEnd)} (${this.formatDuration(duration)})`;
        } else if (this.trimStart !== undefined) {
            info.textContent = `Start: ${this.formatDuration(this.trimStart)}`;
        } else if (this.trimEnd !== undefined) {
            info.textContent = `End: ${this.formatDuration(this.trimEnd)}`;
        } else {
            info.textContent = 'No selection';
        }
    }

    enableControls() {
        const controls = [
            'playPauseBtn', 'stopBtn', 'skipBackBtn', 'skipForwardBtn',
            'playOnCharacterBtn', 'setStartBtn', 'setEndBtn', 'previewTrimBtn',
            'fadeInBtn', 'fadeOutBtn'
        ];

        controls.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.disabled = false;
            }
        });
    }

    updatePlayButton() {
        const btn = document.getElementById('playPauseBtn');
        const icon = btn.querySelector('i');

        if (this.isPlaying) {
            icon.className = 'bi bi-pause-fill';
        } else {
            icon.className = 'bi bi-play-fill';
        }
    }

    formatDuration(seconds) {
        if (!seconds || isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    showSuccess(message) {
        alert('✅ ' + message);
    }

    showError(message) {
        alert('❌ ' + message);
    }

    destroy() {
        if (this.wavesurfer) {
            this.wavesurfer.destroy();
            this.wavesurfer = null;
        }
    }
}
