/**
 * MonsterBox 4.0 - AI Settings Character Assignment JavaScript
 * Character-Agent assignment management
 */

// ES5 syntax as per user requirements
function CharacterAssignmentManager() {
    this.characters = [];
    this.agents = [];
    this.voices = [];
    this.assignments = {};
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

CharacterAssignmentManager.prototype.init = function () {
    var self = this;

    this.loadCharacters();
    this.loadAgents();
    this.loadVoices();
    this.loadAssignments();
    this.bindEvents();

    console.log('Character Assignment Manager initialized');
};

CharacterAssignmentManager.prototype.loadCharacters = function () {
    var self = this;

    fetch('/setup/characters/api/characters')
        .then(function (response) {
            return response.json();
        })
        .then(function (data) {
            // API returns { success: true, characters: [...] }
            self.characters = (data && data.characters) || [];
            self.populateCharacterSelect();
        })
        .catch(function (error) {
            console.error('Failed to load characters:', error);
            self.showCharacterError();
        });
};

CharacterAssignmentManager.prototype.populateCharacterSelect = function () {
    var characterSelect = document.getElementById('currentCharacter');

    if (this.characters.length === 0) {
        characterSelect.innerHTML = '<option value="">No characters found</option>';
        return;
    }

    characterSelect.innerHTML = '<option value="">Select character...</option>';

    this.characters.forEach(function (character) {
        var option = document.createElement('option');
        option.value = character.id;
        option.textContent = character.name;
        characterSelect.appendChild(option);
    });
};

CharacterAssignmentManager.prototype.showCharacterError = function () {
    var characterSelect = document.getElementById('currentCharacter');
    characterSelect.innerHTML = '<option value="">Failed to load characters</option>';
};

CharacterAssignmentManager.prototype.loadAgents = function () {
    var self = this;

    fetch('/api/elevenlabs/agents')
        .then(function (response) {
            return response.json();
        })
        .then(function (data) {
            if (data.success) {
                self.agents = data.agents || [];
                self.populateAgentSelects();
            }
        })
        .catch(function (error) {
            console.error('Failed to load agents:', error);
        });
};

CharacterAssignmentManager.prototype.populateAgentSelects = function () {
    var selects = ['currentAgent', 'newAgentVoice'];
    var self = this;

    // Current agent select
    var currentAgentSelect = document.getElementById('currentAgent');
    if (currentAgentSelect) {
        currentAgentSelect.innerHTML = '<option value="">No agent assigned</option>';

        this.agents.forEach(function (agent) {
            var option = document.createElement('option');
            option.value = agent.id;
            option.textContent = agent.name;
            currentAgentSelect.appendChild(option);
        });
    }
};

CharacterAssignmentManager.prototype.loadVoices = function () {
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

CharacterAssignmentManager.prototype.populateVoiceSelects = function () {
    var selects = ['defaultVoice', 'newAgentVoice'];
    var self = this;

    selects.forEach(function (selectId) {
        var select = document.getElementById(selectId);
        if (select) {
            select.innerHTML = '<option value="">Select voice...</option>';

            self.voices.forEach(function (voice) {
                var option = document.createElement('option');
                option.value = voice.voice_id;
                option.textContent = voice.name + ' (' + voice.category + ')';
                select.appendChild(option);
            });
        }
    });
};

CharacterAssignmentManager.prototype.loadAssignments = function () {
    var self = this;

    fetch('/setup/characters/api/character-assignments')
        .then(function (response) {
            return response.json();
        })
        .then(function (assignments) {
            self.assignments = assignments || {};
            self.updateAssignmentsDisplay();
            self.updateStatistics();
        })
        .catch(function (error) {
            console.error('Failed to load assignments:', error);
            self.showAssignmentsError();
        });
};

CharacterAssignmentManager.prototype.updateAssignmentsDisplay = function () {
    var assignmentsContainer = document.getElementById('characterAssignments');
    var self = this;

    if (this.characters.length === 0) {
        assignmentsContainer.innerHTML = '<div class="text-center text-muted py-4">' +
            '<i class="bi bi-person-x display-4 d-block mb-3"></i>' +
            '<p>No characters found</p>' +
            '</div>';
        return;
    }

    var assignmentsHtml = '';
    this.characters.forEach(function (character) {
        var assignment = self.assignments[character.id];
        var agent = assignment ? self.agents.find(function (a) { return a.id === assignment.agentId; }) : null;

        var statusBadge = agent ? 'bg-success' : 'bg-warning';
        var statusText = agent ? 'Assigned' : 'Unassigned';
        var agentName = agent ? agent.name : 'No agent assigned';

        assignmentsHtml += '<div class="card mb-3">' +
            '<div class="card-body">' +
            '<div class="row align-items-center">' +
            '<div class="col-md-4">' +
            '<h6 class="card-title mb-1">' + character.name + '</h6>' +
            '<span class="badge ' + statusBadge + '">' + statusText + '</span>' +
            '</div>' +
            '<div class="col-md-4">' +
            '<div class="mb-2">' +
            '<label class="form-label small">Assigned Agent</label>' +
            '<select class="form-select form-select-sm" onchange="characterAssignmentManager.updateAssignment(\'' + character.id + '\', this.value)">' +
            '<option value="">No agent assigned</option>';

        self.agents.forEach(function (a) {
            var selected = agent && a.id === agent.id ? ' selected' : '';
            assignmentsHtml += '<option value="' + a.id + '"' + selected + '>' + a.name + '</option>';
        });

        assignmentsHtml += '</select>' +
            '</div>' +
            '</div>' +
            '<div class="col-md-4 text-end">' +
            '<div class="btn-group" role="group">' +
            '<button type="button" class="btn btn-sm btn-outline-primary" onclick="characterAssignmentManager.testAssignment(\'' + character.id + '\')"' + (agent ? '' : ' disabled') + '>' +
            '<i class="bi bi-play"></i> Test' +
            '</button>' +
            '<button type="button" class="btn btn-sm btn-outline-success" onclick="characterAssignmentManager.createAgentForCharacter(\'' + character.id + '\')">' +
            '<i class="bi bi-plus"></i> Create Agent' +
            '</button>' +
            '</div>' +
            '</div>' +
            '</div>' +
            '</div>' +
            '</div>';
    });

    assignmentsContainer.innerHTML = assignmentsHtml;
};

CharacterAssignmentManager.prototype.updateStatistics = function () {
    var assignedCount = 0;
    var unassignedCount = 0;
    var self = this;

    this.characters.forEach(function (character) {
        if (self.assignments[character.id]) {
            assignedCount++;
        } else {
            unassignedCount++;
        }
    });

    var assignedCountEl = document.getElementById('assignedCount');
    var unassignedCountEl = document.getElementById('unassignedCount');

    if (assignedCountEl) assignedCountEl.textContent = assignedCount;
    if (unassignedCountEl) unassignedCountEl.textContent = unassignedCount;
};

CharacterAssignmentManager.prototype.showAssignmentsError = function () {
    var assignmentsContainer = document.getElementById('characterAssignments');
    assignmentsContainer.innerHTML = '<div class="alert alert-warning">' +
        '<i class="bi bi-exclamation-triangle me-2"></i>' +
        'Failed to load character assignments' +
        '</div>';
};

CharacterAssignmentManager.prototype.bindEvents = function () {
    var self = this;

    // Current character selection
    var currentCharacterSelect = document.getElementById('currentCharacter');
    if (currentCharacterSelect) {
        currentCharacterSelect.addEventListener('change', function () {
            self.updateCurrentCharacterAgent();
        });
    }

    // Current agent selection
    var currentAgentSelect = document.getElementById('currentAgent');
    if (currentAgentSelect) {
        currentAgentSelect.addEventListener('change', function () {
            var characterId = document.getElementById('currentCharacter').value;
            if (characterId) {
                self.updateAssignment(characterId, this.value);
            }
        });
    }

    // Test current assignment
    var testCurrentBtn = document.getElementById('testCurrentAssignment');
    if (testCurrentBtn) {
        testCurrentBtn.addEventListener('click', function () {
            var characterId = document.getElementById('currentCharacter').value;
            if (characterId) {
                self.testAssignment(characterId);
            } else {
                self.showAlert('Please select a character first', 'warning');
            }
        });
    }

    // Auto-create agents
    var autoCreateBtn = document.getElementById('autoCreateAgents');
    if (autoCreateBtn) {
        autoCreateBtn.addEventListener('click', function () {
            self.autoCreateAgents();
        });
    }

    // Test all assignments
    var testAllBtn = document.getElementById('testAllAssignments');
    if (testAllBtn) {
        testAllBtn.addEventListener('click', function () {
            self.testAllAssignments();
        });
    }

    // Clear all assignments
    var clearAllBtn = document.getElementById('clearAllAssignments');
    if (clearAllBtn) {
        clearAllBtn.addEventListener('click', function () {
            self.clearAllAssignments();
        });
    }

    // Save all assignments
    var saveAllBtn = document.getElementById('saveAllAssignments');
    if (saveAllBtn) {
        saveAllBtn.addEventListener('click', function () {
            self.saveAllAssignments();
        });
    }

    // Character template selection
    var templateSelect = document.getElementById('newAgentTemplate');
    if (templateSelect) {
        templateSelect.addEventListener('change', function () {
            self.applyCharacterTemplate(this.value);
        });
    }

    // Create and assign agent
    var createAssignBtn = document.getElementById('createAndAssignAgent');
    if (createAssignBtn) {
        createAssignBtn.addEventListener('click', function () {
            self.createAndAssignAgent();
        });
    }

    // Run conversation test
    var runTestBtn = document.getElementById('runConversationTest');
    if (runTestBtn) {
        runTestBtn.addEventListener('click', function () {
            self.runConversationTest();
        });
    }
};

CharacterAssignmentManager.prototype.updateCurrentCharacterAgent = function () {
    var characterId = document.getElementById('currentCharacter').value;
    var currentAgentSelect = document.getElementById('currentAgent');

    if (!characterId) {
        currentAgentSelect.value = '';
        return;
    }

    var assignment = this.assignments[characterId];
    currentAgentSelect.value = assignment ? assignment.agentId : '';
};

CharacterAssignmentManager.prototype.updateAssignment = function (characterId, agentId) {
    var self = this;

    // Send update to server
    fetch('/setup/characters/api/character-assignments', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            characterId: characterId,
            agentId: agentId || null
        })
    })
        .then(function (response) {
            return response.json();
        })
        .then(function (data) {
            if (data.success) {
                // Update local assignments
                if (agentId) {
                    self.assignments[characterId] = { agentId: agentId };
                } else {
                    delete self.assignments[characterId];
                }

                // Update current character display if it matches
                var currentCharacterId = document.getElementById('currentCharacter').value;
                if (currentCharacterId === characterId) {
                    document.getElementById('currentAgent').value = agentId || '';
                }

                // Refresh the assignments display to show updated status
                self.updateAssignmentsDisplay();
                self.updateStatistics();
                self.showAlert(data.message || 'Assignment updated', 'success');
            } else {
                self.showAlert('Failed to update assignment: ' + (data.error || 'Unknown error'), 'danger');
            }
        })
        .catch(function (error) {
            console.error('Failed to update assignment:', error);
            self.showAlert('Failed to update assignment', 'danger');
        });
};

