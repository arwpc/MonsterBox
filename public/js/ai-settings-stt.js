/**
 * MonsterBox 4.0 - AI Settings STT JavaScript
 * Speech-to-Text configuration and testing
 */

// ES5 syntax as per user requirements
function STTManager() {
    this.models = [];
    this.microphoneParts = [];
    this.currentConfig = {};
    this.mediaRecorder = null;
    this.chunks = [];
    this.stream = null;
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

    fetch('/api/elevenlabs/stt/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
    })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (data && data.success) self.showAlert('STT configuration saved successfully!', 'success');
            else self.showAlert('Failed to save STT configuration', 'danger');
        })
        .catch(function (e) {
            console.error('Save STT config error', e);
            self.showAlert('Failed to save STT configuration', 'danger');
        });
};

STTManager.prototype.testSTTConfiguration = function () {
    var self = this;
    fetch('/api/elevenlabs/stt/capabilities')
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (data && data.success !== false) self.showAlert('STT capabilities fetched successfully.', 'success');
            else self.showAlert('Failed to fetch STT capabilities', 'danger');
        })
        .catch(function (e) {
            console.error('STT capabilities error', e);
            self.showAlert('Failed to fetch STT capabilities', 'danger');
        });
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
    formData.append('audio', file);

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
    var startBtn = document.getElementById('startRecording');
    var stopBtn = document.getElementById('stopRecording');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        this.showAlert('getUserMedia not supported in this browser', 'danger');
        return;
    }

    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
        self.stream = stream;
        try {
            self.mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        } catch (e) {
            console.warn('MediaRecorder mimeType not supported, falling back');
            self.mediaRecorder = new MediaRecorder(stream);
        }
        self.chunks = [];
        self.mediaRecorder.ondataavailable = function (ev) {
            if (ev.data && ev.data.size > 0) self.chunks.push(ev.data);
        };
        self.mediaRecorder.onstop = function () {
            var blob = new Blob(self.chunks, { type: 'audio/webm' });
            var form = new FormData();
            form.append('audio', blob, 'recording.webm');
            fetch('/api/elevenlabs/stt/transcribe', { method: 'POST', body: form })
                .then(function (r) { return r.json(); })
                .then(function (data) {
                    if (data && data.success) self.showTranscriptionResults(data);
                    else self.showAlert('Transcription failed: ' + (data && data.error || 'Unknown'), 'danger');
                })
                .catch(function (e) {
                    console.error('Transcribe error', e);
                    self.showAlert('Transcription failed', 'danger');
                });
        };
        self.mediaRecorder.start();
        startBtn.disabled = true;
        stopBtn.disabled = false;
        self.showAlert('Recording started', 'info');
    }).catch(function (err) {
        console.error('getUserMedia error', err);
        self.showAlert('Microphone access denied', 'danger');
    });
};

STTManager.prototype.stopRecording = function () {
    var self = this;
    var startBtn = document.getElementById('startRecording');
    var stopBtn = document.getElementById('stopRecording');

    try {
        if (self.mediaRecorder && self.mediaRecorder.state !== 'inactive') {
            self.mediaRecorder.stop();
        }
        if (self.stream) {
            self.stream.getTracks().forEach(function (t) { t.stop(); });
            self.stream = null;
        }
        self.showAlert('Recording stopped', 'info');
    } catch (e) {
        console.warn('Stop recording error', e);
    }

    startBtn.disabled = false;
    stopBtn.disabled = true;
};

STTManager.prototype.testMicrophoneIntegration = function () {
    var self = this;
    var microphoneSelect = document.getElementById('microphonePart');

    if (!microphoneSelect.value) {
        this.showAlert('Please select a microphone part first', 'warning');
        return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        this.showAlert('getUserMedia not supported in this browser', 'danger');
        return;
    }

    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
        // Immediately stop to verify permissions/integration
        stream.getTracks().forEach(function (t) { t.stop(); });
        self.showAlert('Microphone is accessible and working!', 'success');
    }).catch(function (err) {
        console.error('Microphone test error', err);
        self.showAlert('Microphone access failed', 'danger');
    });
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
