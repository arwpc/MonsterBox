/**
 * Jaw Animation Configuration JavaScript (ES5)
 * MonsterBox — Single-viewport jaw tuning page
 * Handles TTS test playback, calibration quick-adjust, and real-time monitoring.
 */

(function() {
  'use strict';

  var currentCharacterId = null;
  var pollingInterval = null;
  var isPlaying = false;
  var playbackTimer = null;
  var currentConfig = {};
  var availableServos = [];
  var el = {};

  // ─── Initialization ───────────────────────────────────────────────

  function init() {
    cacheElements();
    bindEvents();
    readCharacterFromNav();
    if (currentCharacterId) {
      loadCharacterConfig(currentCharacterId);
    }
  }

  function cacheElements() {
    el = {
      jawEnabled:          document.getElementById('jawEnabled'),
      jawServoSelect:      document.getElementById('jawServoSelect'),
      sensitivityRange:    document.getElementById('sensitivityRange'),
      sensitivityValue:    document.getElementById('sensitivityValue'),
      smoothingRange:      document.getElementById('smoothingRange'),
      smoothingValue:      document.getElementById('smoothingValue'),
      volumeThresholdRange:document.getElementById('volumeThresholdRange'),
      volumeThresholdValue:document.getElementById('volumeThresholdValue'),
      attackTime:          document.getElementById('attackTime'),
      releaseTime:         document.getElementById('releaseTime'),
      saveConfigBtn:       document.getElementById('saveConfigBtn'),
      testJawBtn:          document.getElementById('testJawBtn'),
      playTtsBtn:          document.getElementById('playTtsBtn'),
      stopBtn:             document.getElementById('stopBtn'),
      emergencyStopBtn:    document.getElementById('emergencyStopBtn'),
      ttsTestText:         document.getElementById('ttsTestText'),
      ttsStatus:           document.getElementById('ttsStatus'),
      audioMeterFill:      document.getElementById('audioMeterFill'),
      currentAmplitude:    document.getElementById('currentAmplitude'),
      smoothedAmplitude:   document.getElementById('smoothedAmplitude'),
      targetAngle:         document.getElementById('targetAngle'),
      jawMeterFill:        document.getElementById('jawMeterFill'),
      jawMeterMin:         document.getElementById('jawMeterMin'),
      jawMeterMax:         document.getElementById('jawMeterMax'),
      liveDot:             document.getElementById('liveDot'),
      servoStatusIndicator:document.getElementById('servoStatusIndicator'),
      servoStatusText:     document.getElementById('servoStatusText'),
      minAngleValue:       document.getElementById('minAngleValue'),
      maxAngleValue:       document.getElementById('maxAngleValue'),
      minAngleDown:        document.getElementById('minAngleDown'),
      minAngleUp:          document.getElementById('minAngleUp'),
      maxAngleDown:        document.getElementById('maxAngleDown'),
      maxAngleUp:          document.getElementById('maxAngleUp'),
      statusToast:         document.getElementById('statusToast'),
      toastMessage:        document.getElementById('toastMessage'),
      // Phase 2 controls
      bandpassFilter:      document.getElementById('bandpassFilter'),
      agcEnabled:          document.getElementById('agcEnabled'),
      quantizationRange:   document.getElementById('quantizationRange'),
      quantizationValue:   document.getElementById('quantizationValue'),
      presetSpeech:        document.getElementById('presetSpeech'),
      presetMusic:         document.getElementById('presetMusic'),
      presetCustom:        document.getElementById('presetCustom'),
      jawTimelineCanvas:   document.getElementById('jawTimelineCanvas'),
      timelinePanel:       document.getElementById('timelinePanel')
    };
  }

  function bindEvents() {
    // Sliders — live value display
    if (el.sensitivityRange) {
      el.sensitivityRange.addEventListener('input', function() {
        if (el.sensitivityValue) el.sensitivityValue.textContent = this.value;
      });
    }
    if (el.smoothingRange) {
      el.smoothingRange.addEventListener('input', function() {
        if (el.smoothingValue) el.smoothingValue.textContent = this.value;
      });
    }
    if (el.volumeThresholdRange) {
      el.volumeThresholdRange.addEventListener('input', function() {
        if (el.volumeThresholdValue) el.volumeThresholdValue.textContent = this.value;
      });
    }

    // Buttons
    if (el.saveConfigBtn)    el.saveConfigBtn.addEventListener('click', saveConfiguration);
    if (el.testJawBtn)       el.testJawBtn.addEventListener('click', testJawMovement);
    if (el.playTtsBtn)       el.playTtsBtn.addEventListener('click', playTts);
    if (el.stopBtn)          el.stopBtn.addEventListener('click', stopPlayback);
    if (el.emergencyStopBtn) el.emergencyStopBtn.addEventListener('click', emergencyStop);

    // Servo dropdown
    if (el.jawServoSelect) el.jawServoSelect.addEventListener('change', onServoChange);

    // Enable toggle
    if (el.jawEnabled) el.jawEnabled.addEventListener('change', updateFormState);

    // Calibration quick-adjust
    if (el.minAngleDown) el.minAngleDown.addEventListener('click', function() { adjustCalibration('Min', -1); });
    if (el.minAngleUp)   el.minAngleUp.addEventListener('click',   function() { adjustCalibration('Min',  1); });
    if (el.maxAngleDown) el.maxAngleDown.addEventListener('click', function() { adjustCalibration('Max', -1); });
    if (el.maxAngleUp)   el.maxAngleUp.addEventListener('click',   function() { adjustCalibration('Max',  1); });

    // Quantization slider live value
    if (el.quantizationRange) {
      el.quantizationRange.addEventListener('input', function() {
        if (el.quantizationValue) el.quantizationValue.textContent = this.value;
        selectPreset('custom');
      });
    }

    // Preset radio buttons
    if (el.presetSpeech) el.presetSpeech.addEventListener('change', function() { applyPreset('speech'); });
    if (el.presetMusic)  el.presetMusic.addEventListener('change',  function() { applyPreset('music'); });
    if (el.presetCustom) el.presetCustom.addEventListener('change', function() { /* custom — no auto-set */ });

    // Filter/AGC toggles switch to custom preset
    if (el.bandpassFilter) el.bandpassFilter.addEventListener('change', function() { selectPreset('custom'); });
    if (el.agcEnabled)     el.agcEnabled.addEventListener('change',     function() { selectPreset('custom'); });
  }

  function readCharacterFromNav() {
    var charLabel = document.getElementById('charLabel');
    if (charLabel) {
      var id = charLabel.getAttribute('data-char-id');
      if (id && id !== '') {
        currentCharacterId = parseInt(id, 10);
      }
    }
  }

  // ─── Config Loading ───────────────────────────────────────────────

  function loadCharacterConfig(charId) {
    fetch('/setup/jaw-animation/api/jaw-animation/' + charId)
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.success) {
          currentConfig = data.config;
          availableServos = data.availableServos || [];
          populateServoDropdown(availableServos);
          populateForm(data.config);
          updateFormState();
        } else {
          showToast('Error loading config: ' + (data.error || 'Unknown'), 'error');
        }
      })
      .catch(function(err) {
        showToast('Failed to load configuration', 'error');
        console.error('Config load error:', err);
      });
  }

  function populateServoDropdown(servos) {
    if (!el.jawServoSelect) return;
    el.jawServoSelect.innerHTML = '<option value="">Select a servo...</option>';

    servos.forEach(function(servo) {
      var opt = document.createElement('option');
      opt.value = servo.id;
      var statusText = servo.calibrated
        ? ' (calibrated, ' + servo.minAngle + '\u00B0\u2013' + servo.maxAngle + '\u00B0)'
        : ' (not calibrated)';
      opt.textContent = servo.name + statusText;
      if (!servo.calibrated) opt.disabled = true;
      if (currentConfig.servoPartId === servo.id) opt.selected = true;
      el.jawServoSelect.appendChild(opt);
    });

    onServoChange();
  }

  function populateForm(config) {
    if (el.jawEnabled) el.jawEnabled.checked = config.enabled || false;
    if (config.servoPartId && el.jawServoSelect) el.jawServoSelect.value = config.servoPartId;
    if (el.sensitivityRange)     { el.sensitivityRange.value = config.sensitivity || 1.0; }
    if (el.sensitivityValue)     el.sensitivityValue.textContent = config.sensitivity || 1.0;
    if (el.smoothingRange)       { el.smoothingRange.value = config.smoothing || 0.6; }
    if (el.smoothingValue)       el.smoothingValue.textContent = config.smoothing || 0.6;
    if (el.volumeThresholdRange) { el.volumeThresholdRange.value = config.volumeThreshold || 0.02; }
    if (el.volumeThresholdValue) el.volumeThresholdValue.textContent = config.volumeThreshold || 0.02;
    if (el.attackTime)  el.attackTime.value = config.attackTime || 50;
    if (el.releaseTime) el.releaseTime.value = config.releaseTime || 150;

    // Phase 2 controls
    if (el.bandpassFilter) el.bandpassFilter.checked = config.useBandpassFilter !== false;
    if (el.agcEnabled)     el.agcEnabled.checked = config.useAGC !== false;
    if (el.quantizationRange) {
      el.quantizationRange.value = config.quantizationLevels || 10;
      if (el.quantizationValue) el.quantizationValue.textContent = config.quantizationLevels || 10;
    }
    selectPreset(config.preset || 'speech');
  }

  function onServoChange() {
    var servoId = el.jawServoSelect ? el.jawServoSelect.value : '';
    var servo = null;

    for (var i = 0; i < availableServos.length; i++) {
      if (availableServos[i].id === servoId) { servo = availableServos[i]; break; }
    }

    if (servo && servo.calibrated) {
      if (el.servoStatusIndicator) {
        el.servoStatusIndicator.innerHTML = '<span class="servo-status-indicator status-connected"></span>';
      }
      if (el.servoStatusText) el.servoStatusText.textContent = 'Calibrated \u2014 ' + servo.minAngle + '\u00B0 to ' + servo.maxAngle + '\u00B0';
      if (el.minAngleValue) el.minAngleValue.value = servo.minAngle;
      if (el.maxAngleValue) el.maxAngleValue.value = servo.maxAngle;
      updateJawMeterLabels();
    } else if (servo) {
      if (el.servoStatusIndicator) {
        el.servoStatusIndicator.innerHTML = '<span class="servo-status-indicator status-disconnected"></span>';
      }
      if (el.servoStatusText) el.servoStatusText.textContent = 'Not calibrated \u2014 calibrate in Setup \u2192 Calibration';
      if (el.minAngleValue) el.minAngleValue.value = '';
      if (el.maxAngleValue) el.maxAngleValue.value = '';
      updateJawMeterLabels();
    } else {
      if (el.servoStatusIndicator) el.servoStatusIndicator.innerHTML = '';
      if (el.servoStatusText) el.servoStatusText.textContent = 'Select a servo to see its status';
      if (el.minAngleValue) el.minAngleValue.value = '';
      if (el.maxAngleValue) el.maxAngleValue.value = '';
      updateJawMeterLabels();
    }
  }

  function updateFormState() {
    var enabled = el.jawEnabled ? el.jawEnabled.checked : false;
    var inputs = [
      el.jawServoSelect, el.sensitivityRange, el.smoothingRange,
      el.volumeThresholdRange, el.attackTime, el.releaseTime,
      el.bandpassFilter, el.agcEnabled, el.quantizationRange
    ];
    inputs.forEach(function(inp) { if (inp) inp.disabled = !enabled; });

    var hasServo = el.jawServoSelect && el.jawServoSelect.value;
    if (el.testJawBtn)  el.testJawBtn.disabled = !enabled || !hasServo;
    if (el.playTtsBtn)  el.playTtsBtn.disabled = !enabled || !hasServo;

    // Calibration buttons
    var calDisabled = !enabled || !hasServo;
    if (el.minAngleDown) el.minAngleDown.disabled = calDisabled;
    if (el.minAngleUp)   el.minAngleUp.disabled = calDisabled;
    if (el.maxAngleDown) el.maxAngleDown.disabled = calDisabled;
    if (el.maxAngleUp)   el.maxAngleUp.disabled = calDisabled;
  }

  // ─── Save Configuration ───────────────────────────────────────────

  function saveConfiguration() {
    if (!currentCharacterId) { showToast('No character selected', 'error'); return; }
    var config = {
      enabled:             el.jawEnabled ? el.jawEnabled.checked : false,
      servoPartId:         el.jawServoSelect ? (el.jawServoSelect.value || null) : null,
      sensitivity:         parseFloat(el.sensitivityRange ? el.sensitivityRange.value : 1.0),
      smoothing:           parseFloat(el.smoothingRange ? el.smoothingRange.value : 0.6),
      volumeThreshold:     parseFloat(el.volumeThresholdRange ? el.volumeThresholdRange.value : 0.02),
      attackTime:          parseInt(el.attackTime ? el.attackTime.value : 50, 10),
      releaseTime:         parseInt(el.releaseTime ? el.releaseTime.value : 150, 10),
      useBandpassFilter:   el.bandpassFilter ? el.bandpassFilter.checked : true,
      useAGC:              el.agcEnabled ? el.agcEnabled.checked : true,
      quantizationLevels:  parseInt(el.quantizationRange ? el.quantizationRange.value : 10, 10),
      preset:              getSelectedPreset()
    };
    if (config.enabled && !config.servoPartId) {
      showToast('Please select a servo when jaw animation is enabled', 'error');
      return;
    }
    el.saveConfigBtn.disabled = true;
    el.saveConfigBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Saving...';
    fetch('/setup/jaw-animation/api/jaw-animation/' + currentCharacterId, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      el.saveConfigBtn.disabled = false;
      el.saveConfigBtn.innerHTML = '<i class="bi bi-save"></i> Save Config';
      if (data.success) {
        currentConfig = config;
        showToast('Configuration saved', 'success');
      } else {
        showToast('Save failed: ' + (data.error || 'Unknown'), 'error');
      }
    })
    .catch(function(err) {
      console.error('Save error:', err);
      el.saveConfigBtn.disabled = false;
      el.saveConfigBtn.innerHTML = '<i class="bi bi-save"></i> Save Config';
      showToast('Failed to save configuration', 'error');
    });
  }

  // ─── TTS Playback ─────────────────────────────────────────────────

  function playTts() {
    if (!currentCharacterId || isPlaying) return;
    var text = el.ttsTestText ? el.ttsTestText.value.trim() : '';
    if (!text) { showToast('Enter some text to test', 'error'); return; }

    isPlaying = true;
    setStatus('Generating TTS...');
    setLive(true);

    if (el.playTtsBtn) {
      el.playTtsBtn.disabled = true;
      el.playTtsBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Generating...';
    }

    fetch('/setup/jaw-animation/api/jaw-animation/' + currentCharacterId + '/test-tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.success) {
        setStatus('Playing');
        if (el.playTtsBtn) el.playTtsBtn.innerHTML = '<i class="bi bi-play-fill"></i> Playing...';
        // Draw timeline visualization if returned
        if (data.timeline && data.timeline.length > 0) {
          drawTimeline(data.timeline);
        }
        startPolling();
        // Auto-stop after duration + buffer
        var duration = (data.duration || 3000) + 500;
        playbackTimer = setTimeout(function() {
          stopPlayback();
          setStatus('Done');
        }, duration);
      } else {
        isPlaying = false;
        setStatus('Error');
        showToast('TTS failed: ' + (data.error || 'Unknown'), 'error');
        resetPlayBtn();
      }
    })
    .catch(function(err) {
      console.error('TTS error:', err);
      isPlaying = false;
      setStatus('Error');
      showToast('TTS request failed', 'error');
      resetPlayBtn();
    });
  }

  function stopPlayback() {
    if (playbackTimer) { clearTimeout(playbackTimer); playbackTimer = null; }
    stopPolling();
    isPlaying = false;
    resetPlayBtn();
    setStatus('Idle');
    setLive(false);
    updateAudioDisplay(0, 0, 0);

    if (!currentCharacterId) return;
    fetch('/setup/jaw-animation/api/jaw-animation/' + currentCharacterId + '/stop', {
      method: 'POST'
    }).catch(function() {});
  }

  function emergencyStop() {
    stopPlayback();
    showToast('Emergency stop activated', 'warning');
    if (el.emergencyStopBtn) {
      el.emergencyStopBtn.classList.add('btn-danger');
      el.emergencyStopBtn.classList.remove('btn-outline-danger');
      setTimeout(function() {
        el.emergencyStopBtn.classList.remove('btn-danger');
        el.emergencyStopBtn.classList.add('btn-outline-danger');
      }, 2000);
    }
  }

  function resetPlayBtn() {
    if (el.playTtsBtn) {
      el.playTtsBtn.disabled = false;
      el.playTtsBtn.innerHTML = '<i class="bi bi-play-fill"></i> Play TTS &amp; Jaw';
    }
  }

  function setStatus(text) {
    if (!el.ttsStatus) return;
    var cls = 'bg-secondary';
    if (text === 'Playing')            cls = 'bg-success';
    else if (text === 'Generating TTS...') cls = 'bg-info';
    else if (text === 'Done')          cls = 'bg-primary';
    else if (text === 'Error')         cls = 'bg-danger';
    el.ttsStatus.innerHTML = '<span class="' + cls + ' px-2 py-1 rounded">' + text + '</span>';
  }

  function setLive(active) {
    if (el.liveDot) {
      if (active) {
        el.liveDot.classList.add('active');
      } else {
        el.liveDot.classList.remove('active');
      }
    }
  }

  // ─── Audio Level Polling ──────────────────────────────────────────

  function startPolling() {
    stopPolling();
    pollingInterval = setInterval(function() {
      if (!isPlaying || !currentCharacterId) { stopPolling(); return; }
      pollAudioLevels();
    }, 60);
  }

  function stopPolling() {
    if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; }
  }

  function pollAudioLevels() {
    fetch('/setup/jaw-animation/api/jaw-animation/' + currentCharacterId + '/audio-levels')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.success) {
          var amp = data.currentAmplitude || 0;
          var smoothed = data.smoothedAmplitude || 0;
          var angle = data.jawAngle || 0;
          updateAudioDisplay(amp, smoothed, angle);
        }
      })
      .catch(function() {});
  }

  function updateAudioDisplay(current, smoothed, angle) {
    if (el.currentAmplitude)  el.currentAmplitude.textContent = current.toFixed(3);
    if (el.smoothedAmplitude) el.smoothedAmplitude.textContent = smoothed.toFixed(3);
    if (el.targetAngle)       el.targetAngle.textContent = Math.round(angle) + '\u00B0';

    // Audio level bar — scale so typical TTS peaks (0.15-0.25) reach 60-100%
    if (el.audioMeterFill) {
      var pct = Math.min(100, current * 400);
      el.audioMeterFill.style.width = pct + '%';
    }

    // Jaw angle bar — position between minAngle and maxAngle
    // Uses sqrt scaling so small movements near minAngle are more visible
    if (el.jawMeterFill) {
      var minA = parseFloat((el.minAngleValue && el.minAngleValue.value) || 0);
      var maxA = parseFloat((el.maxAngleValue && el.maxAngleValue.value) || 180);
      var range = maxA - minA;
      var linearPct = range > 0 ? Math.min(1, Math.max(0, (angle - minA) / range)) : 0;
      var jawPct = Math.sqrt(linearPct) * 100;
      el.jawMeterFill.style.width = jawPct + '%';
    }
  }

  function updateJawMeterLabels() {
    var minA = (el.minAngleValue && el.minAngleValue.value) || '0';
    var maxA = (el.maxAngleValue && el.maxAngleValue.value) || '180';
    if (el.jawMeterMin) el.jawMeterMin.textContent = minA + '\u00B0';
    if (el.jawMeterMax) el.jawMeterMax.textContent = maxA + '\u00B0';
  }

  // ─── Test Jaw Sweep ───────────────────────────────────────────────

  function testJawMovement() {
    if (!currentCharacterId) return;
    if (el.testJawBtn) {
      el.testJawBtn.disabled = true;
      el.testJawBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Sweeping...';
    }
    fetch('/setup/jaw-animation/api/jaw-animation/' + currentCharacterId + '/test', { method: 'POST' })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (el.testJawBtn) {
          el.testJawBtn.disabled = false;
          el.testJawBtn.innerHTML = '<i class="bi bi-arrow-left-right"></i> Test Mechanical Sweep';
        }
        if (data.success) showToast('Jaw sweep completed', 'success');
        else showToast('Sweep failed: ' + (data.message || 'Unknown'), 'error');
      })
      .catch(function(err) {
        console.error('Sweep error:', err);
        if (el.testJawBtn) {
          el.testJawBtn.disabled = false;
          el.testJawBtn.innerHTML = '<i class="bi bi-arrow-left-right"></i> Test Mechanical Sweep';
        }
        showToast('Sweep request failed', 'error');
      });
  }

  // ─── Calibration Quick-Adjust ─────────────────────────────────────

  function adjustCalibration(marker, delta) {
    if (!currentCharacterId) return;
    var servoId = el.jawServoSelect ? el.jawServoSelect.value : '';
    if (!servoId) { showToast('Select a servo first', 'error'); return; }

    fetch('/setup/jaw-animation/api/jaw-animation/' + currentCharacterId + '/adjust-calibration', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ servoPartId: servoId, marker: marker, delta: delta })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.success) {
        if (el.minAngleValue && data.minAngle !== undefined) el.minAngleValue.value = data.minAngle;
        if (el.maxAngleValue && data.maxAngle !== undefined) el.maxAngleValue.value = data.maxAngle;
        // Update in-memory servo data
        for (var i = 0; i < availableServos.length; i++) {
          if (availableServos[i].id === servoId) {
            availableServos[i].minAngle = data.minAngle;
            availableServos[i].maxAngle = data.maxAngle;
            break;
          }
        }
        // Update servo dropdown text
        var opt = el.jawServoSelect.querySelector('option[value="' + servoId + '"]');
        if (opt) {
          var servo = null;
          for (var j = 0; j < availableServos.length; j++) {
            if (availableServos[j].id === servoId) { servo = availableServos[j]; break; }
          }
          if (servo) {
            opt.textContent = servo.name + ' (calibrated, ' + data.minAngle + '\u00B0\u2013' + data.maxAngle + '\u00B0)';
          }
        }
        if (el.servoStatusText) el.servoStatusText.textContent = 'Calibrated \u2014 ' + data.minAngle + '\u00B0 to ' + data.maxAngle + '\u00B0';
        updateJawMeterLabels();
      } else {
        showToast('Adjust failed: ' + (data.error || 'Unknown'), 'error');
      }
    })
    .catch(function(err) {
      console.error('Adjust calibration error:', err);
      showToast('Calibration adjust failed', 'error');
    });
  }

  // ─── Presets ──────────────────────────────────────────────────────

  function applyPreset(name) {
    if (name === 'speech') {
      if (el.bandpassFilter)    el.bandpassFilter.checked = true;
      if (el.agcEnabled)        el.agcEnabled.checked = true;
      if (el.quantizationRange) { el.quantizationRange.value = 10; }
      if (el.quantizationValue) el.quantizationValue.textContent = '10';
    } else if (name === 'music') {
      if (el.bandpassFilter)    el.bandpassFilter.checked = false;
      if (el.agcEnabled)        el.agcEnabled.checked = true;
      if (el.quantizationRange) { el.quantizationRange.value = 15; }
      if (el.quantizationValue) el.quantizationValue.textContent = '15';
    }
    // 'custom' does nothing — user sets values manually
  }

  function selectPreset(name) {
    if (name === 'speech' && el.presetSpeech) el.presetSpeech.checked = true;
    else if (name === 'music' && el.presetMusic) el.presetMusic.checked = true;
    else if (el.presetCustom) el.presetCustom.checked = true;
  }

  function getSelectedPreset() {
    if (el.presetSpeech && el.presetSpeech.checked) return 'speech';
    if (el.presetMusic  && el.presetMusic.checked)  return 'music';
    return 'custom';
  }

  // ─── Jaw Timeline Canvas ────────────────────────────────────────

  function drawTimeline(frames) {
    if (!el.jawTimelineCanvas || !el.timelinePanel) return;
    el.timelinePanel.style.display = 'block';

    var canvas = el.jawTimelineCanvas;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas resolution to match display size
    var rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * (window.devicePixelRatio || 1);
    canvas.height = rect.height * (window.devicePixelRatio || 1);
    ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);

    var w = rect.width;
    var h = rect.height;

    // Read theme colors from CSS variables
    var cs = getComputedStyle(document.documentElement);
    var bgColor = cs.getPropertyValue('--bs-tertiary-bg').trim() || '#1a1a1a';
    var infoColor = cs.getPropertyValue('--bs-info').trim() || '#0dcaf0';
    var primaryColor = cs.getPropertyValue('--bs-primary').trim() || '#0d6efd';
    var borderColor = cs.getPropertyValue('--bs-border-color').trim() || 'rgba(255,255,255,0.15)';

    // Clear
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);

    if (frames.length === 0) return;

    // Find angle range from frames
    var minA = frames[0].angle;
    var maxA = frames[0].angle;
    for (var i = 1; i < frames.length; i++) {
      if (frames[i].angle < minA) minA = frames[i].angle;
      if (frames[i].angle > maxA) maxA = frames[i].angle;
    }
    var range = maxA - minA;
    if (range < 1) range = 1;

    var barWidth = Math.max(1, w / frames.length);

    for (var j = 0; j < frames.length; j++) {
      var pct = (frames[j].angle - minA) / range;
      var barH = Math.max(1, pct * (h - 4));

      // Color based on amplitude
      var amp = frames[j].amplitude || 0;
      if (amp < 0.05) {
        ctx.fillStyle = '#2d4a6d';
      } else if (amp < 0.3) {
        ctx.fillStyle = infoColor;
      } else {
        ctx.fillStyle = primaryColor;
      }

      ctx.fillRect(j * barWidth, h - barH - 2, barWidth - (barWidth > 2 ? 1 : 0), barH);
    }

    // Draw midline
    ctx.strokeStyle = borderColor;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // ─── Toast Notifications ──────────────────────────────────────────

  function showToast(message, type) {
    if (window.showToast) {
      window.showToast(message, type);
    }
  }

  // ─── Bootstrap ────────────────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