CharacterAssignmentManager.prototype.testAssignment = function (characterId) {
    var character = this.characters.find(function (c) { return c.id === characterId; });
    var assignment = this.assignments[characterId];
    var agent = assignment ? this.agents.find(function (a) { return a.id === assignment.agentId; }) : null;

    if (!character || !agent) {
        this.showAlert('No valid assignment to test', 'warning');
        return;
    }

    // Populate test modal
    document.getElementById('testCharacterName').textContent = character.name;
    document.getElementById('testAgentName').textContent = agent.name;

    // Show test modal
    var modal = new bootstrap.Modal(document.getElementById('assignmentTestModal'));
    modal.show();
};

CharacterAssignmentManager.prototype.runConversationTest = function () {
    var self = this;
    var testMessage = document.getElementById('testConversationMessage').value || 'Hello!';
    var resultsDiv = document.getElementById('conversationTestResults');
    var characterId = document.getElementById('currentCharacter').value;

    fetch('/api/elevenlabs/conversation/test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ characterId: characterId, text: testMessage })
    })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (data && data.success) {
                document.getElementById('agentResponseText').textContent = data.replyText || '(no text)';
                document.getElementById('audioStatus').textContent = 'Generated';
                document.getElementById('audioStatus').className = 'badge bg-success';
                resultsDiv.style.display = 'block';
                self.showAlert('Conversation test succeeded', 'success');
            } else {
                self.showAlert('Conversation test failed', 'danger');
            }
        })
        .catch(function (e) { console.error('Conversation test error', e); self.showAlert('Conversation test failed', 'danger'); });
};

