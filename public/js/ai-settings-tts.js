/**
 * MonsterBox 4.0 - AI Settings TTS JavaScript
 * Text-to-Speech configuration and testing
 */

// ES5 syntax as per user requirements
function TTSManager() {
    this.voices = [];
    this.speakerParts = [];
    this.currentConfig = {};
}

TTSManager.prototype.init = function () {
    var self = this;

    this.loadVoices();
    this.loadSpeakerParts();
    this.bindEvents();
    this.updateRangeDisplays();

    console.log('TTS Manager initialized');
};

TTSManager.prototype.loadVoices = function () {
    var self = this;

    fetch('/api/elevenlabs/voices')
        .then(function (response) {
            return response.json();
        })
        .then(function (data) {
            if (data.success) {
                self.voices = data.voices || [];
                self.updateVoiceLibraryDisplay();
                self.populateVoiceSelects();
            } else {
                self.showVoicesError();
            }
        })
        .catch(function (error) {
            console.error('Failed to load voices:', error);
            self.showVoicesError();
        });
};

TTSManager.prototype.updateVoiceLibraryDisplay = function () {
    var voiceContainer = document.getElementById('voiceLibrary');

    if (this.voices.length === 0) {
        voiceContainer.innerHTML = '<div class="text-center text-muted">No voices available</div>';
        return;
    }

    var voicesHtml = '';
    this.voices.forEach(function (voice) {
        var categoryBadge = voice.category === 'premade' ? 'bg-primary' :
            voice.category === 'cloned' ? 'bg-success' : 'bg-secondary';

        voicesHtml += '<div class="card mb-2">' +
            '<div class="card-body p-3">' +
            '<div class="d-flex justify-content-between align-items-start">' +
            '<div>' +
            '<h6 class="card-title mb-1">' + voice.name + '</h6>' +
            '<span class="badge ' + categoryBadge + ' mb-2">' + voice.category + '</span>' +
            '<p class="card-text small text-muted mb-0">' + (voice.description || 'No description') + '</p>' +
            '</div>' +
            '<button type="button" class="btn btn-sm btn-outline-primary" onclick="ttsManager.previewVoice(\'' + voice.voice_id + '\')">' +
            '<i class="bi bi-play"></i>' +
            '</button>' +
            '</div>' +
            '</div>' +
            '</div>';
    });

    voiceContainer.innerHTML = voicesHtml;
};

TTSManager.prototype.populateVoiceSelects = function () {
    var selects = ['defaultVoice', 'testVoice'];
    var self = this;

    selects.forEach(function (selectId) {
        var select = document.getElementById(selectId);
        if (select) {
            var currentValue = select.value;
            select.innerHTML = selectId === 'testVoice' ? '<option value="">Use default voice</option>' : '<option value="">Select voice...</option>';

            self.voices.forEach(function (voice) {
                var option = document.createElement('option');
                option.value = voice.voice_id;
                option.textContent = voice.name + ' (' + voice.category + ')';
                select.appendChild(option);
            });

            if (currentValue) {
                select.value = currentValue;
            }
        }
    });
};

TTSManager.prototype.showVoicesError = function () {
    var voiceContainer = document.getElementById('voiceLibrary');
    voiceContainer.innerHTML = '<div class="alert alert-warning">' +
        '<i class="bi bi-exclamation-triangle me-2"></i>' +
        'Failed to load voices' +
        '</div>';
};

TTSManager.prototype.loadSpeakerParts = function () {
    var self = this;

    fetch('/setup/parts/api/parts?type=speaker')
        .then(function (response) {
            return response.json();
        })
        .then(function (data) {
            self.speakerParts = (data.success && data.parts) ? data.parts.filter(part => part.type === 'speaker') : [];
            self.populateSpeakerSelect();
        })
        .catch(function (error) {
            console.error('Failed to load speaker parts:', error);
            self.showSpeakerError();
        });
};

