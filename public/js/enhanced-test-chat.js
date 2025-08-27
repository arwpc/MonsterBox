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
        this.isTTSActive = false;
        this.isLiveModeActive = false;
        this.isProcessing = false;
        this.elevenLabsWs = null;
        this.audioStream = null;
        this.liveModeState = 'idle'; // idle, listening, processing, speaking
        this.speechDetected = false; // Track speech state for ElevenLabs VAD
        this.liveModeTimeout = null;
        this.liveModeAudio = null;
        this.liveModeToggleInProgress = false;
        this.performanceMetrics = {
            voiceInput: null,
            agent: null,
            voiceOutput: null,
            processingTime: null // Total processing time for complete pipeline
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
            }

            // Initialize ElevenLabs WebSocket connection first
            await this.initializeElevenLabsConnection();

            // Now handle character selection after WebSocket is connected
            if (this.config.characterId) {
                // Pre-select character if provided
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
     * Initialize ElevenLabs WebSocket connection
     */
    async initializeElevenLabsConnection() {
        try {
            // Use secure WebSocket proxy (wss://8872) if page is loaded over HTTPS, otherwise direct connection (ws://8771)
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const port = window.location.protocol === 'https:' ? '8872' : '8771'; // 8872 is the secure proxy port
            const wsUrl = `${protocol}//${window.location.hostname}:${port}`;

            console.log('🔗 Connecting to ElevenLabs WebSocket:', wsUrl);
            this.elevenLabsWs = new WebSocket(wsUrl);

            // Store connection details for potential fallback
            this.connectionAttempt = { protocol, port, wsUrl };

            this.elevenLabsWs.onopen = () => {
                console.log('✅ Connected to ElevenLabs service');
                this.updateConnectionStatus('connected', 'ElevenLabs Connected');

                // Small delay to ensure service is ready
                setTimeout(() => {
                    console.log('🎯 ElevenLabs service ready for conversations');
                }, 500);
            };

            this.elevenLabsWs.onmessage = async (event) => {
                try {
                    const data = event.data;

                    // Handle binary audio data (Blob or ArrayBuffer)
                    if (data instanceof Blob) {
                        console.log('📥 Received binary Blob from ElevenLabs, size:', data.size);

                        // Always try to parse as JSON first, regardless of size
                        try {
                            const text = await data.text();
                            const jsonData = JSON.parse(text);
                            console.log('📥 Blob contains JSON message:', jsonData);
                            this.handleElevenLabsMessage(jsonData);
                            return;
                        } catch (parseError) {
                            // If JSON parsing fails, treat as binary audio data
                            console.log('🔊 Blob is not JSON, processing as audio data');
                            await this.handleElevenLabsBinaryData(data);
                            return;
                        }
                    }

                    // Handle ArrayBuffer binary data
                    if (data instanceof ArrayBuffer) {
                        console.log('📥 Received ArrayBuffer from ElevenLabs, size:', data.byteLength);

                        // Large ArrayBuffers are likely audio
                        if (data.byteLength > 100) {
                            console.log('🔊 Processing ArrayBuffer as audio data');
                            const blob = new Blob([data]);
                            await this.handleElevenLabsBinaryData(blob);
                            return;
                        }

                        // Try to decode as text for small ArrayBuffers
                        try {
                            const text = new TextDecoder().decode(data);
                            const jsonData = JSON.parse(text);
                            this.handleElevenLabsMessage(jsonData);
                            return;
                        } catch (parseError) {
                            console.warn('⚠️ ArrayBuffer is not JSON, treating as audio');
                            const blob = new Blob([data]);
                            await this.handleElevenLabsBinaryData(blob);
                            return;
                        }
                    }

                    // Handle string data (JSON messages)
                    if (typeof data === 'string') {
                        try {
                            const jsonData = JSON.parse(data);
                            this.handleElevenLabsMessage(jsonData);
                        } catch (parseError) {
                            console.warn('⚠️ Received non-JSON string message:', data.substring(0, 100) + '...');
                        }
                        return;
                    }

                    console.warn('⚠️ Received unknown data type:', typeof data, data);

                } catch (error) {
                    console.error('❌ Error processing WebSocket message:', error);
                }
            };

            this.elevenLabsWs.onclose = () => {
                console.log('🔌 ElevenLabs connection closed');
                this.updateConnectionStatus('disconnected', 'ElevenLabs Disconnected');
            };

            this.elevenLabsWs.onerror = (error) => {
                console.error('❌ ElevenLabs WebSocket error:', error);

                // Check if this is an SSL certificate issue
                if (window.location.protocol === 'https:' && this.connectionAttempt.port === '8872') {
                    this.updateConnectionStatus('error', 'SSL Certificate Required');
                    this.showSSLCertificateInstructions();
                } else {
                    this.updateConnectionStatus('error', 'ElevenLabs Error');
                }
            };

        } catch (error) {
            console.error('❌ Failed to initialize ElevenLabs connection:', error);
            throw error;
        }
    }

    /**
     * Show SSL certificate acceptance instructions
     */
    showSSLCertificateInstructions() {
        const instructionsHtml = `
            <div class="ssl-instructions" style="background: #2a2a2a; border: 2px solid #ff6b6b; border-radius: 8px; padding: 20px; margin: 10px 0; color: #fff;">
                <h3 style="color: #ff6b6b; margin-top: 0;">🔒 SSL Certificate Required</h3>
                <p>To use the ElevenLabs WebSocket connection over HTTPS, you need to accept the SSL certificate:</p>
                <ol style="margin: 15px 0; padding-left: 20px;">
                    <li>Click this link: <a href="https://localhost:8872" target="_blank" style="color: #4ecdc4; text-decoration: underline;">https://localhost:8872</a></li>
                    <li>Accept the security warning/certificate in the new tab</li>
                    <li>Return to this page and refresh</li>
                </ol>
                <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #444;">
                    <button onclick="window.testChat.tryInsecureConnection()" style="background: #ff9500; color: #fff; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; margin-right: 10px;">
                        🔓 Try Insecure Connection (Testing)
                    </button>
                    <span style="font-size: 0.9em; color: #ccc;">For testing only - may not work in production</span>
                </div>
                <p style="margin-bottom: 0; font-size: 0.9em; color: #ccc;">This is a one-time setup for the self-signed SSL certificate.</p>
            </div>
        `;

        // Add instructions to chat area
        this.chatMessages.innerHTML = instructionsHtml + this.chatMessages.innerHTML;
    }

    /**
     * Handle messages from ElevenLabs WebSocket
     */
    handleElevenLabsMessage(message) {
        console.log('📥 ElevenLabs message:', message);

        switch (message.type) {
            case 'connected':
                console.log('🔗 ElevenLabs service connected, session:', message.sessionId);
                console.log('🎭 Available characters:', message.availableCharacters);
                break;

            case 'conversation_started':
                this.addMessage('system', `Connected to ${message.characterName}`, {
                    characterName: 'System',
                    isInfo: true
                });
                break;

            case 'conversation_initiation_metadata':
                console.log('🎯 Conversation metadata:', message.conversation_initiation_metadata_event);
                this.conversationId = message.conversation_initiation_metadata_event?.conversation_id;
                break;

            case 'ping':
                // Handle ping messages silently
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
                // Unify audio handling: support both proxied (audioData) and direct (audio_event.audio_base_64)
                if (message.audio_event && message.audio_event.audio_base_64) {
                    this.handleElevenLabsAudio(message.audio_event.audio_base_64);
                } else {
                    this.handleAudioResponse(message);
                }
                break;

            case 'user_transcript':
                // Handle user speech transcription from ElevenLabs
                console.log('👤 User transcript from ElevenLabs:', message.user_transcription_event?.user_transcript);
                if (message.user_transcription_event?.user_transcript) {
                    this.addMessage('user', message.user_transcription_event.user_transcript, {
                        characterName: 'You',
                        isTranscript: true
                    });
                }
                break;

            case 'agent_response':
                // Handle AI response text from ElevenLabs
                console.log('🤖 Agent response from ElevenLabs:', message.agent_response_event?.agent_response);
                if (message.agent_response_event?.agent_response) {
                    this.addMessage('bot', message.agent_response_event.agent_response, {
                        characterName: this.currentCharacter ? this.currentCharacter.name : 'AI Assistant'
                    });
                }
                break;

            case 'audio':
                // Handle audio response from ElevenLabs
                console.log('🔊 Audio response from ElevenLabs:', message.audio_event);
                if (message.audio_event?.audio_base_64) {
                    this.handleElevenLabsAudio(message.audio_event.audio_base_64);
                }
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

        // Store response for fallback TTS
        this.lastAIResponse = responseText;

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
     * Detect if audio data contains actual speech/sound activity
     */
    detectAudioActivity(pcmData) {
        try {
            // Convert Uint8Array back to Int16Array for analysis
            const int16Data = new Int16Array(pcmData.buffer);

        let totalEnergy = 0;
        let maxAmplitude = 0;
        let nonZeroSamples = 0;

        // Calculate audio energy and statistics
        for (let i = 0; i < int16Data.length; i++) {
            const sample = Math.abs(int16Data[i]);
            totalEnergy += sample * sample;
            maxAmplitude = Math.max(maxAmplitude, sample);
            if (sample > 100) { // Threshold for non-silence
                nonZeroSamples++;
            }
        }

        const averageEnergy = totalEnergy / int16Data.length;
        const activityRatio = nonZeroSamples / int16Data.length;

        // Thresholds for speech detection (more sensitive for ElevenLabs server_vad)
        const energyThreshold = 500000;  // Reduced for better sensitivity
        const amplitudeThreshold = 300;  // Reduced for better sensitivity
        const activityThreshold = 0.005; // Reduced to 0.5% for better sensitivity

        const hasActivity = averageEnergy > energyThreshold ||
                           maxAmplitude > amplitudeThreshold ||
                           activityRatio > activityThreshold;

        console.log(`🎙️ Audio activity: energy=${averageEnergy.toFixed(0)}, max=${maxAmplitude}, activity=${(activityRatio*100).toFixed(1)}%, hasActivity=${hasActivity}`);

        return hasActivity;
        } catch (error) {
            console.error('❌ Error detecting audio activity:', error);
            return false;
        }
    }

    /**
     * Convert audio blob to PCM 16kHz format for ElevenLabs
     */
    async convertToPCM16kHz(audioBlob) {
        try {
            // Create audio context with 16kHz sample rate
            const audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 16000
            });

            // Decode the audio blob
            const arrayBuffer = await audioBlob.arrayBuffer();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

            // Get the audio data as Float32Array
            const channelData = audioBuffer.getChannelData(0); // Use first channel (mono)

            // Convert Float32 to Int16 PCM
            const pcmData = new Int16Array(channelData.length);
            for (let i = 0; i < channelData.length; i++) {
                // Convert from [-1, 1] to [-32768, 32767]
                pcmData[i] = Math.max(-32768, Math.min(32767, channelData[i] * 32767));
            }

            // Convert Int16Array to Uint8Array for base64 encoding
            const uint8Array = new Uint8Array(pcmData.buffer);

            console.log(`🎙️ Converted to PCM 16kHz: ${uint8Array.length} bytes`);
            return uint8Array;

        } catch (error) {
            console.error('❌ Error converting to PCM 16kHz:', error);
            // Return empty array on error to avoid crashes
            return new Uint8Array(0);
        }
    }

    /**
     * Send end-of-speech signal to ElevenLabs
     */
    sendEndOfSpeechToElevenLabs() {
        try {
            if (this.elevenLabsWs && this.elevenLabsWs.readyState === WebSocket.OPEN) {
                // Send empty audio message to signal end of speech (ElevenLabs format)
                const endMessage = {
                    user_audio_chunk: '' // Empty audio data signals end of speech
                };

                this.elevenLabsWs.send(JSON.stringify(endMessage));
                console.log('✅ End-of-speech signal sent to ElevenLabs');
            }
        } catch (error) {
            console.error('❌ Error sending end-of-speech signal:', error);
        }
    }

    /**
     * Handle audio response from ElevenLabs
     */
    async handleElevenLabsAudio(base64Audio) {
        try {
            console.log('🔊 Processing ElevenLabs audio response...');

            // Convert base64 to audio blob
            const audioData = atob(base64Audio);
            const audioArray = new Uint8Array(audioData.length);
            for (let i = 0; i < audioData.length; i++) {
                audioArray[i] = audioData.charCodeAt(i);
            }

            const audioBlob = new Blob([audioArray], { type: 'audio/wav' });
            const audioUrl = URL.createObjectURL(audioBlob);

            // Play the audio
            const audio = new Audio(audioUrl);
            audio.play();

            console.log('✅ ElevenLabs audio played successfully');

        } catch (error) {
            console.error('❌ Error playing ElevenLabs audio:', error);
        }
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

            // Check if WebSocket connection exists and is ready
            if (!this.elevenLabsWs) {
                throw new Error('ElevenLabs WebSocket not initialized');
            }

            // If connection is not open, wait for it with a shorter timeout
            if (this.elevenLabsWs.readyState !== WebSocket.OPEN) {
                this.addMessage('system', 'Connecting to ElevenLabs service...', {
                    characterName: 'System',
                    isInfo: true
                });

                // Wait for connection to be established with shorter timeout
                await this.waitForWebSocketConnection(5000);
            }

            // Verify we have an agent ID
            const agentId = this.config.agentId || character.elevenLabsAgentId;
            if (!agentId) {
                throw new Error(`No ElevenLabs agent ID found for character ${character.char_name || character.name}`);
            }

            // Store the agent ID for use in messages
            this.currentAgentId = agentId;

            // Send conversation start message (using the format expected by the service)
            const startMessage = {
                type: 'start_conversation',
                characterId: character.id
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
            this.addMessage('system', `Failed to start conversation. Please try again. ${error.message}`, {
                characterName: 'System',
                isError: true
            });
            throw error;
        }
    }

    /**
     * Wait for WebSocket connection to be established
     */
    async waitForWebSocketConnection(maxWait = 10000) {
        return new Promise((resolve, reject) => {
            // Check if already connected
            if (this.elevenLabsWs && this.elevenLabsWs.readyState === WebSocket.OPEN) {
                console.log('🔗 WebSocket already connected');
                resolve();
                return;
            }

            console.log('⏳ Waiting for WebSocket connection...');
            const timeout = setTimeout(() => {
                console.log('❌ WebSocket connection timeout after', maxWait, 'ms');
                reject(new Error('WebSocket connection timeout'));
            }, maxWait);

            const checkConnection = () => {
                if (this.elevenLabsWs && this.elevenLabsWs.readyState === WebSocket.OPEN) {
                    console.log('✅ WebSocket connection established');
                    clearTimeout(timeout);
                    resolve();
                } else if (this.elevenLabsWs && this.elevenLabsWs.readyState === WebSocket.CLOSED) {
                    console.log('❌ WebSocket connection closed');
                    clearTimeout(timeout);
                    reject(new Error('WebSocket connection closed'));
                } else {
                    // Still connecting, check again
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

                // Update assistant display based on available capabilities
                const agentId = this.config.agentId || character.elevenLabsAgentId;
                const assistantId = character.openaiAssistantId;

                let displayText = '';
                if (agentId && assistantId) {
                    displayText = `ElevenLabs: ${agentId} + OpenAI: ${assistantId}`;
                } else if (agentId) {
                    displayText = `ElevenLabs: ${agentId}`;
                } else if (assistantId) {
                    displayText = `OpenAI: ${assistantId}`;
                } else if (character.hasVoice) {
                    displayText = 'Voice only (no AI chat)';
                } else {
                    displayText = 'No assistant assigned';
                }

                this.assistantDisplay.value = displayText;

                // Start ElevenLabs conversation if agent is available, or try anyway for testing
                if (this.config.agentId || character.elevenLabsAgentId || this.elevenLabsWs) {
                    await this.startElevenLabsConversation(character);
                } else if (character.openaiAssistantId) {
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
            console.log(`🔍 Fetching character config for ID: ${characterId}`);
            const response = await fetch(`${this.config.apiBaseUrl}/character/${characterId}/config`);
            console.log(`🔍 Character config response status: ${response.status}`);
            const data = await response.json();
            console.log(`🔍 Character config data:`, data);

            if (data.success) {
                this.currentCharacter = { ...this.currentCharacter, ...data.character };
                console.log(`🎭 Selected character: ${this.currentCharacter.name}`);
            } else {
                console.warn(`⚠️ Character config fetch failed:`, data);
            }
            
            this.updateSendButton();
            this.updateConnectionStatus('connected', 'Ready');
            
        } catch (error) {
            console.error('❌ Error selecting character:', error);

            // If we started an ElevenLabs conversation but then failed, clean it up
            if (this.elevenLabsWs && this.elevenLabsWs.readyState === WebSocket.OPEN) {
                try {
                    this.elevenLabsWs.send(JSON.stringify({
                        type: 'stop_conversation'
                    }));
                } catch (cleanupError) {
                    console.error('❌ Error cleaning up conversation:', cleanupError);
                }
            }

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
            const response = await fetch(`${this.config.apiBaseUrl}/api/voice/transcribe`, {
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
                if (this.currentCharacter && (this.currentCharacter.elevenLabsAgentId || this.currentCharacter.openaiAssistantId)) {
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
            console.log('🎙️ toggleLiveMode called, current state:', this.isLiveModeActive);

            // Prevent rapid toggling
            if (this.liveModeToggleInProgress) {
                console.log('🎙️ Live Mode toggle already in progress, ignoring...');
                return;
            }

            this.liveModeToggleInProgress = true;
            if (!this.currentCharacter) {
                alert('Please select a character first');
                return;
            }

            // Check if character has ElevenLabs agent for Live Mode
            if (!this.currentCharacter.elevenLabsAgentId && !this.config.agentId) {
                alert('Live Mode requires a character with ElevenLabs AI agent configured');
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
        } finally {
            // Reset toggle flag after a short delay
            setTimeout(() => {
                this.liveModeToggleInProgress = false;
            }, 1000);
        }
    }

    /**
     * Start Live Mode with ElevenLabs Conversational AI
     */
    async startLiveMode() {
        try {
            console.log('🎙️ Starting ElevenLabs Live Mode...');
            console.log('🎙️ Current Live Mode state before start:', this.isLiveModeActive);

            // Don't clear chat history - continue existing conversation
            // this.clearChatHistory(); // Removed to preserve conversation

            // Set Live Mode active
            this.isLiveModeActive = true;
            this.liveModeState = 'starting';
            this.updateLiveModeStatus(true, 'Starting Live Mode...');

            // Start continuous listening directly since ElevenLabs connection is already established
            await this.startContinuousListening();
            this.updateLiveModeStatus(true, 'Live Mode Active - Listening...');

            console.log('🎙️ ElevenLabs Live Mode started successfully');

        } catch (error) {
            console.error('❌ Error starting ElevenLabs Live Mode:', error);
            console.error('❌ Error details:', error.message, error.stack);
            this.isLiveModeActive = false;
            this.updateLiveModeStatus(false, 'Error: ' + error.message);
            throw error;
        }
    }

    /**
     * Stop ElevenLabs Live Mode
     */
    async stopLiveMode() {
        try {
            console.log('🎙️ Stopping ElevenLabs Live Mode...');

            // Set Live Mode inactive
            this.isLiveModeActive = false;
            this.liveModeState = 'idle';

            // Send stop conversation message
            const ws = this.elevenLabsConversationWs || this.elevenLabsWs;
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'stop_conversation'
                }));
            }

            // Close ElevenLabs conversation WebSocket (only if it's separate)
            if (this.elevenLabsConversationWs && this.elevenLabsConversationWs !== this.elevenLabsWs) {
                this.elevenLabsConversationWs.close();
                this.elevenLabsConversationWs = null;
            }

            // Stop microphone level indicator
            this.stopMicrophoneLevelIndicator();

            // Stop microphone stream
            if (this.audioStream) {
                this.audioStream.getTracks().forEach(track => track.stop());
                this.audioStream = null;
            }

            // Stop MediaRecorder
            if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
                this.mediaRecorder.stop();
                this.mediaRecorder = null;
            }

            // Stop any audio playback
            if (this.currentAudio) {
                this.currentAudio.pause();
                this.currentAudio = null;
            }

            // Clear timeouts and intervals
            if (this.liveModeTimeout) {
                clearTimeout(this.liveModeTimeout);
                this.liveModeTimeout = null;
            }

            if (this.liveModeStatusInterval) {
                clearInterval(this.liveModeStatusInterval);
                this.liveModeStatusInterval = null;
            }

            // Update status
            this.updateLiveModeStatus(false, 'OFF');

            console.log('🎙️ ElevenLabs Live Mode stopped successfully');

        } catch (error) {
            console.error('❌ Error stopping ElevenLabs Live Mode:', error);
            this.updateLiveModeStatus(false, 'Error');
        }
    }

    /**
     * Initialize ElevenLabs Conversational AI WebSocket
     */
    async initializeElevenLabsConversation() {
        try {
            console.log('🎭 Initializing ElevenLabs Conversational AI...');

            // Get agent ID from current character
            const agentId = this.currentCharacter?.elevenLabsAgentId;
            if (!agentId) {
                throw new Error('No ElevenLabs agent ID found for current character');
            }

            // Use the existing ElevenLabs WebSocket connection if available
            if (this.elevenLabsWs && this.elevenLabsWs.readyState === WebSocket.OPEN) {
                console.log('🔗 Using existing ElevenLabs connection for Live Mode');
                await this.handleElevenLabsConversationOpen();
                return;
            }

            // If no connection exists, throw error - connection should be established during initialization
            if (!this.elevenLabsWs) {
                throw new Error('ElevenLabs WebSocket connection not available. Please refresh the page.');
            }

            // If connection is connecting, wait for it
            if (this.elevenLabsWs.readyState === WebSocket.CONNECTING) {
                console.log('⏳ Waiting for ElevenLabs connection to establish...');
                await this.waitForWebSocketConnection(10000);
                await this.handleElevenLabsConversationOpen();
                return;
            }

            // If connection is closed, it needs to be re-established
            throw new Error('ElevenLabs WebSocket connection is closed. Please refresh the page.');

        } catch (error) {
            console.error('❌ Failed to initialize ElevenLabs Conversational AI:', error);
            throw error;
        }
    }

    /**
     * Connect to ElevenLabs for Live Mode via authenticated proxy
     */
    async connectDirectlyToElevenLabs(agentId) {
        try {
            console.log('🔗 Getting ElevenLabs conversation token...');

            // Get authentication token from backend
            const response = await fetch('/ai-management/api/elevenlabs/conversation-token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ agentId })
            });

            const data = await response.json();
            if (!data.success) {
                throw new Error(data.error || 'Failed to get conversation token');
            }

            console.log('🔗 Connecting to ElevenLabs via authenticated proxy...');

            // Connect to our proxy with the token
            const proxyWsUrl = `wss://${window.location.hostname}:8872`;
            this.elevenLabsDirectWs = new WebSocket(proxyWsUrl);

            // Store token for authentication
            this.authToken = data.token;
            this.agentId = agentId;

            // Set up WebSocket event handlers
            this.elevenLabsDirectWs.onopen = () => {
                console.log('✅ Connected to ElevenLabs proxy');
                // Send authentication and start Live Mode
                this.elevenLabsDirectWs.send(JSON.stringify({
                    type: 'authenticate',
                    token: this.authToken,
                    agentId: this.agentId,
                    liveMode: true
                }));
            };

            this.elevenLabsDirectWs.onmessage = (event) => {
                this.handleElevenLabsDirectMessage(event);
            };

            this.elevenLabsDirectWs.onerror = (error) => {
                console.error('❌ ElevenLabs proxy WebSocket error:', error);
            };

            this.elevenLabsDirectWs.onclose = (event) => {
                console.log('🔌 ElevenLabs proxy WebSocket closed:', event.code, event.reason);
            };

        } catch (error) {
            console.error('❌ Error connecting to ElevenLabs proxy:', error);
            throw error;
        }
    }

    /**
     * Handle direct ElevenLabs connection open
     */
    async handleElevenLabsDirectConversationOpen() {
        try {
            console.log('🎤 Initializing direct ElevenLabs conversation...');

            // Send conversation initiation message
            const initMessage = {
                type: 'conversation_initiation_client_data',
                conversation_config_override: {
                    agent: {
                        prompt: {
                            prompt: this.currentCharacter?.elevenLabsConfig?.prompt || "You are a helpful AI assistant."
                        },
                        first_message: this.getConversationStarter(),
                        language: "en"
                    },
                    tts: {
                        voice_id: this.currentCharacter?.elevenLabsConfig?.voice_id || "21m00Tcm4TlvDq8ikWAM"
                    }
                }
            };

            console.log('📤 Sending conversation initiation:', initMessage);
            this.elevenLabsDirectWs.send(JSON.stringify(initMessage));

        } catch (error) {
            console.error('❌ Error handling direct ElevenLabs connection:', error);
        }
    }

    /**
     * Handle direct ElevenLabs WebSocket messages
     */
    async handleElevenLabsDirectMessage(event) {
        try {
            const data = event.data;

            // Check if the data is binary (Blob) or ArrayBuffer
            if (data instanceof Blob) {
                console.log('📥 Received binary Blob from direct ElevenLabs, size:', data.size);

                // Try to parse as JSON first
                try {
                    const text = await data.text();
                    const jsonData = JSON.parse(text);
                    console.log('📥 Direct ElevenLabs Blob contains JSON:', jsonData);
                    this.handleDirectElevenLabsJsonMessage(jsonData);
                    return;
                } catch (parseError) {
                    // If JSON parsing fails, treat as binary audio data
                    console.log('🔊 Direct ElevenLabs Blob is not JSON, processing as audio');
                    this.handleElevenLabsBinaryData(data);
                    return;
                }
            }

            if (data instanceof ArrayBuffer) {
                console.log('📥 Received ArrayBuffer from direct ElevenLabs, size:', data.byteLength);
                const blob = new Blob([data]);
                this.handleElevenLabsBinaryData(blob);
                return;
            }

            // Handle JSON messages
            if (typeof data === 'string') {
                try {
                    const message = JSON.parse(data);
                    console.log('📥 Direct ElevenLabs message:', message);
                    this.handleDirectElevenLabsJsonMessage(message);
                } catch (parseError) {
                    console.warn('⚠️ Received non-JSON string from direct ElevenLabs:', data.substring(0, 100) + '...');
                }
                return;
            }

            console.warn('⚠️ Unknown data type from direct ElevenLabs:', typeof data);

        } catch (error) {
            console.error('❌ Error handling direct ElevenLabs message:', error);
        }
    }

    /**
     * Handle JSON messages from direct ElevenLabs connection
     */
    handleDirectElevenLabsJsonMessage(message) {
        try {

            switch (message.type) {
                case 'authentication_success':
                    console.log('✅ Live Mode authentication successful');
                    this.updateLiveModeStatus(true, 'Live Mode Active - Speak now!');
                    break;

                case 'authentication_error':
                    console.error('❌ Live Mode authentication failed:', message.error);
                    this.updateLiveModeStatus(false, 'Authentication Failed');
                    break;

                case 'conversation_initiation_metadata':
                    this.handleDirectConversationStarted(message);
                    break;

                case 'audio':
                    this.handleDirectAudioResponse(message);
                    break;

                case 'transcript':
                    if (message.role === 'assistant') {
                        this.handleAIResponse(message.text);
                    }
                    break;

                case 'live_mode_error':
                    console.error('❌ Live Mode error:', message.error);
                    this.updateLiveModeStatus(false, 'Error');
                    break;

                default:
                    console.log('📥 Unknown direct ElevenLabs message type:', message.type);
            }

        } catch (error) {
            console.error('❌ Error handling direct ElevenLabs message:', error);
        }
    }

    /**
     * Handle binary audio data from ElevenLabs
     */
    async handleElevenLabsBinaryData(blob) {
        try {
            console.log('🔊 Processing binary audio data from ElevenLabs');

            // Convert blob to array buffer
            const arrayBuffer = await blob.arrayBuffer();
            const audioData = new Uint8Array(arrayBuffer);

            // Convert to base64 for our existing audio playback system
            let binary = '';
            for (let i = 0; i < audioData.length; i++) {
                binary += String.fromCharCode(audioData[i]);
            }
            const base64Audio = btoa(binary);

            // Use our existing audio playback method
            await this.playAudioFromBase64(base64Audio);

        } catch (error) {
            console.error('❌ Error processing binary audio data:', error);
        }
    }

    /**
     * Handle direct conversation started
     */
    handleDirectConversationStarted(message) {
        console.log('🎭 Direct conversation started:', message);
        this.conversationId = message.conversationId;

        // ElevenLabs Conversational AI is now ready for voice input
        this.updateLiveModeStatus(true, 'Live Mode Active - Speak now!');

        // Add system message to chat
        this.addMessage('system', `🎙️ Live Mode activated! ElevenLabs is listening for your voice. Start speaking to ${this.currentCharacter?.char_name || 'the character'}.`, {
            characterName: 'System'
        });
    }

    /**
     * Handle direct audio response
     */
    handleDirectAudioResponse(message) {
        console.log('🔊 Received direct audio response');

        if (message.audio_event && message.audio_event.audio_base_64) {
            // Play audio directly from base64
            this.playAudioFromBase64(message.audio_event.audio_base_64);
        }
    }

    /**
     * Get conversation starter for character
     */
    getConversationStarter() {
        if (this.currentCharacter?.elevenLabsConfig?.first_message) {
            return this.currentCharacter.elevenLabsConfig.first_message;
        }

        const characterName = this.currentCharacter?.char_name || this.currentCharacter?.name || 'AI Assistant';
        return `Hello! I'm ${characterName}. How can I help you today?`;
    }

    /**
     * Wait for ElevenLabs Conversational AI connection
     */
    async waitForElevenLabsConnection(maxWait = 10000) {
        return new Promise((resolve, reject) => {
            // Check if we're using existing connection
            const ws = this.elevenLabsConversationWs || this.elevenLabsWs;

            if (ws && ws.readyState === WebSocket.OPEN) {
                resolve();
                return;
            }

            const timeout = setTimeout(() => {
                reject(new Error('ElevenLabs connection timeout'));
            }, maxWait);

            const checkConnection = () => {
                const currentWs = this.elevenLabsConversationWs || this.elevenLabsWs;

                if (currentWs && currentWs.readyState === WebSocket.OPEN) {
                    clearTimeout(timeout);
                    resolve();
                } else if (currentWs && currentWs.readyState === WebSocket.CLOSED) {
                    clearTimeout(timeout);
                    reject(new Error('ElevenLabs connection closed'));
                } else {
                    setTimeout(checkConnection, 100);
                }
            };

            checkConnection();
        });
    }

    /**
     * Handle ElevenLabs Conversational AI connection open
     */
    async handleElevenLabsConversationOpen() {
        try {
            console.log('🎤 Starting ElevenLabs Conversational AI...');

            // Only send start_conversation if we don't already have an active conversation
            // Check if we already have a conversation by looking for existing messages or connection state
            const hasActiveConversation = this.currentAgentId && this.elevenLabsWs && this.elevenLabsWs.readyState === WebSocket.OPEN;

            if (!hasActiveConversation) {
                // Start conversation using the existing service protocol
                const startMessage = {
                    type: 'start_conversation',
                    characterId: this.currentCharacter.id
                };

                console.log('📤 Sending start_conversation message:', startMessage);

                // Use the appropriate WebSocket connection
                const ws = this.elevenLabsConversationWs || this.elevenLabsWs;
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify(startMessage));
                } else {
                    throw new Error('No active ElevenLabs WebSocket connection');
                }
            } else {
                console.log('🔗 Using existing active conversation for Live Mode');
            }

            // If Live Mode is active, start continuous listening for microphone input
            if (this.isLiveModeActive) {
                console.log('🎙️ Starting microphone for Live Mode...');
                this.updateLiveModeStatus(true, 'Starting microphone...');

                // Start continuous listening immediately
                try {
                    await this.startContinuousListening();
                    this.updateLiveModeStatus(true, 'Live Mode Active - Listening...');
                    console.log('✅ Live Mode microphone started successfully');
                } catch (error) {
                    console.error('❌ Failed to start microphone:', error);
                    this.updateLiveModeStatus(false, 'Microphone Error');

                    // Show user-friendly error message
                    this.addMessage('system', `Microphone access denied or unavailable. Please check browser permissions and try again.`, {
                        characterName: 'System',
                        isError: true
                    });
                }
            } else {
                this.updateLiveModeStatus(true, 'Connected to ElevenLabs');
            }

        } catch (error) {
            console.error('❌ Error handling ElevenLabs connection open:', error);
            this.updateLiveModeStatus(false, 'Error');
        }
    }

    /**
     * Get conversation starter for character
     */
    getConversationStarter() {
        if (this.currentCharacter?.conversationStarters?.length > 0) {
            const starters = this.currentCharacter.conversationStarters.filter(s => s && s.trim());
            if (starters.length > 0) {
                return starters[Math.floor(Math.random() * starters.length)];
            }
        }
        return "Hello! I'm ready to chat. What would you like to talk about?";
    }

    /**
     * Send text message to ElevenLabs agent
     */
    sendTextToAgent(text) {
        try {
            if (!this.elevenLabsWs || this.elevenLabsWs.readyState !== WebSocket.OPEN) {
                console.warn('⚠️ ElevenLabs WebSocket not connected');
                return false;
            }

            console.log('📤 Sending text to agent:', text);

            // Send text message to ElevenLabs (using the format expected by the service)
            this.elevenLabsWs.send(JSON.stringify({
                type: 'send_text',
                text: text
            }));

            return true;
        } catch (error) {
            console.error('❌ Error sending text to agent:', error);
            return false;
        }
    }

    /**
     * Handle ElevenLabs Conversational AI messages
     */
    handleElevenLabsConversationMessage(event) {
        try {
            const message = JSON.parse(event.data);
            console.log('📥 ElevenLabs Conversational AI message:', message);

            switch (message.type) {
                case 'connected':
                    this.handleServiceConnected(message);
                    break;

                case 'conversation_started':
                    this.handleConversationStarted(message);
                    break;

                case 'conversation_metadata':
                    this.handleConversationMetadata(message);
                    break;

                case 'transcript':
                    this.handleTranscript(message);
                    break;

                case 'audio':
                    this.handleAudioResponse(message);
                    break;

                case 'conversation_starters':
                    this.handleConversationStarters(message);
                    break;

                case 'error':
                    this.handleServiceError(message);
                    break;

                case 'conversation_stopped':
                case 'conversation_ended':
                    this.handleConversationEnded(message);
                    break;

                default:
                    console.log('📥 Unknown ElevenLabs message type:', message.type);
            }

        } catch (error) {
            console.error('❌ Error handling ElevenLabs message:', error);
            console.error('❌ Message data:', event.data);
        }
    }

    /**
     * ElevenLabs Conversational AI handles microphone access natively
     * No custom microphone initialization needed
     */

    /**
     * ElevenLabs Conversational AI handles all audio processing natively
     * No custom audio processing needed
     */

    /**
     * Handle service connected message
     */
    handleServiceConnected(message) {
        console.log('🔗 ElevenLabs service connected:', message);
        this.sessionId = message.sessionId;
        this.updateLiveModeStatus(true, 'Connected');
    }

    /**
     * Handle conversation started message
     */
    handleConversationStarted(message) {
        console.log('🎭 Conversation started:', message);
        this.conversationId = message.conversationId;

        // ElevenLabs Conversational AI is now ready for voice input
        this.updateLiveModeStatus(true, 'Live Mode Active - Speak now!');

        // Add system message to chat
        this.addMessage('system', `🎙️ Live Mode activated! ElevenLabs is listening for your voice. Start speaking to ${message.characterName || this.currentCharacter?.char_name || 'the character'}.`, {
            characterName: 'System'
        });
    }

    /**
     * Handle conversation metadata
     */
    handleConversationMetadata(message) {
        console.log('📋 Conversation metadata:', message);
        this.conversationId = message.conversationId;
        this.audioFormat = message.audioFormat;
    }

    /**
     * Handle transcript messages (both user and assistant)
     */
    handleTranscript(message) {
        console.log('📝 Transcript:', message);

        const role = message.role === 'user' ? 'user' : 'bot';
        const characterName = role === 'user' ? 'You' : (this.currentCharacter?.char_name || this.currentCharacter?.name || 'AI');

        // Add message to chat
        this.addMessage(role, message.text, {
            characterName: characterName
        });
    }

    /**
     * Handle conversation starters
     */
    handleConversationStarters(message) {
        console.log('💬 Conversation starters:', message);
        // Could be used to update UI with available conversation starters
    }

    /**
     * Handle service errors
     */
    handleServiceError(message) {
        console.error('❌ ElevenLabs service error:', message);
        this.updateLiveModeStatus(false, `Error: ${message.message}`);
    }

    /**
     * Handle conversation ended
     */
    handleConversationEnded(message) {
        console.log('🔚 Conversation ended:', message);
        this.updateLiveModeStatus(false, 'Conversation Ended');
    }

    /**
     * Handle audio response
     */
    handleAudioResponse(message) {
        try {
            const audioBase64 = message.audioData || message.audio;
            if (!audioBase64) {
                console.error('❌ No audio data in message:', message);
                return;
            }

            console.log('🔊 Received audio response');

            // Convert base64 to audio and play
            this.playAudioFromBase64(audioBase64);
        } catch (error) {
            console.error('❌ Error handling audio response:', error);
        }
    }



    /**
     * Stop and clean up any currently playing audio (barge-in friendly)
     */
    stopCurrentAudio() {
        try {
            if (this.currentAudio) {
                try { this.currentAudio.pause(); } catch (e) {}
                // Revoke blob URL if present
                if (this.currentAudio._blobUrl) {
                    try { URL.revokeObjectURL(this.currentAudio._blobUrl); } catch (e) {}
                }
                this.currentAudio.src = '';
                this.currentAudio = null;
            }
        } catch (e) {
            console.warn('⚠️ Error while stopping current audio:', e);
        }
    }

    /**
     * Play audio from base64 data (single-stream, interruptible)
     */
    async playAudioFromBase64(audioBase64) {
        try {
            if (!audioBase64) {
                console.error('❌ No audio data provided');
                return;
            }

            // Check if voice output is enabled
            if (!this.isElevenLabsActive && !this.isTTSActive) {
                console.log('🔇 Audio playback disabled by user controls');
                return;
            }

            // Ensure only one audio stream at a time
            this.stopCurrentAudio();

            console.log('🔊 Playing audio from base64, length:', audioBase64.length);

            // First, try to detect if this is already a complete audio format (MP3, WAV, etc.)
            try {
                // Try direct playback first using blob URL (avoids CSP issues)
                const audioBytes = atob(audioBase64);
                const audioArray = new Uint8Array(audioBytes.length);
                for (let i = 0; i < audioBytes.length; i++) {
                    audioArray[i] = audioBytes.charCodeAt(i);
                }

                const audioBlob = new Blob([audioArray], { type: 'audio/mpeg' });
                const audioUrl = URL.createObjectURL(audioBlob);
                const testAudio = new Audio(audioUrl);
                // Track URL for cleanup
                testAudio._blobUrl = audioUrl;

                await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        reject(new Error('Audio load timeout'));
                    }, 2000);

                    testAudio.oncanplaythrough = () => {
                        clearTimeout(timeout);
                        resolve();
                    };

                    testAudio.onerror = () => {
                        clearTimeout(timeout);
                        reject(new Error('Direct audio playback failed'));
                    };

                    testAudio.load();
                });

                // If we get here, direct playback works
                console.log('✅ Direct audio playback successful');
                this.currentAudio = testAudio;
                this.currentAudio.volume = 0.8;

                this.currentAudio.onended = () => {
                    if (this.currentAudio?._blobUrl) {
                        URL.revokeObjectURL(this.currentAudio._blobUrl);
                    }
                    this.currentAudio = null;
                };

                await this.currentAudio.play();
                return;

            } catch (directPlaybackError) {
                console.log('🔄 Direct playback failed, trying PCM conversion:', directPlaybackError.message);

                // Try PCM to WAV conversion
                try {
                    const pcmData = atob(audioBase64);
                    const wavBlob = this.convertPCMToWAV(pcmData, 16000, 1); // 16kHz, mono
                    const audioUrl = URL.createObjectURL(wavBlob);

                    this.currentAudio = new Audio(audioUrl);
                    // Track URL for cleanup
                    this.currentAudio._blobUrl = audioUrl;
                    this.currentAudio.volume = 0.8;

                    this.currentAudio.onended = () => {
                        if (this.currentAudio?._blobUrl) {
                            URL.revokeObjectURL(this.currentAudio._blobUrl);
                        }
                        this.currentAudio = null;
                    };

                    this.currentAudio.onerror = (error) => {
                        console.error('❌ PCM audio playback error:', error);
                        if (this.currentAudio?._blobUrl) {
                            URL.revokeObjectURL(this.currentAudio._blobUrl);
                        }
                        this.currentAudio = null;
                        this.fallbackToExistingTTS();
                    };

                    this.currentAudio.onloadeddata = () => {
                        console.log('✅ PCM audio converted to WAV and loaded successfully');
                    };

                    await this.currentAudio.play();
                    console.log('✅ Playing converted PCM audio');

                } catch (pcmError) {
                    console.error('❌ Error converting PCM to WAV:', pcmError);
                    this.fallbackToExistingTTS();
                }
            }

        } catch (error) {
            console.error('❌ Error playing audio from base64:', error);
            this.fallbackToExistingTTS();
        }
    }

    /**
     * Convert PCM audio data to WAV format
     */
    convertPCMToWAV(pcmData, sampleRate, channels) {
        try {
            console.log('🔧 Converting PCM to WAV:', {
                pcmDataLength: pcmData.length,
                sampleRate,
                channels,
                dataType: typeof pcmData
            });

            // Handle different PCM data formats
            let samples;
            if (typeof pcmData === 'string') {
                // Convert string to Uint8Array
                samples = new Uint8Array(pcmData.length);
                for (let i = 0; i < pcmData.length; i++) {
                    samples[i] = pcmData.charCodeAt(i);
                }
            } else if (pcmData instanceof ArrayBuffer) {
                samples = new Uint8Array(pcmData);
            } else if (pcmData instanceof Uint8Array) {
                samples = pcmData;
            } else {
                throw new Error('Unsupported PCM data format: ' + typeof pcmData);
            }

            // Assume 16-bit PCM (2 bytes per sample)
            const numSamples = Math.floor(samples.length / 2);
            const arrayBuffer = new ArrayBuffer(44 + samples.length);
            const view = new DataView(arrayBuffer);

            // WAV header
            const writeString = (offset, string) => {
                for (let i = 0; i < string.length; i++) {
                    view.setUint8(offset + i, string.charCodeAt(i));
                }
            };

            // RIFF header
            writeString(0, 'RIFF');
            view.setUint32(4, 36 + samples.length, true); // File size - 8
            writeString(8, 'WAVE');

            // fmt chunk
            writeString(12, 'fmt ');
            view.setUint32(16, 16, true); // fmt chunk size
            view.setUint16(20, 1, true); // PCM format
            view.setUint16(22, channels, true); // Number of channels
            view.setUint32(24, sampleRate, true); // Sample rate
            view.setUint32(28, sampleRate * channels * 2, true); // Byte rate
            view.setUint16(32, channels * 2, true); // Block align
            view.setUint16(34, 16, true); // Bits per sample

            // data chunk
            writeString(36, 'data');
            view.setUint32(40, samples.length, true); // Data size

            // Copy PCM data
            const dataView = new Uint8Array(arrayBuffer, 44);
            dataView.set(samples);

            console.log('✅ PCM to WAV conversion completed:', {
                originalSize: samples.length,
                wavSize: arrayBuffer.byteLength,
                numSamples: numSamples
            });

            return new Blob([arrayBuffer], { type: 'audio/wav' });

        } catch (error) {
            console.error('❌ Error in PCM to WAV conversion:', error);
            throw error;
        }
    }

    fallbackToExistingTTS() {
        // Since we've moved to ElevenLabs, we don't have a fallback TTS system
        // Log the issue and inform the user
        console.warn('⚠️ ElevenLabs audio playback failed and no fallback TTS available');

        if (this.lastAIResponse) {
            // Add a system message to inform the user
            this.addMessage('system', `Audio playback failed. Response text: "${this.lastAIResponse}"`, {
                characterName: 'System',
                isError: true
            });
        }
    }

    // Legacy Live Mode methods removed - now using ElevenLabs native Conversational AI

    /**
     * Send user message to ElevenLabs Conversational AI
     */
    sendUserMessageToElevenLabs(text) {
        if (!this.elevenLabsConversationWs || this.elevenLabsConversationWs.readyState !== WebSocket.OPEN) {
            console.warn('⚠️ ElevenLabs Conversational AI not connected');
            return;
        }

        console.log('📤 Sending user message to ElevenLabs:', text);

        this.elevenLabsConversationWs.send(JSON.stringify({
            type: 'user_message',
            text: text
        }));
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

            // Check if audio blob is too large (increased limit to 100KB for better quality)
            if (audioBlob.size > 100000) {
                console.warn(`⚠️ Audio blob too large (${audioBlob.size} bytes), skipping transcription`);
                if (this.isLiveModeActive) {
                    this.restartContinuousListening();
                }
                return;
            }

            // Skip very small audio blobs (likely silence) - reduced threshold for better sensitivity
            if (audioBlob.size < 500) {
                console.log(`🎙️ Audio blob too small (${audioBlob.size} bytes), likely silence - restarting`);
                if (this.isLiveModeActive) {
                    this.restartContinuousListening();
                }
                return;
            }

            // Convert audio blob to PCM 16kHz format for ElevenLabs
            console.log(`🎙️ Converting audio blob to PCM 16kHz format...`);
            const pcmAudio = await this.convertToPCM16kHz(audioBlob);

            // Check if audio contains actual speech (not just silence)
            const hasAudio = this.detectAudioActivity(pcmAudio);
            if (!hasAudio) {
                console.log(`🎙️ Audio chunk contains mostly silence, skipping...`);
                // Reset speech state if we were previously detecting speech
                if (this.speechDetected) {
                    console.log(`🎙️ Speech ended, sending end-of-speech signal to ElevenLabs`);
                    this.speechDetected = false;
                    // Client-side barge-in: stop any agent playback as soon as we start (or end) speaking
                    this.stopCurrentAudio();
                    // Send empty audio chunk to signal end of speech
                    this.sendEndOfSpeechToElevenLabs();
                }
                if (this.isLiveModeActive) {
                    this.restartContinuousListening();
                }
                return;
            }

            // Mark that we're detecting speech
            if (!this.speechDetected) {
                console.log(`🎙️ Speech started, beginning transmission to ElevenLabs`);
                this.speechDetected = true;
                // Client-side barge-in: immediately stop any agent playback on speech start
                this.stopCurrentAudio();
            }

            const base64Audio = btoa(String.fromCharCode.apply(null, pcmAudio));
            console.log(`🎙️ Converted to PCM 16kHz base64: ${base64Audio.length} characters`);

            // Send audio chunk directly to ElevenLabs API (using official ElevenLabs format)
            if (this.elevenLabsWs && this.elevenLabsWs.readyState === WebSocket.OPEN) {
                console.log('🎙️ Sending audio chunk to ElevenLabs WebSocket...');

                const audioMessage = {
                    user_audio_chunk: base64Audio
                };

                this.elevenLabsWs.send(JSON.stringify(audioMessage));
                console.log('✅ Audio chunk sent to ElevenLabs');

                this.liveModeState = 'listening';
                this.updateLiveModeStatus(true, 'Listening...');

                // Continue listening for more audio
                if (this.isLiveModeActive) {
                    this.restartContinuousListening();
                }
            } else {
                console.error('❌ ElevenLabs WebSocket not connected');
                this.liveModeState = 'listening';
                this.updateLiveModeStatus(true, 'WebSocket Error');

                // Try to restart listening anyway
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

                // ElevenLabs handles TTS directly, no need for separate TTS call
                console.log('🎙️ AI response added to chat - ElevenLabs will handle TTS automatically');
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
     * Check if transcribed text represents valid speech
     */
    isValidSpeech(text) {
        if (!text || typeof text !== 'string') {
            return false;
        }

        const cleanText = text.trim().toLowerCase();

        // Must be at least 2 characters
        if (cleanText.length < 2) {
            return false;
        }

        // Filter out common noise patterns
        const noisePatterns = [
            /^\(.*\)$/,                    // Anything in parentheses like "(applause)", "(music)"
            /^\.+$/,                       // Just dots
            /^you\.?$/,                    // Just "you" or "you."
            /^um\.?$/,                     // Just "um" or "um."
            /^uh\.?$/,                     // Just "uh" or "uh."
            /^ah\.?$/,                     // Just "ah" or "ah."
            /^oh\.?$/,                     // Just "oh" or "oh."
            /^okay\.{3,}$/,                // "okay..." with multiple dots
            /^era\.{3,}$/,                 // "era..." (Spanish noise)
            /^\¿.*\?\.{3,}$/,              // Spanish questions with trailing dots
            /^(techno|music|cheering|applause|vidro|quebrando)/i, // Sound effects
            /^[^a-zA-Z]*$/,                // No letters (just punctuation/symbols)
        ];

        // Check if text matches any noise pattern
        for (const pattern of noisePatterns) {
            if (pattern.test(cleanText)) {
                return false;
            }
        }

        // Must contain at least one letter
        if (!/[a-zA-Z]/.test(cleanText)) {
            return false;
        }

        // If it's a single word, it should be at least 3 characters (unless it's common words)
        const words = cleanText.split(/\s+/).filter(word => word.length > 0);
        if (words.length === 1 && words[0].length < 3) {
            const commonShortWords = ['hi', 'no', 'ok', 'yes', 'go', 'me', 'my', 'we', 'he', 'it', 'is', 'am', 'do'];
            if (!commonShortWords.includes(words[0])) {
                return false;
            }
        }

        return true;
    }

    /**
     * Start continuous listening for Live Mode
     */
    async startContinuousListening() {
        try {
            console.log('🎙️ Starting continuous listening for Live Mode...');

            if (!this.isLiveModeActive) {
                console.log('🎙️ Live mode not active, not starting listening');
                return;
            }

            // Check if browser supports getUserMedia
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('Browser does not support microphone access');
            }

            console.log('🎙️ Requesting microphone permission...');

            // Request microphone permission with optimized settings for Live Mode
            this.audioStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: 16000,  // Lower sample rate for smaller files
                    channelCount: 1     // Mono audio
                }
            });

            console.log('✅ Microphone access granted');

            // Setup media recorder with WebM format and time slicing for continuous recording
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

            // Set up event handlers for continuous recording
            this.mediaRecorder.ondataavailable = (event) => {
                console.log('🎙️ MediaRecorder data available:', event.data.size, 'bytes');
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                    console.log('🎙️ Total audio chunks now:', this.audioChunks.length);

                    // Process audio chunks when we have enough data (every ~2 seconds)
                    if (this.audioChunks.length >= 2 && this.isLiveModeActive) {
                        console.log('🎙️ Processing audio chunks for Live Mode...');
                        // Use setTimeout to make this async and avoid blocking the recorder
                        setTimeout(() => {
                            this.processLiveModeAudio().catch(error => {
                                console.error('❌ Error processing Live Mode audio:', error);
                            });
                        }, 0);
                    }
                }
            };

            this.mediaRecorder.onstop = async () => {
                console.log('🎙️ MediaRecorder stopped, processing audio chunks:', this.audioChunks.length);
                if (this.isLiveModeActive) {
                    await this.processLiveModeAudio();
                }
            };

            // Start recording with 1-second chunks for more responsive Live Mode
            this.mediaRecorder.start(1000);
            this.liveModeState = 'listening';
            this.updateLiveModeStatus(true, 'Listening...');

            console.log('🎙️ Continuous listening started for Live Mode');
            console.log('🎙️ MediaRecorder state after start:', this.mediaRecorder.state);

            // Add periodic status check for debugging
            this.liveModeStatusInterval = setInterval(() => {
                if (this.isLiveModeActive && this.mediaRecorder) {
                    console.log('🎙️ Live Mode Status Check - State:', this.mediaRecorder.state, 'Chunks:', this.audioChunks.length);
                }
            }, 3000);

            // Start visual microphone level indicator
            this.startMicrophoneLevelIndicator();

        } catch (error) {
            console.error('❌ Error starting continuous listening:', error);
            console.error('❌ Continuous listening error details:', error.message, error.stack);
            this.updateLiveModeStatus(false, 'Microphone Error: ' + error.message);

            // Show error message to user
            this.addMessage('system', `Microphone access error: ${error.message}`, {
                characterName: 'System',
                isError: true
            });

            throw error;
        }
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
                                    this.mediaRecorder.start(1000);
                                    console.log('🎙️ Restarted continuous listening after stop, new state:', this.mediaRecorder.state);
                                }
                            }, 100);
                        } else if (this.mediaRecorder.state === 'inactive') {
                            this.audioChunks = [];
                            this.mediaRecorder.start(1000);
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
     * Speak text in Live Mode (DEPRECATED - ElevenLabs handles TTS directly)
     */
    async speakLiveModeText(text) {
        console.warn('⚠️ speakLiveModeText() called but TTS is now handled directly by ElevenLabs');
        console.log('📝 Text that would have been spoken:', text);

        // ElevenLabs Conversational AI handles TTS automatically
        // Just restart listening if in Live Mode
        if (this.isLiveModeActive) {
            setTimeout(() => {
                this.restartContinuousListening();
            }, 1000); // Give a brief pause before restarting
        }
    }

    /**
     * Clear chat history
     */
    clearChatHistory() {
        this.chatMessages.innerHTML = `
            <div class="message bot">
                <div class="message-content">
                    🎙️ Initializing ElevenLabs Live Mode... Please wait for connection.
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
                agentId: this.currentAgentId || this.config.agentId || null
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
     * Start visual microphone level indicator
     */
    startMicrophoneLevelIndicator() {
        if (!this.audioStream) {
            console.warn('⚠️ No audio stream available for level indicator');
            return;
        }

        try {
            // Create audio context and analyzer
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            this.microphone = this.audioContext.createMediaStreamSource(this.audioStream);

            // Configure analyzer for real-time level detection
            this.analyser.fftSize = 256;
            this.analyser.smoothingTimeConstant = 0.8;
            this.microphone.connect(this.analyser);

            // Create data array for frequency data
            this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);

            // Start the level monitoring loop
            this.monitorMicrophoneLevel();

            console.log('🎤 Microphone level indicator started');

        } catch (error) {
            console.error('❌ Error starting microphone level indicator:', error);
        }
    }

    /**
     * Monitor microphone level and update visual indicator
     */
    monitorMicrophoneLevel() {
        if (!this.isLiveModeActive || !this.analyser) {
            return;
        }

        // Get frequency data
        this.analyser.getByteFrequencyData(this.dataArray);

        // Calculate average volume level
        let sum = 0;
        for (let i = 0; i < this.dataArray.length; i++) {
            sum += this.dataArray[i];
        }
        const averageLevel = sum / this.dataArray.length;

        // Convert to percentage (0-100)
        const levelPercentage = Math.round((averageLevel / 255) * 100);

        // Update visual indicator
        this.updateMicrophoneLevelDisplay(levelPercentage);

        // Continue monitoring
        if (this.isLiveModeActive) {
            requestAnimationFrame(() => this.monitorMicrophoneLevel());
        }
    }

    /**
     * Update the visual microphone level display
     */
    updateMicrophoneLevelDisplay(levelPercentage) {
        // Find or create the microphone level indicator
        let levelIndicator = document.getElementById('microphoneLevelIndicator');
        if (!levelIndicator) {
            levelIndicator = this.createMicrophoneLevelIndicator();
        }

        // Update the level bar
        const levelBar = levelIndicator.querySelector('.mic-level-bar');
        const levelText = levelIndicator.querySelector('.mic-level-text');

        if (levelBar && levelText) {
            levelBar.style.width = `${levelPercentage}%`;
            levelText.textContent = `${levelPercentage}%`;

            // Color coding based on level
            if (levelPercentage > 50) {
                levelBar.style.backgroundColor = '#00ff00'; // Green - good level
            } else if (levelPercentage > 20) {
                levelBar.style.backgroundColor = '#ffff00'; // Yellow - moderate level
            } else {
                levelBar.style.backgroundColor = '#ff6600'; // Orange - low level
            }
        }
    }

    /**
     * Create the visual microphone level indicator
     */
    createMicrophoneLevelIndicator() {
        // Find the Live Mode toggle area to attach the indicator
        const liveModeToggle = document.getElementById('liveModeToggle');
        if (!liveModeToggle) {
            console.warn('⚠️ Live Mode toggle not found for microphone indicator');
            return null;
        }

        // Create the indicator container
        const indicator = document.createElement('div');
        indicator.id = 'microphoneLevelIndicator';
        indicator.className = 'microphone-level-indicator';
        indicator.innerHTML = `
            <div class="mic-level-label">🎤 Mic Level:</div>
            <div class="mic-level-container">
                <div class="mic-level-bar"></div>
            </div>
            <div class="mic-level-text">0%</div>
        `;

        // Add CSS styles
        const style = document.createElement('style');
        style.textContent = `
            .microphone-level-indicator {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-top: 8px;
                padding: 8px;
                background: rgba(0, 255, 0, 0.1);
                border: 1px solid #00ff00;
                border-radius: 4px;
                font-family: 'Courier New', monospace;
                font-size: 12px;
                color: #00ff00;
            }
            .mic-level-label {
                white-space: nowrap;
                min-width: 80px;
            }
            .mic-level-container {
                flex: 1;
                height: 16px;
                background: rgba(0, 0, 0, 0.3);
                border: 1px solid #333;
                border-radius: 2px;
                overflow: hidden;
                position: relative;
            }
            .mic-level-bar {
                height: 100%;
                background: #00ff00;
                width: 0%;
                transition: width 0.1s ease-out;
            }
            .mic-level-text {
                min-width: 35px;
                text-align: right;
                font-weight: bold;
            }
        `;

        if (!document.getElementById('microphoneLevelStyles')) {
            style.id = 'microphoneLevelStyles';
            document.head.appendChild(style);
        }

        // Add to Live Mode toggle area
        liveModeToggle.appendChild(indicator);

        return indicator;
    }

    /**
     * Stop microphone level indicator
     */
    stopMicrophoneLevelIndicator() {
        // Clean up audio context
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }

        this.analyser = null;
        this.microphone = null;
        this.dataArray = null;

        // Remove visual indicator
        const indicator = document.getElementById('microphoneLevelIndicator');
        if (indicator) {
            indicator.remove();
        }

        console.log('🎤 Microphone level indicator stopped');
    }

    /**
     * Speak text using TTS (DEPRECATED - ElevenLabs handles TTS directly)
     */
    async speakText(text) {
        console.warn('⚠️ speakText() called but TTS is now handled directly by ElevenLabs');
        console.log('📝 Text that would have been spoken:', text);

        // Since ElevenLabs handles TTS directly through WebSocket,
        // this method is no longer needed but kept for compatibility
        if (this.isTTSActive) {
            this.updateTTSStatus(this.isTTSActive, 'ElevenLabs TTS Active');
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
        // Update status text (sttToggle element doesn't exist in the HTML)
        if (this.sttStatus) {
            this.sttStatus.textContent = message;
            // Could add visual indication based on active state if needed
            this.sttStatus.style.color = active ? '#00ff00' : '#ffffff';
        }
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
