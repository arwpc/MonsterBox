/**
 * MonsterBox 4.0 - AI Settings JavaScript
 * Rebuilt from scratch using proper Bootstrap patterns
 */

// ES5 syntax as per user requirements
function AISettingsManager() {
    this.config = {
        apiKey: null,
        configured: false
    };
    this.stats = {
        agents: 0,
        voices: 0,
        characters: 0,
        assignments: 0
    };
}

AISettingsManager.prototype.init = function () {
    var self = this;

    // Load configuration status on page load
    this.loadConfigurationStatus();
    this.loadStats();
    this.bindEvents();

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

        // Test connection automatically
        this.testConnection(connectionStatus);

        this.config.configured = true;
        this.config.apiKey = data.apiKey;
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

    // Load agents count
    fetch('/api/elevenlabs/agents')
        .then(function (response) {
            return response.json();
        })
        .then(function (data) {
            if (data.success) {
                self.stats.agents = data.agents.length;
                self.updateStatsDisplay();
            }
        })
        .catch(function (error) {
            console.error('Failed to load agents:', error);
        });

    // Load voices count
    fetch('/api/elevenlabs/voices')
        .then(function (response) {
            return response.json();
        })
        .then(function (data) {
            if (data.success) {
                self.stats.voices = data.voices.length;
                self.updateStatsDisplay();
            }
        })
        .catch(function (error) {
            console.error('Failed to load voices:', error);
        });

    // Load characters count (placeholder - would need actual API)
    self.stats.characters = 1; // Placeholder
    self.stats.assignments = 0; // Placeholder
    self.updateStatsDisplay();
};

AISettingsManager.prototype.updateStatsDisplay = function () {
    var agentCountEl = document.getElementById('agentCount');
    var voiceCountEl = document.getElementById('voiceCount');
    var characterCountEl = document.getElementById('characterCount');
    var assignmentCountEl = document.getElementById('assignmentCount');

    if (agentCountEl) agentCountEl.textContent = this.stats.agents;
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

    // Quick Action buttons
    var createAgentBtn = document.getElementById('createAgent');
    if (createAgentBtn) {
        createAgentBtn.addEventListener('click', function () {
            window.location.href = '/ai-settings/agents';
        });
    }

    var testConversationBtn = document.getElementById('testConversation');
    if (testConversationBtn) {
        testConversationBtn.addEventListener('click', async function () {
            try {
                // Get current character
                const curRes = await fetch('/setup/characters/api/current');
                const cur = await curRes.json();
                const characterId = cur && cur.selectedCharacter ? cur.selectedCharacter : null;

                var prompt = window.prompt('Enter a test prompt to send to the AI:', 'Happy Halloween!');
                if (!prompt) return;

                const resp = await fetch('/api/elevenlabs/conversation/test', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ characterId: characterId, text: prompt })
                });
                const data = await resp.json();
                if (data && data.success) {
                    self.showAlert('AI replied: ' + data.replyText, 'success');
                } else {
                    self.showAlert('Conversation failed: ' + (data.error || 'Unknown error'), 'danger');
                }
            } catch (e) {
                console.error('Test conversation failed:', e);
                self.showAlert('Test conversation failed', 'danger');
            }
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

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function () {
    var aiSettings = new AISettingsManager();
    aiSettings.init();

    // Make globally available for debugging
    window.aiSettings = aiSettings;
});
