/**
 * Enhanced Test Chat Interface
 * Unified interactive conversation interface with character selection,
 * voice controls (STT/TTS), and performance monitoring
 */

class EnhancedTestChat {
    constructor(options = {}) {
        this.config = {
            apiBaseUrl: '/api',
            characterId: options.characterId,
            characters: options.characters || [],
            assistants: options.assistants || {},
            ...options
        };
        
        // State management
        this.currentCharacter = null;
        this.isSTTActive = false;
        this.isTTSActive = false;
        this.isProcessing = false;
        this.mediaRecorder = null;
        this.audioStream = null;
        this.performanceMetrics = {
            stt: null,
            ai: null,
            tts: null
        };
        
        // Initialize the interface
        this.initializeElements();
        this.setupEventListeners();
        this.initializeInterface();
    }
    
    /**
     * Initialize DOM elements
     */
    initializeElements() {
        // Character selection
        this.characterSelect = document.getElementById('characterSelect');
        this.assistantDisplay = document.getElementById('assistantDisplay');
        
        // Voice controls
        this.sttToggle = document.getElementById('sttToggle');
        this.ttsToggle = document.getElementById('ttsToggle');
        this.sttStatus = document.getElementById('sttStatus');
        this.ttsStatus = document.getElementById('ttsStatus');
        
        // Chat interface
        this.chatMessages = document.getElementById('chatMessages');
        this.chatInput = document.getElementById('chatInput');
        this.sendButton = document.getElementById('sendButton');
        
        // Status and metrics
        this.connectionStatus = document.getElementById('connectionStatus');
        this.sttTime = document.getElementById('sttTime');
        this.aiTime = document.getElementById('aiTime');
        this.ttsTime = document.getElementById('ttsTime');
        this.welcomeTime = document.getElementById('welcomeTime');
    }
    
    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Character selection
        this.characterSelect.addEventListener('change', (e) => {
            this.handleCharacterSelection(e.target.value);
        });
        
        // Voice controls
        this.sttToggle.addEventListener('click', () => {
            this.toggleSTT();
        });
        
        this.ttsToggle.addEventListener('click', () => {
            this.toggleTTS();
        });
        
        // Chat input
        this.chatInput.addEventListener('input', () => {
            this.updateSendButton();
        });
        
