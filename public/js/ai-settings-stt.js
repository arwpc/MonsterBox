/**
 * MonsterBox 4.0 - AI Settings STT JavaScript
 * Speech-to-Text configuration and testing
 */

// ES5 syntax as per user requirements
function STTManager() {
    this.models = [];
    this.microphoneParts = [];
    this.currentConfig = {};
    this.savedConfig = null;
    this.modelsLoaded = false;
    this.micsLoaded = false;
    // Client mic recorder (legacy, no longer used for real-time)
    this.mediaRecorder = null;
    this.chunks = [];
    this.stream = null;
    // VU meter
    this.vuTimer = null;
    this.currentMicDeviceId = null;
    // Server-side listening session
    this.isListening = false;
    this.serverSessionId = null;
    this.statusPollTimer = null;
    this.lastTranscriptText = '';
    this.lastStatusError = '';
    this.mediaRecorderTimeslice = 1000; // ms per chunk (legacy)
}

STTManager.prototype.init = function () {
    var self = this;

    this.loadSTTModels();
    this.loadMicrophoneParts();
    this.loadFilterPresets();
    this.loadSavedConfig();
    this.bindEvents();

    console.log('STT Manager initialized');
};

STTManager.prototype.loadFilterPresets = function () {
    var self = this;

    fetch('/api/elevenlabs/stt/presets')
        .then(function (response) {
            return response.json();
        })
        .then(function (data) {
            if (data && data.success && data.presets) {
                self.displayFilterPresets(data.presets);
            }
        })
        .catch(function (error) {
            console.error('Failed to load filter presets:', error);
        });
};

STTManager.prototype.displayFilterPresets = function (presets) {
    var self = this;
    var container = document.getElementById('filterPresets');
    if (!container) return;

    var html = '';
    presets.forEach(function (preset) {
        html += '<div class="col-md-4 col-lg-3">' +
            '<button type="button" class="btn btn-outline-primary btn-sm w-100" ' +
            'data-preset-id="' + preset.id + '" ' +
            'title="' + preset.description + '">' +
            '<i class="bi bi-' + preset.icon + ' me-1"></i>' +
            preset.name +
            '</button>' +
            '</div>';
    });

    container.innerHTML = html;

    // Bind click events
    container.querySelectorAll('button[data-preset-id]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var presetId = this.getAttribute('data-preset-id');
            self.applyFilterPreset(presetId);
        });
    });
};

