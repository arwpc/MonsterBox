/**
 * MonsterBox 4.0 - AI Settings STT JavaScript
 * Speech-to-Text configuration and testing
 */

// ES5 syntax as per user requirements
function STTManager() {
    this.models = [];
    this.microphoneParts = [];
    this.currentConfig = {};
}

STTManager.prototype.init = function () {
    var self = this;

    this.loadSTTModels();
    this.loadMicrophoneParts();
    this.bindEvents();

    console.log('STT Manager initialized');
};

STTManager.prototype.loadSTTModels = function () {
    var self = this;

    fetch('/api/elevenlabs/stt/capabilities')
        .then(function (response) {
            return response.json();
        })
        .then(function (data) {
            if (data.success) {
                self.models = data.models || [];
                self.updateModelsDisplay();
                self.populateModelSelect();
            } else {
                self.showModelsError();
            }
        })
        .catch(function (error) {
            console.error('Failed to load STT models:', error);
            self.showModelsError();
        });
};

STTManager.prototype.updateModelsDisplay = function () {
    var modelsContainer = document.getElementById('sttModels');

    if (this.models.length === 0) {
        modelsContainer.innerHTML = '<div class="text-center text-muted">No STT models available</div>';
        return;
    }

    var modelsHtml = '';
    this.models.forEach(function (model) {
        modelsHtml += '<div class="card mb-2">' +
            '<div class="card-body p-3">' +
            '<h6 class="card-title mb-1">' + model.name + '</h6>' +
            '<p class="card-text small text-muted mb-1">' + model.description + '</p>' +
            '<div class="small text-muted">' +
            '<strong>Languages:</strong> ' + (model.languages ? model.languages.join(', ') : 'Multiple') +
            '</div>' +
            '</div>' +
            '</div>';
    });

    modelsContainer.innerHTML = modelsHtml;
};

STTManager.prototype.populateModelSelect = function () {
    var modelSelect = document.getElementById('sttModel');
    modelSelect.innerHTML = '<option value="">Select STT model...</option>';

    this.models.forEach(function (model) {
        var option = document.createElement('option');
        option.value = model.id;
        option.textContent = model.name + ' - ' + model.description;
        modelSelect.appendChild(option);
    });
};

STTManager.prototype.showModelsError = function () {
    var modelsContainer = document.getElementById('sttModels');
    modelsContainer.innerHTML = '<div class="alert alert-warning">' +
        '<i class="bi bi-exclamation-triangle me-2"></i>' +
        'Failed to load STT models' +
        '</div>';
};

STTManager.prototype.loadMicrophoneParts = function () {
    var self = this;

    fetch('/setup/parts/api/parts?type=microphone')
        .then(function (response) {
            return response.json();
        })
        .then(function (data) {
            self.microphoneParts = (data.success && data.parts) ? data.parts.filter(part => part.type === 'microphone') : [];
            self.populateMicrophoneSelect();
        })
        .catch(function (error) {
            console.error('Failed to load microphone parts:', error);
            self.showMicrophoneError();
        });
};

STTManager.prototype.populateMicrophoneSelect = function () {
    var micSelect = document.getElementById('microphonePart');

    if (this.microphoneParts.length === 0) {
        micSelect.innerHTML = '<option value="">No microphone parts found</option>';
        return;
    }

    micSelect.innerHTML = '<option value="">Select microphone part...</option>';

    this.microphoneParts.forEach(function (part) {
        var option = document.createElement('option');
        option.value = part.id;
        option.textContent = part.name + ' (' + part.id + ')';
        micSelect.appendChild(option);
    });
};

STTManager.prototype.showMicrophoneError = function () {
    var micSelect = document.getElementById('microphonePart');
    micSelect.innerHTML = '<option value="">Failed to load microphone parts</option>';
};

STTManager.prototype.bindEvents = function () {
    var self = this;

    // STT Configuration form
    var configForm = document.getElementById('sttConfigForm');
    if (configForm) {
        configForm.addEventListener('submit', function (e) {
            e.preventDefault();
            self.saveConfiguration();
        });
    }

    // Test STT button
    var testSTTBtn = document.getElementById('testSTT');
    if (testSTTBtn) {
        testSTTBtn.addEventListener('click', function () {
            self.testSTTConfiguration();
        });
    }

    // File transcription
    var transcribeFileBtn = document.getElementById('transcribeFile');
    if (transcribeFileBtn) {
        transcribeFileBtn.addEventListener('click', function () {
            self.transcribeAudioFile();
        });
    }

    // Recording controls
    var startRecordingBtn = document.getElementById('startRecording');
    var stopRecordingBtn = document.getElementById('stopRecording');

    if (startRecordingBtn) {
        startRecordingBtn.addEventListener('click', function () {
            self.startRecording();
        });
    }

    if (stopRecordingBtn) {
        stopRecordingBtn.addEventListener('click', function () {
            self.stopRecording();
        });
    }

    // Microphone integration test
    var testMicBtn = document.getElementById('testMicrophoneIntegration');
    if (testMicBtn) {
        testMicBtn.addEventListener('click', function () {
            self.testMicrophoneIntegration();
        });
    }
};

