/**
 * MonsterBox - AI Settings JavaScript
 * Rebuilt from scratch using proper Bootstrap patterns
 * Includes inline chat panel
 */

// ES5 syntax as per user requirements
function AISettingsManager() {
    this.config = {
        apiKey: null,
        configured: false
    };
    this.stats = {
        voices: 0,
        characters: 0,
        assignments: 0
    };
    // Chat state
    this.chatWs = null;
    this.chatConnected = false;
    this.chatCharacterId = null;
    this.chatAgentId = null;
    this.chatVUTimer = null;
    this._lastAgentText = '';
    this._pendingChatMessage = null;
    this._audioPlaybackEnabled = true;
    this.chatSpeakerPartId = null;
    this._lastPartialEl = null; // for in-place STT partial update
}

AISettingsManager.prototype.init = function () {
    var self = this;

    // Load configuration status on page load; stats load only after configured
    this.loadConfigurationStatus();
    this.bindEvents();
    this.initChat();

    console.log('AI Settings Manager initialized');
};

AISettingsManager.prototype.loadConfigurationStatus = function () {
    var self = this;

    fetch('/api/elevenlabs/status')
        .then(function (response) {
            return response.json();
        })
        .then(function (data) {
            self.updateConfigurationStatus(data);
        })
        .catch(function (error) {
            console.error('Failed to load configuration status:', error);
            self.showConfigurationError();
        });
};

AISettingsManager.prototype.updateConfigurationStatus = function (data) {
    var apiKeyStatus = document.getElementById('apiKeyStatus');
    var connectionStatus = document.getElementById('connectionStatus');

    if (data.success && data.configured) {
        // API Key Status
        apiKeyStatus.innerHTML = '<i class="bi bi-check-circle text-success me-2"></i>' +
            '<span>Configured (' + data.apiKey + ')</span>';

        this.config.configured = true;
        this.config.apiKey = data.apiKey;

        // Test connection automatically and then load stats
        this.testConnection(connectionStatus);
        this.loadStats();
    } else {
        // API Key Status - Not configured
        apiKeyStatus.innerHTML = '<i class="bi bi-x-circle text-danger me-2"></i>' +
            '<span>Not configured - Please set ELEVENLABS_API_KEY in .env file</span>';

        connectionStatus.innerHTML = '<i class="bi bi-dash-circle text-warning me-2"></i>' +
            '<span>Cannot test - API key not configured</span>';

        this.config.configured = false;
    }
};

AISettingsManager.prototype.testConnection = function (statusElement) {
    var self = this;

    if (statusElement) {
        statusElement.innerHTML = '<div class="spinner-border spinner-border-sm me-2" role="status">' +
            '<span class="visually-hidden">Loading...</span></div>' +
            '<span>Testing connection...</span>';
    }

    fetch('/api/elevenlabs/test-connection', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    })
        .then(function (response) {
            return response.json();
        })
        .then(function (data) {
            if (statusElement) {
                if (data.success) {
                    statusElement.innerHTML = '<i class="bi bi-check-circle text-success me-2"></i>' +
                        '<span>Connected (' + data.voiceCount + ' voices available)</span>';
                } else {
                    statusElement.innerHTML = '<i class="bi bi-x-circle text-danger me-2"></i>' +
                        '<span>Connection failed: ' + data.error + '</span>';
                }
            }

            if (data.success) {
                self.showAlert('Connection test successful!', 'success');
            } else {
                self.showAlert('Connection test failed: ' + data.error, 'danger');
            }
        })
        .catch(function (error) {
            console.error('Connection test failed:', error);
            if (statusElement) {
                statusElement.innerHTML = '<i class="bi bi-x-circle text-danger me-2"></i>' +
                    '<span>Connection test failed</span>';
            }
            self.showAlert('Connection test failed', 'danger');
        });
};