STTManager.prototype.applyFilterPreset = function (presetId) {
    var self = this;

    fetch('/api/elevenlabs/stt/presets/' + presetId + '/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    })
        .then(function (response) {
            return response.json();
        })
        .then(function (data) {
            if (data && data.success) {
                self.showAlert('Applied preset: ' + presetId, 'success');
                // Reload configuration to update UI
                self.loadSavedConfig();
            } else {
                self.showAlert('Failed to apply preset', 'danger');
            }
        })
        .catch(function (error) {
            console.error('Failed to apply preset:', error);
            self.showAlert('Failed to apply preset', 'danger');
        });
};

STTManager.prototype.loadSTTModels = function () {
    var self = this;

    fetch('/api/elevenlabs/stt/capabilities')
        .then(function (response) {
            return response.json();
        })
        .then(function (data) {
            var hasModels = data && data.models && data.models.length >= 0;
            if (data && data.success === false) {
                self.showModelsError();
                return;
            }
            self.models = hasModels ? data.models : [];
            self.updateModelsDisplay();
            self.populateModelSelect();
            self.modelsLoaded = true;
            self.applySavedConfigIfReady();
        })
        .catch(function (error) {
            console.error('Failed to load STT models:', error);
            self.showModelsError();
        });
};

STTManager.prototype.updateModelsDisplay = function () {
    var modelsContainer = document.getElementById('sttModels');
    if (!modelsContainer) return; // models list removed from UI

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
    if (!modelsContainer) return; // models list removed from UI
    modelsContainer.innerHTML = '<div class="alert alert-warning">' +
        '<i class="bi bi-exclamation-triangle me-2"></i>' +
        'Failed to load STT models' +
        '</div>';
};

STTManager.prototype.loadMicrophoneParts = function () {
    var self = this;

    fetch('/setup/calibration/api/parts?type=microphone')
        .then(function (response) {
            return response.json();
        })
        .then(function (data) {
            self.microphoneParts = (data.success && data.parts) ? data.parts.filter(function (part) { return part.type === 'microphone'; }) : [];
            self.populateMicrophoneSelect();
            self.micsLoaded = true;
            self.applySavedConfigIfReady();
        })
        .catch(function (error) {
            console.error('Failed to load microphone parts:', error);
            self.showMicrophoneError();
        });
};

// Load saved STT config (model, language, sampleRate, microphone)
STTManager.prototype.loadSavedConfig = function () {
    var self = this;
    fetch('/api/elevenlabs/stt/config')
        .then(function (r) { return r.json(); })
        .then(function (j) {
            if (!j || j.success === false) return;
            self.savedConfig = j.config || {};
            self.currentConfig = self.savedConfig;
            self.applySavedConfigIfReady();
        })
        .catch(function () { /* ignore */ });
};

STTManager.prototype.applySavedConfigIfReady = function () {
    var cfg = this.savedConfig;
    if (!cfg) return;
    // Model
    if (this.modelsLoaded) {
        var modelSelect = document.getElementById('sttModel');
        if (modelSelect && cfg.model) {
            modelSelect.value = cfg.model;
        }
        var langSelect = document.getElementById('sttLanguage');
        if (langSelect && cfg.language) {
            langSelect.value = cfg.language;
        }
        var srSelect = document.getElementById('sampleRate');
        if (srSelect && cfg.sampleRate) {
            srSelect.value = String(cfg.sampleRate);
        }
    }
    // VAD UI (if present)
    var vadE = document.getElementById('vadEnabled');
    if (vadE && typeof cfg.vadEnabled !== 'undefined') { vadE.checked = !!cfg.vadEnabled; }
    var vadT = document.getElementById('vadThreshold');
    var vadLbl = document.getElementById('vadThresholdLabel');
    if (vadT) {
        var pct = Math.round(((cfg.vadThreshold != null ? cfg.vadThreshold : 0.03) * 100));
        if (!(pct >= 1 && pct <= 30)) pct = 3;
        vadT.value = String(pct);
        if (vadLbl) vadLbl.textContent = pct + '%';
    }

    // Microphone
    if (this.micsLoaded) {
        var micSelect = document.getElementById('microphonePart');
        if (micSelect && cfg.microphonePartId) {
            micSelect.value = String(cfg.microphonePartId);
            this.onMicSelectionChange();
        }
    }
};

// Save subset of STT config immediately (called on change)
STTManager.prototype.savePartialConfig = function (patch) {
    var self = this;
    var base = self.savedConfig || {};
    var merged = {};
    for (var k in base) merged[k] = base[k];
    for (var p in patch) merged[p] = patch[p];
    return fetch('/api/elevenlabs/stt/config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(merged)
    }).then(function (r) { return r.json(); })
        .then(function (j) { if (j && j.success) { self.savedConfig = j.config; self.currentConfig = j.config; } })
        .catch(function () { /* ignore */ });
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

    // Microphone selection -> start VU meter and save
    var micSelect = document.getElementById('microphonePart');
    if (micSelect) {
        micSelect.addEventListener('change', function () {
            self.onMicSelectionChange();
            var partId = micSelect && micSelect.value ? micSelect.value : null;
            var deviceId = self.getSelectedMicDeviceId() || null;
            self.savePartialConfig({ microphonePartId: partId, microphoneDeviceId: deviceId });
        });
        // Initialize once loaded
        setTimeout(function () { self.onMicSelectionChange(); }, 0);
    }

    // Autosave STT dropdown changes
    var modelSelect = document.getElementById('sttModel');
    if (modelSelect) {
        modelSelect.addEventListener('change', function () {
            var m = modelSelect.value;
            if (m === 'scribe_english_v1') {
                var langSelect2 = document.getElementById('sttLanguage');
                if (langSelect2) { langSelect2.value = 'en'; }
                self.savePartialConfig({ model: m, language: 'en' });
            } else {
                self.savePartialConfig({ model: m });
            }
        });
    }
    var langSelect = document.getElementById('sttLanguage');
    if (langSelect) {
        langSelect.addEventListener('change', function () { self.savePartialConfig({ language: langSelect.value }); });
    }
    var srSelect = document.getElementById('sampleRate');
    if (srSelect) {
        srSelect.addEventListener('change', function () {
            var v = parseInt(srSelect.value, 10);
            self.savePartialConfig({ sampleRate: v });
        });
    }

    // New real-time controls
    var startListeningBtn = document.getElementById('startListening');
    var stopListeningBtn = document.getElementById('stopListening');
    if (startListeningBtn) {
        startListeningBtn.addEventListener('click', function () { self.startListening(); });
    }
    if (stopListeningBtn) {
        stopListeningBtn.addEventListener('click', function () { self.stopListening(); });
    }
    // 2s diagnostic test
    var twoSecBtn = document.getElementById('sttTwoSecTest');
    if (twoSecBtn) {
        twoSecBtn.addEventListener('click', function () { self.runTwoSecondTest(); });
    }

    // Legacy buttons (safe no-ops if elements removed)
    var testSTTBtn = document.getElementById('testSTT');
    if (testSTTBtn) {
        testSTTBtn.addEventListener('click', function () { self.testSTTConfiguration(); });
    }
    var transcribeFileBtn = document.getElementById('transcribeFile');
    if (transcribeFileBtn) {
        transcribeFileBtn.addEventListener('click', function () { self.transcribeAudioFile(); });
    }
    var startRecordingBtn = document.getElementById('startRecording');
    var stopRecordingBtn = document.getElementById('stopRecording');
    if (startRecordingBtn) {
        startRecordingBtn.addEventListener('click', function () { self.startRecording(); });
    }

    // Input Gain live control
    var inputGain = document.getElementById('inputGain');
    var inputGainLabel = document.getElementById('inputGainLabel');
    function applyInputGainNow() {
        if (!inputGain) return; var pct = parseInt(inputGain.value, 10) || 100;
        if (inputGainLabel) inputGainLabel.textContent = pct + '%';
        var devId = self.getSelectedMicDeviceId();
        var idToUse = devId || 'default';
        fetch('/setup/audio/api/set-input-gain', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId: idToUse, gainPercent: pct })
        }).catch(function () { /* ignore */ });
    }
    if (inputGain) { inputGain.addEventListener('input', applyInputGainNow); }

    // Range slider value display updates
    var vadThresholdEl = document.getElementById('vadThreshold');
    var vadThresholdValue = document.getElementById('vadThresholdValue');
    if (vadThresholdEl && vadThresholdValue) {
        vadThresholdEl.addEventListener('input', function () {
            vadThresholdValue.textContent = parseFloat(vadThresholdEl.value).toFixed(2);
        });
    }

    var vadSilenceDurationEl = document.getElementById('vadSilenceDuration');
    var vadSilenceDurationValue = document.getElementById('vadSilenceDurationValue');
    if (vadSilenceDurationEl && vadSilenceDurationValue) {
        vadSilenceDurationEl.addEventListener('input', function () {
            vadSilenceDurationValue.textContent = vadSilenceDurationEl.value;
        });
    }

    var highpassFreqEl = document.getElementById('highpassFreq');
    var highpassFreqValue = document.getElementById('highpassFreqValue');
    if (highpassFreqEl && highpassFreqValue) {
        highpassFreqEl.addEventListener('input', function () {
            highpassFreqValue.textContent = highpassFreqEl.value;
        });
    }

    var lowpassFreqEl = document.getElementById('lowpassFreq');
    var lowpassFreqValue = document.getElementById('lowpassFreqValue');
    if (lowpassFreqEl && lowpassFreqValue) {
        lowpassFreqEl.addEventListener('input', function () {
            lowpassFreqValue.textContent = lowpassFreqEl.value;
        });
    }

    var denoiseLevelEl = document.getElementById('denoiseLevel');
    var denoiseLevelValue = document.getElementById('denoiseLevelValue');
    if (denoiseLevelEl && denoiseLevelValue) {
        denoiseLevelEl.addEventListener('input', function () {
            denoiseLevelValue.textContent = denoiseLevelEl.value;
        });
    }

    var minLetterRatioEl = document.getElementById('minLetterRatio');
    var minLetterRatioValue = document.getElementById('minLetterRatioValue');
    if (minLetterRatioEl && minLetterRatioValue) {
        minLetterRatioEl.addEventListener('input', function () {
            minLetterRatioValue.textContent = minLetterRatioEl.value;
        });
    }

    // VAD tuning controls (attach to all duplicates safely)
    var vadLbl = document.getElementById('vadThresholdLabel');
    // Enable toggles
    var vadToggles = document.querySelectorAll('#vadEnabled');
    vadToggles.forEach(function (el) {
        el.addEventListener('change', function () {
            self.savePartialConfig({ vadEnabled: !!el.checked });
        });
    });
    // Threshold sliders (two variants exist: 0.05..0.95 and 1..30)
    var vadSliders = document.querySelectorAll('#vadThreshold');
    vadSliders.forEach(function (sl) {
        sl.addEventListener('input', function () {
            var min = parseFloat(sl.min || '0');
            var max = parseFloat(sl.max || '0');
            var pct;
            if (max <= 1.0) {
                // Decimal slider (0.05..0.95)
                var f = parseFloat(sl.value || '0.03') || 0.03;
                pct = Math.max(1, Math.min(30, Math.round(f * 100)));
            } else {
                // Percent slider (1..30)
                pct = Math.max(1, Math.min(30, parseInt(sl.value, 10) || 3));
            }
            if (vadLbl) vadLbl.textContent = pct + '%';
            var thr = Math.max(0.01, Math.min(0.3, pct / 100));
            self.savePartialConfig({ vadThreshold: thr });
        });
    });

    if (stopRecordingBtn) {
        stopRecordingBtn.addEventListener('click', function () { self.stopRecording(); });
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

    // Include microphone selection and defaults
    var micSelect = document.getElementById('microphonePart');
    config.microphonePartId = micSelect && micSelect.value ? micSelect.value : null;
    config.microphoneDeviceId = self.getSelectedMicDeviceId() || null;
    config.format = 'mp3';

    // Persist to global STT config
    fetch('/api/elevenlabs/stt/config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config)
    })
        .then(function (r) { return r.json(); })
        .then(function (j) {
            if (j && j.success) {
                self.savedConfig = j.config; self.currentConfig = j.config;
                self.showAlert('Saved STT configuration', 'success');
            } else {
                self.showAlert('Failed to save STT configuration', 'danger');
            }
        })
        .catch(function (e) {
            console.error('Save STT config (global) error', e);
            self.showAlert('Failed to save STT configuration', 'danger');
        })
        .then(function () {
            // Also persist to current Character (kept for compatibility)
            return self.getCurrentCharacterId()
                .then(function (charId) {
                    if (!charId) {
                        self.showAlert('No current Character selected. Use the Character menu.', 'warning');
                        return null;
                    }
                    return fetch('/setup/characters/api/characters/' + charId, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ sttConfig: config })
                    });
                })
                .then(function (r) { return r ? r.json() : null; })
                .then(function (data) {
                    if (data && data.success) self.showAlert('Saved STT settings to Character', 'success');
                    else self.showAlert('Failed to save STT settings to Character', 'danger');
                })
                .catch(function (e) {
                    console.error('Save STT config (character) error', e);
                    self.showAlert('Failed to save STT settings to Character', 'danger');
                });
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
    var devId = self.getSelectedMicDeviceId();
    if (!devId) { self.showAlert('Please select a Microphone Part first', 'warning'); return; }
    var url = '/setup/audio/api/audio-levels?deviceId=' + encodeURIComponent(devId) + '&deviceType=input';
    fetch(url)
        .then(function (r) { return r.json(); })
        .then(function (j) {
            if (j && j.success) self.showAlert('Microphone device reachable (level: ' + Math.round((+j.level || 0) * 100) + '%)', 'success');
            else self.showAlert('Microphone level check failed', 'danger');
        })
        .catch(function () { self.showAlert('Microphone level check error', 'danger'); });
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
// Helpers for Character and Microphone
STTManager.prototype.getCurrentCharacterId = function () {
    return fetch('/setup/characters/api/current')
        .then(function (r) { return r.json(); })
        .then(function (d) { return d && d.selectedCharacter ? d.selectedCharacter : null; })
        .catch(function () { return null; });
};

