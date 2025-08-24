/**
 * ChatterPi - ElevenLabs Conversational AI Interface
 * Handles WebSocket connections, voice input, and real-time conversations
 */

class ChatterPiInterface {
    constructor() {
        this.websocket = null;
        this.isConnected = false;
        this.currentCharacter = null;
        this.isRecording = false;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.settings = {
            vadThreshold: 0.5,
            audioQuality: 'medium',
            jawAnimationEnabled: true,
            jawSensitivity: 1.0,
            servoPin: 18
        };
        
        this.init();
    }

    /**
     * Initialize the interface
     */
    init() {
        console.log('🤖 Initializing ChatterPi Interface...');
        
        // Load settings
        this.loadSettings();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Check character availability
        this.checkCharacterAvailability();
        
        // Update service status
        this.updateServiceStatus();
        
        console.log('✅ ChatterPi Interface initialized');
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Character selection
        document.querySelectorAll('.character-card').forEach(card => {
            card.addEventListener('click', () => {
                const characterId = parseInt(card.dataset.characterId);
                const characterName = card.dataset.characterName;
                this.selectCharacter(characterId, characterName);
            });
        });

        // Voice button
        const voiceBtn = document.getElementById('voice-btn');
        voiceBtn.addEventListener('mousedown', () => this.startRecording());
        voiceBtn.addEventListener('mouseup', () => this.stopRecording());
        voiceBtn.addEventListener('mouseleave', () => this.stopRecording());

        // Text input
        const textInput = document.getElementById('text-input');
        textInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendTextMessage();
            }
        });

        // Send button
        document.getElementById('send-btn').addEventListener('click', () => {
            this.sendTextMessage();
        });

        // Disconnect button
        document.getElementById('disconnect-btn').addEventListener('click', () => {
            this.disconnect();
        });

        // Settings button
        document.getElementById('settings-btn').addEventListener('click', () => {
            this.toggleSettings();
        });

        // Settings controls
        document.getElementById('save-settings-btn').addEventListener('click', () => {
            this.saveSettings();
        });

        document.getElementById('reset-settings-btn').addEventListener('click', () => {
            this.resetSettings();
        });

        // Conversation starters
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('starter-btn')) {
                const text = e.target.textContent;
                this.sendTextMessage(text);
            }
        });
    }

    /**
     * Check character availability
     */
    async checkCharacterAvailability() {
        try {
            const response = await fetch('/chatterpi/api/characters');
            const result = await response.json();
            
            if (result.success) {
                result.data.forEach(character => {
                    const statusElement = document.getElementById(`status-${character.id}`);
                    if (statusElement) {
                        if (character.available) {
                            statusElement.innerHTML = '<span class="text-success">✅ Ready</span>';
                            statusElement.className = 'badge badge-sm badge-success';
                        } else {
                            statusElement.innerHTML = '<span class="text-error">❌ Unavailable</span>';
                            statusElement.className = 'badge badge-sm badge-error';
                        }
                    }
                });
            }
        } catch (error) {
            console.error('Error checking character availability:', error);
        }
    }

    /**
     * Update service status
     */
    async updateServiceStatus() {
        try {
            const response = await fetch('/chatterpi/api/status');
            const result = await response.json();
            
            if (result.success) {
                const status = result.data;
                
                document.getElementById('service-running').innerHTML = 
                    status.isRunning ? '<span class="text-success">✅ Running</span>' : '<span class="text-error">❌ Offline</span>';
                
                document.getElementById('service-port').textContent = `Port: ${status.port}`;
                document.getElementById('available-agents').textContent = status.availableAgents;
                document.getElementById('active-connections').textContent = status.activeConnections;
            }
        } catch (error) {
            console.error('Error updating service status:', error);
        }
    }

    /**
     * Select character and start conversation
     */
    async selectCharacter(characterId, characterName) {
        try {
            console.log(`🎭 Selecting character: ${characterName} (ID: ${characterId})`);
            
            // Update UI
            document.querySelectorAll('.character-card').forEach(card => {
                card.classList.remove('ring-2', 'ring-primary');
            });
            
            document.querySelector(`[data-character-id="${characterId}"]`).classList.add('ring-2', 'ring-primary');
            
            // Start conversation
            const response = await fetch('/chatterpi/api/start-conversation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ characterId })
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.currentCharacter = result.data;
                this.connectWebSocket();
                this.showConversationInterface();
                this.loadConversationStarters();
            } else {
                this.showError(result.error);
            }
            
        } catch (error) {
            console.error('Error selecting character:', error);
            this.showError('Failed to select character');
        }
    }

    /**
     * Connect to WebSocket
     */
    connectWebSocket() {
        if (this.websocket) {
            this.websocket.close();
        }

        const wsUrl = this.currentCharacter.websocketUrl;
        console.log(`🔗 Connecting to WebSocket: ${wsUrl}`);
        
        this.websocket = new WebSocket(wsUrl);
        
        this.websocket.onopen = () => {
            console.log('✅ WebSocket connected');
            this.isConnected = true;
            this.updateConnectionStatus('Connected', 'success');
            
            // Start conversation with character
            this.websocket.send(JSON.stringify({
                type: 'start_conversation',
                characterId: this.currentCharacter.characterId
            }));
        };
        
        this.websocket.onmessage = (event) => {
            this.handleWebSocketMessage(JSON.parse(event.data));
        };
        
        this.websocket.onclose = () => {
            console.log('🔌 WebSocket disconnected');
            this.isConnected = false;
            this.updateConnectionStatus('Disconnected', 'error');
        };
        
        this.websocket.onerror = (error) => {
            console.error('❌ WebSocket error:', error);
            this.updateConnectionStatus('Connection Error', 'error');
        };
    }

    /**
     * Handle WebSocket messages
     */
    handleWebSocketMessage(message) {
        console.log('📨 WebSocket message:', message);
        
        switch (message.type) {
            case 'connected':
                this.updateConnectionStatus('Connected to ElevenLabs', 'success');
                break;
                
            case 'conversation_started':
                this.updateConnectionStatus(`Talking with ${message.characterName}`, 'success');
                this.enableControls();
                break;
                
            case 'audio':
                this.handleAudioMessage(message);
                break;
                
            case 'transcript':
                this.addMessage(message.text, message.role);
                break;
                
            case 'conversation_ended':
                this.updateConnectionStatus('Conversation ended', 'warning');
                break;
                
            case 'error':
                this.showError(message.message);
                break;
        }
    }

    /**
     * Handle audio message from ElevenLabs
     */
    handleAudioMessage(message) {
        try {
            // Convert base64 to audio and play
            const audioData = atob(message.audioData);
            const audioArray = new Uint8Array(audioData.length);
            for (let i = 0; i < audioData.length; i++) {
                audioArray[i] = audioData.charCodeAt(i);
            }
            
            const audioBlob = new Blob([audioArray], { type: 'audio/wav' });
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);
            
            audio.play().catch(error => {
                console.error('Error playing audio:', error);
            });
            
            // Clean up URL after playing
            audio.onended = () => {
                URL.revokeObjectURL(audioUrl);
            };
            
        } catch (error) {
            console.error('Error handling audio message:', error);
        }
    }

    /**
     * Start recording audio
     */
    async startRecording() {
        if (!this.isConnected || this.isRecording) return;
        
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaRecorder = new MediaRecorder(stream);
            this.audioChunks = [];
            
            this.mediaRecorder.ondataavailable = (event) => {
                this.audioChunks.push(event.data);
            };
            
            this.mediaRecorder.onstop = () => {
                this.processRecordedAudio();
            };
            
            this.mediaRecorder.start();
            this.isRecording = true;
            
            document.getElementById('voice-btn').textContent = '🎤 Recording...';
            document.getElementById('voice-btn').classList.add('button-error');
            
        } catch (error) {
            console.error('Error starting recording:', error);
            this.showError('Microphone access denied');
        }
    }

    /**
     * Stop recording audio
     */
    stopRecording() {
        if (!this.isRecording) return;
        
        this.mediaRecorder.stop();
        this.isRecording = false;
        
        document.getElementById('voice-btn').textContent = '🎤 Hold to Talk';
        document.getElementById('voice-btn').classList.remove('button-error');
        
        // Stop all tracks
        this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }

    /**
     * Process recorded audio
     */
    async processRecordedAudio() {
        try {
            const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
            const arrayBuffer = await audioBlob.arrayBuffer();
            const audioData = new Uint8Array(arrayBuffer);
            
            // Convert to base64
            const base64Audio = btoa(String.fromCharCode(...audioData));
            
            // Send to ElevenLabs
            this.websocket.send(JSON.stringify({
                type: 'send_audio',
                audioData: base64Audio
            }));
            
        } catch (error) {
            console.error('Error processing recorded audio:', error);
        }
    }

    /**
     * Send text message
     */
    sendTextMessage(text = null) {
        if (!this.isConnected) return;
        
        const message = text || document.getElementById('text-input').value.trim();
        if (!message) return;
        
        // Add to chat
        this.addMessage(message, 'user');
        
        // Send to ElevenLabs
        this.websocket.send(JSON.stringify({
            type: 'send_text',
            text: message
        }));
        
        // Clear input
        if (!text) {
            document.getElementById('text-input').value = '';
        }
    }

    /**
     * Add message to chat
     */
    addMessage(text, role) {
        const messagesContainer = document.getElementById('chat-messages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat ${role === 'user' ? 'chat-end' : 'chat-start'}`;
        
        messageDiv.innerHTML = `
            <div class="chat-bubble ${role === 'user' ? 'chat-bubble-primary' : 'chat-bubble-secondary'}">
                ${text}
            </div>
            <div class="chat-footer opacity-50 text-xs">
                ${new Date().toLocaleTimeString()}
            </div>
        `;
        
        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    /**
     * Load conversation starters
     */
    async loadConversationStarters() {
        try {
            const response = await fetch(`/chatterpi/api/conversation-starters/${this.currentCharacter.characterId}`);
            const result = await response.json();
            
            if (result.success) {
                const container = document.getElementById('starters-container');
                container.innerHTML = '';
                
                result.data.conversationStarters.forEach(starter => {
                    const button = document.createElement('button');
                    button.className = 'button button-sm button-outline starter-btn';
                    button.textContent = starter;
                    container.appendChild(button);
                });
                
                document.getElementById('conversation-starters').style.display = 'block';
            }
        } catch (error) {
            console.error('Error loading conversation starters:', error);
        }
    }

    /**
     * Show conversation interface
     */
    showConversationInterface() {
        document.getElementById('conversation-interface').style.display = 'block';
        document.getElementById('current-character-name').textContent = this.currentCharacter.characterName;
        
        // Clear previous messages
        document.getElementById('chat-messages').innerHTML = `
            <div class="text-center text-base-content/50 text-sm">
                Starting conversation with ${this.currentCharacter.characterName}...
            </div>
        `;
    }

    /**
     * Update connection status
     */
    updateConnectionStatus(message, type) {
        const statusElement = document.getElementById('connection-status');
        const messageElement = document.getElementById('connection-message');
        
        statusElement.className = `alert alert-${type}`;
        messageElement.textContent = message;
        
        if (type === 'success') {
            statusElement.innerHTML = `
                <span class="text-success">✅</span>
                <span>${message}</span>
            `;
        } else if (type === 'error') {
            statusElement.innerHTML = `
                <span class="text-error">❌</span>
                <span>${message}</span>
            `;
        } else {
            statusElement.innerHTML = `
                <span class="loading loading-spinner loading-sm"></span>
                <span>${message}</span>
            `;
        }
    }

    /**
     * Enable controls
     */
    enableControls() {
        document.getElementById('voice-btn').disabled = false;
        document.getElementById('text-input').disabled = false;
        document.getElementById('send-btn').disabled = false;
    }

    /**
     * Disconnect from conversation
     */
    disconnect() {
        if (this.websocket) {
            this.websocket.send(JSON.stringify({ type: 'stop_conversation' }));
            this.websocket.close();
        }
        
        this.isConnected = false;
        this.currentCharacter = null;
        
        document.getElementById('conversation-interface').style.display = 'none';
        document.querySelectorAll('.character-card').forEach(card => {
            card.classList.remove('ring-2', 'ring-primary');
        });
    }

    /**
     * Toggle settings panel
     */
    toggleSettings() {
        const settingsPanel = document.getElementById('advanced-settings');
        settingsPanel.style.display = settingsPanel.style.display === 'none' ? 'block' : 'none';
    }

    /**
     * Save settings
     */
    saveSettings() {
        this.settings.vadThreshold = parseFloat(document.getElementById('vad-threshold').value);
        this.settings.audioQuality = document.getElementById('audio-quality').value;
        this.settings.jawAnimationEnabled = document.getElementById('jaw-animation-enabled').checked;
        this.settings.jawSensitivity = parseFloat(document.getElementById('jaw-sensitivity').value);
        
        localStorage.setItem('chatterpi-settings', JSON.stringify(this.settings));
        
        this.showSuccess('Settings saved successfully');
    }

    /**
     * Load settings
     */
    loadSettings() {
        const saved = localStorage.getItem('chatterpi-settings');
        if (saved) {
            this.settings = { ...this.settings, ...JSON.parse(saved) };
        }
        
        // Apply to UI when DOM is ready
        setTimeout(() => {
            if (document.getElementById('vad-threshold')) {
                document.getElementById('vad-threshold').value = this.settings.vadThreshold;
                document.getElementById('audio-quality').value = this.settings.audioQuality;
                document.getElementById('jaw-animation-enabled').checked = this.settings.jawAnimationEnabled;
                document.getElementById('jaw-sensitivity').value = this.settings.jawSensitivity;
            }
        }, 100);
    }

    /**
     * Reset settings
     */
    resetSettings() {
        this.settings = {
            vadThreshold: 0.5,
            audioQuality: 'medium',
            jawAnimationEnabled: true,
            jawSensitivity: 1.0,
            servoPin: 18
        };
        
        this.loadSettings();
        this.saveSettings();
    }

    /**
     * Show error message
     */
    showError(message) {
        console.error('ChatterPi Error:', message);
        // You could implement a toast notification here
        alert(`Error: ${message}`);
    }

    /**
     * Show success message
     */
    showSuccess(message) {
        console.log('ChatterPi Success:', message);
        // You could implement a toast notification here
        alert(`Success: ${message}`);
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.chatterPi = new ChatterPiInterface();
});