AISettingsManager.prototype.loadStats = function () {
    var self = this;

    // If not configured, skip remote calls and keep zero/placeholder stats
    if (!this.config || !this.config.configured) {
        self.stats.voices = 0;
        self.stats.characters = 0;
        self.stats.assignments = 0;
        self.updateStatsDisplay();
        return;
    }

    // Load voices count
    fetch('/api/elevenlabs/voices').then(function (response) {
        if (!response.ok) return Promise.reject(new Error('voices: ' + response.status));
        return response.json();
    }).then(function (data) {
        if (data.success && Array.isArray(data.voices)) {
            self.stats.voices = data.voices.length;
            self.updateStatsDisplay();
        }
    }).catch(function () { /* gracefully ignore when not configured */ });

    // Placeholder counts (could be wired later)
    self.stats.characters = self.stats.characters || 0;
    self.stats.assignments = self.stats.assignments || 0;
    self.updateStatsDisplay();
};

AISettingsManager.prototype.updateStatsDisplay = function () {
    var voiceCountEl = document.getElementById('voiceCount');
    var characterCountEl = document.getElementById('characterCount');
    var assignmentCountEl = document.getElementById('assignmentCount');

    if (voiceCountEl) voiceCountEl.textContent = this.stats.voices;
    if (characterCountEl) characterCountEl.textContent = this.stats.characters;
    if (assignmentCountEl) assignmentCountEl.textContent = this.stats.assignments;
};

AISettingsManager.prototype.showConfigurationError = function () {
    var apiKeyStatus = document.getElementById('apiKeyStatus');
    var connectionStatus = document.getElementById('connectionStatus');

    apiKeyStatus.innerHTML = '<i class="bi bi-exclamation-triangle text-warning me-2"></i>' +
        '<span>Failed to check configuration</span>';

    connectionStatus.innerHTML = '<i class="bi bi-exclamation-triangle text-warning me-2"></i>' +
        '<span>Cannot test connection</span>';
};

AISettingsManager.prototype.bindEvents = function () {
    var self = this;

    // Test Connection button
    var testConnectionBtn = document.getElementById('testConnection');
    if (testConnectionBtn) {
        testConnectionBtn.addEventListener('click', function () {
            self.testConnection(document.getElementById('connectionStatus'));
        });
    }

    // Chat Input
    var chatInput = document.getElementById('chatInput');
    var chatSendBtn = document.getElementById('chatSendBtn');
    if (chatSendBtn) {
        chatSendBtn.addEventListener('click', function () {
            self.sendChatMessage();
        });
    }
    if (chatInput) {
        chatInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                self.sendChatMessage();
            }
        });
    }

    // AI On toggle — controls WS conversation lifecycle and speaker playback
    var aiToggle = document.getElementById('aiAutonomousToggle');
    if (aiToggle) {
        aiToggle.addEventListener('change', function () {
            if (aiToggle.checked) {
                self._audioPlaybackEnabled = true;
                self.connectChatWebSocket();
            } else {
                self._audioPlaybackEnabled = false;
                if (self.chatWs && self.chatConnected) {
                    try {
                        self.chatWs.send(JSON.stringify({ type: 'set_audio_playback', enabled: false }));
                        self.chatWs.send(JSON.stringify({ type: 'end_conversation' }));
                    } catch (_) { /* noop */ }
                    self.chatWs.close();
                    self.chatWs = null;
                    self.chatConnected = false;
                    self.updateChatStatus(false);
                }
            }
        });
    }

    var testConversationBtn = document.getElementById('testConversation');
    if (testConversationBtn) {
        testConversationBtn.addEventListener('click', function () {
            // Use the inline chat panel to test — toggle AI on and auto-send greeting
            var toggle = document.getElementById('aiAutonomousToggle');
            if (toggle && !toggle.checked) {
                toggle.checked = true;
                toggle.dispatchEvent(new Event('change'));
            }
            var chatInput = document.getElementById('chatInput');
            if (chatInput) {
                chatInput.scrollIntoView({ behavior: 'smooth' });
            }
            // Queue the greeting — it will be sent when conversation_started is received
            var greeting = 'Hello! Who are you?';
            self._pendingChatMessage = greeting;
            self.appendChatMessage('You', greeting);
            self.showAlert('AI conversation started — sending greeting...', 'success');
        });
    }

    var viewLogsBtn = document.getElementById('viewLogs');
    if (viewLogsBtn) {
        viewLogsBtn.addEventListener('click', function () {
            self.showAlert('AI logs feature coming soon!', 'info');
        });
    }
};