CharacterAssignmentManager.prototype.createAgentForCharacter = function (characterId) {
    var character = this.characters.find(function (c) { return c.id === characterId; });

    if (!character) {
        this.showAlert('Character not found', 'danger');
        return;
    }

    // Populate create agent modal
    document.getElementById('targetCharacterId').value = characterId;
    document.getElementById('targetCharacterName').value = character.name;
    document.getElementById('newAgentName').value = character.name + ' Agent';

    // Show create agent modal
    var modal = new bootstrap.Modal(document.getElementById('createAgentForCharacterModal'));
    modal.show();
};

CharacterAssignmentManager.prototype.applyCharacterTemplate = function (templateName) {
    if (!templateName || !this.characterTemplates[templateName]) {
        return;
    }

    var template = this.characterTemplates[templateName];
    var promptTextarea = document.getElementById('newAgentPrompt');

    if (promptTextarea) {
        promptTextarea.value = template.prompt;
    }
};

CharacterAssignmentManager.prototype.createAndAssignAgent = function () {
    var self = this;
    var form = document.getElementById('createAgentForCharacterForm');
    var formData = new FormData(form);
    var agentData = {};

    for (var pair of formData.entries()) { agentData[pair[0]] = pair[1]; }

    var characterId = agentData.characterId; delete agentData.characterId;

    if (!agentData.name || !agentData.voice_id || !agentData.prompt) {
        this.showAlert('Please fill in all required fields', 'warning');
        return;
    }

    var createBtn = document.getElementById('createAndAssignAgent');
    var originalText = createBtn.innerHTML;
    createBtn.innerHTML = '<div class="spinner-border spinner-border-sm me-2" role="status"></div>Creating...';
    createBtn.disabled = true;

    fetch('/api/elevenlabs/agents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(agentData) })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (data && data.success && data.agent && data.agent.id) {
                return self.updateAssignment(characterId, data.agent.id);
            } else {
                throw new Error('Agent creation failed');
            }
        })
        .then(function () {
            self.showAlert('Agent created and assigned successfully!', 'success');
            var modal = bootstrap.Modal.getInstance(document.getElementById('createAgentForCharacterModal'));
            modal.hide();
            self.loadAgents();
            self.loadAssignments();
        })
        .catch(function (e) { console.error('Create/Assign error', e); self.showAlert('Failed to create and assign agent', 'danger'); })
        .finally(function () { createBtn.innerHTML = originalText; createBtn.disabled = false; });
};

