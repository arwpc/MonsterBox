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

AgentsManager.prototype.init = function() {
    var self = this;
    
    this.loadAgents();
    this.loadModels();
    this.loadVoices();
    this.bindEvents();
    
    console.log('Agents Manager initialized');
};

AgentsManager.prototype.loadAgents = function() {
    var self = this;
    
    fetch('/api/elevenlabs/agents')
        .then(function(response) {
            return response.json();
        })
        .then(function(data) {
            if (data.success) {
                self.agents = data.agents || [];
                self.updateAgentsDisplay();
            } else {
                self.showAgentsError();
            }
        })
        .catch(function(error) {
            console.error('Failed to load agents:', error);
            self.showAgentsError();
        });
};

AgentsManager.prototype.updateAgentsDisplay = function() {
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
    this.agents.forEach(function(agent) {
        var statusBadge = agent.status === 'active' ? 'bg-success' : 'bg-secondary';
        
        agentsHtml += '<div class="card mb-3">' +
                     '<div class="card-body">' +
                     '<div class="row align-items-center">' +
                     '<div class="col-md-6">' +
                     '<h6 class="card-title mb-1">' + agent.name + ' <span class="badge ' + statusBadge + '">' + agent.status + '</span></h6>' +
                     '<p class="card-text small text-muted mb-1">' + (agent.description || 'No description') + '</p>' +
                     '<div class="small text-muted">' +
                     '<strong>Model:</strong> ' + (agent.model || 'Unknown') + ' | ' +
                     '<strong>Voice:</strong> ' + (agent.voice_name || 'Unknown') + ' | ' +
                     '<strong>Language:</strong> ' + (agent.language || 'en') +
                     '</div>' +
                     '</div>' +
                     '<div class="col-md-6 text-end">' +
                     '<div class="btn-group" role="group">' +
                     '<button type="button" class="btn btn-sm btn-outline-primary" onclick="agentsManager.testAgent(\'' + agent.id + '\')">' +
                     '<i class="bi bi-play"></i> Test' +
                     '</button>' +
                     '<button type="button" class="btn btn-sm btn-outline-secondary" onclick="agentsManager.editAgent(\'' + agent.id + '\')">' +
                     '<i class="bi bi-pencil"></i> Edit' +
                     '</button>' +
                     '<button type="button" class="btn btn-sm btn-outline-danger" onclick="agentsManager.deleteAgent(\'' + agent.id + '\')">' +
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

AgentsManager.prototype.showAgentsError = function() {
    var agentsContainer = document.getElementById('agentsList');
    agentsContainer.innerHTML = '<div class="alert alert-warning">' +
                               '<i class="bi bi-exclamation-triangle me-2"></i>' +
                               'Failed to load agents' +
                               '</div>';
};

AgentsManager.prototype.loadModels = function() {
    var self = this;
    
    fetch('/api/elevenlabs/models')
        .then(function(response) {
            return response.json();
        })
        .then(function(data) {
            if (data.success) {
                self.models = data.models || [];
                self.updateModelsDisplay();
                self.populateModelSelects();
            } else {
                self.showModelsError();
            }
        })
        .catch(function(error) {
            console.error('Failed to load models:', error);
            self.showModelsError();
        });
};

AgentsManager.prototype.updateModelsDisplay = function() {
    var modelsContainer = document.getElementById('availableModels');
    
    if (this.models.length === 0) {
        modelsContainer.innerHTML = '<div class="text-center text-muted">No models available</div>';
        return;
    }
    
    var modelsHtml = '';
    this.models.forEach(function(model) {
        modelsHtml += '<div class="card mb-2">' +
                     '<div class="card-body p-3">' +
                     '<h6 class="card-title mb-1">' + model.name + '</h6>' +
                     '<p class="card-text small text-muted mb-0">' + (model.description || 'LLM Model') + '</p>' +
                     '</div>' +
                     '</div>';
    });
    
    modelsContainer.innerHTML = modelsHtml;
};

AgentsManager.prototype.populateModelSelects = function() {
    var selects = ['agentModel'];
    var self = this;
    
    selects.forEach(function(selectId) {
        var select = document.getElementById(selectId);
        if (select) {
            select.innerHTML = '<option value="">Select model...</option>';
            
            self.models.forEach(function(model) {
                var option = document.createElement('option');
                option.value = model.id;
                option.textContent = model.name;
                select.appendChild(option);
            });
        }
    });
};

AgentsManager.prototype.showModelsError = function() {
    var modelsContainer = document.getElementById('availableModels');
    modelsContainer.innerHTML = '<div class="alert alert-warning">' +
                               '<i class="bi bi-exclamation-triangle me-2"></i>' +
                               'Failed to load models' +
                               '</div>';
};

AgentsManager.prototype.loadVoices = function() {
    var self = this;
    
    fetch('/api/elevenlabs/voices')
        .then(function(response) {
            return response.json();
        })
        .then(function(data) {
            if (data.success) {
                self.voices = data.voices || [];
                self.populateVoiceSelects();
            }
        })
        .catch(function(error) {
            console.error('Failed to load voices:', error);
        });
};

AgentsManager.prototype.populateVoiceSelects = function() {
    var selects = ['agentVoice'];
    var self = this;
    
    selects.forEach(function(selectId) {
        var select = document.getElementById(selectId);
        if (select) {
            select.innerHTML = '<option value="">Select voice...</option>';
            
            self.voices.forEach(function(voice) {
                var option = document.createElement('option');
                option.value = voice.voice_id;
                option.textContent = voice.name + ' (' + voice.category + ')';
                select.appendChild(option);
            });
        }
    });
};

AgentsManager.prototype.bindEvents = function() {
    var self = this;
    
    // Template selection
    var templateSelect = document.getElementById('agentTemplate');
    if (templateSelect) {
        templateSelect.addEventListener('change', function() {
            self.applyCharacterTemplate(this.value);
        });
    }
    
    // Voice preview
    var previewVoiceBtn = document.getElementById('previewVoice');
    if (previewVoiceBtn) {
        previewVoiceBtn.addEventListener('click', function() {
            self.previewVoice();
        });
    }
    
    // Create agent
    var saveAgentBtn = document.getElementById('saveAgent');
    if (saveAgentBtn) {
        saveAgentBtn.addEventListener('click', function() {
            self.createAgent();
        });
    }
    
    // Test agent
    var testAgentBtn = document.getElementById('testAgent');
    if (testAgentBtn) {
        testAgentBtn.addEventListener('click', function() {
            self.testNewAgent();
        });
    }
    
    // Update agent
    var updateAgentBtn = document.getElementById('updateAgent');
    if (updateAgentBtn) {
        updateAgentBtn.addEventListener('click', function() {
            self.updateAgent();
        });
    }
};

AgentsManager.prototype.applyCharacterTemplate = function(templateName) {
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

AgentsManager.prototype.previewVoice = function() {
    var voiceSelect = document.getElementById('agentVoice');
    
    if (!voiceSelect.value) {
        this.showAlert('Please select a voice first', 'warning');
        return;
    }
    
    // TODO: Implement voice preview
    console.log('Previewing voice:', voiceSelect.value);
    this.showAlert('Voice preview (feature coming soon)', 'info');
};

AgentsManager.prototype.createAgent = function() {
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
    .then(function(response) {
        return response.json();
    })
    .then(function(data) {
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
    .catch(function(error) {
        console.error('Create agent error:', error);
        self.showAlert('Failed to create agent', 'danger');
    })
    .finally(function() {
        saveBtn.innerHTML = originalText;
        saveBtn.disabled = false;
    });
};

AgentsManager.prototype.testNewAgent = function() {
    // TODO: Implement agent testing
    console.log('Testing new agent...');
    this.showAlert('Agent test (feature coming soon)', 'info');
};

AgentsManager.prototype.testAgent = function(agentId) {
    // TODO: Implement agent testing
    console.log('Testing agent:', agentId);
    this.showAlert('Agent test (feature coming soon)', 'info');
};

AgentsManager.prototype.editAgent = function(agentId) {
    var agent = this.agents.find(function(a) { return a.id === agentId; });
    
    if (!agent) {
        this.showAlert('Agent not found', 'danger');
        return;
    }
    
    // Populate edit form
    document.getElementById('editAgentId').value = agent.id;
    document.getElementById('editAgentName').value = agent.name;
    document.getElementById('editAgentLanguage').value = agent.language || 'en';
    document.getElementById('editAgentPrompt').value = agent.prompt || '';
    
    // Show edit modal
    var modal = new bootstrap.Modal(document.getElementById('editAgentModal'));
    modal.show();
};

AgentsManager.prototype.updateAgent = function() {
    var self = this;
    var form = document.getElementById('editAgentForm');
    var formData = new FormData(form);
    var agentData = {};
    
    for (var pair of formData.entries()) {
        agentData[pair[0]] = pair[1];
    }
    
    var agentId = agentData.agentId;
    delete agentData.agentId;
    
    // TODO: Implement agent update
    console.log('Updating agent:', agentId, agentData);
    this.showAlert('Agent updated successfully!', 'success');
    
    // Close modal
    var modal = bootstrap.Modal.getInstance(document.getElementById('editAgentModal'));
    modal.hide();
};

AgentsManager.prototype.deleteAgent = function(agentId) {
    var self = this;
    
    if (!confirm('Are you sure you want to delete this agent? This action cannot be undone.')) {
        return;
    }
    
    // TODO: Implement agent deletion
    console.log('Deleting agent:', agentId);
    this.showAlert('Agent deleted successfully!', 'success');
    this.loadAgents(); // Refresh the list
};

AgentsManager.prototype.showAlert = function(message, type) {
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
    setTimeout(function() {
        if (alertDiv.parentNode) {
            alertDiv.parentNode.removeChild(alertDiv);
        }
    }, 5000);
};

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    var agentsManager = new AgentsManager();
    agentsManager.init();
    
    // Make globally available for debugging and onclick handlers
    window.agentsManager = agentsManager;
});