STTManager.prototype.getSelectedMicDeviceId = function () {
    var micSelect = document.getElementById('microphonePart');
    if (!micSelect || !micSelect.value) return null;
    var selId = String(micSelect.value);
    for (var i = 0; i < this.microphoneParts.length; i++) {
        if (String(this.microphoneParts[i].id) === selId) {
            var deviceId = this.microphoneParts[i].config && this.microphoneParts[i].config.deviceId;
            // If no deviceId configured, use 'default' as fallback
            return deviceId || 'default';
        }
    }
    return null;
};

// VU meter handling
STTManager.prototype.onMicSelectionChange = function () {
    this.currentMicDeviceId = this.getSelectedMicDeviceId();
    if (this.currentMicDeviceId) this.startVUMeter(); else this.stopVUMeter();
};

STTManager.prototype.startVUMeter = function () {
    var self = this;
    self.stopVUMeter();
    if (!self.currentMicDeviceId) return;
    var meterEl = document.getElementById('micVUMeter');
    var labelEl = document.getElementById('micVULabel');
    if (!meterEl || !labelEl) return;

    self.vuTimer = setInterval(function () {
        var url = '/setup/audio/api/audio-levels?deviceId=' + encodeURIComponent(self.currentMicDeviceId) + '&deviceType=input';
        fetch(url)
            .then(function (r) { return r.json(); })
            .then(function (j) {
                if (!j || !j.success) return;
                var level = +j.level || 0;
                var pct = Math.max(0, Math.min(100, Math.round(level * 100)));
                meterEl.style.width = pct + '%';
                meterEl.setAttribute('aria-valuenow', String(pct));
                labelEl.textContent = pct + '%';
            })
            .catch(function () { /* ignore */ });
    }, 300);
};

