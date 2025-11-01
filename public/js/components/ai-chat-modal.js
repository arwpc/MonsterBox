/**
 * MonsterBox AI Chat Modal - Reusable Component
 * Provides WebSocket-based real-time AI chat with STT, TTS, and character speaker routing
 */

function AIChatModal(containerId) {
    this.containerId = containerId || 'ai-chat-container';
    this.currentAgentId = null;
    this.currentCharacterId = null;
    this.wsChat = null;
    this.audioOutputMode = 'speaker'; // 'local' or 'speaker' (character speaker)
    this.micSource = 'server'; // 'server' (PipeWire) or 'browser' (getUserMedia)
    this._audioChunks = [];
    this._audioTimeout = null;
    this._lastAudioData = null;
    this._lastReplyText = '';
    this._isPlayingAudio = false;
    this._vuTimer = null;
    this._vuBusy = false;
    this._browserMicStream = null;
    this._browserProcessor = null;
    this._audioCtx = null;
    this._lastVoiceTs = Date.now();
    
    // Initialize on creation
    this.init();
}

AIChatModal.prototype.init = function() {
    var self = this;
    
    // Initialize WebSocket if available
    if (window.WebSocketChatClient) {
        this.initWebSocket();
    }
    
    // Check secure context for browser mic
    try {
        var insecure = !(window.isSecureContext || window.location.protocol === 'https:' || /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname));
        if (insecure) {
            console.warn('Browser microphone requires HTTPS - disabled');
        }
    } catch (e) { /* no-op */ }
    
    console.log('AIChatModal initialized');
};

// Render modal HTML into container
AIChatModal.prototype.render = function(characterId, agentId) {
    var container = document.getElementById(this.containerId);
    if (!container) {
        console.error('Chat modal container not found:', this.containerId);
        return;
    }
    
    var modalId = 'aiChatModal-' + (characterId || 'default');
    
    var html = `
    <div class="modal fade" id="${modalId}" tabindex="-1">
        <div class="modal-dialog modal-lg">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">
                        <i class="bi bi-chat-dots"></i> 
                        <span id="${modalId}-title">AI Chat</span>
                    </h5>
                    <span id="${modalId}-status" class="badge bg-secondary me-2">Connecting...</span>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <div id="${modalId}-log" class="border rounded p-2 mb-3"
                        style="height: 300px; overflow:auto; background:#111;">
                        <div class="text-muted">Type a message to start chatting...</div>
                    </div>
                    <div class="input-group">
                        <input type="text" id="${modalId}-input" class="form-control" 
                            placeholder="Say something spooky…">
                        <button class="btn btn-primary" type="button" id="${modalId}-send">
                            <i class="bi bi-send"></i> Send
                        </button>
                    </div>
                </div>
                <div class="modal-footer">
                    <div class="d-flex w-100 align-items-center justify-content-between">
                        <!-- Mic Source -->
                        <div class="btn-group" role="group">
                            <input type="radio" class="btn-check" name="${modalId}-micSource" 
                                id="${modalId}-micServer" checked>
                            <label class="btn btn-outline-warning" for="${modalId}-micServer">
                                <i class="bi bi-mic"></i> Server Mic
                            </label>
                            <input type="radio" class="btn-check" name="${modalId}-micSource" 
                                id="${modalId}-micBrowser">
                            <label class="btn btn-outline-info" for="${modalId}-micBrowser" 
                                title="Requires HTTPS (or localhost)">
                                <i class="bi bi-mic-fill"></i> Browser Mic
                            </label>
                        </div>

                        <!-- Audio Output -->
                        <div class="btn-group" role="group">
                            <input type="radio" class="btn-check" name="${modalId}-audioOutput" 
                                id="${modalId}-audioLocal">
                            <label class="btn btn-outline-primary" for="${modalId}-audioLocal">
                                <i class="bi bi-headphones"></i> Local
                            </label>
                            <input type="radio" class="btn-check" name="${modalId}-audioOutput" 
                                id="${modalId}-audioSpeaker" checked>
                            <label class="btn btn-outline-success" for="${modalId}-audioSpeaker">
                                <i class="bi bi-speaker"></i> Speaker
                            </label>
                        </div>

                        <!-- VU Meter -->
                        <div class="flex-grow-1 mx-3" style="max-width:300px;">
                            <div class="small text-muted mb-1"><i class="bi bi-activity"></i> Mic Level</div>
                            <div class="progress" style="height:10px; background:#222;">
                                <div id="${modalId}-vuBar" class="progress-bar bg-warning" 
                                    style="width:0%" aria-valuenow="0"></div>
                            </div>
                            <div class="small text-muted mt-2">
                                <span>Character: <span id="${modalId}-char">-</span></span>
                                &nbsp;&middot;&nbsp;
                                <span>Mic: <span id="${modalId}-device">-</span></span>
                                &nbsp;&middot;&nbsp;
                                <span>STT: <span id="${modalId}-stt">-</span></span>
                            </div>
                        </div>

                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                    </div>
                </div>
            </div>
        </div>
    </div>`;
    
    container.innerHTML = html;
    this.modalId = modalId;
    
    // Bind events
    this.bindEvents();
    
    return modalId;
};

