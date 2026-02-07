/**
 * MonsterBox 5.5 - AI Settings Agents JavaScript
 * AI Agent management and CRUD operations
 */

// ES5 syntax as per user requirements
function AgentsManager() {
    this.agents = [];
    this.models = [];
    this.voices = [];
    this.characterTemplates = {
        'Orlok': {
            prompt: 'You are Count Orlok, an ancient vampire from Transylvania. Speak in an old-fashioned, aristocratic manner with a slight menacing undertone. You are curious about modern trick-or-treaters but maintain your vampiric dignity. Keep responses under 30 seconds.',
            firstMessage: 'Ah, what have we here? A young mortal seeking treats on this dark Halloween night...'
        },
        'Witch': {
            prompt: 'You are a wise but mischievous witch. Speak with knowledge of potions, spells, and magical creatures. You enjoy Halloween and are delighted to meet trick-or-treaters. Use mystical language but remain friendly. Keep responses under 30 seconds.',
            firstMessage: 'Welcome, little one! I sense magic in the air tonight. What brings you to my dwelling?'
        },
        'Ghost': {
            prompt: 'You are a friendly ghost who has been haunting this house for decades. You love Halloween because it\'s the one night you can freely interact with the living. Speak with ethereal wisdom but childlike wonder. Keep responses under 30 seconds.',
            firstMessage: 'Boo! Oh, don\'t be frightened! I\'ve been waiting all year for Halloween visitors!'
        },
        'Pirate': {
            prompt: 'You are a swashbuckling pirate captain who has returned from the seven seas. Speak with nautical terms and pirate slang. You\'re searching for treasure but are delighted by trick-or-treaters. Keep responses under 30 seconds.',
            firstMessage: 'Ahoy there, matey! What brings ye to me ship on this spooky night? Seeking treasure, are ye?'
        }
    };
}

AgentsManager.prototype.init = function () {
    var self = this;

    this.loadAgents();
    this.loadModels();
    this.loadVoices();
    this.bindEvents();

    // Chat state
    this.currentChatAgentId = null;
    this._lastReplyText = '';
    this._lastAudioData = null;
    this.wsChat = null;
    this.useWebSocket = true; // Enable WebSocket for real-time chat
    this.audioOutputMode = 'local'; // 'local' for browser, 'speaker' for character speaker
    this.micSource = 'server'; // 'server' (PipeWire) or 'browser' (getUserMedia)
    this._isPlayingAudio = false; // Prevent simultaneous audio playback

    // Initialize WebSocket chat if available
    this.initWebSocketChat();

    // Mic source UI availability (browser mic requires secure context)
    try {
        var insecure = !(window.isSecureContext || window.location.protocol === 'https:' || /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname));
        var micBrowser = document.getElementById('micBrowser');
        var micBrowserLabel = document.querySelector('label[for="micBrowser"]');
        if (micBrowser) {
            if (insecure) {
                micBrowser.disabled = true;
                if (micBrowserLabel) micBrowserLabel.title = 'Browser microphone requires HTTPS (or localhost).';
            } else {
                micBrowser.disabled = false;
            }
        }
    } catch (e) { /* no-op */ }

    console.log('Agents Manager initialized');
};

AgentsManager.prototype.loadAgents = function () {
    var self = this;

    fetch('/api/elevenlabs/agents')
        .then(function (response) {
            return response.json();
        })
        .then(function (data) {
            if (data.success) {
                // Normalize id field so downstream always has agent.id
                var list = data.agents || [];
                for (var i = 0; i < list.length; i++) {
                    var a = list[i];
                    a.id = a.id || a.agent_id || a.agentId || a.uuid || a._id || null;
                }
                self.agents = list;
                self.updateAgentsDisplay();
            } else {
                self.showAgentsError();
            }
        })
        .catch(function (error) {
            console.error('Failed to load agents:', error);
            self.showAgentsError();
        });
};

AgentsManager.prototype.updateAgentsDisplay = function () {
    var agentsContainer = document.getElementById('agentsList');

    if (this.agents.length === 0) {
        agentsContainer.innerHTML = '<div class="text-center text-muted py-4">' +
            '<i class="bi bi-robot display-4 d-block mb-3"></i>' +
            '<p>No AI agents created yet</p>' +
            '<button class="btn btn-success" data-bs-toggle="modal" data-bs-target="#createAgentModal">' +
            '<i class="bi bi-plus-circle me-2"></i>Create Your First Agent' +
            '</button>' +
            '</div>';
        return;
    }

    var agentsHtml = '';
    this.agents.forEach(function (agent) {
        var statusBadge = agent.status === 'active' ? 'bg-success' : 'bg-secondary';
        var aid = agent.id || agent.agent_id || agent.agentId || agent.uuid || '';
        var voiceName = agent.voice_name || (agent.voice && (agent.voice.name || agent.voice.display_name)) || 'Unknown';
        var modelName = agent.model || (agent.llm && agent.llm.model) || 'Unknown';

        agentsHtml += '<div class="card mb-3">' +
            '<div class="card-body">' +
            '<div class="row align-items-center">' +
            '<div class="col-md-6">' +
            '<h6 class="card-title mb-1">' + agent.name + ' <span class="badge ' + statusBadge + '">' + (agent.status || 'active') + '</span></h6>' +
            '<p class="card-text small text-muted mb-1">' + (agent.description || 'No description') + '</p>' +
            '<div class="small text-muted">' +
            '<strong>Model:</strong> ' + modelName + ' | ' +
            '<strong>Voice:</strong> ' + voiceName + ' | ' +
            '<strong>Language:</strong> ' + (agent.language || 'en') +
            '</div>' +
            '</div>' +
            '<div class="col-md-6 text-end">' +
            '<div class="btn-group" role="group">' +
            '<button type="button" class="btn btn-sm btn-outline-primary" onclick="agentsManager.testAgent(\'' + aid + '\')">' +
            '<i class="bi bi-play"></i> Test' +
            '</button>' +
            '<button type="button" class="btn btn-sm btn-outline-info" onclick="agentsManager.openChat(\'' + aid + '\')">' +
            '<i class="bi bi-chat-dots"></i> Chat' +
            '</button>' +
            '<button type="button" class="btn btn-sm btn-outline-secondary" onclick="agentsManager.editAgent(\'' + aid + '\')">' +
            '<i class="bi bi-pencil"></i> Edit' +
            '</button>' +
            '<button type="button" class="btn btn-sm btn-outline-danger" onclick="agentsManager.deleteAgent(\'' + aid + '\')">' +
            '<i class="bi bi-trash"></i> Delete' +
            '</button>' +
            '</div>' +
            '</div>' +
            '</div>' +
            '</div>' +
            '</div>';
    });

    agentsContainer.innerHTML = agentsHtml;
};