        this.chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        
        this.sendButton.addEventListener('click', () => {
            this.sendMessage();
        });
    }
    
    /**
     * Initialize the interface
     */
    async initializeInterface() {
        try {
            this.updateConnectionStatus('connecting', 'Initializing...');
            
            // Set welcome time
            if (this.welcomeTime) {
                this.welcomeTime.textContent = new Date().toLocaleTimeString();
            }
            
            // Pre-select character if provided
            if (this.config.characterId) {
                this.characterSelect.value = this.config.characterId;
                await this.handleCharacterSelection(this.config.characterId);
            }
            
            this.updateConnectionStatus('connected', 'Ready');
            console.log('✅ Enhanced Test Chat initialized');
            
        } catch (error) {
            console.error('❌ Failed to initialize Enhanced Test Chat:', error);
            this.updateConnectionStatus('disconnected', 'Error');
        }
    }
    
    /**
     * Handle character selection
     */
    async handleCharacterSelection(characterId) {
        try {
            if (!characterId) {
                this.currentCharacter = null;
                this.assistantDisplay.value = '';
                this.assistantDisplay.placeholder = 'Select character first...';
                this.updateSendButton();
                return;
            }
            
            this.updateConnectionStatus('processing', 'Loading character...');
            
            // Find character in local data first
            const character = this.config.characters.find(c => c.id == characterId);
            if (character) {
                this.currentCharacter = character;
                this.assistantDisplay.value = character.openaiAssistantId || 'No assistant assigned';
                
                // Load character greeting
                await this.loadCharacterGreeting(character);
            }
            
            // Fetch detailed configuration
            const response = await fetch(`${this.config.apiBaseUrl}/character/${characterId}/config`);
            const data = await response.json();
            
            if (data.success) {
                this.currentCharacter = { ...this.currentCharacter, ...data.character };
                console.log(`🎭 Selected character: ${this.currentCharacter.name}`);
            }
            
            this.updateSendButton();
            this.updateConnectionStatus('connected', 'Ready');
            
        } catch (error) {
            console.error('❌ Error selecting character:', error);
            this.updateConnectionStatus('disconnected', 'Character load failed');
        }
    }
    
    /**
     * Load character greeting message
     */
    async loadCharacterGreeting(character) {
        try {
            const assistantInfo = this.config.assistants[character.openaiAssistantId];
            if (assistantInfo && assistantInfo.conversationStarters && assistantInfo.conversationStarters.length > 0) {
                const randomGreeting = assistantInfo.conversationStarters[
                    Math.floor(Math.random() * assistantInfo.conversationStarters.length)
                ];
                
                this.addMessage('bot', randomGreeting, {
                    characterName: character.char_name || character.name,
                    isGreeting: true
                });
            }
        } catch (error) {
            console.warn('⚠️ Could not load character greeting:', error);
        }
    }
    
    /**
     * Toggle Speech-to-Text
     */
    async toggleSTT() {
        try {
            if (!this.currentCharacter) {
                alert('Please select a character first');
                return;
            }
            
            if (this.isSTTActive) {
                await this.stopSTT();
            } else {
                await this.startSTT();
            }
        } catch (error) {
            console.error('❌ Error toggling STT:', error);
            this.updateSTTStatus(false, 'Error');
        }
    }
    
    /**
     * Start Speech-to-Text
     */
    async startSTT() {
        try {
            // Request microphone permission
            this.audioStream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            
            // Setup media recorder
            this.mediaRecorder = new MediaRecorder(this.audioStream);
            this.audioChunks = [];
            
            this.mediaRecorder.ondataavailable = (event) => {
                this.audioChunks.push(event.data);
            };
            
            this.mediaRecorder.onstop = async () => {
                await this.processSTTAudio();
            };
            
            // Start recording
            this.mediaRecorder.start();
            this.isSTTActive = true;
            this.updateSTTStatus(true, 'Listening...');
            
            console.log('🎤 STT started');
            
        } catch (error) {
            console.error('❌ Error starting STT:', error);
            throw error;
        }
    }
    
    /**
     * Stop Speech-to-Text
     */
    async stopSTT() {
        try {
            if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
                this.mediaRecorder.stop();
            }
            
            if (this.audioStream) {
                this.audioStream.getTracks().forEach(track => track.stop());
                this.audioStream = null;
            }
            
            this.isSTTActive = false;
            this.updateSTTStatus(false, 'OFF');
            
            console.log('🎤 STT stopped');
            
        } catch (error) {
            console.error('❌ Error stopping STT:', error);
            throw error;
        }
    }
    
    /**
     * Process STT audio data
     */
    async processSTTAudio() {
        try {
            if (this.audioChunks.length === 0) return;
            
            const startTime = Date.now();
            this.updateSTTStatus(false, 'Processing...');
            
            // Create audio blob
            const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
            this.audioChunks = [];
            
            // Convert to base64
            const arrayBuffer = await audioBlob.arrayBuffer();
            const base64Audio = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
            
            // Send to STT service
            const response = await fetch(`${this.config.apiBaseUrl}/voice/transcribe`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    audioData: base64Audio,
                    character: this.currentCharacter.name.toLowerCase(),
                    characterId: this.currentCharacter.id,
                    sttOnly: true
                })
            });
            
            const data = await response.json();
            const sttTime = Date.now() - startTime;
            
            if (data.success && data.data.stt && data.data.stt.text) {
                // Update input with transcribed text
                this.chatInput.value = data.data.stt.text;
                this.updateSendButton();
                
                // Update performance metrics
                this.updatePerformanceMetric('stt', sttTime);
                
                console.log(`🎤 STT completed in ${sttTime}ms: "${data.data.stt.text}"`);
            }
            
            this.updateSTTStatus(false, 'OFF');
            
        } catch (error) {
            console.error('❌ Error processing STT audio:', error);
            this.updateSTTStatus(false, 'Error');
        }
    }
    
    /**
     * Toggle Text-to-Speech
     */
    toggleTTS() {
        this.isTTSActive = !this.isTTSActive;
        this.updateTTSStatus(this.isTTSActive, this.isTTSActive ? 'ON' : 'OFF');
        console.log(`🔊 TTS ${this.isTTSActive ? 'enabled' : 'disabled'}`);
    }
    
    /**
     * Send message
     */
    async sendMessage() {
        const message = this.chatInput.value.trim();
        if (!message || !this.currentCharacter || this.isProcessing) return;
        
        try {
            this.isProcessing = true;
            this.updateConnectionStatus('processing', 'Processing...');
            
            // Add user message
            this.addMessage('user', message);
            this.chatInput.value = '';
            this.updateSendButton();
            
            // Show typing indicator
            const typingId = this.showTypingIndicator();
            
            const startTime = Date.now();
            
            // Send to AI
            const response = await fetch(`${this.config.apiBaseUrl}/ai/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: message,
                    character: this.currentCharacter.name.toLowerCase(),
                    characterId: this.currentCharacter.id
                })
            });
            
            const data = await response.json();
            const aiTime = Date.now() - startTime;
            
            // Remove typing indicator
            this.removeTypingIndicator(typingId);
            
            if (data.success && data.data.aiResponse) {
                // Add AI response
                this.addMessage('bot', data.data.aiResponse.text, {
                    characterName: this.currentCharacter.name,
                    performance: { ai: aiTime }
                });
                
                // Update performance metrics
                this.updatePerformanceMetric('ai', aiTime);
                
                // Handle TTS if enabled
                if (this.isTTSActive) {
                    await this.speakText(data.data.aiResponse.text);
                }
                
                console.log(`🤖 AI response in ${aiTime}ms`);
            } else {
                this.addMessage('bot', 'Sorry, I encountered an error processing your message.', {
                    characterName: 'System',
                    isError: true
                });
            }
            
            this.updateConnectionStatus('connected', 'Ready');
            
        } catch (error) {
            console.error('❌ Error sending message:', error);
            this.addMessage('bot', 'Connection error. Please try again.', {
                characterName: 'System',
                isError: true
            });
            this.updateConnectionStatus('disconnected', 'Error');
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Speak text using TTS
     */
    async speakText(text) {
        try {
            if (!this.isTTSActive || !text) return;

            const startTime = Date.now();
            this.updateTTSStatus(true, 'Speaking...');

            const response = await fetch(`${this.config.apiBaseUrl}/voice/speak`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: text,
                    character: this.currentCharacter.name.toLowerCase(),
                    characterId: this.currentCharacter.id,
                    voiceConfig: this.currentCharacter.voiceConfig || {}
                })
            });

            const data = await response.json();
            const ttsTime = Date.now() - startTime;

            if (data.success && data.audioUrl) {
                // Play audio
                const audio = new Audio(data.audioUrl);
                audio.volume = 0.8;

                audio.onended = () => {
                    this.updateTTSStatus(this.isTTSActive, this.isTTSActive ? 'ON' : 'OFF');
                };

                audio.onerror = () => {
                    console.error('❌ Audio playback error');
                    this.updateTTSStatus(this.isTTSActive, 'Error');
                };

                await audio.play();

                // Update performance metrics
                this.updatePerformanceMetric('tts', ttsTime);

                console.log(`🔊 TTS completed in ${ttsTime}ms`);
            }

        } catch (error) {
            console.error('❌ Error with TTS:', error);
            this.updateTTSStatus(this.isTTSActive, 'Error');
        }
    }

    /**
     * Add message to chat
     */
    addMessage(type, content, options = {}) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.textContent = content;

        // Add timestamp
        const timeDiv = document.createElement('div');
        timeDiv.className = 'message-time';
        timeDiv.textContent = new Date().toLocaleTimeString();
        contentDiv.appendChild(timeDiv);

        // Add performance info if available
        if (options.performance) {
            const perfDiv = document.createElement('div');
            perfDiv.className = 'message-performance';
            const perfText = Object.entries(options.performance)
                .map(([key, value]) => `${key.toUpperCase()}: ${value}ms`)
                .join(' | ');
            perfDiv.textContent = perfText;
            contentDiv.appendChild(perfDiv);
        }

        messageDiv.appendChild(contentDiv);
        this.chatMessages.appendChild(messageDiv);

        // Scroll to bottom
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    /**
     * Show typing indicator
     */
    showTypingIndicator() {
        const typingDiv = document.createElement('div');
        typingDiv.className = 'typing-indicator';
        typingDiv.innerHTML = `
            <span>AI is thinking</span>
            <div class="typing-dots">
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
            </div>
        `;

        const typingId = 'typing-' + Date.now();
        typingDiv.id = typingId;

        this.chatMessages.appendChild(typingDiv);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;

        return typingId;
    }

    /**
     * Remove typing indicator
     */
    removeTypingIndicator(typingId) {
        const typingDiv = document.getElementById(typingId);
        if (typingDiv) {
            typingDiv.remove();
        }
    }

    /**
     * Update connection status
     */
    updateConnectionStatus(status, message) {
        this.connectionStatus.className = `status-indicator status-${status}`;
        this.connectionStatus.textContent = message;
    }

    /**
     * Update STT status
     */
    updateSTTStatus(active, message) {
        this.sttToggle.className = `voice-toggle ${active ? 'active' : ''} ${active && message === 'Listening...' ? 'listening' : ''}`;
        this.sttStatus.textContent = message;
    }

    /**
     * Update TTS status
     */
    updateTTSStatus(active, message) {
        this.ttsToggle.className = `voice-toggle ${active ? 'active' : ''}`;
        this.ttsStatus.textContent = message;
    }

    /**
     * Update send button state
     */
    updateSendButton() {
        const hasMessage = this.chatInput.value.trim().length > 0;
        const hasCharacter = !!this.currentCharacter;
        const canSend = hasMessage && hasCharacter && !this.isProcessing;

        this.sendButton.disabled = !canSend;
    }

    /**
     * Update performance metric
     */
    updatePerformanceMetric(type, time) {
        this.performanceMetrics[type] = time;

        const element = this[`${type}Time`];
        if (element) {
            element.textContent = `${time}ms`;
        }
    }
}

// Make class available globally
window.EnhancedTestChat = EnhancedTestChat;
