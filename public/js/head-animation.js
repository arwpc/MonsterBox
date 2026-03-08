/**
 * Head Animation Configuration JavaScript (ES5)
 * MonsterBox — Head tracking tuning page with webcam overlay
 *
 * Two independent toggles:
 *   1. OpenCV Detection toggle — starts/stops Python motion tracking process
 *   2. Head Tracking toggle — enables/disables servo movement (requires OpenCV)
 * All parameter changes are hot-updated immediately to the running process.
 */

(function() {
  'use strict';

  var currentCharacterId = null;
  var pollingInterval = null;
  var isOpenCVActive = false;
  var isHeadTrackingOn = false;
  var currentConfig = {};
  var availableServos = [];
  var availableWebcams = [];
  var hotUpdateTimer = null;
  var selectedServoData = null;
  var el = {};

  // ─── Initialization ───────────────────────────────────────────────

  function init() {
    cacheElements();
    bindEvents();
    readCharacterFromNav();
    if (currentCharacterId) {
      loadConfig(currentCharacterId);
      loadPresetsFromAPI();
    }
    // Bind save preset button
    var savePresetBtn = document.getElementById('savePresetBtn');
    if (savePresetBtn) savePresetBtn.addEventListener('click', saveCurrentAsPreset);
  }

  function cacheElements() {
    el = {
      ocvEnabled:           document.getElementById('ocvEnabled'),
      htEnabled:            document.getElementById('htEnabled'),
      htDisabledHint:       document.getElementById('htDisabledHint'),
      panServoSelect:       document.getElementById('panServoSelect'),
      webcamSelect:         document.getElementById('webcamSelect'),
      servoBoundsInfo:      document.getElementById('servoBoundsInfo'),
      smoothingRange:       document.getElementById('smoothingRange'),
      smoothingValue:       document.getElementById('smoothingValue'),
      deadzoneRange:        document.getElementById('deadzoneRange'),
      deadzoneValue:        document.getElementById('deadzoneValue'),
      centerDeg:            document.getElementById('centerDeg'),
      rangeDeg:             document.getElementById('rangeDeg'),
      invertPan:            document.getElementById('invertPan'),
      motionThresholdRange: document.getElementById('motionThresholdRange'),
      motionThresholdValue: document.getElementById('motionThresholdValue'),
      minContourArea:       document.getElementById('minContourArea'),
      maxContourArea:       document.getElementById('maxContourArea'),
      bgLearningRateRange:  document.getElementById('bgLearningRateRange'),
      bgLearningRateValue:  document.getElementById('bgLearningRateValue'),
      noiseKernelRange:     document.getElementById('noiseKernelRange'),
      noiseKernelValue:     document.getElementById('noiseKernelValue'),
      blurSizeRange:        document.getElementById('blurSizeRange'),
      blurSizeValue:        document.getElementById('blurSizeValue'),
      dilateSizeRange:      document.getElementById('dilateSizeRange'),
      dilateSizeValue:      document.getElementById('dilateSizeValue'),
      varThresholdRange:    document.getElementById('varThresholdRange'),
      varThresholdValue:    document.getElementById('varThresholdValue'),
      targetLockRange:      document.getElementById('targetLockRange'),
      targetLockValue:      document.getElementById('targetLockValue'),
      confirmFramesRange:   document.getElementById('confirmFramesRange'),
      confirmFramesValue:   document.getElementById('confirmFramesValue'),
      presetPerson:         document.getElementById('presetPerson'),
      presetNoisy:          document.getElementById('presetNoisy'),
      presetSensitive:      document.getElementById('presetSensitive'),
      saveConfigBtn:        document.getElementById('saveConfigBtn'),
      testSweepBtn:         document.getElementById('testSweepBtn'),
      emergencyStopBtn:     document.getElementById('emergencyStopBtn'),
      webcamStream:         document.getElementById('webcamStream'),
      trackingOverlay:      document.getElementById('trackingOverlay'),
      webcamPlaceholder:    document.getElementById('webcamPlaceholder'),
      webcamContainer:      document.getElementById('webcamContainer'),
      trackingDot:          document.getElementById('trackingDot'),
      trackingStatusText:   document.getElementById('trackingStatusText'),
      fpsDisplay:           document.getElementById('fpsDisplay'),
      targetStatus:         document.getElementById('targetStatus'),
      targetPosition:       document.getElementById('targetPosition'),
      headTrackingStatus:   document.getElementById('headTrackingStatus'),
      detectionMode:        document.getElementById('detectionMode')
    };
  }

  function bindEvents() {
    // Slider live value displays + hot-update
    bindSlider(el.smoothingRange, el.smoothingValue);
    bindSlider(el.deadzoneRange, el.deadzoneValue);
    bindSlider(el.motionThresholdRange, el.motionThresholdValue);
    bindSlider(el.bgLearningRateRange, el.bgLearningRateValue);
    bindSlider(el.noiseKernelRange, el.noiseKernelValue);
    bindSlider(el.blurSizeRange, el.blurSizeValue);
    bindSlider(el.dilateSizeRange, el.dilateSizeValue);
    bindSlider(el.varThresholdRange, el.varThresholdValue);
    bindSlider(el.targetLockRange, el.targetLockValue);
    bindSlider(el.confirmFramesRange, el.confirmFramesValue);

    // Preset buttons
    if (el.presetPerson)    el.presetPerson.addEventListener('click', function() { applyPreset('person'); });
    if (el.presetNoisy)     el.presetNoisy.addEventListener('click', function() { applyPreset('noisy'); });
    if (el.presetSensitive) el.presetSensitive.addEventListener('click', function() { applyPreset('sensitive'); });

    // Number inputs trigger hot-update
    if (el.centerDeg)       el.centerDeg.addEventListener('change', function() { scheduleHotUpdate(); });
    if (el.rangeDeg)        el.rangeDeg.addEventListener('change', function() { scheduleHotUpdate(); });
    if (el.minContourArea)  el.minContourArea.addEventListener('change', function() { scheduleHotUpdate(); });
    if (el.maxContourArea)  el.maxContourArea.addEventListener('change', function() { scheduleHotUpdate(); });
    if (el.invertPan)       el.invertPan.addEventListener('change', function() { scheduleHotUpdate(); });
    if (el.detectionMode)   el.detectionMode.addEventListener('change', function() { scheduleHotUpdate(); });

    // Buttons
    if (el.saveConfigBtn)    el.saveConfigBtn.addEventListener('click', saveConfiguration);
    if (el.testSweepBtn)     el.testSweepBtn.addEventListener('click', testSweep);
    if (el.emergencyStopBtn) el.emergencyStopBtn.addEventListener('click', emergencyStop);

    // Webcam dropdown
    if (el.webcamSelect) el.webcamSelect.addEventListener('change', onWebcamChange);

    // Pan servo dropdown
    if (el.panServoSelect) el.panServoSelect.addEventListener('change', onServoChange);

    // OpenCV toggle — directly starts/stops the Python process
    if (el.ocvEnabled) el.ocvEnabled.addEventListener('change', onOpenCVToggle);

    // Head Tracking toggle — enables/disables servo mapping
    if (el.htEnabled) el.htEnabled.addEventListener('change', onHeadTrackingToggle);

    // Page unload
    function onPageLeave() {
      stopPolling();
      if (hotUpdateTimer) { clearTimeout(hotUpdateTimer); hotUpdateTimer = null; }
      if (isOpenCVActive && currentCharacterId) {
        navigator.sendBeacon(
          '/setup/head-animation/api/head-tracking/' + currentCharacterId + '/stop',
          ''
        );
      }
    }
    window.addEventListener('pagehide', onPageLeave);
    window.addEventListener('beforeunload', onPageLeave);
  }

  function bindSlider(range, badge) {
    if (range) {
      range.addEventListener('input', function() {
        if (badge) badge.textContent = this.value;
        scheduleHotUpdate();
      });
    }
  }

  function readCharacterFromNav() {
    var mbId = window.__MB_CHAR_ID || null;
    if (mbId) {
      currentCharacterId = parseInt(mbId, 10) || null;
      return;
    }
    var charLabel = document.getElementById('charLabel');
    if (charLabel) {
      var id = charLabel.getAttribute('data-char-id');
      if (id && id !== '') {
        currentCharacterId = parseInt(id, 10);
      }
    }
  }

  // ─── Config Loading ───────────────────────────────────────────────

  function loadConfig(charId) {
    fetch('/setup/head-animation/api/head-tracking/' + charId)
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.success) {
          currentConfig = data.config;
          availableServos = data.availableServos || [];
          availableWebcams = data.availableWebcams || [];
          populateServoDropdown(availableServos);
          populateWebcamDropdown(availableWebcams);
          populateForm(data.config);

          // If OpenCV was already active, resume
          if (data.trackingActive) {
            isOpenCVActive = true;
            if (el.ocvEnabled) el.ocvEnabled.checked = true;
            updateOpenCVUI(true);
            startPolling();
            if (data.headTrackingEnabled) {
              isHeadTrackingOn = true;
              if (el.htEnabled) el.htEnabled.checked = true;
            }
          }
          updateFormState();
          updateHeadTrackingStatusDisplay();
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
    if (!el.panServoSelect) return;
    el.panServoSelect.innerHTML = '<option value="">Select a servo...</option>';

    servos.forEach(function(servo) {
      var opt = document.createElement('option');
      opt.value = servo.id;
      var label = servo.name;
      if (servo.calibrated) {
        label += ' (' + servo.minAngle + '\u00B0 \u2013 ' + servo.maxAngle + '\u00B0)';
      } else {
        label += ' (not calibrated)';
      }
      opt.textContent = label;
      if (currentConfig.panServoId === servo.id) opt.selected = true;
      el.panServoSelect.appendChild(opt);
    });

    onServoChange();
  }

  function populateWebcamDropdown(webcams) {
    if (!el.webcamSelect) return;
    el.webcamSelect.innerHTML = '<option value="">Select a webcam...</option>';

    webcams.forEach(function(webcam) {
      var opt = document.createElement('option');
      opt.value = webcam.id;
      opt.textContent = webcam.name;
      if (currentConfig.webcamPartId === webcam.id) opt.selected = true;
      el.webcamSelect.appendChild(opt);
    });

    if (currentConfig.webcamPartId) {
      showWebcamStream(currentConfig.webcamPartId);
    }
  }

  function populateForm(config) {
    if (el.ocvEnabled) el.ocvEnabled.checked = config.opencvEnabled !== false;
    if (el.htEnabled)  el.htEnabled.checked = config.enabled || false;
    if (config.panServoId && el.panServoSelect) el.panServoSelect.value = config.panServoId;
    if (config.webcamPartId && el.webcamSelect) el.webcamSelect.value = config.webcamPartId;

    setSlider(el.smoothingRange, el.smoothingValue, config.smoothing, 0.25);
    setSlider(el.deadzoneRange, el.deadzoneValue, config.deadzone, 5);
    setSlider(el.motionThresholdRange, el.motionThresholdValue, config.motionThreshold, 25);
    setSlider(el.bgLearningRateRange, el.bgLearningRateValue, config.backgroundLearningRate, 0.005);
    setSlider(el.noiseKernelRange, el.noiseKernelValue, config.noiseReductionKernelSize, 5);
    setSlider(el.blurSizeRange, el.blurSizeValue, config.blurSize, 5);
    setSlider(el.dilateSizeRange, el.dilateSizeValue, config.dilateSize, 9);
    setSlider(el.varThresholdRange, el.varThresholdValue, config.varThreshold, 25);
    setSlider(el.targetLockRange, el.targetLockValue, config.targetLockStrength, 5);
    setSlider(el.confirmFramesRange, el.confirmFramesValue, config.confirmFrames, 3);

    if (el.centerDeg) el.centerDeg.value = config.centerDeg != null ? config.centerDeg : 0;
    if (el.rangeDeg)  el.rangeDeg.value = config.rangeDeg || 60;
    if (el.invertPan) el.invertPan.checked = config.invertPan || false;
    if (el.detectionMode) el.detectionMode.value = config.detectionMode || 'person';
  }

  function setSlider(range, badge, val, fallback) {
    var v = val != null ? val : fallback;
    if (range) range.value = v;
    if (badge) badge.textContent = v;
  }

  function updateFormState() {
    var ocvOn = el.ocvEnabled ? el.ocvEnabled.checked : false;
    var htOn = el.htEnabled ? el.htEnabled.checked : false;

    // Head tracking requires OpenCV
    if (!ocvOn && htOn) {
      if (el.htEnabled) el.htEnabled.checked = false;
      htOn = false;
      if (isHeadTrackingOn) disableHeadTrackingOnServer();
    }

    if (el.htEnabled) el.htEnabled.disabled = !isOpenCVActive;
    if (el.htDisabledHint) el.htDisabledHint.style.display = isOpenCVActive ? 'none' : 'inline';

    // OpenCV inputs
    var ocvInputs = [
      el.webcamSelect, el.motionThresholdRange, el.minContourArea,
      el.maxContourArea, el.bgLearningRateRange, el.noiseKernelRange,
      el.blurSizeRange, el.dilateSizeRange, el.varThresholdRange,
      el.targetLockRange, el.confirmFramesRange, el.detectionMode
    ];
    ocvInputs.forEach(function(inp) { if (inp) inp.disabled = !ocvOn; });

    // Servo inputs
    var servoInputs = [
      el.panServoSelect, el.smoothingRange, el.deadzoneRange,
      el.centerDeg, el.rangeDeg, el.invertPan
    ];
    servoInputs.forEach(function(inp) { if (inp) inp.disabled = !htOn; });

    var hasServo = el.panServoSelect && el.panServoSelect.value;
    if (el.testSweepBtn) el.testSweepBtn.disabled = !htOn || !hasServo;

    updateHeadTrackingStatusDisplay();
  }

  // ─── OpenCV Toggle — start/stop ────────────────────────────────────

  function onOpenCVToggle() {
    var ocvOn = el.ocvEnabled ? el.ocvEnabled.checked : false;
    if (ocvOn) {
      startOpenCV();
    } else {
      stopOpenCV();
    }
  }

  function startOpenCV() {
    if (!currentCharacterId || isOpenCVActive) { updateFormState(); return; }

    var webcamId = el.webcamSelect ? el.webcamSelect.value : '';
    if (!webcamId) {
      showToast('Please select a webcam first', 'error');
      if (el.ocvEnabled) el.ocvEnabled.checked = false;
      updateFormState();
      return;
    }

    // Save config so the server has current params
    var config = buildConfigFromForm();
    config.opencvEnabled = true;

    fetch('/setup/head-animation/api/head-tracking/' + currentCharacterId, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    })
    .then(function(r) { return r.json(); })
    .then(function(saveData) {
      if (!saveData.success) throw new Error('Save failed: ' + (saveData.error || 'Unknown'));
      currentConfig = config;
      return fetch('/setup/head-animation/api/head-tracking/' + currentCharacterId + '/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.success) {
        isOpenCVActive = true;
        updateOpenCVUI(true);
        startPolling();
        showToast('OpenCV started', 'success');

        // Auto-enable head tracking if toggle is on and servo selected
        var htOn = el.htEnabled ? el.htEnabled.checked : false;
        var hasServo = el.panServoSelect && el.panServoSelect.value;
        if (htOn && hasServo) enableHeadTrackingOnServer();
      } else {
        showToast('Start failed: ' + (data.error || 'Unknown'), 'error');
        if (el.ocvEnabled) el.ocvEnabled.checked = false;
      }
      updateFormState();
    })
    .catch(function(err) {
      console.error('Start OpenCV error:', err);
      showToast('Failed to start: ' + err.message, 'error');
      if (el.ocvEnabled) el.ocvEnabled.checked = false;
      updateFormState();
    });
  }

  function stopOpenCV() {
    if (!currentCharacterId) return;

    if (isHeadTrackingOn) disableHeadTrackingOnServer();

    stopPolling();
    isOpenCVActive = false;
    isHeadTrackingOn = false;
    updateOpenCVUI(false);
    clearOverlay();
    updateStatusDisplay(null);
    updateFormState();

    fetch('/setup/head-animation/api/head-tracking/' + currentCharacterId + '/stop', {
      method: 'POST'
    }).catch(function() {});

    showToast('OpenCV stopped', 'success');
  }

  function emergencyStop() {
    if (el.ocvEnabled) el.ocvEnabled.checked = false;
    if (el.htEnabled) el.htEnabled.checked = false;
    stopOpenCV();
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

  function updateOpenCVUI(active) {
    if (el.trackingDot) el.trackingDot.className = 'status-dot ' + (active ? 'active' : 'inactive');
    if (el.trackingStatusText) el.trackingStatusText.textContent = active ? 'OpenCV Running' : 'Stopped';
  }

  // ─── Servo Selection ────────────────────────────────────────────────

  function onServoChange() {
    var servoId = el.panServoSelect ? el.panServoSelect.value : '';
    selectedServoData = null;

    if (servoId) {
      for (var i = 0; i < availableServos.length; i++) {
        if (availableServos[i].id === servoId) {
          selectedServoData = availableServos[i];
          break;
        }
      }
    }

    if (el.servoBoundsInfo) {
      if (selectedServoData && selectedServoData.calibrated) {
        var minA = selectedServoData.minAngle;
        var maxA = selectedServoData.maxAngle;
        var midA = Math.round((minA + maxA) / 2);
        var rangeA = maxA - minA;
        el.servoBoundsInfo.innerHTML = '<i class="bi bi-info-circle"></i> Calibrated: ' +
          minA + '\u00B0 \u2013 ' + maxA + '\u00B0 (center ' + midA + '\u00B0, range ' + rangeA + '\u00B0)';
        el.servoBoundsInfo.style.display = 'block';

        if (el.centerDeg && el.rangeDeg) {
          var curCenter = parseInt(el.centerDeg.value, 10);
          var curRange = parseInt(el.rangeDeg.value, 10);
          if ((curCenter === 0 && curRange === 60) || !currentConfig.panServoId) {
            el.centerDeg.value = midA;
            el.rangeDeg.value = Math.floor(rangeA / 2);
            el.centerDeg.min = minA;
            el.centerDeg.max = maxA;
          }
        }
      } else if (selectedServoData) {
        el.servoBoundsInfo.innerHTML = '<i class="bi bi-exclamation-triangle"></i> Not calibrated';
        el.servoBoundsInfo.style.display = 'block';
      } else {
        el.servoBoundsInfo.style.display = 'none';
      }
    }

    if (isHeadTrackingOn && isOpenCVActive) scheduleHotUpdate();
    updateFormState();
  }

  // ─── Head Tracking Toggle ───────────────────────────────────────────

  function onHeadTrackingToggle() {
    var htOn = el.htEnabled ? el.htEnabled.checked : false;

    if (htOn) {
      if (!isOpenCVActive) {
        showToast('Start OpenCV first', 'error');
        if (el.htEnabled) el.htEnabled.checked = false;
        return;
      }
      var hasServo = el.panServoSelect && el.panServoSelect.value;
      if (!hasServo) {
        showToast('Select a pan servo first', 'error');
        if (el.htEnabled) el.htEnabled.checked = false;
        return;
      }
      enableHeadTrackingOnServer();
    } else {
      disableHeadTrackingOnServer();
    }
    updateFormState();
  }

  function enableHeadTrackingOnServer() {
    if (!currentCharacterId || !isOpenCVActive) return;
    var panServoId = el.panServoSelect ? el.panServoSelect.value : '';
    if (!panServoId) return;

    fetch('/setup/head-animation/api/head-tracking/' + currentCharacterId + '/enable-servo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        panServoId: panServoId,
        centerDeg:  parseInt(el.centerDeg ? el.centerDeg.value : 0, 10),
        rangeDeg:   parseInt(el.rangeDeg ? el.rangeDeg.value : 60, 10),
        invertPan:  el.invertPan ? el.invertPan.checked : false,
        smoothing:  parseFloat(el.smoothingRange ? el.smoothingRange.value : 0.25),
        deadzone:   parseInt(el.deadzoneRange ? el.deadzoneRange.value : 5, 10)
      })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.success) {
        isHeadTrackingOn = true;
        showToast('Head tracking enabled', 'success');
      } else {
        showToast('Failed: ' + (data.error || 'Unknown'), 'error');
        if (el.htEnabled) el.htEnabled.checked = false;
      }
      updateHeadTrackingStatusDisplay();
    })
    .catch(function(err) {
      console.error('Enable head tracking error:', err);
      if (el.htEnabled) el.htEnabled.checked = false;
    });
  }

  function disableHeadTrackingOnServer() {
    if (!currentCharacterId) return;
    isHeadTrackingOn = false;
    updateHeadTrackingStatusDisplay();
    fetch('/setup/head-animation/api/head-tracking/' + currentCharacterId + '/disable-servo', {
      method: 'POST'
    }).catch(function() {});
  }

  function updateHeadTrackingStatusDisplay() {
    if (el.headTrackingStatus) {
      if (isHeadTrackingOn && isOpenCVActive) {
        el.headTrackingStatus.textContent = 'Active';
        el.headTrackingStatus.className = 'fw-bold text-warning';
      } else {
        el.headTrackingStatus.textContent = 'Off';
        el.headTrackingStatus.className = 'fw-bold';
      }
    }
  }

  // ─── Webcam Stream ────────────────────────────────────────────────

  function onWebcamChange() {
    var webcamId = el.webcamSelect ? el.webcamSelect.value : '';
    if (webcamId) {
      showWebcamStream(webcamId);
    } else {
      hideWebcamStream();
    }
    updateFormState();
  }

  function showWebcamStream(webcamId) {
    if (!el.webcamStream || !el.webcamPlaceholder) return;
    el.webcamPlaceholder.style.display = 'none';
    el.webcamStream.style.display = 'block';

    el.webcamStream.onerror = function() {
      el.webcamStream.style.display = 'none';
      if (el.webcamPlaceholder) {
        el.webcamPlaceholder.style.display = 'flex';
        el.webcamPlaceholder.innerHTML = '<div class="text-center text-warning">' +
          '<i class="bi bi-exclamation-triangle" style="font-size:2rem;"></i>' +
          '<p class="mb-0 mt-1">Webcam stream unavailable. Check mjpg-streamer.</p>' +
          '<button class="btn btn-outline-warning btn-sm mt-2" onclick="document.getElementById(\'webcamSelect\').dispatchEvent(new Event(\'change\'))">Retry</button>' +
          '</div>';
      }
    };
    el.webcamStream.onload = function() { sizeOverlayCanvas(); };
    el.webcamStream.src = '/setup/calibration/api/webcam/parts/' + webcamId + '/stream';
  }

  function hideWebcamStream() {
    if (el.webcamStream) {
      el.webcamStream.onerror = null;
      el.webcamStream.onload = null;
      el.webcamStream.src = '';
      el.webcamStream.style.display = 'none';
    }
    if (el.webcamPlaceholder) {
      el.webcamPlaceholder.style.display = 'flex';
      el.webcamPlaceholder.innerHTML = '<div class="text-center"><i class="bi bi-webcam" style="font-size:2rem;"></i><p class="mb-0 mt-1">Select a webcam to preview</p></div>';
    }
    clearOverlay();
  }

  function sizeOverlayCanvas() {
    if (!el.trackingOverlay || !el.webcamStream) return;
    el.trackingOverlay.width = el.webcamStream.clientWidth;
    el.trackingOverlay.height = el.webcamStream.clientHeight;
  }

  // ─── Tracking Overlay ─────────────────────────────────────────────

  function drawOverlay(status) {
    if (!el.trackingOverlay) return;
    var canvas = el.trackingOverlay;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (el.webcamStream && el.webcamStream.clientWidth > 0) {
      if (canvas.width !== el.webcamStream.clientWidth || canvas.height !== el.webcamStream.clientHeight) {
        canvas.width = el.webcamStream.clientWidth;
        canvas.height = el.webcamStream.clientHeight;
      }
    }

    var w = canvas.width;
    var h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (!status || !status.active) return;

    // Deadzone band
    var dead = parseInt(el.deadzoneRange ? el.deadzoneRange.value : 5, 10);
    if (dead > 0) {
      var dzL = ((50 - dead) / 100) * w;
      var dzR = ((50 + dead) / 100) * w;
      ctx.fillStyle = 'rgba(100, 100, 255, 0.08)';
      ctx.fillRect(dzL, 0, dzR - dzL, h);
      ctx.strokeStyle = 'rgba(100, 100, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(dzL, 0); ctx.lineTo(dzL, h);
      ctx.moveTo(dzR, 0); ctx.lineTo(dzR, h);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    var pos = status.targetPosition || [50, 50];
    var x = (pos[0] / 100) * w;
    var y = (pos[1] / 100) * h;

    // Bounding box
    if (status.bbox) {
      ctx.strokeStyle = 'rgba(0, 200, 255, 0.6)';
      ctx.lineWidth = 2;
      ctx.strokeRect(
        (status.bbox.x / 100) * w,
        (status.bbox.y / 100) * h,
        (status.bbox.w / 100) * w,
        (status.bbox.h / 100) * h
      );
    }

    if (status.targetDetected) {
      ctx.strokeStyle = 'rgba(0, 255, 0, 0.8)';
      ctx.lineWidth = 2;

      var cs = 20;
      ctx.beginPath();
      ctx.moveTo(x - cs, y); ctx.lineTo(x + cs, y);
      ctx.moveTo(x, y - cs); ctx.lineTo(x, y + cs);
      ctx.stroke();

      var radius = Math.max(15, (status.targetSize || 0) * 0.3);
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = 'rgba(0, 255, 0, 0.9)';
      ctx.font = '12px monospace';
      ctx.fillText(Math.round(pos[0]) + '%, ' + Math.round(pos[1]) + '%', x + cs + 4, y - 4);

      if (isHeadTrackingOn) {
        ctx.fillStyle = 'rgba(255, 200, 0, 0.8)';
        ctx.font = '10px monospace';
        ctx.fillText('SERVO', x + cs + 4, y + 12);
      }
    } else {
      ctx.strokeStyle = 'rgba(255, 50, 50, 0.6)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      var cx = w / 2, cy = h / 2;
      ctx.beginPath();
      ctx.moveTo(cx - 15, cy); ctx.lineTo(cx + 15, cy);
      ctx.moveTo(cx, cy - 15); ctx.lineTo(cx, cy + 15);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255, 50, 50, 0.7)';
      ctx.font = '11px monospace';
      ctx.fillText('No target', cx + 18, cy - 4);
    }
  }

  function clearOverlay() {
    if (!el.trackingOverlay) return;
    var ctx = el.trackingOverlay.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, el.trackingOverlay.width, el.trackingOverlay.height);
  }

  // ─── Status Polling ───────────────────────────────────────────────

  function startPolling() {
    stopPolling();
    pollingInterval = setInterval(function() {
      if (!isOpenCVActive || !currentCharacterId) { stopPolling(); return; }
      pollStatus();
    }, 60);
  }

  function stopPolling() {
    if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; }
  }

  function pollStatus() {
    fetch('/setup/head-animation/api/head-tracking/' + currentCharacterId + '/status')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.success) {
          drawOverlay(data);
          updateStatusDisplay(data);
        }
      })
      .catch(function() {});
  }

  function updateStatusDisplay(data) {
    if (!data) {
      if (el.fpsDisplay)      el.fpsDisplay.textContent = '0 FPS';
      if (el.targetStatus)    el.targetStatus.textContent = 'No target';
      if (el.targetPosition)  el.targetPosition.textContent = '--';
      if (el.trackingDot)     el.trackingDot.className = 'status-dot inactive';
      return;
    }

    if (el.fpsDisplay) el.fpsDisplay.textContent = (data.fps || 0) + ' FPS';

    if (data.targetDetected) {
      if (el.targetStatus) el.targetStatus.textContent = 'Target detected';
      if (el.trackingDot)  el.trackingDot.className = 'status-dot detecting';
      var pos = data.targetPosition || [50, 50];
      if (el.targetPosition) el.targetPosition.textContent = Math.round(pos[0]) + '%, ' + Math.round(pos[1]) + '%';
    } else {
      if (el.targetStatus)   el.targetStatus.textContent = 'Searching...';
      if (el.trackingDot)    el.trackingDot.className = 'status-dot active';
      if (el.targetPosition) el.targetPosition.textContent = '--';
    }

    if (data.headTrackingEnabled !== undefined) {
      isHeadTrackingOn = data.headTrackingEnabled;
      updateHeadTrackingStatusDisplay();
    }
  }

  // ─── Hot-Update Parameters ────────────────────────────────────────

  function scheduleHotUpdate() {
    if (!isOpenCVActive) return;
    if (hotUpdateTimer) clearTimeout(hotUpdateTimer);
    hotUpdateTimer = setTimeout(function() {
      hotUpdateTimer = null;
      sendHotUpdate();
    }, 150);
  }

  function sendHotUpdate() {
    if (!currentCharacterId || !isOpenCVActive) return;

    var params = {
      smoothing:                parseFloat(el.smoothingRange ? el.smoothingRange.value : 0.25),
      deadzone:                 parseInt(el.deadzoneRange ? el.deadzoneRange.value : 5, 10),
      centerDeg:                parseInt(el.centerDeg ? el.centerDeg.value : 0, 10),
      rangeDeg:                 parseInt(el.rangeDeg ? el.rangeDeg.value : 60, 10),
      invertPan:                el.invertPan ? el.invertPan.checked : false,
      motionThreshold:          parseInt(el.motionThresholdRange ? el.motionThresholdRange.value : 25, 10),
      minContourArea:           parseInt(el.minContourArea ? el.minContourArea.value : 3000, 10),
      maxContourArea:           parseInt(el.maxContourArea ? el.maxContourArea.value : 100000, 10),
      backgroundLearningRate:   parseFloat(el.bgLearningRateRange ? el.bgLearningRateRange.value : 0.005),
      noiseReductionKernelSize: parseInt(el.noiseKernelRange ? el.noiseKernelRange.value : 5, 10),
      blurSize:                 parseInt(el.blurSizeRange ? el.blurSizeRange.value : 5, 10),
      dilateSize:               parseInt(el.dilateSizeRange ? el.dilateSizeRange.value : 9, 10),
      varThreshold:             parseInt(el.varThresholdRange ? el.varThresholdRange.value : 25, 10),
      targetLockStrength:       parseInt(el.targetLockRange ? el.targetLockRange.value : 5, 10),
      confirmFrames:            parseInt(el.confirmFramesRange ? el.confirmFramesRange.value : 3, 10),
      detectionMode:            el.detectionMode ? el.detectionMode.value : 'person'
    };

    fetch('/setup/head-animation/api/head-tracking/' + currentCharacterId + '/params', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    }).catch(function(err) {
      console.warn('Hot-update error:', err);
    });
  }

  // ─── Save Configuration ───────────────────────────────────────────

  function buildConfigFromForm() {
    return {
      opencvEnabled:            el.ocvEnabled ? el.ocvEnabled.checked : true,
      enabled:                  el.htEnabled ? el.htEnabled.checked : false,
      panServoId:               el.panServoSelect ? (el.panServoSelect.value || null) : null,
      webcamPartId:             el.webcamSelect ? (el.webcamSelect.value || null) : null,
      smoothing:                parseFloat(el.smoothingRange ? el.smoothingRange.value : 0.25),
      deadzone:                 parseInt(el.deadzoneRange ? el.deadzoneRange.value : 5, 10),
      centerDeg:                parseInt(el.centerDeg ? el.centerDeg.value : 0, 10),
      rangeDeg:                 parseInt(el.rangeDeg ? el.rangeDeg.value : 60, 10),
      invertPan:                el.invertPan ? el.invertPan.checked : false,
      motionThreshold:          parseInt(el.motionThresholdRange ? el.motionThresholdRange.value : 25, 10),
      minContourArea:           parseInt(el.minContourArea ? el.minContourArea.value : 3000, 10),
      maxContourArea:           parseInt(el.maxContourArea ? el.maxContourArea.value : 100000, 10),
      backgroundLearningRate:   parseFloat(el.bgLearningRateRange ? el.bgLearningRateRange.value : 0.005),
      noiseReductionKernelSize: parseInt(el.noiseKernelRange ? el.noiseKernelRange.value : 5, 10),
      blurSize:                 parseInt(el.blurSizeRange ? el.blurSizeRange.value : 5, 10),
      dilateSize:               parseInt(el.dilateSizeRange ? el.dilateSizeRange.value : 9, 10),
      varThreshold:             parseInt(el.varThresholdRange ? el.varThresholdRange.value : 25, 10),
      targetLockStrength:       parseInt(el.targetLockRange ? el.targetLockRange.value : 5, 10),
      confirmFrames:            parseInt(el.confirmFramesRange ? el.confirmFramesRange.value : 3, 10),
      detectionMode:            el.detectionMode ? el.detectionMode.value : 'person'
    };
  }

  function saveConfiguration() {
    if (!currentCharacterId) { showToast('No character selected', 'error'); return; }
    var config = buildConfigFromForm();

    if (config.enabled && !config.panServoId) {
      showToast('Select a pan servo when head tracking is enabled', 'error');
      return;
    }
    if (config.opencvEnabled && !config.webcamPartId) {
      showToast('Select a webcam when OpenCV is enabled', 'error');
      return;
    }

    if (el.saveConfigBtn) {
      el.saveConfigBtn.disabled = true;
      el.saveConfigBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Saving...';
    }

    fetch('/setup/head-animation/api/head-tracking/' + currentCharacterId, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (el.saveConfigBtn) {
        el.saveConfigBtn.disabled = false;
        el.saveConfigBtn.innerHTML = '<i class="bi bi-save"></i> Save Config';
      }
      if (data.success) {
        currentConfig = config;
        showToast('Configuration saved', 'success');
      } else {
        showToast('Save failed: ' + (data.error || 'Unknown'), 'error');
      }
    })
    .catch(function(err) {
      console.error('Save error:', err);
      if (el.saveConfigBtn) {
        el.saveConfigBtn.disabled = false;
        el.saveConfigBtn.innerHTML = '<i class="bi bi-save"></i> Save Config';
      }
      showToast('Failed to save configuration', 'error');
    });
  }

  // ─── Test Sweep ───────────────────────────────────────────────────

  function testSweep() {
    if (!currentCharacterId) return;
    if (el.testSweepBtn) {
      el.testSweepBtn.disabled = true;
      el.testSweepBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Sweeping...';
    }

    fetch('/setup/head-animation/api/head-tracking/' + currentCharacterId + '/test-sweep', {
      method: 'POST'
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (el.testSweepBtn) {
        el.testSweepBtn.disabled = false;
        el.testSweepBtn.innerHTML = '<i class="bi bi-arrow-left-right"></i> Test Sweep';
      }
      if (data.success) {
        showToast('Sweep: ' + data.minAngle + '\u00B0\u2013' + data.maxAngle + '\u00B0', 'success');
      } else {
        showToast('Sweep failed: ' + (data.error || 'Unknown'), 'error');
      }
    })
    .catch(function(err) {
      console.error('Sweep error:', err);
      if (el.testSweepBtn) {
        el.testSweepBtn.disabled = false;
        el.testSweepBtn.innerHTML = '<i class="bi bi-arrow-left-right"></i> Test Sweep';
      }
      showToast('Sweep request failed', 'error');
    });
  }

  // ─── Toast ─────────────────────────────────────────────────────────

  function showToast(message, type) {
    if (window.showToast) window.showToast(message, type);
  }

  // ─── Presets ───────────────────────────────────────────────────────

  var PRESETS = {
    person: {
      detectionMode: 'person', motionThreshold: 20, minContourArea: 5000, maxContourArea: 150000,
      backgroundLearningRate: 0.003, noiseReductionKernelSize: 5, blurSize: 7,
      dilateSize: 11, varThreshold: 20, targetLockStrength: 7, confirmFrames: 2
    },
    noisy: {
      detectionMode: 'person', motionThreshold: 35, minContourArea: 8000, maxContourArea: 100000,
      backgroundLearningRate: 0.002, noiseReductionKernelSize: 7, blurSize: 9,
      dilateSize: 13, varThreshold: 35, targetLockStrength: 8, confirmFrames: 5
    },
    sensitive: {
      detectionMode: 'person+motion', motionThreshold: 12, minContourArea: 1500, maxContourArea: 200000,
      backgroundLearningRate: 0.008, noiseReductionKernelSize: 3, blurSize: 5,
      dilateSize: 7, varThreshold: 15, targetLockStrength: 4, confirmFrames: 2
    }
  };

  function applyPresetParams(params) {
    if (!params) return;
    if (params.motionThreshold != null) setSlider(el.motionThresholdRange, el.motionThresholdValue, params.motionThreshold);
    if (params.minContourArea != null && el.minContourArea) el.minContourArea.value = params.minContourArea;
    if (params.maxContourArea != null && el.maxContourArea) el.maxContourArea.value = params.maxContourArea;
    if (params.backgroundLearningRate != null) setSlider(el.bgLearningRateRange, el.bgLearningRateValue, params.backgroundLearningRate);
    if (params.noiseReductionKernelSize != null) setSlider(el.noiseKernelRange, el.noiseKernelValue, params.noiseReductionKernelSize);
    if (params.blurSize != null) setSlider(el.blurSizeRange, el.blurSizeValue, params.blurSize);
    if (params.dilateSize != null) setSlider(el.dilateSizeRange, el.dilateSizeValue, params.dilateSize);
    if (params.varThreshold != null) setSlider(el.varThresholdRange, el.varThresholdValue, params.varThreshold);
    if (params.targetLockStrength != null) setSlider(el.targetLockRange, el.targetLockValue, params.targetLockStrength);
    if (params.confirmFrames != null) setSlider(el.confirmFramesRange, el.confirmFramesValue, params.confirmFrames);
    if (params.detectionMode != null && el.detectionMode) el.detectionMode.value = params.detectionMode;
    scheduleHotUpdate();
  }

  function applyPreset(name) {
    var preset = PRESETS[name];
    if (!preset) return;
    applyPresetParams(preset);
    showToast('Applied "' + name + '" preset', 'success');
  }

  function loadPresetsFromAPI() {
    if (!currentCharacterId) return;
    fetch('/setup/head-animation/api/head-tracking/' + currentCharacterId + '/presets')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (!data.success || !data.presets) return;
        renderCustomPresets(data.presets.filter(function(p) { return !p.builtin; }));
      })
      .catch(function() {});
  }

  function renderCustomPresets(customs) {
    var container = document.getElementById('presetsContainer');
    if (!container) return;
    // Remove old custom preset buttons
    var old = container.querySelectorAll('.custom-preset-btn');
    for (var i = 0; i < old.length; i++) old[i].remove();
    // Add custom presets
    customs.forEach(function(p) {
      var wrapper = document.createElement('span');
      wrapper.className = 'custom-preset-btn btn-group btn-group-sm';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-outline-secondary btn-sm';
      btn.textContent = p.name;
      btn.addEventListener('click', function() {
        applyPresetParams(p.params);
        showToast('Applied "' + p.name + '"', 'success');
      });
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn btn-outline-danger btn-sm';
      del.innerHTML = '<i class="bi bi-x"></i>';
      del.addEventListener('click', function() {
        deleteCustomPreset(p.id);
      });
      wrapper.appendChild(btn);
      wrapper.appendChild(del);
      container.appendChild(wrapper);
    });
  }

  function saveCurrentAsPreset() {
    if (!currentCharacterId) { showToast('No character selected', 'error'); return; }
    var name = prompt('Preset name:');
    if (!name || !name.trim()) return;
    var params = {
      motionThreshold:          parseInt(el.motionThresholdRange ? el.motionThresholdRange.value : 25, 10),
      minContourArea:           parseInt(el.minContourArea ? el.minContourArea.value : 3000, 10),
      maxContourArea:           parseInt(el.maxContourArea ? el.maxContourArea.value : 100000, 10),
      backgroundLearningRate:   parseFloat(el.bgLearningRateRange ? el.bgLearningRateRange.value : 0.005),
      noiseReductionKernelSize: parseInt(el.noiseKernelRange ? el.noiseKernelRange.value : 5, 10),
      blurSize:                 parseInt(el.blurSizeRange ? el.blurSizeRange.value : 5, 10),
      dilateSize:               parseInt(el.dilateSizeRange ? el.dilateSizeRange.value : 9, 10),
      varThreshold:             parseInt(el.varThresholdRange ? el.varThresholdRange.value : 25, 10),
      targetLockStrength:       parseInt(el.targetLockRange ? el.targetLockRange.value : 5, 10),
      confirmFrames:            parseInt(el.confirmFramesRange ? el.confirmFramesRange.value : 3, 10)
    };
    fetch('/setup/head-animation/api/head-tracking/' + currentCharacterId + '/presets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), params: params })
    })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.success) {
          showToast('Preset "' + name.trim() + '" saved', 'success');
          loadPresetsFromAPI();
        } else {
          showToast('Failed: ' + (data.error || 'Unknown'), 'error');
        }
      })
      .catch(function(err) { showToast('Error: ' + err.message, 'error'); });
  }

  function deleteCustomPreset(presetId) {
    if (!currentCharacterId) return;
    fetch('/setup/head-animation/api/head-tracking/' + currentCharacterId + '/presets/' + presetId, { method: 'DELETE' })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.success) {
          showToast('Preset deleted', 'success');
          loadPresetsFromAPI();
        } else {
          showToast('Failed: ' + (data.error || 'Unknown'), 'error');
        }
      })
      .catch(function(err) { showToast('Error: ' + err.message, 'error'); });
  }

  // ─── Tooltip Initialization ───────────────────────────────────────

  function initTooltips() {
    var tooltipEls = document.querySelectorAll('[data-bs-toggle="tooltip"]');
    for (var i = 0; i < tooltipEls.length; i++) {
      new bootstrap.Tooltip(tooltipEls[i]);
    }
  }

  // ─── Bootstrap ────────────────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { init(); initTooltips(); });
  } else {
    init();
    initTooltips();
  }

})();