AgentsManager.prototype.showAgentsError = function () {
    var agentsContainer = document.getElementById('agentsList');
    agentsContainer.innerHTML = '<div class="alert alert-warning">' +
        '<i class="bi bi-exclamation-triangle me-2"></i>' +
        'Failed to load agents' +
        '</div>';
};

AgentsManager.prototype.loadModels = function () {
    var self = this;

    fetch('/api/elevenlabs/models')
        .then(function (response) {
            return response.json();
        })
        .then(function (data) {
            if (data.success) {
                self.models = data.models || [];
                self.updateModelsDisplay();
                self.populateModelSelects();
            } else {
                self.showModelsError();
            }
        })
        .catch(function (error) {
            console.error('Failed to load models:', error);
            self.showModelsError();
        });
};

AgentsManager.prototype.updateModelsDisplay = function () {
    var modelsContainer = document.getElementById('availableModels');

    if (this.models.length === 0) {
        modelsContainer.innerHTML = '<div class="text-center text-muted">No models available</div>';
        return;
    }

    var modelsHtml = '';
    this.models.forEach(function (model) {
        modelsHtml += '<div class="card mb-2">' +
            '<div class="card-body p-3">' +
            '<h6 class="card-title mb-1">' + (model.name || model.id) + '</h6>' +
            '<p class="card-text small text-muted mb-0">' + (model.description || 'LLM Model') + '</p>' +
            '</div>' +
            '</div>';
    });

    modelsContainer.innerHTML = modelsHtml;
};

AgentsManager.prototype.populateModelSelects = function () {
    var selects = ['agentModel', 'editAgentModel'];
    var self = this;

    selects.forEach(function (selectId) {
        var select = document.getElementById(selectId);
        if (select) {
            select.innerHTML = '<option value="">Select model...</option>';

            self.models.forEach(function (model) {
                var option = document.createElement('option');
                option.value = model.id;
                option.textContent = model.name || model.id;
                select.appendChild(option);
            });
        }
    });
};

AgentsManager.prototype.showModelsError = function () {
    var modelsContainer = document.getElementById('availableModels');
    modelsContainer.innerHTML = '<div class="alert alert-warning">' +
        '<i class="bi bi-exclamation-triangle me-2"></i>' +
        'Failed to load models' +
        '</div>';
};

AgentsManager.prototype.loadVoices = function () {
    var self = this;

    fetch('/api/elevenlabs/voices')
        .then(function (response) {
            return response.json();
        })
        .then(function (data) {
            if (data.success) {
                self.voices = data.voices || [];
                self.populateVoiceSelects();
            }
        })
        .catch(function (error) {
            console.error('Failed to load voices:', error);
        });
};

AgentsManager.prototype.populateVoiceSelects = function () {
    var selects = ['agentVoice', 'editAgentVoice'];
    var self = this;

    selects.forEach(function (selectId) {
        var select = document.getElementById(selectId);
        if (select) {
            select.innerHTML = '<option value="">Select voice...</option>';

            self.voices.forEach(function (voice) {
                var option = document.createElement('option');
                option.value = voice.voice_id || voice.id;
                option.textContent = voice.name + (voice.category ? (' (' + voice.category + ')') : '');
                select.appendChild(option);
            });
        }
    });
};

AgentsManager.prototype.bindEvents = function () {
    var self = this;

    // Template selection
    var templateSelect = document.getElementById('agentTemplate');
    if (templateSelect) {
        templateSelect.addEventListener('change', function () {
            self.applyCharacterTemplate(this.value);
        });
    }

    // Voice preview
    var previewVoiceBtn = document.getElementById('previewVoice');
    if (previewVoiceBtn) {
        previewVoiceBtn.addEventListener('click', function () {
            self.previewVoice();
        });
    }

    // Create agent
    var saveAgentBtn = document.getElementById('saveAgent');
    if (saveAgentBtn) {
        saveAgentBtn.addEventListener('click', function () {
            self.createAgent();
        });
    }

    // Test agent
    var testAgentBtn = document.getElementById('testAgent');
    if (testAgentBtn) {
        testAgentBtn.addEventListener('click', function () {
            self.testNewAgent();
        });
    }

    // Update agent
    var updateAgentBtn = document.getElementById('updateAgent');
    if (updateAgentBtn) {
        updateAgentBtn.addEventListener('click', function () {
            self.updateAgent();
        });
    }
};

AgentsManager.prototype.applyCharacterTemplate = function (templateName) {
    if (!templateName || !this.characterTemplates[templateName]) {
        return;
    }

    var template = this.characterTemplates[templateName];
    var promptTextarea = document.getElementById('agentPrompt');
    var firstMessageTextarea = document.getElementById('firstMessage');

    if (promptTextarea) {
        promptTextarea.value = template.prompt;
    }

    if (firstMessageTextarea) {
        firstMessageTextarea.value = template.firstMessage;
    }
};

AgentsManager.prototype.previewVoice = function () {
    var self = this;
    var voiceSelect = document.getElementById('agentVoice');
    if (!voiceSelect.value) {
        this.showAlert('Please select a voice first', 'warning');
        return;
    }

    var requestData = {
        text: 'This is a preview of the selected agent voice.',
        voice_id: voiceSelect.value,
        model: 'eleven_flash_v2_5',
        voice_settings: { stability: 0.5, similarity_boost: 0.5, style: 0.0, use_speaker_boost: true }
    };

    fetch('/api/elevenlabs/tts/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestData)
    })
        .then(function (r) { if (!r.ok) throw new Error('Failed'); return r.blob(); })
        .then(function (blob) {
            var audio = new Audio(URL.createObjectURL(blob));
            audio.play().catch(function (e) { console.warn('Autoplay blocked', e); });
            self.showAlert('Voice preview playing...', 'success');
        })
        .catch(function (e) { console.error('Preview error', e); self.showAlert('Failed to preview voice', 'danger'); });
};