AISettingsManager.prototype.showAlert = function (message, type) {
    // Create Bootstrap alert
    var alertDiv = document.createElement('div');
    alertDiv.className = 'alert alert-' + type + ' alert-dismissible fade show position-fixed';
    alertDiv.style.top = '20px';
    alertDiv.style.right = '20px';
    alertDiv.style.zIndex = '9999';
    alertDiv.style.minWidth = '300px';

    alertDiv.innerHTML = '<i class="bi bi-info-circle me-2"></i>' + message +
        '<button type="button" class="btn-close" data-bs-dismiss="alert"></button>';

    document.body.appendChild(alertDiv);

    // Auto-remove after 5 seconds
    setTimeout(function () {
        if (alertDiv.parentNode) {
            alertDiv.parentNode.removeChild(alertDiv);
        }
    }, 5000);
};

// ---- Chat Methods ----

AISettingsManager.prototype.initChat = function () {
    var self = this;

    // Load character info
    var label = document.getElementById('charLabel');
    var chatCharName = document.getElementById('chatCharacterName');
    var charId = label && label.getAttribute('data-char-id');
    self.chatCharacterId = charId ? parseInt(charId, 10) : null;

    if (chatCharName) {
        if (label && label.textContent.trim() && label.textContent.trim() !== 'No Character') {
            chatCharName.textContent = label.textContent.trim();
        } else {
            // Fallback
            fetch('/setup/characters/api/current')
                .then(function (r) { return r.json(); })
                .then(function (j) {
                    if (j && j.characterName) {
                        chatCharName.textContent = j.characterName;
                        if (!self.chatCharacterId && j.selectedCharacter) {
                            self.chatCharacterId = parseInt(j.selectedCharacter, 10);
                        }
                    } else if (j && j.selectedCharacter) {
                        chatCharName.textContent = 'Character ' + j.selectedCharacter;
                        self.chatCharacterId = parseInt(j.selectedCharacter, 10);
                    }
                })
                .catch(function () {
                    chatCharName.textContent = 'Unknown';
                });
        }
    }

    // Get agent ID for character
    if (self.chatCharacterId) {
        self.getAgentIdForCharacter(self.chatCharacterId, function (agentId) {
            self.chatAgentId = agentId;
        });
    }

    // Load available speaker parts for audio output dropdown
    self.loadSpeakerParts();
    var speakerSelect = document.getElementById('chatSpeakerSelect');
    if (speakerSelect) {
        speakerSelect.addEventListener('change', function () {
            self.chatSpeakerPartId = speakerSelect.value || null;
            if (self.chatWs && self.chatConnected) {
                self.chatWs.send(JSON.stringify({ type: 'set_speaker_part', speakerPartId: self.chatSpeakerPartId }));
            }
        });
    }

    // Poll for character changes every 10 seconds — reconnect WS if character changed
    self._charPollTimer = setInterval(function () {
        fetch('/setup/characters/api/current')
            .then(function (r) { return r.json(); })
            .then(function (j) {
                var newId = j && j.selectedCharacter ? parseInt(j.selectedCharacter, 10) : null;
                if (newId && newId !== self.chatCharacterId) {
                    var newName = (j && j.characterName) ? j.characterName : ('Character ' + newId);
                    self.chatCharacterId = newId;
                    if (chatCharName) chatCharName.textContent = newName;

                    // Fetch new agent ID
                    self.getAgentIdForCharacter(newId, function (agentId) {
                        self.chatAgentId = agentId;
                    });

                    // If WS is active, disconnect and reconnect with new character
                    if (self.chatWs && self.chatConnected) {
                        try { self.chatWs.close(); } catch (_) { /* noop */ }
                        self.chatWs = null;
                        self.chatConnected = false;
                        self.appendChatMessage('System', 'Character changed to ' + newName + '. Reconnecting...');
                        // Small delay for agent ID fetch to complete
                        setTimeout(function () { self.connectChatWebSocket(); }, 1000);
                    }
                }
            })
            .catch(function () { /* ignore polling errors */ });
    }, 10000);
};