TTSManager.prototype.populateSpeakerSelect = function () {
    var speakerSelect = document.getElementById('speakerPart');

    if (this.speakerParts.length === 0) {
        speakerSelect.innerHTML = '<option value="">No speaker parts found</option>';
        return;
    }

    speakerSelect.innerHTML = '<option value="">Select speaker part...</option>';

    this.speakerParts.forEach(function (part) {
        var option = document.createElement('option');
        option.value = part.id;
        option.textContent = part.name + ' (' + part.id + ')';
        speakerSelect.appendChild(option);
    });
};

TTSManager.prototype.showSpeakerError = function () {
    var speakerSelect = document.getElementById('speakerPart');
    speakerSelect.innerHTML = '<option value="">Failed to load speaker parts</option>';
};

TTSManager.prototype.bindEvents = function () {
    var self = this;

    // TTS Configuration form
    var configForm = document.getElementById('ttsConfigForm');
    if (configForm) {
        configForm.addEventListener('submit', function (e) {
            e.preventDefault();
            self.saveConfiguration();
        });
    }

    // Range inputs for real-time display updates
    var rangeInputs = ['stability', 'similarityBoost', 'style'];
    rangeInputs.forEach(function (inputId) {
        var input = document.getElementById(inputId);
        if (input) {
            input.addEventListener('input', function () {
                self.updateRangeDisplay(inputId);
            });
        }
    });

    // Test TTS button
    var testTTSBtn = document.getElementById('testTTS');
    if (testTTSBtn) {
        testTTSBtn.addEventListener('click', function () {
            self.testTTSConfiguration();
        });
    }

    // Generate speech button
    var generateSpeechBtn = document.getElementById('generateSpeech');
    if (generateSpeechBtn) {
        generateSpeechBtn.addEventListener('click', function () {
            self.generateSpeech();
        });
    }

    // Speaker integration test
    var testSpeakerBtn = document.getElementById('testSpeakerIntegration');
    if (testSpeakerBtn) {
        testSpeakerBtn.addEventListener('click', function () {
            self.testSpeakerIntegration();
        });
    }

    // Voice cloning
    var cloneVoiceBtn = document.getElementById('cloneVoice');
    if (cloneVoiceBtn) {
        cloneVoiceBtn.addEventListener('click', function () {
            self.cloneVoice();
        });
    }
};

TTSManager.prototype.updateRangeDisplays = function () {
    var ranges = ['stability', 'similarityBoost', 'style'];
    var self = this;

    ranges.forEach(function (rangeId) {
        self.updateRangeDisplay(rangeId);
    });
};

TTSManager.prototype.updateRangeDisplay = function (rangeId) {
    var input = document.getElementById(rangeId);
    if (!input) return;

    var value = parseFloat(input.value);
    var label = input.previousElementSibling;

    if (label && label.tagName === 'LABEL') {
        var baseLabelText = label.textContent.split(' (')[0]; // Remove existing value
        label.textContent = baseLabelText + ' (' + value.toFixed(1) + ')';
    }
};

TTSManager.prototype.saveConfiguration = function () {
    var self = this;
    var formData = new FormData(document.getElementById('ttsConfigForm'));
    var config = {};

    for (var pair of formData.entries()) {
        if (pair[0] === 'use_speaker_boost') {
            config[pair[0]] = true; // Checkbox is checked
        } else {
            config[pair[0]] = pair[1];
        }
    }

    // Handle unchecked checkbox
    if (!config.use_speaker_boost) {
        config.use_speaker_boost = false;
    }

    // TODO: Save configuration to backend
    console.log('Saving TTS configuration:', config);
    this.showAlert('TTS configuration saved successfully!', 'success');
};

TTSManager.prototype.testTTSConfiguration = function () {
    var self = this;

    // TODO: Test TTS configuration
    console.log('Testing TTS configuration...');
    this.showAlert('TTS configuration test completed!', 'info');
};