AgentsManager.prototype.createAgent = function () {
    var self = this;
    var form = document.getElementById('createAgentForm');
    var formData = new FormData(form);
    var agentData = {};

    for (var pair of formData.entries()) {
        agentData[pair[0]] = pair[1];
    }

    // Validation
    if (!agentData.name || !agentData.model || !agentData.voice_id || !agentData.prompt) {
        this.showAlert('Please fill in all required fields', 'warning');
        return;
    }

    // Show loading state
    var saveBtn = document.getElementById('saveAgent');
    var originalText = saveBtn.innerHTML;
    saveBtn.innerHTML = '<div class="spinner-border spinner-border-sm me-2" role="status"></div>Creating...';
    saveBtn.disabled = true;

    fetch('/api/elevenlabs/agents', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(agentData)
    })
        .then(function (response) {
            return response.json();
        })
        .then(function (data) {
            if (data.success) {
                self.showAlert('Agent created successfully!', 'success');
                self.loadAgents(); // Refresh the list

                // Close modal and reset form
                var modal = bootstrap.Modal.getInstance(document.getElementById('createAgentModal'));
                modal.hide();
                form.reset();
            } else {
                self.showAlert('Failed to create agent: ' + data.error, 'danger');
            }
        })
        .catch(function (error) {
            console.error('Create agent error:', error);
            self.showAlert('Failed to create agent', 'danger');
        })
        .finally(function () {
            saveBtn.innerHTML = originalText;
            saveBtn.disabled = false;
        });
};

AgentsManager.prototype.testNewAgent = function () {
    var self = this;
    var promptTextarea = document.getElementById('firstMessage');
    var text = (promptTextarea && promptTextarea.value) || 'Hello there!';
    fetch('/api/elevenlabs/conversation/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: text }) })
        .then(function (r) { return r.json(); })
        .then(function (data) { if (data && data.success) self.showAlert('AI replied: ' + data.replyText, 'success'); else self.showAlert('Agent test failed', 'danger'); })
        .catch(function (e) { console.error('Test agent error', e); self.showAlert('Agent test failed', 'danger'); });
};

AgentsManager.prototype.testAgent = function (agentId) {
    var self = this;
    if (!agentId || agentId === 'undefined') {
        self.showAlert('Agent ID is not available for this entry', 'warning');
        return;
    }
    // Request TTS audio stream for a quick audible test
    fetch('/api/elevenlabs/conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: agentId, text: 'Hello from MonsterBox!' })
    })
        .then(function (r) {
            if (!r.ok) throw new Error('Conversation failed');
            return r.blob();
        })
        .then(function (blob) {
            var audio = new Audio(URL.createObjectURL(blob));
            audio.play().catch(function (e) { console.warn('Autoplay blocked', e); });
            self.showAlert('Agent TTS test playing...', 'success');
        })
        .catch(function (e) { console.error('Test agent error', e); self.showAlert('Agent test failed', 'danger'); });
};

AgentsManager.prototype.editAgent = function (agentId) {
    var agent = this.agents.find(function (a) { return a.id === agentId; });

    if (!agent) {
        this.showAlert('Agent not found', 'danger');
        return;
    }

    // Populate edit form
    document.getElementById('editAgentId').value = agent.id || agent.agent_id || '';
    document.getElementById('editAgentName').value = agent.name || '';
    document.getElementById('editAgentLanguage').value = agent.language || 'en';
    document.getElementById('editAgentPrompt').value = agent.prompt || '';

    // Optional fields if present
    var em = document.getElementById('editAgentModel');
    if (em && this.models && this.models.length) {
        var modelId = agent.model || (agent.llm && agent.llm.model) || '';
        if (modelId) em.value = modelId;
    }
    var ev = document.getElementById('editAgentVoice');
    if (ev && this.voices && this.voices.length) {
        var voiceId = agent.voice_id || (agent.voice && (agent.voice.voice_id || agent.voice.id)) || '';
        if (voiceId) ev.value = voiceId;
    }

    // Show edit modal
    var modal = new bootstrap.Modal(document.getElementById('editAgentModal'));
    modal.show();
};

AgentsManager.prototype.updateAgent = function () {
    var self = this;
    var form = document.getElementById('editAgentForm');
    var formData = new FormData(form);
    var agentData = {};
    for (var pair of formData.entries()) { agentData[pair[0]] = pair[1]; }
    var agentId = agentData.agentId; delete agentData.agentId;

    // Validate minimal fields
    if (!agentId) { self.showAlert('Missing agent id', 'warning'); return; }

    fetch('/api/elevenlabs/agents/' + agentId, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(agentData) })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (data && data.success) {
                self.showAlert('Agent updated successfully!', 'success');
                self.loadAgents();
                var modal = bootstrap.Modal.getInstance(document.getElementById('editAgentModal'));
                modal.hide();
            } else {
                self.showAlert('Failed to update agent', 'danger');
            }
        })
        .catch(function (e) { console.error('Update agent error', e); self.showAlert('Failed to update agent', 'danger'); });

};