AISettingsManager.prototype.getAgentIdForCharacter = function (charId, callback) {
    fetch('/setup/characters/api/characters/' + charId)
        .then(function (r) { return r.json(); })
        .then(function (j) {
            var agent = (j && j.character && (j.character.elevenLabsAgentId || j.character.agentId)) || null;
            if (agent) { callback(String(agent)); return; }
            fetch('/setup/characters/api/character-assignments')
                .then(function (r2) { return r2.json(); })
                .then(function (a) {
                    if (a && a[charId] && a[charId].agentId) { callback(String(a[charId].agentId)); }
                    else { callback(null); }
                })
                .catch(function () { callback(null); });
        })
        .catch(function () { callback(null); });
};

AISettingsManager.prototype.loadSpeakerParts = function () {
    var select = document.getElementById('chatSpeakerSelect');
    if (!select) return;
    fetch('/conversation/api/speakers')
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (!data || !data.speakers) return;
            var speakers = data.speakers;
            // Keep existing "Auto" option, add speaker parts
            for (var i = 0; i < speakers.length; i++) {
                var s = speakers[i];
                var opt = document.createElement('option');
                opt.value = String(s.id);
                var label = s.name || s.label || ('Speaker #' + s.id);
                if (s.characterId) label += ' (char ' + s.characterId + ')';
                opt.textContent = label;
                select.appendChild(opt);
            }
        })
        .catch(function () { /* ignore */ });
};