STTManager.prototype.stopVUMeter = function () {
    if (this.vuTimer) {
        clearInterval(this.vuTimer);
        this.vuTimer = null;
    }
    var meterEl = document.getElementById('micVUMeter');
    var labelEl = document.getElementById('micVULabel');
    if (meterEl) { meterEl.style.width = '0%'; meterEl.setAttribute('aria-valuenow', '0'); }
    if (labelEl) { labelEl.textContent = '0%'; }
};

// Live transcription UI
STTManager.prototype.appendTranscript = function (text) {
    var area = document.getElementById('liveTranscript');
    if (!area) return;
    var t = (text || '').trim();
    if (!t) return;
    area.textContent = (area.textContent ? area.textContent + ' ' : '') + t;
    area.scrollTop = area.scrollHeight;
};

// Real-time listening using server-side Microphone Part
STTManager.prototype.startListening = function () {
    var self = this;
    var startBtn = document.getElementById('startListening');
    var stopBtn = document.getElementById('stopListening');

    var devId = self.getSelectedMicDeviceId();
    if (!devId) { self.showAlert('Select a Microphone Part first', 'warning'); return; }

    var area = document.getElementById('liveTranscript');
    if (area) area.textContent = '';
    self.lastTranscriptText = '';

    var body = {
        deviceId: devId,
        model: (document.getElementById('sttModel') || {}).value || 'scribe_v1',
        language: (document.getElementById('sttLanguage') || {}).value || 'auto'
    };

    fetch('/api/elevenlabs/stt/listen/start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    }).then(function (r) { return r.json(); }).then(function (j) {
        if (!j || !j.success) { self.showAlert('Failed to start listening', 'danger'); return; }
        self.serverSessionId = j.sessionId; self.isListening = true;
        if (startBtn) startBtn.disabled = true; if (stopBtn) stopBtn.disabled = false;
        self.showAlert('Listening started (server)', 'info');
        // begin polling status
        self.statusPollTimer = setInterval(function () { self.pollTranscript(); }, 300); // faster UI updates
    }).catch(function () { self.showAlert('Failed to start listening', 'danger'); });
};