// Chat helpers appended (ES5)
AgentsManager.prototype.openChat = AgentsManager.prototype.openChat || function (agentId) {
    this.currentChatAgentId = agentId;
    var title = document.getElementById('chatAgentTitle');
    if (title) title.textContent = 'Chat with Agent ' + agentId;
    var log = document.getElementById('chatLog');
    if (log) log.innerHTML = '';

    // Clean up any existing audio processing
    if (this._audioTimeout) {
        clearTimeout(this._audioTimeout);
        this._audioTimeout = null;
    }
    this._audioChunks = [];
    this._lastAudioData = null;

    // Start WebSocket conversation if available
    if (this.useWebSocket && this.wsChat && this.wsChat.isConnected) {
        console.log('🚀 Starting WebSocket conversation with agent:', agentId);
        this.wsChat.startConversation(agentId);
        // Apply current routing preferences
        try {
            this.wsChat.sendMessage({ type: 'set_output_mode', mode: this.audioOutputMode === 'speaker' ? 'server' : 'local' });
            this.wsChat.sendMessage({ type: 'set_mic_source', source: this.micSource });
            // Also set STT language based on agent's configured language (default to 'en')
            var agent = (this.agents || []).find(function (a) { return (a.id || a.agent_id || a.agentId) === agentId; });
            var lang = agent && agent.language ? String(agent.language).toLowerCase() : 'en';
            if (lang && lang.length > 2) lang = lang.slice(0, 2);
            this.wsChat.sendMessage({ type: 'set_stt_language', language: lang || 'en' });
        } catch (e) { /* best-effort */ }
        // Send current Character so Server Mic uses the Character's Microphone Part
        try {
            var selfRef = this;
            this.getCurrentCharacterId().then(function (cid) {
                if (cid != null && selfRef.wsChat && selfRef.wsChat.isConnected) {
                    selfRef.wsChat.sendMessage({ type: 'set_character', characterId: cid });
                }
            });
        } catch (e) { /* noop */ }
        this.showChatMessage('System', 'Connecting to agent via WebSocket...', 'info');
    } else {
        console.log('📱 WebSocket not available, using HTTP fallback');
        this.showChatMessage('System', 'Connected via HTTP (slower responses)', 'warning');
    }

    var modalEl = document.getElementById('agentChatModal');
    if (modalEl) {
        var modal = new bootstrap.Modal(modalEl);
        // Ensure browser mic capture stops when modal closes
        var self = this;
        modalEl.addEventListener('hidden.bs.modal', function () {
            try { self._stopBrowserMicCapture(true); } catch (e) { }
            try { self._stopChatVUMeter(); } catch (e) { }
            try { if (self.wsChat && self.wsChat.isConnected) { self.wsChat.endConversation(); } } catch (e) { }
        }, { once: true });
        modal.show();
    }
};

AgentsManager.prototype.sendChatMessage = AgentsManager.prototype.sendChatMessage || function () {
    var self = this;
    var input = document.getElementById('chatInput');
    if (!input || !input.value.trim()) return;
    var text = input.value.trim();
    input.value = '';

    // Show user message
    this.showChatMessage('You', text, 'user');

    // Record message time for response time calculation
    this.lastMessageTime = Date.now();

    // Use WebSocket ONLY - no HTTP fallback for real-time chat
    if (this.useWebSocket && this.wsChat && this.wsChat.isConnected) {
        console.log('📡 Sending via WebSocket...');
        this.wsChat.sendChatMessage(text);
        return;
    }

    // If WebSocket not available, show error instead of slow HTTP fallback
    console.error('❌ WebSocket not available - real-time chat required');
    this.showChatMessage('System', 'WebSocket connection required for real-time chat. Please refresh the page.', 'error');
};

// HTTP fallback method
AgentsManager.prototype.sendChatMessageHTTP = AgentsManager.prototype.sendChatMessageHTTP || function (text) {
    var self = this;

    // Add typing indicator
    var log = document.getElementById('chatLog');
    if (log) {
        var typing = document.createElement('div');
        typing.className = 'mb-2 text-muted';
        typing.id = 'typing-indicator';
        typing.innerHTML = '<strong>Agent:</strong> <em>typing...</em>';
        log.appendChild(typing);
        log.scrollTop = log.scrollHeight;
    }

    // Use the faster test endpoint for immediate responses
    var startTime = Date.now();
    fetch('/api/elevenlabs/conversation/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: this.currentChatAgentId, text: text })
    })
        .then(function (r) {
            // Remove typing indicator
            var typing = document.getElementById('typing-indicator');
            if (typing) typing.remove();

            if (!r.ok) throw new Error('Conversation failed');
            return r.json();
        })
        .then(function (data) {
            var responseTime = Date.now() - startTime;
            console.log('HTTP Chat response time:', responseTime + 'ms');

            if (data.success && data.replyText) {
                self._lastReplyText = data.replyText;
                var fastBadge = data.fastResponse ? ' <small class="badge bg-warning">HTTP</small>' : ' <small class="badge bg-info">HTTP</small>';
                self.showChatMessage('Agent', data.replyText + fastBadge, 'agent', responseTime);

                // Optional: Generate TTS audio in background (non-blocking)
                if (data.agentUsed && !data.fastResponse) {
                    self.generateTTSAudio(data.replyText);
                }
            } else {
                throw new Error('No reply received');
            }
        })
        .catch(function (e) {
            // Remove typing indicator on error
            var typing = document.getElementById('typing-indicator');
            if (typing) typing.remove();

            console.error('HTTP Chat error', e);
            self.showChatMessage('System', 'Chat failed - ' + e.message, 'error');
        });
};

// Generate TTS audio in background (non-blocking)
AgentsManager.prototype.generateTTSAudio = AgentsManager.prototype.generateTTSAudio || function (text) {
    var self = this;
    // Generate TTS audio without blocking the chat
    fetch('/api/elevenlabs/conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: this.currentChatAgentId, text: text })
    })
        .then(function (r) {
            if (r.ok) return r.blob();
            throw new Error('TTS generation failed');
        })
        .then(function (blob) {
            var audio = new Audio(URL.createObjectURL(blob));
            audio.play().catch(function (e) { console.warn('Autoplay blocked', e); });
        })
        .catch(function (e) {
            console.warn('Background TTS failed:', e.message);
        });
};

// Fetch current selected character id
AgentsManager.prototype.getCurrentCharacterId = function () {
    return fetch('/setup/characters/api/current')
        .then(function (r) { return r.json(); })
        .then(function (d) { return (d && (typeof d.selectedCharacter !== 'undefined')) ? d.selectedCharacter : null; })
        .catch(function () { return null; });
};

// Set audio output mode (local browser or character speaker)
AgentsManager.prototype.setAudioOutput = function (mode) {
    this.audioOutputMode = mode;
    console.log('🔊 Audio output mode set to:', mode);

    // Update UI to show current mode
    var statusIndicator = document.getElementById('wsConnectionStatus');
    if (statusIndicator) {
        var modeText = mode === 'local' ? 'Browser Audio' : 'Character Speaker';
        var modeClass = mode === 'local' ? 'bg-primary' : 'bg-success';
        statusIndicator.className = 'badge ' + modeClass;
        statusIndicator.textContent = 'WebSocket Connected - ' + modeText;
    }

    this.showAlert('Audio output: ' + (mode === 'local' ? 'Browser (Local)' : 'Character Speaker'), 'info');
};