AIChatModal.prototype.bindEvents = function() {
    var self = this;
    var modalId = this.modalId;
    
    // Send button
    var sendBtn = document.getElementById(modalId + '-send');
    if (sendBtn) {
        sendBtn.addEventListener('click', function() {
            self.sendMessage();
        });
    }
    
    // Input enter key
    var input = document.getElementById(modalId + '-input');
    if (input) {
        input.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                self.sendMessage();
            }
        });
    }
    
    // Mic source toggle
    var micServer = document.getElementById(modalId + '-micServer');
    var micBrowser = document.getElementById(modalId + '-micBrowser');
    if (micServer) {
        micServer.addEventListener('change', function() {
            if (this.checked) self.setMicSource('server');
        });
    }
    if (micBrowser) {
        micBrowser.addEventListener('change', function() {
            if (this.checked) self.setMicSource('browser');
        });
    }
    
    // Audio output toggle
    var audioLocal = document.getElementById(modalId + '-audioLocal');
    var audioSpeaker = document.getElementById(modalId + '-audioSpeaker');
    if (audioLocal) {
        audioLocal.addEventListener('change', function() {
            if (this.checked) self.setAudioOutput('local');
        });
    }
    if (audioSpeaker) {
        audioSpeaker.addEventListener('change', function() {
            if (this.checked) self.setAudioOutput('speaker');
        });
    }
    
    // Modal close cleanup
    var modalEl = document.getElementById(modalId);
    if (modalEl) {
        modalEl.addEventListener('hidden.bs.modal', function() {
            self.cleanup();
        });
    }
};

AIChatModal.prototype.open = function(characterId, agentId) {
    this.currentCharacterId = characterId;
    this.currentAgentId = agentId;
    
    // Render modal if not already present
    if (!this.modalId) {
        this.render(characterId, agentId);
    }
    
    // Update title
    var title = document.getElementById(this.modalId + '-title');
    if (title) {
        title.textContent = 'Chat with ' + (characterId || 'Agent');
    }
    
    // Clear log
    var log = document.getElementById(this.modalId + '-log');
    if (log) {
        log.innerHTML = '<div class="text-muted">Connecting...</div>';
    }
    
    // Start WebSocket conversation
    if (this.wsChat && this.wsChat.isConnected) {
        this.wsChat.startConversation(agentId);
        this.wsChat.sendMessage({ type: 'set_character', characterId: characterId });
        this.wsChat.sendMessage({ type: 'set_output_mode', mode: 'server' }); // Always use character speaker
        this.wsChat.sendMessage({ type: 'set_mic_source', source: this.micSource });
        this.showMessage('System', 'Connected - speak to the character', 'info');
    }
    
    // Start VU meter
    if (this.micSource === 'server') {
        this._startVUMeter();
    }
    
    // Show modal
    var modalEl = document.getElementById(this.modalId);
    if (modalEl) {
        var modal = new bootstrap.Modal(modalEl);
        modal.show();
    }
};