STTManager.prototype.pollTranscript = function () {
    var self = this; if (!self.serverSessionId) return;
    fetch('/api/elevenlabs/stt/listen/status?sessionId=' + encodeURIComponent(self.serverSessionId))
        .then(function (r) { return r.json(); })
        .then(function (j) {
            if (!j || !j.success) return;
            if (j.lastError && j.lastError !== self.lastStatusError) { self.lastStatusError = j.lastError; self.showAlert('STT warning: ' + j.lastError, 'warning'); }
            if (!j.lastError && self.lastStatusError) { self.lastStatusError = ''; }

            // Debug counters (helps determine if audio is reaching server/ElevenLabs)
            var prev = self._lastCounters || {};
            if (typeof j.chunksCaptured === 'number' && j.chunksCaptured !== prev.chunksCaptured) {
                if (window.MONSTERBOX_DEBUG_AUDIO) {
                    console.log('[STT] captured=%d, withAudio=%d, transcribed=%d, lastChunkBytes=%d, err=%s',
                        j.chunksCaptured, j.chunksWithAudio, j.chunksTranscribed, j.lastChunkBytes, j.lastError || '');
                }
                // Notify once if we are capturing audio but not getting transcripts
                if (!j.lastError && j.chunksWithAudio > 0 && j.chunksTranscribed === 0 && !self._notifiedNoTranscriptYet) {
                    self._notifiedNoTranscriptYet = true;
                    self.showAlert('Capturing audio but no transcription yet. Please speak clearly for 2–3 seconds.', 'info');
                }
                self._lastCounters = {
                    chunksCaptured: j.chunksCaptured,
                    chunksWithAudio: j.chunksWithAudio,
                    chunksTranscribed: j.chunksTranscribed,
                    lastChunkBytes: j.lastChunkBytes
                };
            }

            var text = String(j.transcript || '');
            if (text && text !== self.lastTranscriptText) {
                var area = document.getElementById('liveTranscript');
                if (area) { area.textContent = text; area.scrollTop = area.scrollHeight; }
                self.lastTranscriptText = text;
            }
        }).catch(function () { });
};