// Play audio data on character's configured speaker
// Helper: convert ArrayBuffer to base64 (chunk-safe)
AgentsManager.prototype._arrayBufferToBase64 = function (buffer) {
    var binary = '';
    var bytes = new Uint8Array(buffer);
    var chunkSize = 0x8000; // 32KB chunks to avoid call stack issues
    for (var i = 0; i < bytes.length; i += chunkSize) {
        var sub = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
        binary += String.fromCharCode.apply(null, sub);
    }
    return btoa(binary);
};

// Play audio data on character's configured speaker
AgentsManager.prototype.playAudioOnCharacterSpeaker = function (audioBase64, characterId) {
    var self = this;

    // If no characterId provided, get current character
    if (!characterId) {
        this.getCurrentCharacterId().then(function (charId) {
            if (charId) {
                self.playAudioOnCharacterSpeaker(audioBase64, charId);
            } else {
                console.warn('⚠️ No character selected for speaker playback');
                self.showAlert('No Character selected - using browser audio', 'warning');
                // Fallback to local playback
                self.audioOutputMode = 'local';
                document.getElementById('audioLocal').checked = true;
                self.playAudioChunk(audioBase64);
            }
        });
        return;
    }

    console.log('🔊 Playing audio on character speaker (converting to WAV), length:', audioBase64.length);

    // Convert PCM base64 to WAV base64 with correct sample rate
    try {
        var pcmBinary = atob(audioBase64);
        var pcmBytes = new Uint8Array(pcmBinary.length);
        for (var i = 0; i < pcmBinary.length; i++) {
            pcmBytes[i] = pcmBinary.charCodeAt(i);
        }
        var wavBuffer = this.pcmToWav(pcmBytes, 16000, 1, 16);
        var wavBase64 = this._arrayBufferToBase64(wavBuffer);
    } catch (convErr) {
        console.warn('⚠️ Failed to convert PCM to WAV for speaker playback:', convErr.message);
        // Fallback: send original (may be choppy if wrong format)
        wavBase64 = audioBase64;
    }

    return fetch('/api/elevenlabs/play-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            audioData: wavBase64,
            characterId: characterId,
            format: 'wav'
        })
    })
        .then(function (r) { return r.json(); })
        .then(function (d) {
            if (d && d.success !== false) {
                console.log('✅ Character speaker playback successful:', d.device);
                // Don't show alert for every audio chunk - too noisy
            } else {
                console.error('❌ Character speaker playback failed:', d && d.error);
                self.showAlert('Speaker playback failed - switching to browser', 'warning');
                // Auto-fallback to local
                self.audioOutputMode = 'local';
                document.getElementById('audioLocal').checked = true;
            }
        })
        .catch(function (e) {
            console.error('Character speaker playback error', e);
            self.showAlert('Speaker connection failed - using browser', 'warning');
            // Auto-fallback to local
            self.audioOutputMode = 'local';
            document.getElementById('audioLocal').checked = true;
        });
};

// === Microphone routing (Server vs Browser) ===
AgentsManager.prototype.setMicSource = function (source) {
    source = (source === 'browser') ? 'browser' : 'server';
    this.micSource = source;
    var micServer = document.getElementById('micServer');
    var micBrowser = document.getElementById('micBrowser');
    if (micServer && micBrowser) { if (source === 'server') micServer.checked = true; else micBrowser.checked = true; }
    if (this.wsChat && this.wsChat.isConnected) { try { this.wsChat.sendMessage({ type: 'set_mic_source', source: source }); } catch (e) { } }
    // Update VU meter
    try { if (source === 'server') this._startChatVUMeter(); else this._stopChatVUMeter(); } catch (e) { }
    if (source === 'browser') {
        if (!(window.isSecureContext || window.location.protocol === 'https:' || /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname))) {
            this.showAlert('Browser microphone requires HTTPS (or localhost). Falling back to Server Mic.', 'warning');
            this.micSource = 'server'; if (micServer) micServer.checked = true;
            if (this.wsChat && this.wsChat.isConnected) { try { this.wsChat.sendMessage({ type: 'set_mic_source', source: 'server' }); } catch (e) { } }
            return;
        }
        this._startBrowserMicCapture();
    } else {
        this._stopBrowserMicCapture(true);
    }
};

AgentsManager.prototype._startBrowserMicCapture = function () {
    var self = this;
    if (this._browserMicStream) return;
    navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } })
        .then(function (stream) {
            self._browserMicStream = stream;
            self._audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
            var src = self._audioCtx.createMediaStreamSource(stream);
            var processor = self._audioCtx.createScriptProcessor(4096, 1, 1);
            self._browserProcessor = processor;
            self._lastVoiceTs = Date.now();
            processor.onaudioprocess = function (e) {
                if (self.micSource !== 'browser' || !self.wsChat || !self.wsChat.isConnected) return;
                var input = e.inputBuffer.getChannelData(0);
                var down = self._downsampleBuffer(input, self._audioCtx.sampleRate, 16000);
                var pcm = self._floatTo16BitPCM(down);
                var active = false; for (var i = 0; i < down.length; i += 64) { if (Math.abs(down[i]) > 0.02) { active = true; break; } }
                if (active) self._lastVoiceTs = Date.now();
                var b64 = self._uint8ToBase64(pcm);
                try { self.wsChat.sendMessage({ type: 'browser_audio_chunk', audio: b64 }); } catch (e) { }
                if (!active && (Date.now() - self._lastVoiceTs > 700)) { try { self.wsChat.sendMessage({ type: 'eos' }); } catch (e) { } self._lastVoiceTs = Date.now(); }
            };
            src.connect(processor); processor.connect(self._audioCtx.destination);
            self.showAlert('Browser microphone active', 'info');
        })
        .catch(function (err) {
            console.error('Browser mic error:', err);
            self.showAlert('Microphone permission failed: ' + err.message, 'danger');
            self.micSource = 'server'; var micServer = document.getElementById('micServer'); if (micServer) micServer.checked = true;
            if (self.wsChat && self.wsChat.isConnected) { try { self.wsChat.sendMessage({ type: 'set_mic_source', source: 'server' }); } catch (e) { } }
        });
};