AISettingsManager.prototype.connectChatWebSocket = function () {
    var self = this;
    if (self.chatWs && self.chatConnected) return;

    // Track whether conversation is fully ready (after conversation_started from server)
    self._conversationReady = false;

    var protocol = (window.location.protocol === 'https:') ? 'wss:' : 'ws:';
    var wsPort = document.body.getAttribute('data-ws-port') || '8795';
    var wsUrl = protocol + '//' + window.location.hostname + ':' + wsPort;

    try {
        self.chatWs = new WebSocket(wsUrl);

        self.chatWs.onopen = function () {
            self.chatConnected = true;
            self.updateChatStatus(true);

            if (self.chatCharacterId) {
                self.chatWs.send(JSON.stringify({ type: 'set_character', characterId: self.chatCharacterId }));
            }
            self.chatWs.send(JSON.stringify({ type: 'set_mic_source', source: 'server' }));
            // Tell server whether to play audio through character speaker
            self.chatWs.send(JSON.stringify({ type: 'set_audio_playback', enabled: self._audioPlaybackEnabled }));
            // Send speaker part selection if user picked one
            if (self.chatSpeakerPartId) {
                self.chatWs.send(JSON.stringify({ type: 'set_speaker_part', speakerPartId: self.chatSpeakerPartId }));
            }

            if (self.chatAgentId) {
                self.chatWs.send(JSON.stringify({ type: 'start_conversation', agentId: self.chatAgentId }));
            }

            // NOTE: Do NOT send pending messages here — wait for conversation_started
        };

        self.chatWs.onmessage = function (ev) {
            try {
                var msg = JSON.parse(ev.data);
                if (!msg) return;

                // Audio chunks are for speaker playback only — never display
                if (msg.type === 'audio_chunk') return;

                // VU meter — update from server mic audio level
                if (msg.type === 'audio_level') {
                    self.updateVUMeter(msg.level || 0);
                    return;
                }

                // Conversation is ready — flush any pending messages
                if (msg.type === 'conversation_started') {
                    self._conversationReady = true;
                    console.log('Chat conversation started with agent:', msg.agentId);
                    if (self._pendingChatMessage) {
                        var pending = self._pendingChatMessage;
                        self._pendingChatMessage = null;
                        self.chatWs.send(JSON.stringify({ type: 'send_message', text: pending }));
                    }
                    return;
                }

                if (msg.type === 'conversation_ended') {
                    self._conversationReady = false;
                    return;
                }

                if (msg.type === 'error') {
                    // Display server-sent errors in the chat log
                    var errText = msg.message || msg.error || 'Unknown error';
                    self.appendChatMessage('System', 'Error: ' + errText);
                    return;
                }

                if (msg.type === 'interruption') {
                    // Barge-in: agent was interrupted by user speaking
                    self._lastPartialEl = null;
                    return;
                }

                if (msg.type === 'agent_response' || msg.type === 'agent_response_event') {
                    var text = '';
                    if (msg.agent_response_event && msg.agent_response_event.agent_response) {
                        text = msg.agent_response_event.agent_response;
                    } else if (msg.agent_response) {
                        text = msg.agent_response;
                    } else if (msg.text) {
                        text = msg.text;
                    }
                    // Skip empty, fallback placeholders, and duplicate text
                    if (!text || text === 'Audio response' || text === 'Text response') return;
                    if (text === self._lastAgentText) return;
                    self._lastAgentText = text;
                    self.appendChatMessage('AI', text);
                }
                else if (msg.type === 'user_transcript' && msg.user_transcription_event) {
                    var userText = msg.user_transcription_event.user_transcript;
                    if (userText) {
                        // Final user transcript — clear any partial and show committed text
                        self._lastPartialEl = null;
                        self.appendChatMessage('You (mic)', userText);
                    }
                }
                else if (msg.type === 'stt_committed' && msg.text) {
                    // Committed transcript from Scribe v2 Realtime — replace partial
                    self._lastPartialEl = null;
                    self.appendChatMessage('You (mic)', msg.text);
                }
                else if (msg.type === 'stt_partial' && msg.text) {
                    // Partial transcript — update in-place to avoid flooding
                    if (msg.final) {
                        // Final stt_partial acts like committed — skip if stt_committed already handled
                        return;
                    }
                    self.updatePartialTranscript(msg.text);
                }
            } catch (e) {
                console.error('Chat WS parse error:', e);
            }
        };

        self.chatWs.onclose = function () {
            self.chatConnected = false;
            self._conversationReady = false;
            self.chatWs = null;
            self.updateChatStatus(false);
        };

        self.chatWs.onerror = function () {
            self.chatConnected = false;
            self._conversationReady = false;
        };
    } catch (e) {
        console.error('Chat WS connect error:', e);
    }
};

AISettingsManager.prototype.sendChatMessage = function () {
    var self = this;
    var input = document.getElementById('chatInput');
    if (!input) return;
    var text = input.value.trim();
    if (!text) return;

    self.appendChatMessage('You', text);
    input.value = '';

    if (self.chatWs && self.chatConnected && self._conversationReady) {
        // Conversation is fully ready — send immediately
        self.chatWs.send(JSON.stringify({ type: 'send_message', text: text }));
    } else if (self.chatWs && self.chatConnected && !self._conversationReady) {
        // WS connected but conversation not yet initialized — queue for server-side handling
        self.chatWs.send(JSON.stringify({ type: 'send_message', text: text }));
    } else {
        // Not connected at all — queue message and connect
        self._pendingChatMessage = text;
        // Auto-enable audio playback when user initiates chat
        self._audioPlaybackEnabled = true;
        self.connectChatWebSocket();
    }
};