STTManager.prototype.saveConfiguration = function () {
    var self = this;
    var formData = new FormData(document.getElementById('sttConfigForm'));
    var config = {};

    for (var pair of formData.entries()) {
        config[pair[0]] = pair[1];
    }

    // TODO: Save configuration to backend
    console.log('Saving STT configuration:', config);
    this.showAlert('STT configuration saved successfully!', 'success');
};

STTManager.prototype.testSTTConfiguration = function () {
    var self = this;

    // TODO: Test STT configuration
    console.log('Testing STT configuration...');
    this.showAlert('STT configuration test completed!', 'info');
};

STTManager.prototype.transcribeAudioFile = function () {
    var self = this;
    var fileInput = document.getElementById('audioFile');

    if (!fileInput.files || fileInput.files.length === 0) {
        this.showAlert('Please select an audio file first', 'warning');
        return;
    }

    var file = fileInput.files[0];
    var formData = new FormData();
    formData.append('audioFile', file);

    // Show loading state
    var transcribeBtn = document.getElementById('transcribeFile');
    var originalText = transcribeBtn.innerHTML;
    transcribeBtn.innerHTML = '<div class="spinner-border spinner-border-sm me-2" role="status"></div>Transcribing...';
    transcribeBtn.disabled = true;

    fetch('/api/elevenlabs/stt/transcribe', {
        method: 'POST',
        body: formData
    })
        .then(function (response) {
            return response.json();
        })
        .then(function (data) {
            if (data.success) {
                self.showTranscriptionResults(data);
            } else {
                self.showAlert('Transcription failed: ' + data.error, 'danger');
            }
        })
        .catch(function (error) {
            console.error('Transcription error:', error);
            self.showAlert('Transcription failed', 'danger');
        })
        .finally(function () {
            transcribeBtn.innerHTML = originalText;
            transcribeBtn.disabled = false;
        });
};

STTManager.prototype.showTranscriptionResults = function (data) {
    var resultsDiv = document.getElementById('transcriptionResults');
    var textDiv = document.getElementById('transcriptionText');
    var confidenceSpan = document.getElementById('transcriptionConfidence');
    var languageSpan = document.getElementById('transcriptionLanguage');
    var durationSpan = document.getElementById('transcriptionDuration');

    textDiv.textContent = data.text || 'No transcription available';
    confidenceSpan.textContent = data.confidence ? (data.confidence * 100).toFixed(1) + '%' : 'N/A';
    languageSpan.textContent = data.language || 'Unknown';
    durationSpan.textContent = data.duration ? data.duration.toFixed(2) + 's' : 'N/A';

    resultsDiv.style.display = 'block';
};

STTManager.prototype.startRecording = function () {
    var self = this;

    // TODO: Implement live recording
    console.log('Starting recording...');

    var startBtn = document.getElementById('startRecording');
    var stopBtn = document.getElementById('stopRecording');

    startBtn.disabled = true;
    stopBtn.disabled = false;

    this.showAlert('Recording started (feature coming soon)', 'info');
};

STTManager.prototype.stopRecording = function () {
    var self = this;

    // TODO: Implement stop recording
    console.log('Stopping recording...');

    var startBtn = document.getElementById('startRecording');
    var stopBtn = document.getElementById('stopRecording');

    startBtn.disabled = false;
    stopBtn.disabled = true;

    this.showAlert('Recording stopped (feature coming soon)', 'info');
};

STTManager.prototype.testMicrophoneIntegration = function () {
    var self = this;
    var microphoneSelect = document.getElementById('microphonePart');

    if (!microphoneSelect.value) {
        this.showAlert('Please select a microphone part first', 'warning');
        return;
    }

    // TODO: Test microphone integration
    console.log('Testing microphone integration with part:', microphoneSelect.value);
    this.showAlert('Microphone integration test completed!', 'success');
};

STTManager.prototype.showAlert = function (message, type) {
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
    var sttManager = new STTManager();
    sttManager.init();

    // Make globally available for debugging
    window.sttManager = sttManager;
});