AgentsManager.prototype._stopBrowserMicCapture = function (sendEos) {
    try {
        if (this._browserProcessor) { this._browserProcessor.disconnect(); this._browserProcessor.onaudioprocess = null; this._browserProcessor = null; }
        if (this._audioCtx) { this._audioCtx.close(); this._audioCtx = null; }
        if (this._browserMicStream) { this._browserMicStream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) { } }); this._browserMicStream = null; }
        if (sendEos && this.wsChat && this.wsChat.isConnected) { try { this.wsChat.sendMessage({ type: 'eos' }); } catch (e) { } }
    } catch (_) { }
};

AgentsManager.prototype._downsampleBuffer = function (buffer, sampleRate, outRate) {
    if (outRate === sampleRate) return buffer;
    var ratio = sampleRate / outRate; var newLen = Math.round(buffer.length / ratio); var result = new Float32Array(newLen);
    var oR = 0, oB = 0; while (oR < result.length) { var nextOB = Math.round((oR + 1) * ratio); var sum = 0, cnt = 0; for (var i = oB; i < nextOB && i < buffer.length; i++) { sum += buffer[i]; cnt++; } result[oR] = sum / (cnt || 1); oR++; oB = nextOB; }
    return result;
};

AgentsManager.prototype._floatTo16BitPCM = function (float32) {
    var out = new Uint8Array(float32.length * 2); for (var i = 0; i < float32.length; i++) { var s = Math.max(-1, Math.min(1, float32[i])); var v = s < 0 ? s * 0x8000 : s * 0x7FFF; out[i * 2] = v & 0xFF; out[i * 2 + 1] = (v >> 8) & 0xFF; } return out;
};

AgentsManager.prototype._uint8ToBase64 = function (u8) {
    var CHUNK = 0x8000, idx = 0, len = u8.length, res = '', slice; while (idx < len) { slice = u8.subarray(idx, Math.min(idx + CHUNK, len)); res += String.fromCharCode.apply(null, slice); idx += CHUNK; } return btoa(res);
};





AgentsManager.prototype.deleteAgent = function (agentId) {
    var self = this;
    if (!confirm('Are you sure you want to delete this agent? This action cannot be undone.')) return;
    fetch('/api/elevenlabs/agents/' + agentId, { method: 'DELETE' })
        .then(function (r) { return r.json(); })
        .then(function (data) { if (data && data.success) { self.showAlert('Agent deleted successfully!', 'success'); self.loadAgents(); } else { self.showAlert('Failed to delete agent', 'danger'); } })
        .catch(function (e) { console.error('Delete agent error', e); self.showAlert('Failed to delete agent', 'danger'); });
};

AgentsManager.prototype.showAlert = function (message, type) {
    // Create Bootstrap alert
    var alertDiv = document.createElement('div');
    alertDiv.className = 'alert alert-' + type + ' alert-dismissible fade show position-fixed';
    alertDiv.style.top = '20px';
    alertDiv.style.right = '20px';
    alertDiv.style.zIndex = '9999';
    alertDiv.style.minWidth = '300px';

    var iconClass = type === 'success' ? 'bi-check-circle' :
        type === 'danger' ? 'bi-x-circle' :
            type === 'warning' ? 'bi-exclamation-triangle' : 'bi-info-circle';

    alertDiv.innerHTML = '<i class="bi ' + iconClass + ' me-2"></i>' + message +
        '<button type="button" class="btn-close" data-bs-dismiss="alert"></button>';

    document.body.appendChild(alertDiv);

    // Auto-remove after 5 seconds
    setTimeout(function () {
        if (alertDiv.parentNode) {
            alertDiv.parentNode.removeChild(alertDiv);
        }
    }, 5000);
};