AIChatModal.prototype.sendMessage = function() {
    var input = document.getElementById(this.modalId + '-input');
    if (!input || !input.value.trim()) return;
    
    var text = input.value.trim();
    input.value = '';
    
    this.showMessage('You', text, 'user');
    
    if (this.wsChat && this.wsChat.isConnected) {
        this.wsChat.sendChatMessage(text);
    } else {
        this.showMessage('System', 'Not connected - please refresh', 'error');
    }
};

AIChatModal.prototype.showMessage = function(sender, text, type, responseTime) {
    var log = document.getElementById(this.modalId + '-log');
    if (!log) return;
    
    var colorClass = type === 'user' ? 'text-info' :
                     type === 'agent' ? 'text-success' :
                     type === 'error' ? 'text-danger' :
                     type === 'info' ? 'text-warning' : 'text-muted';
    
    var timeInfo = responseTime ? ' <small class="text-muted">(' + responseTime + 'ms)</small>' : '';
    
    var msg = document.createElement('div');
    msg.className = 'mb-2 ' + colorClass;
    msg.innerHTML = '<strong>' + sender + ':</strong> ' + text + timeInfo;
    log.appendChild(msg);
    log.scrollTop = log.scrollHeight;
};

AIChatModal.prototype.setAudioOutput = function(mode) {
    this.audioOutputMode = mode;
    console.log('🔊 Audio output:', mode);
    
    // Update status
    this.updateStatus(mode === 'local' ? 'Browser Audio' : 'Character Speaker');
};

AIChatModal.prototype.setMicSource = function(source) {
    this.micSource = source;
    console.log('🎤 Mic source:', source);
    
    if (this.wsChat && this.wsChat.isConnected) {
        this.wsChat.sendMessage({ type: 'set_mic_source', source: source });
    }
    
    if (source === 'server') {
        this._stopBrowserMic();
        this._startVUMeter();
    } else {
        this._stopVUMeter();
        this._startBrowserMic();
    }
};

AIChatModal.prototype.updateStatus = function(text) {
    var status = document.getElementById(this.modalId + '-status');
    if (status) {
        status.textContent = text;
        status.className = 'badge bg-success';
    }
};

AIChatModal.prototype.setStatusValue = function(key, value) {
    var el = document.getElementById(this.modalId + '-' + key);
    if (el) {
        el.textContent = value || '-';
    }
};

AIChatModal.prototype._startVUMeter = function() {
    var self = this;
    this._stopVUMeter();
    
    this._vuTimer = setInterval(function() {
        if (self._vuBusy || !self.currentCharacterId) return;
        self._vuBusy = true;
        
        // Get character's microphone device
        fetch('/api/parts?characterId=' + self.currentCharacterId + '&type=microphone')
            .then(function(r) { return r.json(); })
            .then(function(d) {
                if (!d.success || !d.parts || !d.parts[0]) return;
                var mic = d.parts[0];
                var deviceId = mic.config && mic.config.deviceId || 'default';
                
                // Get audio level
                return fetch('/setup/audio/api/audio-levels?deviceId=' + deviceId + '&deviceType=input');
            })
            .then(function(r) { return r && r.json(); })
            .then(function(j) {
                if (!j || !j.success) return;
                var level = +j.level || 0;
                var pct = Math.max(0, Math.min(100, Math.round(level * 100)));
                var bar = document.getElementById(self.modalId + '-vuBar');
                if (bar) {
                    bar.style.width = pct + '%';
                    bar.setAttribute('aria-valuenow', pct);
                }
            })
            .catch(function() {})
            .finally(function() { self._vuBusy = false; });
    }, 300);
};

AIChatModal.prototype._stopVUMeter = function() {
    if (this._vuTimer) {
        clearInterval(this._vuTimer);
        this._vuTimer = null;
    }
};