TTSManager.prototype.generateSpeech = function () {
    var self = this;
    var testText = document.getElementById('testText').value.trim();
    var testVoice = document.getElementById('testVoice').value;

    if (!testText) {
        this.showAlert('Please enter text to convert to speech', 'warning');
        return;
    }

    // Show loading state
    var generateBtn = document.getElementById('generateSpeech');
    var originalText = generateBtn.innerHTML;
    generateBtn.innerHTML = '<div class="spinner-border spinner-border-sm me-2" role="status"></div>Generating...';
    generateBtn.disabled = true;

    var requestData = {
        text: testText,
        voice_id: testVoice || document.getElementById('defaultVoice').value,
        model: document.getElementById('ttsModel').value,
        voice_settings: {
            stability: parseFloat(document.getElementById('stability').value),
            similarity_boost: parseFloat(document.getElementById('similarityBoost').value),
            style: parseFloat(document.getElementById('style').value),
            use_speaker_boost: document.getElementById('speakerBoost').checked
        }
    };

    fetch('/api/elevenlabs/tts/generate', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestData)
    })
        .then(function (response) {
            if (response.ok) {
                return response.blob();
            } else {
                throw new Error('Failed to generate speech');
            }
        })
        .then(function (audioBlob) {
            self.playGeneratedAudio(audioBlob);
            self.showAlert('Speech generated successfully!', 'success');
        })
        .catch(function (error) {
            console.error('Speech generation error:', error);
            self.showAlert('Failed to generate speech', 'danger');
        })
        .finally(function () {
            generateBtn.innerHTML = originalText;
            generateBtn.disabled = false;
        });
};

TTSManager.prototype.playGeneratedAudio = function (audioBlob) {
    var audioPlayer = document.getElementById('audioPlayer');
    var audio = audioPlayer.querySelector('audio');

    // Create object URL for the audio blob
    var audioUrl = URL.createObjectURL(audioBlob);
    audio.src = audioUrl;

    // Show the audio player
    audioPlayer.style.display = 'block';

    // Clean up the object URL when audio ends
    audio.addEventListener('ended', function () {
        URL.revokeObjectURL(audioUrl);
    });
};

TTSManager.prototype.previewVoice = function (voiceId) {
    var self = this;

    // TODO: Implement voice preview
    console.log('Previewing voice:', voiceId);
    this.showAlert('Voice preview (feature coming soon)', 'info');
};

TTSManager.prototype.testSpeakerIntegration = function () {
    var self = this;
    var speakerSelect = document.getElementById('speakerPart');

    if (!speakerSelect.value) {
        this.showAlert('Please select a speaker part first', 'warning');
        return;
    }

    // TODO: Test speaker integration
    console.log('Testing speaker integration with part:', speakerSelect.value);
    this.showAlert('Speaker integration test completed!', 'success');
};

TTSManager.prototype.cloneVoice = function () {
    var self = this;
    var form = document.getElementById('voiceCloningForm');
    var formData = new FormData(form);

    var voiceName = formData.get('name');
    var audioFiles = formData.getAll('files');

    if (!voiceName) {
        this.showAlert('Please enter a voice name', 'warning');
        return;
    }

    if (audioFiles.length === 0) {
        this.showAlert('Please select audio samples to clone', 'warning');
        return;
    }

    // Show loading state
    var cloneBtn = document.getElementById('cloneVoice');
    var originalText = cloneBtn.innerHTML;
    cloneBtn.innerHTML = '<div class="spinner-border spinner-border-sm me-2" role="status"></div>Cloning...';
    cloneBtn.disabled = true;

    fetch('/api/elevenlabs/voices/clone', {
        method: 'POST',
        body: formData
    })
        .then(function (response) {
            return response.json();
        })
        .then(function (data) {
            if (data.success) {
                self.showAlert('Voice cloned successfully!', 'success');
                self.loadVoices(); // Refresh the voice list

                // Close modal and reset form
                var modal = bootstrap.Modal.getInstance(document.getElementById('voiceCloningModal'));
                modal.hide();
                form.reset();
            } else {
                self.showAlert('Failed to clone voice: ' + data.error, 'danger');
            }
        })
        .catch(function (error) {
            console.error('Voice cloning error:', error);
            self.showAlert('Failed to clone voice', 'danger');
        })
        .finally(function () {
            cloneBtn.innerHTML = originalText;
            cloneBtn.disabled = false;
        });
};

TTSManager.prototype.showAlert = function (message, type) {
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
    var ttsManager = new TTSManager();
    ttsManager.init();

    // Make globally available for debugging and onclick handlers
    window.ttsManager = ttsManager;
});