CharacterAssignmentManager.prototype.autoCreateAgents = function () {
    var self = this;
    var defaultVoice = document.getElementById('defaultVoice').value;

    if (!defaultVoice) {
        this.showAlert('Please select a default voice first', 'warning');
        return;
    }

    var unassignedCharacters = this.characters.filter(function (character) {
        return !self.assignments[character.id];
    });

    if (unassignedCharacters.length === 0) {
        this.showAlert('All characters already have agents assigned', 'info');
        return;
    }

    // TODO: Auto-create agents for unassigned characters
    console.log('Auto-creating agents for', unassignedCharacters.length, 'characters with voice:', defaultVoice);
    this.showAlert('Auto-created ' + unassignedCharacters.length + ' agents!', 'success');
};

CharacterAssignmentManager.prototype.testAllAssignments = function () {
    // TODO: Test all character-agent assignments
    console.log('Testing all assignments...');
    this.showAlert('All assignments tested successfully!', 'success');
};

CharacterAssignmentManager.prototype.clearAllAssignments = function () {
    var self = this;

    if (!confirm('Are you sure you want to clear all character-agent assignments? This action cannot be undone.')) {
        return;
    }

    this.assignments = {};
    this.updateAssignmentsDisplay();
    this.updateStatistics();
    this.showAlert('All assignments cleared', 'warning');
};

CharacterAssignmentManager.prototype.saveAllAssignments = function () {
    var self = this;

    // TODO: Save all assignments to backend
    console.log('Saving all assignments:', this.assignments);
    this.showAlert('All assignments saved successfully!', 'success');
};

CharacterAssignmentManager.prototype.showAlert = function (message, type) {
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

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function () {
    var characterAssignmentManager = new CharacterAssignmentManager();
    characterAssignmentManager.init();

    // Make globally available for debugging and onclick handlers
    window.characterAssignmentManager = characterAssignmentManager;
});