STTManager.prototype.stopListening = function () {
    var self = this;
    var startBtn = document.getElementById('startListening');
    var stopBtn = document.getElementById('stopListening');

    function cleanup() {
        self.isListening = false; self.serverSessionId = null;
        if (self.statusPollTimer) { clearInterval(self.statusPollTimer); self.statusPollTimer = null; }
        if (startBtn) startBtn.disabled = false; if (stopBtn) stopBtn.disabled = true;
        self.showAlert('Listening stopped', 'info');
    }

    if (!self.serverSessionId) { cleanup(); return; }

    fetch('/api/elevenlabs/stt/listen/stop', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: self.serverSessionId })
    }).then(function () { cleanup(); }).catch(function () { cleanup(); });
};

STTManager.prototype.runTwoSecondTest = function () {
    var self = this;
    var devId = self.getSelectedMicDeviceId();
    if (!devId) { self.showAlert('Select a Microphone Part first', 'warning'); return; }
    var body = {
        deviceId: devId,
        model: (document.getElementById('sttModel') || {}).value || 'eleven_multilingual_v2',
        language: (document.getElementById('sttLanguage') || {}).value || 'auto'
    };
    var btn = document.getElementById('sttTwoSecTest');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Testing...'; }
    fetch('/api/elevenlabs/stt/testSample?duration=2', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    }).then(function (r) { return r.json(); }).then(function (j) {
        if (!j || !j.success) {
            var sizeInfo = (j && typeof j.sizeBytes === 'number') ? (' (bytes=' + j.sizeBytes + ', path=' + (j.usedPath || 'unknown') + ')') : '';
            self.showAlert('2s test failed: ' + ((j && j.error) || 'Unknown') + sizeInfo, 'danger');
            return;
        }
        var msg = 'Captured ' + j.sizeBytes + ' bytes via ' + (j.usedPath || 'unknown') + (j.text ? ('; Transcript: "' + j.text.substring(0, 80) + '"') : '');
        self.showAlert(msg, 'success');
    }).catch(function (e) {
        console.error('2s test error', e);
        self.showAlert('2s test failed', 'danger');
    }).finally(function () {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-mic-fill"></i> 2s Test'; }
    });
};


// Initialize when DOM is loaded (or immediately if already loaded)
(function () {
    function boot() {
        var sttManager = new STTManager();
        sttManager.init();
        window.sttManager = sttManager; // for debugging
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        // DOM is already parsed; initialize now
        try { boot(); } catch (e) { console.error('STT init error', e); }
    }
})();