// Initialize WebSocket chat client
AgentsManager.prototype.initWebSocketChat = AgentsManager.prototype.initWebSocketChat || function () {
    var self = this;

    if (!this.useWebSocket || !window.WebSocketChatClient) {
        console.log('WebSocket chat disabled or not available');
        return;
    }

    try {
        this.wsChat = new window.WebSocketChatClient();

        // Override event handlers
        this.wsChat.onConnectionStatusChange = function (connected) {
            console.log('🔌 WebSocket chat:', connected ? 'Connected' : 'Disconnected');
            self.updateChatConnectionStatus(connected);
            try { self._setChatStatus('character', null); self._setChatStatus('device', null); self._setChatStatus('stt', connected ? 'ready' : 'disconnected'); } catch (e) { }
        };

        this.wsChat.onConversationStarted = function (message) {
            console.log('✅ WebSocket conversation started with:', message.agentId);
            self.showChatMessage('System', 'Connected to agent - ready for instant chat!', 'success');
            if (self.micSource === 'server') {
                self.showChatMessage('System', 'Server Mic streaming active — speak to the animatronic.', 'info');
            }
            // Populate status line with current character selection
            try { self.getCurrentCharacterId().then(function (cid) { self._setChatStatus('character', cid); }); } catch (e) { }
        };

        // Show server mic hint
        if (self.micSource === 'server') {
            self.showChatMessage('System', 'Server Mic streaming active — speak to the animatronic.', 'info');
        }

        // Wire partial STT transcripts to chat log
        this.wsChat.onPartialTranscript = function (msg) {
            var t = (msg && msg.text) ? String(msg.text).trim() : '';
            if (t) {
                self.showChatMessage('You (STT)', t, 'secondary');
                try { self._setChatStatus('stt', 'ok'); } catch (e) { }
            }
        };

        // Start VU meter polling for Server Mic (defer until helpers are defined)
        setTimeout(function () { if (self._startChatVUMeter) try { self._startChatVUMeter(); } catch (e) { } }, 0);

        // Debug breadcrumbs from server to update status line
        this.wsChat.onDebug = function (msg) {
            try {
                if (msg && msg.originalType === 'server_mic_device' && msg.data && msg.data.deviceId) {
                    self._setChatStatus('device', msg.data.deviceId);
                } else if (msg && msg.originalType === 'server_mic_tick' && msg.data) {
                    if (typeof msg.data.suppressed !== 'undefined') {
                        self._setChatStatus('stt', msg.data.suppressed ? 'suppressed' : 'ok');
                    }
                } else if (msg && msg.originalType === 'set_character') {
                    self._setChatStatus('character', (msg.data && msg.data.characterId) || null);
                }
            } catch (e) { }
        };

        // STT errors
        this.wsChat.onSTTError = function (msg) {
            try { self._setChatStatus('stt', (msg && msg.message) ? ('error: ' + msg.message) : 'error'); } catch (e) { }
        };

        // Initialize audio chunk aggregation
        this._audioChunks = [];
        this._audioTimeout = null;

        this.wsChat.onAgentResponse = function (message) {
            var responseTime = (typeof self.lastMessageTime === 'number') ? (Date.now() - self.lastMessageTime) : null;
            if (responseTime != null) console.log('🤖 Agent response in ' + responseTime + 'ms');

            // Show agent response text (but avoid duplicate generic messages)
            var responseText = message.text || 'Agent response';
            if (responseText && responseText !== 'Audio response received' && responseText !== 'Audio response') {
                // Show the actual response text
                self._lastReplyText = responseText;
                self.showChatMessage('Agent', responseText, 'agent', responseTime);
            } else if (message.audio && (!self._lastReplyText || self._lastReplyText === 'Audio response received')) {
                // If we only have audio and no meaningful text, show a placeholder
                self.showChatMessage('Agent', '🎵 Audio response', 'agent', responseTime);
            }

            // Handle audio chunks - aggregate them for smoother playback
            if (message.audio) {
                self._audioChunks.push(message.audio);
                console.log('🎵 Audio chunk received, total chunks:', self._audioChunks.length, 'size:', message.audio.length);

                // Clear existing timeout to prevent multiple simultaneous playbacks
                if (self._audioTimeout) {
                    clearTimeout(self._audioTimeout);
                }

                // Set timeout to play aggregated audio after brief pause
                self._audioTimeout = setTimeout(function () {
                    if (self._audioChunks.length > 0) {
                        console.log('🎵 Processing', self._audioChunks.length, 'audio chunks for playback');

                        // Concatenate all chunks for complete audio
                        var totalLength = self._audioChunks.reduce(function (sum, chunk) {
                            return sum + chunk.length;
                        }, 0);

                        // Use the largest chunk (usually most complete)
                        var largestChunk = self._audioChunks.reduce(function (prev, current) {
                            return current.length > prev.length ? current : prev;
                        });

                        console.log('🎵 Playing audio chunk of size:', largestChunk.length, 'from', self._audioChunks.length, 'total chunks');

                        // Store for potential replay
                        self._lastAudioData = largestChunk;

                        // Play the audio (respects toggle setting)
                        self.playAudioChunk(largestChunk);

                        // Clear chunks after playing
                        self._audioChunks = [];
                        self._audioTimeout = null;
                    }
                }, 300); // Reduced to 300ms for faster response
            }
        };

        this.wsChat.onConversationEnded = function (message) {
            console.log('🔚 WebSocket conversation ended');
            self.showChatMessage('System', 'Conversation ended', 'info');
        };

        this.wsChat.onError = function (message) {
            console.error('❌ WebSocket chat error:', message.message);
            self.showChatMessage('System', 'Error: ' + message.message, 'error');

            // Fallback to HTTP if WebSocket fails
            self.useWebSocket = false;
            console.log('🔄 Falling back to HTTP chat');
        };


        // Resolve Character's microphone deviceId (from Parts)
        AgentsManager.prototype._resolveCharacterMicDeviceId = function () {
            var self = this;
            return this.getCurrentCharacterId().then(function (cid) {
                // If no Character selected, fall back to saved STT config or 'default'
                if (cid == null) {
                    return fetch('/api/elevenlabs/stt/config')
                        .then(function (r) { return r.json(); })
                        .then(function (j) {
                            if (j && j.success && j.config) {
                                var c = j.config;
                                return c.microphoneDeviceId || c.deviceId || 'default';
                            }
                            return 'default';
                        })
                        .catch(function () { return 'default'; });
                }
                // Otherwise, use the Character's Microphone Part; if missing, fall back to STT config
                return fetch('/setup/calibration/api/parts')
                    .then(function (r) { return r.json(); })
                    .then(function (j) {
                        if (!j || !j.success || !Array.isArray(j.parts)) return null;
                        var mic = j.parts.find(function (p) { return String(p.type).toLowerCase() === 'microphone' && Number(p.characterId) === Number(cid); });
                        if (mic) {
                            var cfg = mic.config || {};
                            return cfg.deviceId || cfg.inputDevice || cfg.audioDeviceId || mic.inputDevice || 'default';
                        }
                        // Fallback: saved STT config
                        return fetch('/api/elevenlabs/stt/config')
                            .then(function (r2) { return r2.json(); })
                            .then(function (j2) { var c2 = j2 && j2.config || {}; return c2.microphoneDeviceId || c2.deviceId || 'default'; })
                            .catch(function () { return 'default'; });
                    })
                    .catch(function () { return 'default'; });
            });
        };

        // Chat VU meter polling
        AgentsManager.prototype._startChatVUMeter = function () {
            var self = this;
            try { self._stopChatVUMeter(); } catch (e) { }
            if (self.micSource !== 'server') return; // only for server mic
            self._vuBusy = false;
            self._vuTimer = null;
            self._resolveCharacterMicDeviceId().then(function (devId) {
                if (!devId) return;
                var bar = document.getElementById('chatVUMeterBar');
                if (!bar) return;
                self._vuTimer = setInterval(function () {
                    if (self._vuBusy) return;
                    self._vuBusy = true;
                    fetch('/setup/audio/api/audio-levels?deviceId=' + encodeURIComponent(devId) + '&deviceType=input')
                        .then(function (r) { return r.json(); })
                        .then(function (j) {
                            if (!j || !j.success) return;
                            var level = +j.level || 0;
                            var pct = Math.max(0, Math.min(100, Math.round(level * 100)));
                            bar.style.width = pct + '%';
                            bar.setAttribute('aria-valuenow', String(pct));
                        })
                        .catch(function () { })
                        .finally(function () { self._vuBusy = false; });
                }, 300);
            });
        };

        AgentsManager.prototype._stopChatVUMeter = function () {
            if (this._vuTimer) { try { clearInterval(this._vuTimer); } catch (_) { } this._vuTimer = null; }
        };

        // Stop VU and browser mic on modal close

        // Update inline chat status (character/device/stt)
        AgentsManager.prototype._setChatStatus = function (key, value) {
            try {
                if (key === 'character') {
                    var elc = document.getElementById('chatStatusCharacter');
                    if (elc) elc.textContent = (value === null || typeof value === 'undefined') ? '-' : String(value);
                } else if (key === 'device') {
                    var eld = document.getElementById('chatStatusDevice');
                    if (eld) eld.textContent = value ? String(value) : '-';
                } else if (key === 'stt') {
                    var els = document.getElementById('chatStatusSTT');
                    if (els) els.textContent = value ? String(value) : '-';
                }
            } catch (_) { }
        };

        (function () {
            var modalEl = document.getElementById('agentChatModal');
            if (!modalEl) return;
            modalEl.addEventListener('hidden.bs.modal', function () {
                if (window.agentsManager) {
                    try { window.agentsManager._stopChatVUMeter(); } catch (e) { }
                }
            });
        })();
        // Interruption event (barge-in from agent)
        this.wsChat.onInterruption = function (msg) {
            self.showChatMessage('System', 'Interruption: ' + (msg && msg.reason ? msg.reason : 'stopped'), 'info');
        };


        // Connect to WebSocket server
        this.wsChat.connect();

    } catch (error) {
        console.error('❌ Failed to initialize WebSocket chat:', error);
        this.useWebSocket = false;
    }
};

