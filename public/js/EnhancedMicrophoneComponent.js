/**
 * Enhanced Microphone Component for MonsterBox
 * Provides improved UI/UX for microphone input with visual feedback,
 * accessibility features, and integration with STT and audio streaming
 */

class EnhancedMicrophoneComponent {
    constructor(options = {}) {
        this.containerId = options.containerId || 'microphoneContainer';
        this.characterId = options.characterId || null;
        this.onTranscription = options.onTranscription || null;
        this.onAudioData = options.onAudioData || null;
        this.onError = options.onError || null;
        this.onStatusChange = options.onStatusChange || null;
        
        // Audio processing settings
        this.audioSettings = {
            sampleRate: options.sampleRate || 16000,
            channels: options.channels || 1,
            echoCancellation: options.echoCancellation !== false,
            noiseSuppression: options.noiseSuppression !== false,
            autoGainControl: options.autoGainControl !== false,
            sensitivity: options.sensitivity || 0.5
        };
        
        // Component state
        this.isRecording = false;
        this.isInitialized = false;
        this.mediaRecorder = null;
        this.audioContext = null;
        this.analyser = null;
        this.microphone = null;
        this.animationId = null;
        this.audioChunks = [];
        
        // WebSocket connections
        this.sttWebSocket = null;
        this.audioWebSocket = null;
        
        // UI elements
        this.container = null;
        this.recordButton = null;
        this.statusDisplay = null;
        this.audioLevelBar = null;
        this.settingsPanel = null;
        
        this.init();
    }
    
    async init() {
        try {
            await this.createUI();
            await this.setupAudioContext();
            await this.connectWebSockets();
            this.isInitialized = true;
            this.updateStatus('Ready', 'ready');
        } catch (error) {
            console.error('Failed to initialize microphone component:', error);
            this.handleError('Initialization failed: ' + error.message);
        }
    }
    
    async createUI() {
        this.container = document.getElementById(this.containerId);
        if (!this.container) {
            throw new Error(`Container element with ID '${this.containerId}' not found`);
        }
        
        this.container.innerHTML = `
            <div class="enhanced-microphone-component">
                <div class="mic-header">
                    <h3><i class="fas fa-microphone"></i> Enhanced Microphone Control</h3>
                    <div class="mic-status" id="micStatus">
                        <span class="status-text">Initializing...</span>
                        <div class="status-indicator status-loading"></div>
                    </div>
                </div>
                
                <div class="mic-controls">
                    <button class="mic-record-btn" id="micRecordBtn" disabled>
                        <i class="fas fa-microphone"></i>
                        <span class="btn-text">Start Recording</span>
                    </button>
                    
                    <div class="audio-visualizer">
                        <div class="audio-level-container">
                            <div class="audio-level-bar" id="audioLevelBar"></div>
                            <div class="audio-level-text">Audio Level</div>
                        </div>
                        <div class="frequency-bars" id="frequencyBars">
                            ${Array.from({length: 8}, (_, i) => `<div class="freq-bar" data-freq="${i}"></div>`).join('')}
                        </div>
                    </div>
                </div>
                
                <div class="mic-settings" id="micSettings">
                    <div class="settings-header">
                        <span>Audio Settings</span>
                        <button class="settings-toggle" id="settingsToggle">
                            <i class="fas fa-cog"></i>
                        </button>
                    </div>
                    <div class="settings-panel" id="settingsPanel" style="display: none;">
                        <div class="setting-group">
                            <label for="micSensitivity">Sensitivity</label>
                            <input type="range" id="micSensitivity" min="0.1" max="2.0" step="0.1" value="${this.audioSettings.sensitivity}">
                            <span class="setting-value">${this.audioSettings.sensitivity}</span>
                        </div>
                        <div class="setting-group">
                            <label>
                                <input type="checkbox" id="echoCancellation" ${this.audioSettings.echoCancellation ? 'checked' : ''}>
                                Echo Cancellation
                            </label>
                        </div>
                        <div class="setting-group">
                            <label>
                                <input type="checkbox" id="noiseSuppression" ${this.audioSettings.noiseSuppression ? 'checked' : ''}>
                                Noise Suppression
                            </label>
                        </div>
                        <div class="setting-group">
                            <label>
                                <input type="checkbox" id="autoGainControl" ${this.audioSettings.autoGainControl ? 'checked' : ''}>
                                Auto Gain Control
                            </label>
                        </div>
                    </div>
                </div>
                
                <div class="mic-output" id="micOutput">
                    <div class="transcription-display" id="transcriptionDisplay">
                        <div class="transcription-header">Live Transcription</div>
                        <div class="transcription-text" id="transcriptionText">
                            Transcription will appear here when you start speaking...
                        </div>
                        <div class="transcription-confidence" id="transcriptionConfidence">
                            <span>Confidence: </span>
                            <div class="confidence-bar">
                                <div class="confidence-fill" id="confidenceFill"></div>
                            </div>
                            <span id="confidencePercent">0%</span>
                        </div>
                    </div>
                </div>
                
                <div class="mic-actions">
                    <button class="action-btn secondary" id="clearBtn">
                        <i class="fas fa-trash"></i> Clear
                    </button>
                    <button class="action-btn secondary" id="downloadBtn" disabled>
                        <i class="fas fa-download"></i> Download
                    </button>
                    <button class="action-btn primary" id="testBtn">
                        <i class="fas fa-test-tube"></i> Test Connection
                    </button>
                </div>
            </div>
        `;
        
        this.setupEventListeners();
        this.applyStyles();
    }
    
    applyStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .enhanced-microphone-component {
                background: #001100;
                border: 2px solid #00ff00;
                border-radius: 12px;
                padding: 20px;
                margin: 20px 0;
                font-family: 'Courier New', monospace;
            }
            
            .mic-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 20px;
                padding-bottom: 10px;
                border-bottom: 1px solid #00ff00;
            }
            
            .mic-header h3 {
                color: #00ff00;
                margin: 0;
                font-size: 1.2em;
            }
            
            .mic-status {
                display: flex;
                align-items: center;
                gap: 10px;
            }
            
            .status-text {
                color: #cccccc;
                font-size: 0.9em;
            }
            
            .status-indicator {
                width: 12px;
                height: 12px;
                border-radius: 50%;
                transition: all 0.3s ease;
            }
            
            .status-indicator.status-ready { background: #00ff00; }
            .status-indicator.status-recording { background: #ff0000; animation: pulse 1s infinite; }
            .status-indicator.status-error { background: #ff0000; }
            .status-indicator.status-loading { background: #ffff00; animation: pulse 1s infinite; }
            
            .mic-controls {
                display: flex;
                align-items: center;
                gap: 20px;
                margin: 20px 0;
            }
            
            .mic-record-btn {
                background: #ff0000;
                border: none;
                border-radius: 50%;
                width: 80px;
                height: 80px;
                color: white;
                font-size: 1.5em;
                cursor: pointer;
                transition: all 0.3s ease;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                position: relative;
            }
            
            .mic-record-btn:hover:not(:disabled) {
                background: #ff3333;
                transform: scale(1.05);
            }
            
            .mic-record-btn:disabled {
                background: #666666;
                cursor: not-allowed;
            }
            
            .mic-record-btn.recording {
                background: #ffff00;
                color: #000000;
                animation: pulse 1s infinite;
            }
            
            .btn-text {
                font-size: 0.3em;
                margin-top: 5px;
            }
            
            .audio-visualizer {
                flex: 1;
                display: flex;
                flex-direction: column;
                gap: 10px;
            }
            
            .audio-level-container {
                position: relative;
                height: 30px;
                background: #000800;
                border: 1px solid #00ff00;
                border-radius: 15px;
                overflow: hidden;
            }
            
            .audio-level-bar {
                height: 100%;
                background: linear-gradient(90deg, #00ff00, #ffff00, #ff0000);
                width: 0%;
                transition: width 0.1s ease;
            }
            
            .audio-level-text {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                color: #ffffff;
                font-size: 0.8em;
                text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
            }
            
            .frequency-bars {
                display: flex;
                gap: 2px;
                height: 40px;
                align-items: end;
            }
            
            .freq-bar {
                flex: 1;
                background: #00ff00;
                min-height: 2px;
                transition: height 0.1s ease;
                border-radius: 2px 2px 0 0;
            }
            
            .mic-settings {
                background: #000800;
                border: 1px solid #00ff00;
                border-radius: 8px;
                margin: 15px 0;
            }
            
            .settings-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 10px 15px;
                color: #00ff00;
                cursor: pointer;
            }
            
            .settings-toggle {
                background: none;
                border: none;
                color: #00ff00;
                cursor: pointer;
                font-size: 1.1em;
            }
            
            .settings-panel {
                padding: 15px;
                border-top: 1px solid #00ff00;
            }
            
            .setting-group {
                display: flex;
                align-items: center;
                gap: 10px;
                margin: 10px 0;
                color: #cccccc;
            }
            
            .setting-group label {
                flex: 1;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            .setting-group input[type="range"] {
                flex: 2;
                background: #000800;
                border: 1px solid #00ff00;
            }
            
            .setting-value {
                min-width: 40px;
                text-align: center;
                color: #00ff00;
            }
            
            .mic-output {
                margin: 20px 0;
            }
            
            .transcription-display {
                background: #000800;
                border: 1px solid #00ff00;
                border-radius: 8px;
                padding: 15px;
            }
            
            .transcription-header {
                color: #00ff00;
                font-weight: bold;
                margin-bottom: 10px;
            }
            
            .transcription-text {
                color: #ffffff;
                min-height: 60px;
                padding: 10px;
                background: #001100;
                border-radius: 5px;
                margin-bottom: 10px;
                font-style: italic;
            }
            
            .transcription-confidence {
                display: flex;
                align-items: center;
                gap: 10px;
                color: #cccccc;
            }
            
            .confidence-bar {
                flex: 1;
                height: 8px;
                background: #000800;
                border: 1px solid #00ff00;
                border-radius: 4px;
                overflow: hidden;
            }
            
            .confidence-fill {
                height: 100%;
                background: linear-gradient(90deg, #ff0000, #ffff00, #00ff00);
                width: 0%;
                transition: width 0.3s ease;
            }
            
            .mic-actions {
                display: flex;
                gap: 10px;
                justify-content: center;
                margin-top: 20px;
            }
            
            .action-btn {
                padding: 10px 20px;
                border: 1px solid #00ff00;
                border-radius: 5px;
                background: #000800;
                color: #00ff00;
                cursor: pointer;
                transition: all 0.3s ease;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            .action-btn:hover:not(:disabled) {
                background: #00ff00;
                color: #000000;
            }
            
            .action-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
            
            .action-btn.primary {
                background: #00ff00;
                color: #000000;
            }
            
            .action-btn.primary:hover {
                background: #33ff33;
            }
            
            @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.5; }
            }
        `;
        
        if (!document.getElementById('enhanced-microphone-styles')) {
            style.id = 'enhanced-microphone-styles';
            document.head.appendChild(style);
        }
    }

    setupEventListeners() {
        // Get UI elements
        this.recordButton = document.getElementById('micRecordBtn');
        this.statusDisplay = document.getElementById('micStatus');
        this.audioLevelBar = document.getElementById('audioLevelBar');
        this.settingsPanel = document.getElementById('settingsPanel');

        // Record button
        this.recordButton.addEventListener('click', () => this.toggleRecording());

        // Settings toggle
        document.getElementById('settingsToggle').addEventListener('click', () => {
            const panel = this.settingsPanel;
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        });

        // Settings controls
        document.getElementById('micSensitivity').addEventListener('input', (e) => {
            this.audioSettings.sensitivity = parseFloat(e.target.value);
            e.target.nextElementSibling.textContent = e.target.value;
        });

        document.getElementById('echoCancellation').addEventListener('change', (e) => {
            this.audioSettings.echoCancellation = e.target.checked;
        });

        document.getElementById('noiseSuppression').addEventListener('change', (e) => {
            this.audioSettings.noiseSuppression = e.target.checked;
        });

        document.getElementById('autoGainControl').addEventListener('change', (e) => {
            this.audioSettings.autoGainControl = e.target.checked;
        });

        // Action buttons
        document.getElementById('clearBtn').addEventListener('click', () => this.clearResults());
        document.getElementById('downloadBtn').addEventListener('click', () => this.downloadRecording());
        document.getElementById('testBtn').addEventListener('click', () => this.testConnection());
    }

    async setupAudioContext() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log('Audio context initialized');
        } catch (error) {
            throw new Error('Web Audio API not supported: ' + error.message);
        }
    }

    async connectWebSockets() {
        try {
            // Connect to Enhanced Audio Stream WebSocket
            const enhancedAudioUrl = `ws://${window.location.hostname}:${window.location.port}/enhanced-audiostream`;
            this.enhancedAudioWebSocket = new WebSocket(enhancedAudioUrl);

            this.enhancedAudioWebSocket.onopen = () => {
                console.log('Connected to Enhanced Audio Stream WebSocket');

                // Subscribe to STT updates
                this.enhancedAudioWebSocket.send(JSON.stringify({
                    type: 'subscribeSTT',
                    timestamp: Date.now()
                }));

                // Subscribe to jaw animation updates
                this.enhancedAudioWebSocket.send(JSON.stringify({
                    type: 'subscribeJawAnimation',
                    timestamp: Date.now()
                }));
            };

            this.enhancedAudioWebSocket.onmessage = (event) => {
                this.handleEnhancedAudioMessage(JSON.parse(event.data));
            };

            this.enhancedAudioWebSocket.onerror = (error) => {
                console.error('Enhanced Audio WebSocket error:', error);
            };

            this.enhancedAudioWebSocket.onclose = () => {
                console.log('Enhanced Audio WebSocket connection closed');
                // Attempt to reconnect after a delay
                setTimeout(() => {
                    if (!this.enhancedAudioWebSocket || this.enhancedAudioWebSocket.readyState === WebSocket.CLOSED) {
                        this.connectWebSockets();
                    }
                }, 3000);
            };

        } catch (error) {
            console.error('Failed to connect Enhanced Audio WebSocket:', error);
        }
    }

    async toggleRecording() {
        if (!this.isInitialized) {
            this.handleError('Component not initialized');
            return;
        }

        if (this.isRecording) {
            await this.stopRecording();
        } else {
            await this.startRecording();
        }
    }

    async startRecording() {
        try {
            // Request microphone lock from enhanced audio stream
            if (this.enhancedAudioWebSocket && this.enhancedAudioWebSocket.readyState === WebSocket.OPEN) {
                this.enhancedAudioWebSocket.send(JSON.stringify({
                    type: 'requestMic',
                    clientId: `microphone-component-${Date.now()}`,
                    timestamp: Date.now()
                }));
            }

            // Request microphone access
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    sampleRate: this.audioSettings.sampleRate,
                    channelCount: this.audioSettings.channels,
                    echoCancellation: this.audioSettings.echoCancellation,
                    noiseSuppression: this.audioSettings.noiseSuppression,
                    autoGainControl: this.audioSettings.autoGainControl
                }
            });

            // Set up audio analysis
            this.analyser = this.audioContext.createAnalyser();
            this.microphone = this.audioContext.createMediaStreamSource(stream);
            this.microphone.connect(this.analyser);
            this.analyser.fftSize = 256;

            // Start visual feedback
            this.startAudioVisualization();

            // Set up media recorder
            this.mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus'
            });

            this.audioChunks = [];

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                    this.sendAudioToEnhancedStream(event.data);
                }
            };

            this.mediaRecorder.onstop = () => {
                this.processRecording();
            };

            // Start recording
            this.mediaRecorder.start(100); // 100ms chunks for real-time processing
            this.isRecording = true;

            // Update UI
            this.updateRecordingUI(true);
            this.updateStatus('Recording...', 'recording');

            if (this.onStatusChange) {
                this.onStatusChange('recording', 'Microphone recording started');
            }

        } catch (error) {
            this.handleError('Failed to start recording: ' + error.message);
        }
    }

    async stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;

            // Stop audio visualization
            this.stopAudioVisualization();

            // Stop microphone stream
            if (this.microphone && this.microphone.mediaStream) {
                this.microphone.mediaStream.getTracks().forEach(track => track.stop());
            }

            // Update UI
            this.updateRecordingUI(false);
            this.updateStatus('Processing...', 'loading');

            if (this.onStatusChange) {
                this.onStatusChange('stopped', 'Recording stopped, processing...');
            }
        }
    }

    startAudioVisualization() {
        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        const frequencyBars = document.querySelectorAll('.freq-bar');

        const updateVisualization = () => {
            if (!this.isRecording) return;

            this.analyser.getByteFrequencyData(dataArray);

            // Update audio level bar
            let sum = 0;
            for (let i = 0; i < bufferLength; i++) {
                sum += dataArray[i];
            }
            const average = sum / bufferLength;
            const percentage = (average / 255) * 100 * this.audioSettings.sensitivity;
            this.audioLevelBar.style.width = Math.min(percentage, 100) + '%';

            // Update frequency bars
            const barCount = frequencyBars.length;
            const barWidth = Math.floor(bufferLength / barCount);

            for (let i = 0; i < barCount; i++) {
                let barSum = 0;
                for (let j = 0; j < barWidth; j++) {
                    barSum += dataArray[i * barWidth + j];
                }
                const barAverage = barSum / barWidth;
                const barHeight = (barAverage / 255) * 40; // 40px max height
                frequencyBars[i].style.height = barHeight + 'px';
            }

            this.animationId = requestAnimationFrame(updateVisualization);
        };

        updateVisualization();
    }

    stopAudioVisualization() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }

        // Reset visual elements
        this.audioLevelBar.style.width = '0%';
        document.querySelectorAll('.freq-bar').forEach(bar => {
            bar.style.height = '2px';
        });
    }

    sendAudioToWebSockets(audioData) {
        // Send to STT WebSocket
        if (this.sttWebSocket && this.sttWebSocket.readyState === WebSocket.OPEN) {
            const reader = new FileReader();
            reader.onload = () => {
                const base64Data = reader.result.split(',')[1];
                this.sttWebSocket.send(JSON.stringify({
                    type: 'audio_data',
                    data: base64Data,
                    sample_rate: this.audioSettings.sampleRate,
                    format: 'webm',
                    character_id: this.characterId,
                    timestamp: Date.now()
                }));
            };
            reader.readAsDataURL(audioData);
        }

        // Send to Audio WebSocket for jaw animation
        if (this.audioWebSocket && this.audioWebSocket.readyState === WebSocket.OPEN) {
            const reader = new FileReader();
            reader.onload = () => {
                const base64Data = reader.result.split(',')[1];
                this.audioWebSocket.send(JSON.stringify({
                    type: 'audio_stream',
                    data: base64Data,
                    sample_rate: this.audioSettings.sampleRate,
                    character_id: this.characterId,
                    timestamp: Date.now()
                }));
            };
            reader.readAsDataURL(audioData);
        }
    }

    handleSTTMessage(message) {
        switch (message.type) {
            case 'transcription':
                this.displayTranscription(message.text, message.confidence);
                if (this.onTranscription) {
                    this.onTranscription(message.text, message.confidence);
                }
                break;
            case 'error':
                this.handleError('STT Error: ' + message.error);
                break;
            case 'status':
                console.log('STT Status:', message.status);
                break;
        }
    }

    displayTranscription(text, confidence = 1.0) {
        const transcriptionText = document.getElementById('transcriptionText');
        const confidenceFill = document.getElementById('confidenceFill');
        const confidencePercent = document.getElementById('confidencePercent');

        transcriptionText.textContent = text;
        transcriptionText.style.fontStyle = 'normal';

        const confidencePercentage = Math.round(confidence * 100);
        confidenceFill.style.width = confidencePercentage + '%';
        confidencePercent.textContent = confidencePercentage + '%';

        // Enable download button
        document.getElementById('downloadBtn').disabled = false;
    }

    processRecording() {
        if (this.audioChunks.length === 0) {
            this.updateStatus('No audio recorded', 'error');
            return;
        }

        // Create audio blob
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });

        // Store for download
        this.lastRecording = audioBlob;

        // Send for transcription if no real-time STT
        if (!this.sttWebSocket || this.sttWebSocket.readyState !== WebSocket.OPEN) {
            this.sendForTranscription(audioBlob);
        }

        this.updateStatus('Ready', 'ready');
    }

    async sendForTranscription(audioBlob) {
        try {
            const formData = new FormData();
            formData.append('audio', audioBlob, 'recording.webm');

            const response = await fetch('/ai-management/api/stt/transcribe', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                this.displayTranscription(result.text, result.confidence);
            } else {
                this.handleError('Transcription failed: ' + result.error);
            }
        } catch (error) {
            this.handleError('Transcription request failed: ' + error.message);
        }
    }

    updateRecordingUI(isRecording) {
        const button = this.recordButton;
        const icon = button.querySelector('i');
        const text = button.querySelector('.btn-text');

        if (isRecording) {
            button.classList.add('recording');
            icon.className = 'fas fa-stop';
            text.textContent = 'Stop Recording';
        } else {
            button.classList.remove('recording');
            icon.className = 'fas fa-microphone';
            text.textContent = 'Start Recording';
        }

        button.disabled = false;
    }

    updateStatus(message, status) {
        const statusText = document.querySelector('.status-text');
        const statusIndicator = document.querySelector('.status-indicator');

        statusText.textContent = message;
        statusIndicator.className = `status-indicator status-${status}`;
    }

    clearResults() {
        const transcriptionText = document.getElementById('transcriptionText');
        const confidenceFill = document.getElementById('confidenceFill');
        const confidencePercent = document.getElementById('confidencePercent');

        transcriptionText.textContent = 'Transcription will appear here when you start speaking...';
        transcriptionText.style.fontStyle = 'italic';
        confidenceFill.style.width = '0%';
        confidencePercent.textContent = '0%';

        document.getElementById('downloadBtn').disabled = true;
        this.audioChunks = [];
        this.lastRecording = null;
    }

    downloadRecording() {
        if (!this.lastRecording) {
            this.handleError('No recording available for download');
            return;
        }

        const url = URL.createObjectURL(this.lastRecording);
        const a = document.createElement('a');
        a.href = url;
        a.download = `microphone-recording-${Date.now()}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    async testConnection() {
        try {
            this.updateStatus('Testing connections...', 'loading');

            // Test STT connection
            const sttResponse = await fetch('/ai-management/api/stt/status');
            const sttData = await sttResponse.json();

            if (!sttData.success) {
                throw new Error('STT service not available');
            }

            // Test microphone access
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                stream.getTracks().forEach(track => track.stop());
            } catch (error) {
                throw new Error('Microphone access denied');
            }

            this.updateStatus('All connections OK', 'ready');

            // Show success message
            this.showMessage('Connection test successful!', 'success');

        } catch (error) {
            this.handleError('Connection test failed: ' + error.message);
        }
    }

    handleError(message) {
        console.error('Microphone Component Error:', message);
        this.updateStatus('Error: ' + message, 'error');
        this.showMessage(message, 'error');

        if (this.onError) {
            this.onError(message);
        }
    }

    showMessage(message, type = 'info') {
        // Create or update message display
        let messageDiv = document.querySelector('.mic-message');
        if (!messageDiv) {
            messageDiv = document.createElement('div');
            messageDiv.className = 'mic-message';
            this.container.appendChild(messageDiv);
        }

        messageDiv.className = `mic-message mic-message-${type}`;
        messageDiv.innerHTML = `
            <i class="fas fa-${type === 'error' ? 'exclamation-triangle' : type === 'success' ? 'check-circle' : 'info-circle'}"></i>
            ${message}
        `;

        // Auto-hide after 5 seconds
        setTimeout(() => {
            if (messageDiv.parentNode) {
                messageDiv.parentNode.removeChild(messageDiv);
            }
        }, 5000);

        // Add message styles if not already present
        if (!document.getElementById('mic-message-styles')) {
            const style = document.createElement('style');
            style.id = 'mic-message-styles';
            style.textContent = `
                .mic-message {
                    padding: 10px 15px;
                    margin: 10px 0;
                    border-radius: 5px;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    animation: slideIn 0.3s ease;
                }

                .mic-message-info {
                    background: #003366;
                    border: 1px solid #0066cc;
                    color: #66ccff;
                }

                .mic-message-success {
                    background: #003300;
                    border: 1px solid #00ff00;
                    color: #66ff66;
                }

                .mic-message-error {
                    background: #330000;
                    border: 1px solid #ff0000;
                    color: #ff6666;
                }

                @keyframes slideIn {
                    from { opacity: 0; transform: translateY(-10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `;
            document.head.appendChild(style);
        }
    }

    // Public API methods
    getRecordingState() {
        return {
            isRecording: this.isRecording,
            isInitialized: this.isInitialized,
            hasRecording: !!this.lastRecording,
            audioSettings: { ...this.audioSettings }
        };
    }

    updateSettings(newSettings) {
        this.audioSettings = { ...this.audioSettings, ...newSettings };

        // Update UI elements
        if (newSettings.sensitivity !== undefined) {
            const slider = document.getElementById('micSensitivity');
            const value = document.querySelector('#micSensitivity + .setting-value');
            slider.value = newSettings.sensitivity;
            value.textContent = newSettings.sensitivity;
        }
    }

    destroy() {
        // Stop recording if active
        if (this.isRecording) {
            this.stopRecording();
        }

        // Close WebSocket connections
        if (this.sttWebSocket) {
            this.sttWebSocket.close();
        }
        if (this.audioWebSocket) {
            this.audioWebSocket.close();
        }

        // Clean up audio context
        if (this.audioContext) {
            this.audioContext.close();
        }

        // Remove UI
        if (this.container) {
            this.container.innerHTML = '';
        }

        console.log('Enhanced Microphone Component destroyed');
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EnhancedMicrophoneComponent;
}
