/**
 * MonsterBox 4.0 - AI Settings Agents JavaScript
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

    // Initialize WebSocket chat if available
    this.initWebSocketChat();

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
        model: 'eleven_monolingual_v1',
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

    // Start WebSocket conversation if available
    if (this.useWebSocket && this.wsChat && this.wsChat.isConnected) {
        console.log('🚀 Starting WebSocket conversation with agent:', agentId);
        this.wsChat.startConversation(agentId);
        this.showChatMessage('System', 'Connecting to agent via WebSocket...', 'info');
    } else {
        console.log('📱 WebSocket not available, using HTTP fallback');
        this.showChatMessage('System', 'Connected via HTTP (slower responses)', 'warning');
    }

    var modalEl = document.getElementById('agentChatModal');
    if (modalEl) {
        var modal = new bootstrap.Modal(modalEl);
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

// Ask server to play the last reply through the assigned Character's speaker
AgentsManager.prototype.playLastReplyOnCharacterSpeaker = function () {
    var self = this;
    return this.getCurrentCharacterId().then(function (charId) {
        if (!charId) {
            self.showAlert('No Character selected', 'warning');
            return;
        }

        // Check if we have audio data from the last WebSocket response
        if (self._lastAudioData) {
            console.log('🔊 Playing last audio response on character speaker');
            return self.playAudioOnCharacterSpeaker(self._lastAudioData, charId);
        } else if (self._lastReplyText) {
            // If no audio but we have text, generate TTS and play
            console.log('🔊 Generating TTS for character speaker playback');
            return self.generateAndPlayTTSOnCharacterSpeaker(self._lastReplyText, charId);
        } else {
            self.showAlert('No audio or text to play', 'warning');
        }
    });
};

// Play audio data on character's configured speaker
AgentsManager.prototype.playAudioOnCharacterSpeaker = function (audioBase64, characterId) {
    var self = this;
    console.log('🔊 Playing audio on character speaker, length:', audioBase64.length);

    return fetch('/api/elevenlabs/play-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            audioData: audioBase64,
            characterId: characterId,
            format: 'mp3'
        })
    })
        .then(function (r) { return r.json(); })
        .then(function (d) {
            if (d && d.success !== false) {
                self.showAlert('Playing on Character speaker (' + (d.device || 'default') + ')', 'success');
            } else {
                self.showAlert('Character speaker playback failed: ' + (d && d.error || 'unknown'), 'danger');
            }
        })
        .catch(function (e) {
            console.error('Character speaker playback error', e);
            self.showAlert('Character speaker playback failed: ' + e.message, 'danger');
        });
};

// Generate TTS and play on character's configured speaker
AgentsManager.prototype.generateAndPlayTTSOnCharacterSpeaker = function (text, characterId) {
    var self = this;
    console.log('🔊 Generating TTS for character speaker:', text);

    return fetch('/api/elevenlabs/generate-and-play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            text: text,
            characterId: characterId
        })
    })
        .then(function (r) { return r.json(); })
        .then(function (d) {
            if (d && d.success !== false) {
                self.showAlert('TTS playing on Character speaker (' + (d.device || 'default') + ')', 'success');
            } else {
                self.showAlert('TTS generation failed: ' + (d && d.error || 'unknown'), 'danger');
            }
        })
        .catch(function (e) {
            console.error('TTS generation error', e);
            self.showAlert('TTS generation failed: ' + e.message, 'danger');
        });
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
        };

        this.wsChat.onConversationStarted = function (message) {
            console.log('✅ WebSocket conversation started with:', message.agentId);
            self.showChatMessage('System', 'Connected to agent - ready for instant chat!', 'success');
        };

        // Initialize audio chunk aggregation
        this._audioChunks = [];
        this._audioTimeout = null;

        this.wsChat.onAgentResponse = function (message) {
            var responseTime = Date.now() - self.lastMessageTime;
            console.log('🤖 Agent response in ' + responseTime + 'ms');

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

                // Clear existing timeout
                if (self._audioTimeout) {
                    clearTimeout(self._audioTimeout);
                }

                // Set timeout to play aggregated audio after brief pause
                self._audioTimeout = setTimeout(function () {
                    if (self._audioChunks.length > 0) {
                        // Play the largest audio chunk (usually the complete response)
                        var largestChunk = self._audioChunks.reduce(function (prev, current) {
                            return current.length > prev.length ? current : prev;
                        });

                        // Store the largest chunk for "Play on Character Speaker" button
                        self._lastAudioData = largestChunk;

                        self.playAudioChunk(largestChunk);
                        self._audioChunks = []; // Clear chunks after playing
                    }
                }, 500); // 500ms delay to aggregate chunks
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
    try {
        // Convert base64 to binary data
        var audioData = atob(audioBase64);
        var pcmData = new Uint8Array(audioData.length);
        for (var i = 0; i < audioData.length; i++) {
            pcmData[i] = audioData.charCodeAt(i);
        }

        // Convert PCM to WAV format
        var wavBuffer = this.pcmToWav(pcmData, 22050, 1, 16);
        var wavBlob = new Blob([wavBuffer], { type: 'audio/wav' });
        var audio = new Audio(URL.createObjectURL(wavBlob));

        // Play audio immediately
        audio.play().catch(function (e) {
            // If autoplay is blocked, try alternative approaches
            if (e.name === 'NotAllowedError') {
                console.log('🔇 Audio autoplay blocked - user interaction required');
            } else {
                console.warn('🎵 Audio play error:', e.message);
            }
        });

    } catch (error) {
        console.error('❌ Audio playback failed:', error.message);
    }
};

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function () {
    var agentsManager = new AgentsManager();
    agentsManager.init();

    // Make globally available for debugging and onclick handlers
    window.agentsManager = agentsManager;
});
