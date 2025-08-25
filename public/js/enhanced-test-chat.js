/**
 * Enhanced Test Chat Interface
 * ElevenLabs Conversational AI interface with character selection,
 * voice controls, and performance monitoring
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
        this.isElevenLabsActive = false;
        this.isLiveModeActive = false;
        this.isProcessing = false;
        this.elevenLabsWs = null;
        this.audioStream = null;
        this.liveModeState = 'idle'; // idle, listening, processing, speaking
        this.liveModeTimeout = null;
        this.liveModeAudio = null;
        this.performanceMetrics = {
            voiceInput: null,
            agent: null,
            voiceOutput: null
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
        this.elevenLabsToggle = document.getElementById('elevenLabsToggle');
        this.ttsToggle = document.getElementById('ttsToggle');
        this.liveModeToggle = document.getElementById('liveModeToggle');
        this.sttStatus = document.getElementById('sttStatus');
        this.ttsStatus = document.getElementById('ttsStatus');
        this.liveModeStatus = document.getElementById('liveModeStatus');
        
        // Chat interface
        this.chatMessages = document.getElementById('chatMessages');
        this.chatInput = document.getElementById('chatInput');
        this.sendButton = document.getElementById('sendButton');
        
        // Status and metrics
        this.connectionStatus = document.getElementById('connectionStatus');
        this.voiceInputTime = document.getElementById('voiceInputTime');
        this.agentTime = document.getElementById('agentTime');
        this.voiceOutputTime = document.getElementById('voiceOutputTime');
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
        this.elevenLabsToggle.addEventListener('click', () => {
            this.toggleElevenLabs();
        });

        this.ttsToggle.addEventListener('click', () => {
            this.toggleTTS();
        });

        this.liveModeToggle.addEventListener('click', () => {
            this.toggleLiveMode();
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

            // Handle agent-specific initialization
            if (this.config.agentId && this.config.selectedAgent) {
                console.log(`🎭 Initializing with ElevenLabs agent: ${this.config.selectedAgent.name}`);
                // Find character assigned to this agent
                const assignedCharacter = this.config.characters.find(c => c.elevenLabsAgentId === this.config.agentId);
                if (assignedCharacter) {
                    this.characterSelect.value = assignedCharacter.id;
                    await this.handleCharacterSelection(assignedCharacter.id);
                } else {
                    // No character assigned, show agent info in welcome message
                    this.addMessage('bot', `Hello! I'm ${this.config.selectedAgent.name}, an ElevenLabs AI agent. I'm ready to chat with you!`, {
                        characterName: this.config.selectedAgent.name,
                        isSystem: true
                    });
                }
            } else if (this.config.characterId) {
                // Pre-select character if provided
                this.characterSelect.value = this.config.characterId;
                await this.handleCharacterSelection(this.config.characterId);
            }

            // Initialize ElevenLabs WebSocket connection
            await this.initializeElevenLabsConnection();

            this.updateConnectionStatus('connected', 'Ready');
            console.log('✅ Enhanced Test Chat initialized');

        } catch (error) {
            console.error('❌ Failed to initialize Enhanced Test Chat:', error);
            this.updateConnectionStatus('disconnected', 'Error');
        }
    }

    /**
     * Initialize ElevenLabs WebSocket connection
     */
    async initializeElevenLabsConnection() {
        try {
            const wsUrl = `ws://${window.location.hostname}:8771`;
            this.elevenLabsWs = new WebSocket(wsUrl);

            this.elevenLabsWs.onopen = () => {
                console.log('✅ Connected to ElevenLabs service');
                this.updateConnectionStatus('connected', 'ElevenLabs Connected');
            };

            this.elevenLabsWs.onmessage = (event) => {
                this.handleElevenLabsMessage(JSON.parse(event.data));
            };

            this.elevenLabsWs.onclose = () => {
                console.log('🔌 ElevenLabs connection closed');
                this.updateConnectionStatus('disconnected', 'ElevenLabs Disconnected');
            };

            this.elevenLabsWs.onerror = (error) => {
                console.error('❌ ElevenLabs WebSocket error:', error);
                this.updateConnectionStatus('error', 'ElevenLabs Error');
            };

        } catch (error) {
            console.error('❌ Failed to initialize ElevenLabs connection:', error);
            throw error;
        }
    }

    /**
     * Handle messages from ElevenLabs WebSocket
     */
    handleElevenLabsMessage(message) {
        console.log('📥 ElevenLabs message:', message);

        switch (message.type) {
            case 'conversation_started':
                this.addMessage('system', `Connected to ${message.characterName}`, {
                    characterName: 'System',
                    isInfo: true
                });
                break;

            case 'transcript':
                if (message.role === 'user') {
                    // User message echo - we already added it
                    console.log('👤 User message confirmed:', message.text);
                } else if (message.role === 'assistant') {
                    // AI response received
                    this.handleAIResponse(message.text);
                }
                break;

            case 'audio':
                this.handleAudioMessage(message);
                break;

            case 'conversation_end':
                this.addMessage('system', 'Conversation ended', {
                    characterName: 'System',
                    isInfo: true
                });
                break;

            case 'error':
                console.error('❌ ElevenLabs error:', message.error);
                this.addMessage('system', `Error: ${message.error}`, {
                    characterName: 'System',
                    isError: true
                });
                this.handleMessageComplete();
                break;

            default:
                console.log('📥 Unknown ElevenLabs message type:', message.type);
        }
    }

    /**
     * Handle AI response from ElevenLabs
     */
    handleAIResponse(responseText) {
        if (!this.pendingMessage) {
            console.warn('⚠️ Received AI response but no pending message');
            return;
        }

        const aiTime = Date.now() - this.pendingMessage.startTime;

        // Remove typing indicator
        if (this.pendingMessage.typingId) {
            this.removeTypingIndicator(this.pendingMessage.typingId);
        }

        // Add AI response
        this.addMessage('bot', responseText, {
            characterName: this.currentCharacter ? this.currentCharacter.name : 'AI Assistant',
            performance: { ai: aiTime }
        });

        // Update performance metrics
        this.updatePerformanceMetric('agent', aiTime);

        // Handle TTS if enabled
        if (this.isTTSActive) {
            this.speakText(responseText);
        }

        console.log(`🤖 AI response in ${aiTime}ms`);

        // Complete message handling
        this.handleMessageComplete();
    }

    /**
     * Complete message handling and reset state
     */
    handleMessageComplete() {
        this.isProcessing = false;
        this.pendingMessage = null;
        this.updateConnectionStatus('connected', 'Ready');
        this.updateSendButton();
    }

    /**
     * Start ElevenLabs conversation
     */
    async startElevenLabsConversation(character) {
        try {
            console.log('🎭 Starting ElevenLabs conversation for character:', character.char_name);

            // Clear chat
            this.chatMessages.innerHTML = '';

            // Wait for WebSocket connection if needed
            if (!this.elevenLabsWs || this.elevenLabsWs.readyState !== WebSocket.OPEN) {
                this.addMessage('system', 'Connecting to ElevenLabs service...', {
                    characterName: 'System',
                    isInfo: true
                });

                // Wait for connection to be established
                await this.waitForWebSocketConnection();
            }

            // Send conversation start message
            const agentId = this.config.agentId || character.elevenLabsAgentId;
            const startMessage = {
                type: 'start_conversation',
                characterId: character.id,
                agentId: agentId,
                characterName: character.char_name || character.name
            };

            console.log('📤 Starting conversation with:', startMessage);
            this.elevenLabsWs.send(JSON.stringify(startMessage));

            this.addMessage('system', `Connected to ElevenLabs service. Ready to chat with ${character.char_name || character.name}!`, {
                characterName: 'System',
                isInfo: true
            });

            // Update connection status to ready
            this.updateConnectionStatus('connected', 'Ready to Chat');

        } catch (error) {
            console.error('❌ Error starting ElevenLabs conversation:', error);
            this.addMessage('system', 'Failed to start conversation. Please try again.', {
                characterName: 'System',
                isError: true
            });
        }
    }

    /**
     * Wait for WebSocket connection to be established
     */
    async waitForWebSocketConnection(maxWait = 5000) {
        return new Promise((resolve, reject) => {
            if (this.elevenLabsWs && this.elevenLabsWs.readyState === WebSocket.OPEN) {
                resolve();
                return;
            }

            const timeout = setTimeout(() => {
                reject(new Error('WebSocket connection timeout'));
            }, maxWait);

            const checkConnection = () => {
                if (this.elevenLabsWs && this.elevenLabsWs.readyState === WebSocket.OPEN) {
                    clearTimeout(timeout);
                    resolve();
                } else {
                    setTimeout(checkConnection, 100);
                }
            };

            checkConnection();
        });
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

                // Update assistant display based on AI availability
                if (character.hasAI && character.openaiAssistantId) {
                    this.assistantDisplay.value = character.openaiAssistantId;
                } else if (character.hasVoice) {
                    this.assistantDisplay.value = 'Voice only (no AI chat)';
                } else {
                    this.assistantDisplay.value = 'No assistant assigned';
                }

                // Start ElevenLabs conversation if agent is available, or try anyway for testing
                if (this.config.agentId || character.elevenLabsAgentId || this.elevenLabsWs) {
                    await this.startElevenLabsConversation(character);
                } else if (character.hasAI) {
                    await this.loadCharacterGreeting(character);
                } else {
                    // Clear chat for voice-only characters
                    this.chatMessages.innerHTML = '';
                    this.addMessage('system', `Selected ${character.char_name || character.name} - Voice features available`, {
                        characterName: 'System',
                        isInfo: true
                    });
                }
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
            console.log('🎭 Loading greeting for character:', character.char_name);
            console.log('🎭 Assistant ID:', character.openaiAssistantId);
            console.log('🎭 Available assistants:', Object.keys(this.config.assistants || {}));

            const assistantInfo = this.config.assistants[character.openaiAssistantId];
            console.log('🎭 Assistant info:', assistantInfo);

            if (assistantInfo && assistantInfo.conversationStarters && assistantInfo.conversationStarters.length > 0) {
                const randomGreeting = assistantInfo.conversationStarters[
                    Math.floor(Math.random() * assistantInfo.conversationStarters.length)
                ];

                console.log('🎭 Selected greeting:', randomGreeting);

                this.addMessage('bot', randomGreeting, {
                    characterName: character.char_name || character.name,
                    isGreeting: true
                });
            } else {
                console.warn('⚠️ No conversation starters found for assistant:', character.openaiAssistantId);
                // Fallback greeting
                this.addMessage('bot', `Hello! I'm ready to chat. What would you like to talk about?`, {
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

            // Prevent STT toggle when Live Mode is active
            if (this.isLiveModeActive) {
                alert('Cannot toggle STT while Live Mode is active');
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
            // Request microphone permission with optimized settings
            this.audioStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: 16000,  // Lower sample rate for smaller files
                    channelCount: 1     // Mono audio
                }
            });

            // Setup media recorder with WebM format and time slicing
            const options = {
                mimeType: 'audio/webm;codecs=opus',
                audioBitsPerSecond: 16000  // Lower bitrate for smaller files
            };

            // Fallback for browsers that don't support WebM
            if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                options.mimeType = 'audio/webm';
                if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                    delete options.mimeType;  // Use default
                }
            }

            this.mediaRecorder = new MediaRecorder(this.audioStream, options);
            this.audioChunks = [];

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstop = async () => {
                await this.processSTTAudio();
            };

            // Start recording with time slicing (1 second chunks)
            this.mediaRecorder.start(1000);
            this.isSTTActive = true;
            this.updateSTTStatus(true, 'Listening...');

            // Auto-stop after 10 seconds to prevent huge files
            this.sttTimeout = setTimeout(() => {
                if (this.isSTTActive) {
                    console.log('🎤 Auto-stopping STT after 10 seconds');
                    this.stopSTT();
                }
            }, 10000);

            console.log('🎤 STT started with optimized settings');

        } catch (error) {
            console.error('❌ Error starting STT:', error);
            this.updateSTTStatus(false, 'Error');

            // Show error message to user
            this.addMessage('system', `Microphone access error: ${error.message}`, {
                characterName: 'System',
                isError: true
            });

            throw error;
        }
    }
    
    /**
     * Stop Speech-to-Text
     */
    async stopSTT() {
        try {
            // Clear timeout if it exists
            if (this.sttTimeout) {
                clearTimeout(this.sttTimeout);
                this.sttTimeout = null;
            }

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
            if (this.audioChunks.length === 0) {
                console.log('🎤 No audio chunks to process');
                this.updateSTTStatus(false, 'Ready');
                return;
            }

            const startTime = Date.now();
            this.updateSTTStatus(false, 'Processing...');

            // Create audio blob with correct MIME type
            const audioBlob = new Blob(this.audioChunks, {
                type: this.audioChunks[0].type || 'audio/webm'
            });
            this.audioChunks = [];

            console.log(`🎤 Processing audio blob: ${audioBlob.size} bytes, type: ${audioBlob.type}`);

            // Check file size (limit to 25MB to avoid "request entity too large")
            if (audioBlob.size > 25 * 1024 * 1024) {
                throw new Error('Audio file too large. Please record shorter audio.');
            }

            // Convert to base64 more efficiently
            const arrayBuffer = await audioBlob.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);
            const base64Audio = btoa(String.fromCharCode.apply(null, uint8Array));

            console.log(`🎤 Sending ${base64Audio.length} characters of base64 audio data`);

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

            if (!response.ok) {
                throw new Error(`STT request failed: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            const sttTime = Date.now() - startTime;
            
            if (data.success && data.data.stt && data.data.stt.text) {
                // Update input with transcribed text
                this.chatInput.value = data.data.stt.text;
                this.updateSendButton();

                // Update performance metrics
                this.updatePerformanceMetric('stt', sttTime);

                console.log(`🎤 STT completed in ${sttTime}ms: "${data.data.stt.text}"`);

                // Automatically send the transcribed text to AI if character has AI enabled
                if (this.currentCharacter && this.currentCharacter.hasAI) {
                    console.log('🤖 Auto-sending transcribed text to AI...');
                    await this.sendMessage(data.data.stt.text);
                }
            } else if (data.data.stt && data.data.stt.error) {
                console.error('❌ STT Error:', data.data.stt.error);
                this.updateSTTStatus(false, 'ERROR');
                return;
            }

            this.updateSTTStatus(false, 'OFF');
            
        } catch (error) {
            console.error('❌ Error processing STT audio:', error);
            this.updateSTTStatus(false, 'Error');

            // Show error message to user
            this.addMessage('system', `Speech recognition error: ${error.message}`, {
                characterName: 'System',
                isError: true
            });
        }
    }
    
    /**
     * Toggle ElevenLabs Voice
     */
    toggleElevenLabs() {
        this.isElevenLabsActive = !this.isElevenLabsActive;
        this.updateElevenLabsStatus(this.isElevenLabsActive, this.isElevenLabsActive ? 'ON' : 'OFF');
        console.log(`🤖 ElevenLabs Voice ${this.isElevenLabsActive ? 'enabled' : 'disabled'}`);
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
     * Toggle Live Mode
     */
    async toggleLiveMode() {
        try {
            if (!this.currentCharacter) {
                alert('Please select a character first');
                return;
            }

            if (!this.currentCharacter.hasAI) {
                alert('Live Mode requires a character with AI capabilities');
                return;
            }

            // Stop regular STT/TTS if active before starting Live Mode
            if (!this.isLiveModeActive) {
                if (this.isSTTActive) {
                    await this.stopSTT();
                }
            }

            if (this.isLiveModeActive) {
                await this.stopLiveMode();
            } else {
                await this.startLiveMode();
            }
        } catch (error) {
            console.error('❌ Error toggling Live Mode:', error);
            this.updateLiveModeStatus(false, 'Error');
        }
    }

    /**
     * Start Live Mode
     */
    async startLiveMode() {
        try {
            console.log('🎙️ Starting Live Mode...');

            // Clear chat history for fresh conversation
            this.clearChatHistory();

            // Enable TTS automatically for Live Mode
            this.isTTSActive = true;
            this.updateTTSStatus(true, 'ON');

            // Set Live Mode active
            this.isLiveModeActive = true;
            this.liveModeState = 'starting';
            this.updateLiveModeStatus(true, 'Starting conversation...');

            // Start with AI greeting/conversation starter
            await this.startConversation();

            console.log('🎙️ Live Mode started successfully');

        } catch (error) {
            console.error('❌ Error starting Live Mode:', error);
            this.isLiveModeActive = false;
            this.updateLiveModeStatus(false, 'Error');
            throw error;
        }
    }

    /**
     * Stop Live Mode
     */
    async stopLiveMode() {
        try {
            console.log('🎙️ Stopping Live Mode...');

            // Set Live Mode inactive
            this.isLiveModeActive = false;
            this.liveModeState = 'idle';

            // Stop any ongoing audio
            await this.stopContinuousListening();

            // Stop any TTS playback
            if (this.liveModeAudio) {
                this.liveModeAudio.pause();
                this.liveModeAudio = null;
            }

            // Clear timeouts
            if (this.liveModeTimeout) {
                clearTimeout(this.liveModeTimeout);
                this.liveModeTimeout = null;
            }

            // Update status
            this.updateLiveModeStatus(false, 'OFF');

            console.log('🎙️ Live Mode stopped successfully');

        } catch (error) {
            console.error('❌ Error stopping Live Mode:', error);
            this.updateLiveModeStatus(false, 'Error');
        }
    }

    /**
     * Start conversation with AI greeting
     */
    async startConversation() {
        try {
            console.log('🎙️ Starting conversation...');

            // Get conversation starter from character or use default
            let starterMessage = "Hello! I'm ready to chat. What would you like to talk about?";

            // Check if character has conversation starters
            if (this.currentCharacter && this.currentCharacter.conversationStarters && this.currentCharacter.conversationStarters.length > 0) {
                const starters = this.currentCharacter.conversationStarters.filter(s => s && s.trim());
                if (starters.length > 0) {
                    starterMessage = starters[Math.floor(Math.random() * starters.length)];
                }
            }

            // Add AI greeting to chat
            this.addMessage('bot', starterMessage, {
                characterName: this.currentCharacter.char_name || this.currentCharacter.name
            });

            // Speak the greeting
            this.liveModeState = 'speaking';
            this.updateLiveModeStatus(true, 'Speaking...');

            // Initialize continuous listening first
            await this.startContinuousListening();

            // Then speak the greeting (which will restart listening when done)
            await this.speakLiveModeText(starterMessage);

        } catch (error) {
            console.error('❌ Error starting conversation:', error);
            // Fallback to listening mode
            await this.startContinuousListening();
        }
    }

    /**
     * Start continuous listening for Live Mode
     */
    async startContinuousListening() {
        try {
            // Request microphone permission with optimized settings
            this.audioStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: 16000,
                    channelCount: 1
                }
            });

            // Create media recorder
            this.mediaRecorder = new MediaRecorder(this.audioStream, {
                mimeType: 'audio/webm;codecs=opus'
            });

            this.audioChunks = [];

            this.mediaRecorder.ondataavailable = (event) => {
                console.log('🎙️ Audio data available:', event.data.size, 'bytes');
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                    console.log('🎙️ Total audio chunks:', this.audioChunks.length);
                } else {
                    console.warn('🎙️ Empty audio chunk received');
                }
            };

            this.mediaRecorder.onstop = async () => {
                if (this.isLiveModeActive && this.audioChunks.length > 0) {
                    console.log('🎙️ Processing audio chunks:', this.audioChunks.length);
                    await this.processLiveModeAudio();
                }
            };

            // Start recording with shorter chunks for faster response (1.5 seconds)
            console.log('🎙️ Starting MediaRecorder with 1.5s chunks...');
            this.mediaRecorder.start(1500);
            this.updateLiveModeStatus(true, 'Listening...');

            console.log('🎙️ MediaRecorder state:', this.mediaRecorder.state);
            console.log('🎙️ Continuous listening started');

        } catch (error) {
            console.error('❌ Error starting continuous listening:', error);
            throw error;
        }
    }

    /**
     * Stop continuous listening
     */
    async stopContinuousListening() {
        try {
            if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
                this.mediaRecorder.stop();
            }

            if (this.audioStream) {
                this.audioStream.getTracks().forEach(track => track.stop());
                this.audioStream = null;
            }

            console.log('🎙️ Continuous listening stopped');

        } catch (error) {
            console.error('❌ Error stopping continuous listening:', error);
        }
    }

    /**
     * Process audio for Live Mode
     */
    async processLiveModeAudio() {
        try {
            if (this.audioChunks.length === 0) {
                console.log('🎙️ No audio chunks to process, restarting listening...');
                if (this.isLiveModeActive) {
                    this.restartContinuousListening();
                }
                return;
            }

            this.liveModeState = 'processing';
            this.updateLiveModeStatus(true, 'Processing...');

            // Create audio blob
            const audioBlob = new Blob(this.audioChunks, {
                type: this.audioChunks[0].type || 'audio/webm'
            });

            // Clear chunks for next recording
            this.audioChunks = [];

            console.log(`🎙️ Processing audio blob: ${audioBlob.size} bytes`);

            // Convert audio blob to base64 for the /voice/transcribe endpoint
            const arrayBuffer = await audioBlob.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);
            const base64Audio = btoa(String.fromCharCode.apply(null, uint8Array));

            console.log(`🎙️ Converted to base64: ${base64Audio.length} characters`);

            // Send to STT service using JSON format
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

            if (!response.ok) {
                const errorText = await response.text();
                console.error('🎙️ STT request failed:', response.status, response.statusText, errorText);
                throw new Error(`STT request failed: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            console.log('🎙️ STT response:', data);

            if (data.success && data.data && data.data.stt && data.data.stt.text) {
                const transcribedText = data.data.stt.text.trim();
                console.log(`🎙️ Transcribed: "${transcribedText}"`);

                // Process any meaningful text (lowered threshold for faster response)
                if (transcribedText.length > 1 && transcribedText.toLowerCase() !== 'you') {
                    await this.processLiveModeMessage(transcribedText);
                } else {
                    console.log('🎙️ Text too short or noise, restarting listening...');
                    if (this.isLiveModeActive) {
                        this.restartContinuousListening();
                    }
                }
            } else {
                console.log('🎙️ No speech detected, restarting listening...');
                if (this.isLiveModeActive) {
                    this.restartContinuousListening();
                }
            }

        } catch (error) {
            console.error('❌ Error processing Live Mode audio:', error);
            if (this.isLiveModeActive) {
                this.restartContinuousListening();
            }
        }
    }

    /**
     * Process message in Live Mode (auto-send to AI and speak response)
     */
    async processLiveModeMessage(message) {
        try {
            console.log(`🎙️ Processing Live Mode message: "${message}"`);

            // Add user message to chat
            this.addMessage('user', message);

            // Send to AI with conversation context
            this.liveModeState = 'processing';
            this.updateLiveModeStatus(true, 'Thinking...');

            // Add conversation context for better responses
            const conversationContext = this.getChatHistory().slice(-5); // Last 5 messages for context

            const response = await fetch(`${this.config.apiBaseUrl}/ai/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: message,
                    character: this.currentCharacter.name.toLowerCase(),
                    characterId: this.currentCharacter.id,
                    context: conversationContext,
                    liveMode: true // Flag for faster, more conversational responses
                })
            });

            if (!response.ok) {
                throw new Error(`AI request failed: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            console.log('🎙️ AI chat response:', data);

            if (data.success && data.data.aiResponse && data.data.aiResponse.text) {
                const aiResponse = data.data.aiResponse.text;
                console.log(`🎙️ AI Response: "${aiResponse}"`);

                // Add AI message to chat
                this.addMessage('bot', aiResponse, {
                    characterName: this.currentCharacter.char_name || this.currentCharacter.name
                });

                // Speak the response
                console.log('🎙️ Starting TTS for AI response...');
                await this.speakLiveModeText(aiResponse);
            } else {
                console.error('❌ Invalid AI response:', data);
                if (this.isLiveModeActive) {
                    this.restartContinuousListening();
                }
            }

        } catch (error) {
            console.error('❌ Error processing Live Mode message:', error);
            if (this.isLiveModeActive) {
                this.restartContinuousListening();
            }
        }
    }

    /**
     * Get chat history for conversation context
     */
    getChatHistory() {
        const chatContainer = document.getElementById('chat-messages');
        if (!chatContainer) return [];

        const messages = [];
        const messageElements = chatContainer.querySelectorAll('.message');

        messageElements.forEach(element => {
            const isUser = element.classList.contains('user-message');
            const text = element.querySelector('.message-text')?.textContent?.trim();
            if (text) {
                messages.push({
                    role: isUser ? 'user' : 'assistant',
                    content: text
                });
            }
        });

        return messages;
    }

    /**
     * Restart continuous listening
     */
    restartContinuousListening() {
        if (!this.isLiveModeActive) {
            console.log('🎙️ Live mode not active, not restarting');
            return;
        }

        console.log('🎙️ Scheduling restart of continuous listening...');
        this.liveModeState = 'listening';
        this.updateLiveModeStatus(true, 'Listening...');

        // Small delay before restarting to prevent rapid cycling
        this.liveModeTimeout = setTimeout(async () => {
            if (this.isLiveModeActive) {
                try {
                    console.log('🎙️ Attempting to restart MediaRecorder...');
                    console.log('🎙️ MediaRecorder state:', this.mediaRecorder?.state);
                    console.log('🎙️ Audio stream active:', !!this.audioStream);

                    // Restart recording with shorter chunks for faster response
                    if (this.mediaRecorder) {
                        if (this.mediaRecorder.state === 'recording') {
                            console.log('🎙️ Stopping current recording before restart...');
                            this.mediaRecorder.stop();
                            // Wait a bit for stop to complete, then restart
                            setTimeout(() => {
                                if (this.isLiveModeActive && this.mediaRecorder.state === 'inactive') {
                                    this.audioChunks = [];
                                    this.mediaRecorder.start(1500);
                                    console.log('🎙️ Restarted continuous listening after stop, new state:', this.mediaRecorder.state);
                                }
                            }, 100);
                        } else if (this.mediaRecorder.state === 'inactive') {
                            this.audioChunks = [];
                            this.mediaRecorder.start(1500);
                            console.log('🎙️ Restarted continuous listening, new state:', this.mediaRecorder.state);
                        } else {
                            console.warn('🎙️ Cannot restart - MediaRecorder in unexpected state:', this.mediaRecorder.state);
                        }
                    } else {
                        console.warn('🎙️ Cannot restart - MediaRecorder not available');
                    }
                } catch (error) {
                    console.error('❌ Error restarting listening:', error);
                }
            }
        }, 500);
    }

    /**
     * Speak text in Live Mode
     */
    async speakLiveModeText(text) {
        try {
            if (!this.isLiveModeActive || !text) return;

            this.liveModeState = 'speaking';
            this.updateLiveModeStatus(true, 'Speaking...');

            console.log('🎙️ Sending TTS request for:', text);
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

            console.log('🎙️ TTS response status:', response.status);
            const data = await response.json();
            console.log('🎙️ TTS response data:', data);

            if (data.success && data.audioUrl) {
                // Play audio
                this.liveModeAudio = new Audio(data.audioUrl);
                this.liveModeAudio.volume = 0.8;

                // When audio finishes, restart listening
                this.liveModeAudio.onended = () => {
                    console.log('🎙️ TTS finished, restarting listening...');
                    console.log('🎙️ Live mode active:', this.isLiveModeActive);
                    console.log('🎙️ MediaRecorder exists:', !!this.mediaRecorder);
                    console.log('🎙️ MediaRecorder state before restart:', this.mediaRecorder?.state);
                    this.liveModeAudio = null;
                    if (this.isLiveModeActive) {
                        this.restartContinuousListening();
                    }
                };

                this.liveModeAudio.onerror = () => {
                    console.error('❌ Live Mode audio playback error');
                    this.liveModeAudio = null;
                    if (this.isLiveModeActive) {
                        this.restartContinuousListening();
                    }
                };

                await this.liveModeAudio.play();
                console.log('🎙️ Speaking Live Mode response');

            } else {
                console.error('❌ TTS failed in Live Mode');
                if (this.isLiveModeActive) {
                    this.restartContinuousListening();
                }
            }

        } catch (error) {
            console.error('❌ Error with Live Mode TTS:', error);
            if (this.isLiveModeActive) {
                this.restartContinuousListening();
            }
        }
    }

    /**
     * Clear chat history
     */
    clearChatHistory() {
        this.chatMessages.innerHTML = `
            <div class="message bot">
                <div class="message-content">
                    Live Mode activated! I'm listening for your voice...
                    <div class="message-time">${new Date().toLocaleTimeString()}</div>
                </div>
            </div>
        `;
        console.log('🎙️ Chat history cleared for Live Mode');
    }

    /**
     * Send message via ElevenLabs
     */
    async sendMessage(messageText = null) {
        const message = messageText || this.chatInput.value.trim();
        if (!message || !this.currentCharacter || this.isProcessing) return;

        // Check if ElevenLabs connection is available
        if (!this.elevenLabsWs || this.elevenLabsWs.readyState !== WebSocket.OPEN) {
            this.addMessage('system', 'ElevenLabs connection not available. Please check the connection.', {
                characterName: 'System',
                isInfo: true
            });
            return;
        }

        try {
            this.isProcessing = true;
            this.updateConnectionStatus('processing', 'Processing...');

            // Add user message
            this.addMessage('user', message);
            if (!messageText) { // Only clear input if not called from voice input
                this.chatInput.value = '';
                this.updateSendButton();
            }

            // Show typing indicator
            const typingId = this.showTypingIndicator();

            const startTime = Date.now();

            // Send to ElevenLabs via WebSocket
            const messageData = {
                type: 'user_message',
                message: message,
                characterId: this.currentCharacter.id,
                characterName: this.currentCharacter.name || this.currentCharacter.char_name,
                agentId: this.config.agentId || null
            };

            console.log('📤 Sending message to ElevenLabs:', messageData);
            this.elevenLabsWs.send(JSON.stringify(messageData));

            // Store message context for response handling
            this.pendingMessage = {
                startTime: startTime,
                typingId: typingId,
                message: message
            };

            // Update performance metrics
            this.performanceMetrics.voiceInput = Date.now() - startTime;
            
        } catch (error) {
            console.error('❌ Error sending message:', error);
            this.addMessage('bot', 'Connection error. Please try again.', {
                characterName: 'System',
                isError: true
            });
            this.updateConnectionStatus('disconnected', 'Error');
            this.handleMessageComplete();
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
     * Update ElevenLabs status
     */
    updateElevenLabsStatus(active, message) {
        this.elevenLabsToggle.className = `voice-toggle ${active ? 'active' : ''}`;
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
     * Update Live Mode status
     */
    updateLiveModeStatus(active, message) {
        let className = 'voice-toggle live-mode-toggle';

        if (active) {
            className += ' active';

            // Add state-specific classes for visual feedback
            switch (this.liveModeState) {
                case 'listening':
                    className += ' listening';
                    break;
                case 'processing':
                    className += ' processing';
                    break;
                case 'speaking':
                    className += ' speaking';
                    break;
            }
        }

        this.liveModeToggle.className = className;
        this.liveModeStatus.textContent = message;
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
        // Map old metric names to new ones
        const metricMap = {
            'stt': 'voiceInput',
            'ai': 'agent',
            'tts': 'voiceOutput'
        };

        const mappedType = metricMap[type] || type;
        this.performanceMetrics[mappedType] = time;

        const element = this[`${mappedType}Time`];
        if (element) {
            element.textContent = `${time}ms`;
        }
    }
}

// Make class available globally
window.EnhancedTestChat = EnhancedTestChat;