AIChatModal.prototype._startBrowserMic = function() {
    var self = this;
    if (this._browserMicStream) return;
    
    navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true } })
        .then(function(stream) {
            self._browserMicStream = stream;
            self._audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
            var src = self._audioCtx.createMediaStreamSource(stream);
            var processor = self._audioCtx.createScriptProcessor(4096, 1, 1);
            self._browserProcessor = processor;
            
            processor.onaudioprocess = function(e) {
                if (self.micSource !== 'browser' || !self.wsChat || !self.wsChat.isConnected) return;
                var input = e.inputBuffer.getChannelData(0);
                var down = self._downsample(input, self._audioCtx.sampleRate, 16000);
                var pcm = self._floatTo16BitPCM(down);
                var b64 = self._uint8ToBase64(pcm);
                self.wsChat.sendMessage({ type: 'browser_audio_chunk', audio: b64 });
            };
            
            src.connect(processor);
            processor.connect(self._audioCtx.destination);
            self.showMessage('System', 'Browser microphone active', 'info');
        })
        .catch(function(err) {
            console.error('Browser mic error:', err);
            self.showMessage('System', 'Mic permission denied', 'error');
            self.micSource = 'server';
            document.getElementById(self.modalId + '-micServer').checked = true;
        });
};

AIChatModal.prototype._stopBrowserMic = function() {
    try {
        if (this._browserProcessor) {
            this._browserProcessor.disconnect();
            this._browserProcessor.onaudioprocess = null;
            this._browserProcessor = null;
        }
        if (this._audioCtx) {
            this._audioCtx.close();
            this._audioCtx = null;
        }
        if (this._browserMicStream) {
            this._browserMicStream.getTracks().forEach(function(t) { t.stop(); });
            this._browserMicStream = null;
        }
    } catch(e) {}
};

AIChatModal.prototype._downsample = function(buffer, rate, outRate) {
    if (rate === outRate) return buffer;
    var ratio = rate / outRate;
    var newLen = Math.round(buffer.length / ratio);
    var result = new Float32Array(newLen);
    var oB = 0;
    for (var i = 0; i < result.length; i++) {
        var nextOB = Math.round((i + 1) * ratio);
        var sum = 0, cnt = 0;
        for (var j = oB; j < nextOB && j < buffer.length; j++) {
            sum += buffer[j];
            cnt++;
        }
        result[i] = sum / (cnt || 1);
        oB = nextOB;
    }
    return result;
};

AIChatModal.prototype._floatTo16BitPCM = function(float32) {
    var out = new Uint8Array(float32.length * 2);
    for (var i = 0; i < float32.length; i++) {
        var s = Math.max(-1, Math.min(1, float32[i]));
        var v = s < 0 ? s * 0x8000 : s * 0x7FFF;
        out[i * 2] = v & 0xFF;
        out[i * 2 + 1] = (v >> 8) & 0xFF;
    }
    return out;
};

AIChatModal.prototype._uint8ToBase64 = function(u8) {
    var CHUNK = 0x8000, idx = 0, res = '';
    while (idx < u8.length) {
        var slice = u8.subarray(idx, Math.min(idx + CHUNK, u8.length));
        res += String.fromCharCode.apply(null, slice);
        idx += CHUNK;
    }
    return btoa(res);
};