AISettingsManager.prototype.appendChatMessage = function (sender, text) {
    var chatLog = document.getElementById('chatLog');
    if (!chatLog) return;

    // Strip stage directions / bracketed annotations from AI text
    if (sender === 'AI') {
        text = text.replace(/\[.*?\]/g, '').replace(/\s{2,}/g, ' ').trim();
        if (!text) return; // Nothing left after stripping
    }

    // Remove any in-flight partial transcript element when committing mic text
    if ((sender === 'You (mic)') && this._lastPartialEl && this._lastPartialEl.parentNode) {
        this._lastPartialEl.parentNode.removeChild(this._lastPartialEl);
        this._lastPartialEl = null;
    }

    // Clear placeholder
    var placeholder = chatLog.querySelector('.text-muted.text-center');
    if (placeholder) placeholder.remove();

    var time = new Date().toLocaleTimeString();
    var msgDiv = document.createElement('div');
    msgDiv.className = 'mb-1';

    var senderClass = sender === 'You' || sender === 'You (mic)' ? 'text-info' :
        sender === 'AI' ? 'text-success' : 'text-warning';

    msgDiv.innerHTML = '<small class="text-muted">[' + time + ']</small> ' +
        '<strong class="' + senderClass + '">' + sender + ':</strong> ' +
        '<span>' + this.escapeHtml(text) + '</span>';

    chatLog.appendChild(msgDiv);
    chatLog.scrollTop = chatLog.scrollHeight;
};

AISettingsManager.prototype.updatePartialTranscript = function (text) {
    var chatLog = document.getElementById('chatLog');
    if (!chatLog) return;

    if (this._lastPartialEl && this._lastPartialEl.parentNode === chatLog) {
        // Update existing partial element in-place
        var span = this._lastPartialEl.querySelector('.partial-text');
        if (span) {
            span.textContent = text;
        }
    } else {
        // Create new partial element
        var placeholder = chatLog.querySelector('.text-muted.text-center');
        if (placeholder) placeholder.remove();

        var time = new Date().toLocaleTimeString();
        var msgDiv = document.createElement('div');
        msgDiv.className = 'mb-1';
        msgDiv.innerHTML = '<small class="text-muted">[' + time + ']</small> ' +
            '<strong class="text-info">You (mic):</strong> ' +
            '<span class="partial-text" style="opacity:0.7"></span>';
        var span = msgDiv.querySelector('.partial-text');
        if (span) span.textContent = text;
        chatLog.appendChild(msgDiv);
        this._lastPartialEl = msgDiv;
    }
    chatLog.scrollTop = chatLog.scrollHeight;
};

AISettingsManager.prototype.escapeHtml = function (text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
};

AISettingsManager.prototype.updateVUMeter = function (level) {
    var meter = document.getElementById('chatVUMeter');
    var label = document.getElementById('chatVULabel');
    if (meter) {
        meter.style.width = level + '%';
        meter.setAttribute('aria-valuenow', level);
        // Color coding: green < 40, yellow 40-70, red > 70
        if (level > 70) {
            meter.className = 'progress-bar bg-danger';
        } else if (level > 40) {
            meter.className = 'progress-bar bg-warning';
        } else {
            meter.className = 'progress-bar bg-success';
        }
    }
    if (label) {
        label.textContent = level + '%';
    }

    // Auto-decay: reset to 0 after 800ms of silence
    var self = this;
    if (self.chatVUTimer) clearTimeout(self.chatVUTimer);
    self.chatVUTimer = setTimeout(function () {
        if (meter) {
            meter.style.width = '0%';
            meter.setAttribute('aria-valuenow', 0);
            meter.className = 'progress-bar bg-success';
        }
        if (label) label.textContent = '0%';
    }, 800);
};

AISettingsManager.prototype.updateChatStatus = function (active) {
    var indicator = document.getElementById('chatActiveIndicator');
    var statusEl = document.getElementById('chatActiveStatus');

    if (indicator) {
        indicator.textContent = active ? 'Connected' : 'Ready';
        indicator.className = 'badge ' + (active ? 'bg-success' : 'bg-secondary');
    }
    if (statusEl) {
        statusEl.innerHTML = active ? '<i class="bi bi-circle-fill text-success"></i>' : '<i class="bi bi-circle"></i>';
    }
};

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function () {
    var aiSettings = new AISettingsManager();
    aiSettings.init();

    // Make globally available for debugging
    window.aiSettings = aiSettings;
});