// Update chat connection status indicator
AgentsManager.prototype.updateChatConnectionStatus = function (connected) {
    var statusIndicator = document.getElementById('wsConnectionStatus');
    if (statusIndicator) {
        statusIndicator.className = connected ? 'badge bg-success' : 'badge bg-danger';
        statusIndicator.textContent = connected ? 'WebSocket Connected' : 'WebSocket Disconnected';
    }
};

// Show chat message in the chat log
AgentsManager.prototype.showChatMessage = function (sender, text, type, responseTime) {
    var log = document.getElementById('chatLog');
    if (!log) return;

    var messageDiv = document.createElement('div');
    messageDiv.className = 'mb-2';

    var badge = '';
    var timeInfo = '';

    if (type === 'success') {
        badge = ' <small class="badge bg-success">System</small>';
    } else if (type === 'error') {
        badge = ' <small class="badge bg-danger">Error</small>';
    } else if (type === 'info') {
        badge = ' <small class="badge bg-info">Info</small>';
    } else if (type === 'agent' && responseTime) {
        var speedBadge = responseTime < 1000 ? 'success' : responseTime < 3000 ? 'warning' : 'secondary';
        timeInfo = ' <small class="badge bg-' + speedBadge + '">' + responseTime + 'ms</small>';
    }

    messageDiv.innerHTML = '<strong>' + sender + ':</strong> ' + text + badge + timeInfo;
    log.appendChild(messageDiv);
    log.scrollTop = log.scrollHeight;
};

// Convert PCM audio data to WAV format for browser playback
AgentsManager.prototype.pcmToWav = function (pcmData, sampleRate, numChannels, bitsPerSample) {
    sampleRate = sampleRate || 22050;
    numChannels = numChannels || 1;
    bitsPerSample = bitsPerSample || 16;

    var bytesPerSample = bitsPerSample / 8;
    var blockAlign = numChannels * bytesPerSample;
    var byteRate = sampleRate * blockAlign;
    var dataSize = pcmData.length;
    var fileSize = 36 + dataSize;

    var buffer = new ArrayBuffer(44 + dataSize);
    var view = new DataView(buffer);

    // WAV header
    var writeString = function (offset, string) {
        for (var i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, fileSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    // Copy PCM data
    var offset = 44;
    for (var i = 0; i < pcmData.length; i++) {
        view.setUint8(offset + i, pcmData[i]);
    }

    return buffer;
};

// Play audio chunk from WebSocket (ElevenLabs real-time audio)
AgentsManager.prototype.playAudioChunk = function (audioBase64) {
    var self = this;

    // Prevent multiple simultaneous playbacks
    if (this._isPlayingAudio) {
        console.log('🔇 Skipping audio playback - already playing');
        return;
    }

    this._isPlayingAudio = true;
    console.log('🔊 Starting audio playback, mode:', this.audioOutputMode, 'size:', audioBase64.length);

    // Check audio output mode
    if (this.audioOutputMode === 'speaker') {
        // Play through character's configured speaker
        this.playAudioOnCharacterSpeaker(audioBase64);
        // Reset flag after a delay (speaker playback is async)
        setTimeout(function () {
            self._isPlayingAudio = false;
        }, 1000);
        return;
    }

    // Default: Play locally in browser
    try {
        // Convert base64 to binary data
        var audioData = atob(audioBase64);
        var pcmData = new Uint8Array(audioData.length);
        for (var i = 0; i < audioData.length; i++) {
            pcmData[i] = audioData.charCodeAt(i);
        }

        // Convert PCM to WAV format (fix sample rate to 16kHz to match realtime stream)
        var wavBuffer = this.pcmToWav(pcmData, 16000, 1, 16);
        var wavBlob = new Blob([wavBuffer], { type: 'audio/wav' });
        var audio = new Audio(URL.createObjectURL(wavBlob));

        // Play audio immediately in browser
        audio.play().then(function () {
            console.log('✅ Local audio playback started successfully');
        }).catch(function (e) {
            // If autoplay is blocked, try alternative approaches
            if (e.name === 'NotAllowedError') {
                console.log('🔇 Audio autoplay blocked - user interaction required');
            } else {
                console.warn('🎵 Audio play error:', e.message);
            }
        });

        // Reset playback flag when audio ends
        audio.addEventListener('ended', function () {
            self._isPlayingAudio = false;
            console.log('🔊 Local audio playback completed');
        });

        // Also reset after a timeout as fallback
        setTimeout(function () {
            self._isPlayingAudio = false;
        }, 10000); // 10 second max

    } catch (error) {
        console.error('❌ Local audio playback failed:', error.message);
        self._isPlayingAudio = false;
    }
};

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function () {
    var agentsManager = new AgentsManager();
    agentsManager.init();

    // Make globally available for debugging and onclick handlers
    window.agentsManager = agentsManager;
});