AIChatModal.prototype.initWebSocket = function() {
    var self = this;
    
    try {
        this.wsChat = new window.WebSocketChatClient();
        
        this.wsChat.onConnectionStatusChange = function(connected) {
            console.log('🔌 WebSocket:', connected ? 'Connected' : 'Disconnected');
            self.updateStatus(connected ? 'Connected' : 'Disconnected');
            self.setStatusValue('stt', connected ? 'ready' : 'disconnected');
        };
        
        this.wsChat.onConversationStarted = function(msg) {
            console.log('✅ Conversation started:', msg.agentId);
            self.showMessage('System', 'Connected to agent', 'info');
        };
        
        this.wsChat.onPartialTranscript = function(msg) {
            if (msg && msg.text) {
                var transcriptText = msg.text.trim();
                console.log('🎤 STT Transcript:', transcriptText);
                self.showMessage('You (STT)', transcriptText, 'secondary');
                self.setStatusValue('stt', 'ok');
            }
        };
        
        this.wsChat.onAgentResponse = function(msg) {
            var responseTime = self.lastMessageTime ? (Date.now() - self.lastMessageTime) : null;
            
            if (msg.text && msg.text !== 'Audio response received') {
                console.log('🤖 Agent Response:', msg.text);
                self.showMessage('Agent', msg.text, 'agent', responseTime);
            }
            
            if (msg.audio) {
                console.log('🔊 Audio chunk received, size:', msg.audio.length);
                self._audioChunks.push(msg.audio);
                
                if (self._audioTimeout) clearTimeout(self._audioTimeout);
                
                self._audioTimeout = setTimeout(function() {
                    if (self._audioChunks.length > 0) {
                        var largest = self._audioChunks.reduce(function(prev, cur) {
                            return cur.length > prev.length ? cur : prev;
                        });
                        
                        console.log('🔊 Playing audio chunk (', largest.length, 'bytes) to', self.audioOutputMode === 'local' ? 'browser' : 'character speaker');
                        self.playAudio(largest);
                        self._audioChunks = [];
                    }
                }, 300);
            }
        };
        
        this.wsChat.onDebug = function(msg) {
            try {
                if (msg && msg.originalType === 'server_mic_device' && msg.data) {
                    self.setStatusValue('device', msg.data.deviceId);
                } else if (msg && msg.originalType === 'set_character') {
                    self.setStatusValue('char', msg.data && msg.data.characterId);
                }
            } catch(e) {}
        };
        
        this.wsChat.connect();
        
    } catch(error) {
        console.error('❌ WebSocket init failed:', error);
    }
};

AIChatModal.prototype.playAudio = function(audioBase64) {
    var self = this;
    
    if (this.audioOutputMode === 'local') {
        // Play in browser
        console.log('🔊 Playing audio in browser (', audioBase64.length, 'bytes base64)');
        try {
            var audio = new Audio('data:audio/mp3;base64,' + audioBase64);
            audio.play().catch(function(e) {
                console.warn('⚠️ Autoplay blocked:', e);
            });
        } catch(e) {
            console.error('❌ Audio playback error:', e);
        }
    } else {
        // Play on character speaker
        if (!this.currentCharacterId) {
            console.warn('⚠️ No character selected for speaker playback');
            return;
        }
        
        console.log('🔊 Sending audio to character', this.currentCharacterId, 'speaker (', audioBase64.length, 'bytes base64)');
        
        fetch('/api/elevenlabs/play-audio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                audioData: audioBase64,
                characterId: this.currentCharacterId,
                format: 'mp3'
            })
        })
        .then(function(r) { return r.json(); })
        .then(function(d) {
            if (d && d.success !== false) {
                console.log('✅ Character speaker playback successful:', d.device);
            } else {
                console.error('❌ Speaker playback failed:', d && d.error);
                self.showMessage('System', 'Speaker failed - using browser', 'warning');
                self.audioOutputMode = 'local';
                document.getElementById(self.modalId + '-audioLocal').checked = true;
            }
        })
        .catch(function(e) {
            console.error('❌ Speaker error:', e);
            self.audioOutputMode = 'local';
            document.getElementById(self.modalId + '-audioLocal').checked = true;
        });
    }
};

AIChatModal.prototype.cleanup = function() {
    console.log('🧹 Cleaning up chat modal');
    
    this._stopBrowserMic();
    this._stopVUMeter();
    
    if (this.wsChat && this.wsChat.isConnected) {
        try {
            this.wsChat.endConversation();
        } catch(e) {}
    }
    
    this._audioChunks = [];
    if (this._audioTimeout) {
        clearTimeout(this._audioTimeout);
        this._audioTimeout = null;
    }
};

// Export for global use
if (typeof window !== 'undefined') {
    window.AIChatModal = AIChatModal;
}
