/**
 * Head Animation Configuration JavaScript (ES5)
 * MonsterBox — Head tracking tuning page with webcam overlay
 * Handles webcam preview, tracking overlay, start/stop, save, and hot-update.
 *
 * Two independent toggles:
 *   1. OpenCV Detection — starts Python motion tracking, shows overlays (webcam only)
 *   2. Head Tracking — enables servo movement from detected motion (requires OpenCV)
 */

(function() {
  'use strict';

  var currentCharacterId = null;
  var pollingInterval = null;
  var isOpenCVActive = false;      // Python motion tracking process running
  var isHeadTrackingOn = false;    // Servo mapping enabled on server
  var currentConfig = {};
  var availableServos = [];
  var availableWebcams = [];
  var hotUpdateTimer = null;
  var selectedServoData = null;    // calibration data for selected servo
  var el = {};

  // ─── Initialization ───────────────────────────────────────────────

  function init() {
    cacheElements();
    bindEvents();
    readCharacterFromNav();
    if (currentCharacterId) {
      loadConfig(currentCharacterId);
    }
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
      saveConfigBtn:        document.getElementById('saveConfigBtn'),
      startTrackingBtn:     document.getElementById('startTrackingBtn'),
      stopTrackingBtn:      document.getElementById('stopTrackingBtn'),
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
      headTrackingStatus:   document.getElementById('headTrackingStatus')
    };
  }

  function bindEvents() {
    // Slider live value displays
    if (el.smoothingRange) {
      el.smoothingRange.addEventListener('input', function() {
        if (el.smoothingValue) el.smoothingValue.textContent = this.value;
        scheduleHotUpdate();
      });
    }
    if (el.deadzoneRange) {
      el.deadzoneRange.addEventListener('input', function() {
        if (el.deadzoneValue) el.deadzoneValue.textContent = this.value;
        scheduleHotUpdate();
      });
    }
    if (el.motionThresholdRange) {
      el.motionThresholdRange.addEventListener('input', function() {
        if (el.motionThresholdValue) el.motionThresholdValue.textContent = this.value;
        scheduleHotUpdate();
      });
    }
    if (el.bgLearningRateRange) {
      el.bgLearningRateRange.addEventListener('input', function() {
        if (el.bgLearningRateValue) el.bgLearningRateValue.textContent = this.value;
        scheduleHotUpdate();
      });
    }
    if (el.noiseKernelRange) {
      el.noiseKernelRange.addEventListener('input', function() {
        if (el.noiseKernelValue) el.noiseKernelValue.textContent = this.value;
        scheduleHotUpdate();
      });
    }

    // Number inputs also trigger hot-update
    if (el.centerDeg)       el.centerDeg.addEventListener('change', function() { scheduleHotUpdate(); });
    if (el.rangeDeg)        el.rangeDeg.addEventListener('change', function() { scheduleHotUpdate(); });
    if (el.minContourArea)  el.minContourArea.addEventListener('change', function() { scheduleHotUpdate(); });
    if (el.maxContourArea)  el.maxContourArea.addEventListener('change', function() { scheduleHotUpdate(); });
    if (el.invertPan)       el.invertPan.addEventListener('change', function() { scheduleHotUpdate(); });

    // Buttons
    if (el.saveConfigBtn)    el.saveConfigBtn.addEventListener('click', saveConfiguration);
    if (el.startTrackingBtn) el.startTrackingBtn.addEventListener('click', startOpenCV);
    if (el.stopTrackingBtn)  el.stopTrackingBtn.addEventListener('click', stopOpenCV);
    if (el.testSweepBtn)     el.testSweepBtn.addEventListener('click', testSweep);
    if (el.emergencyStopBtn) el.emergencyStopBtn.addEventListener('click', emergencyStop);

    // Webcam dropdown — show stream on selection
    if (el.webcamSelect) el.webcamSelect.addEventListener('change', onWebcamChange);

    // Pan servo dropdown — update calibration bounds display
    if (el.panServoSelect) el.panServoSelect.addEventListener('change', onServoChange);

    // OpenCV toggle — controls webcam + opencv params
    if (el.ocvEnabled) el.ocvEnabled.addEventListener('change', updateFormState);

    // Head Tracking toggle — controls servo params, requires OpenCV
    if (el.htEnabled) el.htEnabled.addEventListener('change', onHeadTrackingToggle);

    // Page unload — stop tracking and clean up timers
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
          updateFormState();

          // If OpenCV was already active, resume polling
          if (data.trackingActive) {
            isOpenCVActive = true;
            updateOpenCVUI(true);
            startPolling();
            // Check if head tracking was also enabled
            if (data.headTrackingEnabled) {
              isHeadTrackingOn = true;
            }
          }
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

    // Show bounds for initially selected servo
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

    // Show stream if webcam already selected
    if (currentConfig.webcamPartId) {
      showWebcamStream(currentConfig.webcamPartId);
    }
  }

  function populateForm(config) {
    if (el.ocvEnabled) el.ocvEnabled.checked = config.opencvEnabled !== false;
    if (el.htEnabled)  el.htEnabled.checked = config.enabled || false;
    if (config.panServoId && el.panServoSelect) el.panServoSelect.value = config.panServoId;
    if (config.webcamPartId && el.webcamSelect) el.webcamSelect.value = config.webcamPartId;

    if (el.smoothingRange)       { el.smoothingRange.value = config.smoothing || 0.3; }
    if (el.smoothingValue)       el.smoothingValue.textContent = config.smoothing || 0.3;
    if (el.deadzoneRange)        { el.deadzoneRange.value = config.deadzone || 5; }
    if (el.deadzoneValue)        el.deadzoneValue.textContent = config.deadzone || 5;
    if (el.centerDeg)            el.centerDeg.value = config.centerDeg != null ? config.centerDeg : 0;
    if (el.rangeDeg)             el.rangeDeg.value = config.rangeDeg || 60;
    if (el.invertPan)            el.invertPan.checked = config.invertPan || false;

    if (el.motionThresholdRange) { el.motionThresholdRange.value = config.motionThreshold || 30; }
    if (el.motionThresholdValue) el.motionThresholdValue.textContent = config.motionThreshold || 30;
    if (el.minContourArea)       el.minContourArea.value = config.minContourArea || 300;
    if (el.maxContourArea)       el.maxContourArea.value = config.maxContourArea || 30000;
    if (el.bgLearningRateRange)  { el.bgLearningRateRange.value = config.backgroundLearningRate || 0.02; }
    if (el.bgLearningRateValue)  el.bgLearningRateValue.textContent = config.backgroundLearningRate || 0.02;
    if (el.noiseKernelRange)     { el.noiseKernelRange.value = config.noiseReductionKernelSize || 3; }
    if (el.noiseKernelValue)     el.noiseKernelValue.textContent = config.noiseReductionKernelSize || 3;
  }

  function updateFormState() {
    var ocvOn = el.ocvEnabled ? el.ocvEnabled.checked : false;
    var htOn = el.htEnabled ? el.htEnabled.checked : false;

    // If OpenCV is off, force head tracking off
    if (!ocvOn && htOn) {
      if (el.htEnabled) el.htEnabled.checked = false;
      htOn = false;
      // If head tracking was active on server, disable it
      if (isHeadTrackingOn) {
        disableHeadTrackingOnServer();
      }
    }

    // Head tracking toggle is disabled when OpenCV is off
    if (el.htEnabled) el.htEnabled.disabled = !ocvOn;
    if (el.htDisabledHint) el.htDisabledHint.style.display = ocvOn ? 'none' : 'inline';

    // OpenCV-related inputs: webcam, opencv params
    var ocvInputs = [
      el.webcamSelect, el.motionThresholdRange, el.minContourArea,
      el.maxContourArea, el.bgLearningRateRange, el.noiseKernelRange
    ];
    ocvInputs.forEach(function(inp) { if (inp) inp.disabled = !ocvOn; });

    // Servo-related inputs: pan servo, tracking tuning
    var servoInputs = [
      el.panServoSelect, el.smoothingRange, el.deadzoneRange,
      el.centerDeg, el.rangeDeg, el.invertPan
    ];
    servoInputs.forEach(function(inp) { if (inp) inp.disabled = !htOn; });

    // Start OpenCV: requires OpenCV enabled + webcam selected
    var hasWebcam = el.webcamSelect && el.webcamSelect.value;
    if (el.startTrackingBtn) el.startTrackingBtn.disabled = !ocvOn || !hasWebcam || isOpenCVActive;
    if (el.stopTrackingBtn)  el.stopTrackingBtn.disabled = !isOpenCVActive;

    // Test sweep: requires head tracking enabled + servo selected
    var hasServo = el.panServoSelect && el.panServoSelect.value;
    if (el.testSweepBtn) el.testSweepBtn.disabled = !htOn || !hasServo;

    updateHeadTrackingStatusDisplay();
  }

  // ─── Servo Selection ────────────────────────────────────────────────

  function onServoChange() {
    var servoId = el.panServoSelect ? el.panServoSelect.value : '';
    selectedServoData = null;

    if (servoId) {
      // Find servo data from loaded list
      for (var i = 0; i < availableServos.length; i++) {
        if (availableServos[i].id === servoId) {
          selectedServoData = availableServos[i];
          break;
        }
      }
    }

    // Show calibration bounds info
    if (el.servoBoundsInfo) {
      if (selectedServoData && selectedServoData.calibrated) {
        var minA = selectedServoData.minAngle;
        var maxA = selectedServoData.maxAngle;
        var midA = Math.round((minA + maxA) / 2);
        var rangeA = maxA - minA;
        el.servoBoundsInfo.innerHTML = '<i class="bi bi-info-circle"></i> Calibrated: ' +
          minA + '\u00B0 \u2013 ' + maxA + '\u00B0 (center ' + midA + '\u00B0, range ' + rangeA + '\u00B0)';
        el.servoBoundsInfo.style.display = 'block';

        // Auto-set center and range from calibration if they are still defaults
        if (el.centerDeg && el.rangeDeg) {
          var curCenter = parseInt(el.centerDeg.value, 10);
          var curRange = parseInt(el.rangeDeg.value, 10);
          // Only auto-fill if user hasn't customized (still at defaults 0/60)
          if ((curCenter === 0 && curRange === 60) || !currentConfig.panServoId) {
            el.centerDeg.value = midA;
            el.rangeDeg.value = Math.floor(rangeA / 2);
            // Set min/max constraints on center input
            el.centerDeg.min = minA;
            el.centerDeg.max = maxA;
          }
        }
      } else if (selectedServoData) {
        el.servoBoundsInfo.innerHTML = '<i class="bi bi-exclamation-triangle"></i> Not calibrated \u2014 using default limits';
        el.servoBoundsInfo.style.display = 'block';
      } else {
        el.servoBoundsInfo.style.display = 'none';
      }
    }

    // If head tracking is live, hot-update the servo mapping
    if (isHeadTrackingOn && isOpenCVActive) {
      scheduleHotUpdate();
    }
    updateFormState();
  }

  // ─── Head Tracking Toggle ───────────────────────────────────────────

  function onHeadTrackingToggle() {
    var htOn = el.htEnabled ? el.htEnabled.checked : false;

    if (htOn) {
      // Enable head tracking — requires OpenCV active + servo
      var hasServo = el.panServoSelect && el.panServoSelect.value;
      if (!isOpenCVActive) {
        showToast('Start OpenCV first before enabling head tracking', 'error');
        if (el.htEnabled) el.htEnabled.checked = false;
        return;
      }
      if (!hasServo) {
        showToast('Select a pan servo to enable head tracking', 'error');
        if (el.htEnabled) el.htEnabled.checked = false;
        return;
      }
      enableHeadTrackingOnServer();
    } else {
      // Disable head tracking
      disableHeadTrackingOnServer();
    }
    updateFormState();
  }

  function enableHeadTrackingOnServer() {
    if (!currentCharacterId || !isOpenCVActive) return;

    var panServoId = el.panServoSelect ? el.panServoSelect.value : '';
    if (!panServoId) return;

    var params = {
      panServoId: panServoId,
      centerDeg:  parseInt(el.centerDeg ? el.centerDeg.value : 0, 10),
      rangeDeg:   parseInt(el.rangeDeg ? el.rangeDeg.value : 60, 10),
      invertPan:  el.invertPan ? el.invertPan.checked : false,
      smoothing:  parseFloat(el.smoothingRange ? el.smoothingRange.value : 0.3),
      deadzone:   parseInt(el.deadzoneRange ? el.deadzoneRange.value : 5, 10)
    };

    fetch('/setup/head-animation/api/head-tracking/' + currentCharacterId + '/enable-servo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.success) {
        isHeadTrackingOn = true;
        showToast('Head tracking servo enabled', 'success');
      } else {
        showToast('Failed: ' + (data.error || 'Unknown'), 'error');
        if (el.htEnabled) el.htEnabled.checked = false;
      }
      updateHeadTrackingStatusDisplay();
    })
    .catch(function(err) {
      console.error('Enable head tracking error:', err);
      showToast('Failed to enable head tracking', 'error');
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

    // Show stream immediately — MJPEG multipart streams may not fire onload
    el.webcamPlaceholder.style.display = 'none';
    el.webcamStream.style.display = 'block';

    // Error handler — fires if server returns non-image (e.g. 404/503 JSON)
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

    // Size overlay canvas when first frame arrives
    el.webcamStream.onload = function() {
      sizeOverlayCanvas();
    };

    // Reuse existing calibration webcam proxy
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

    // Resize if needed
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

    // Draw deadzone indicator (vertical band in center)
    var dead = parseInt(el.deadzoneRange ? el.deadzoneRange.value : 5, 10);
    if (dead > 0) {
      var dzLeft = ((50 - dead) / 100) * w;
      var dzRight = ((50 + dead) / 100) * w;
      ctx.fillStyle = 'rgba(100, 100, 255, 0.08)';
      ctx.fillRect(dzLeft, 0, dzRight - dzLeft, h);
      ctx.strokeStyle = 'rgba(100, 100, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(dzLeft, 0); ctx.lineTo(dzLeft, h);
      ctx.moveTo(dzRight, 0); ctx.lineTo(dzRight, h);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    var pos = status.targetPosition || [50, 50];
    var x = (pos[0] / 100) * w;
    var y = (pos[1] / 100) * h;

    // Draw bounding box if available
    if (status.bbox) {
      var bx = (status.bbox.x / 100) * w;
      var by = (status.bbox.y / 100) * h;
      var bw = (status.bbox.w / 100) * w;
      var bh = (status.bbox.h / 100) * h;
      ctx.strokeStyle = 'rgba(0, 200, 255, 0.6)';
      ctx.lineWidth = 2;
      ctx.strokeRect(bx, by, bw, bh);
    }

    if (status.targetDetected) {
      // Green crosshair when target detected
      ctx.strokeStyle = 'rgba(0, 255, 0, 0.8)';
      ctx.lineWidth = 2;

      // Crosshair
      var crossSize = 20;
      ctx.beginPath();
      ctx.moveTo(x - crossSize, y);
      ctx.lineTo(x + crossSize, y);
      ctx.moveTo(x, y - crossSize);
      ctx.lineTo(x, y + crossSize);
      ctx.stroke();

      // Circle around target
      var radius = Math.max(15, (status.targetSize || 0) * 0.3);
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.stroke();

      // Position text
      ctx.fillStyle = 'rgba(0, 255, 0, 0.9)';
      ctx.font = '12px monospace';
      ctx.fillText(Math.round(pos[0]) + '%, ' + Math.round(pos[1]) + '%', x + crossSize + 4, y - 4);

      // Head tracking indicator
      if (isHeadTrackingOn) {
        ctx.fillStyle = 'rgba(255, 200, 0, 0.8)';
        ctx.font = '10px monospace';
        ctx.fillText('SERVO', x + crossSize + 4, y + 12);
      }
    } else {
      // Red "no target" indicator
      ctx.strokeStyle = 'rgba(255, 50, 50, 0.6)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);

      // Center crosshair (dimmed)
      var cx = w / 2;
      var cy = h / 2;
      ctx.beginPath();
      ctx.moveTo(cx - 15, cy);
      ctx.lineTo(cx + 15, cy);
      ctx.moveTo(cx, cy - 15);
      ctx.lineTo(cx, cy + 15);
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

  // ─── Start / Stop OpenCV ───────────────────────────────────────────

  function startOpenCV() {
    if (!currentCharacterId || isOpenCVActive) return;

    // Only require webcam for OpenCV
    var webcamId = el.webcamSelect ? el.webcamSelect.value : '';
    if (!webcamId) { showToast('Please select a webcam first', 'error'); return; }

    if (el.startTrackingBtn) {
      el.startTrackingBtn.disabled = true;
      el.startTrackingBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Starting...';
    }

    // Save config first so the server has the right params
    var config = buildConfigFromForm();
    config.opencvEnabled = true;

    fetch('/setup/head-animation/api/head-tracking/' + currentCharacterId, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    })
    .then(function(r) { return r.json(); })
    .then(function(saveData) {
      if (!saveData.success) {
        throw new Error('Save failed: ' + (saveData.error || 'Unknown'));
      }
      currentConfig = config;
      // Start OpenCV motion tracking
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
        showToast('OpenCV motion detection started', 'success');

        // If head tracking toggle is on and servo is selected, enable servo mapping
        var htOn = el.htEnabled ? el.htEnabled.checked : false;
        var hasServo = el.panServoSelect && el.panServoSelect.value;
        if (htOn && hasServo) {
          enableHeadTrackingOnServer();
        }
      } else {
        showToast('Start failed: ' + (data.error || 'Unknown'), 'error');
        if (el.startTrackingBtn) {
          el.startTrackingBtn.disabled = false;
          el.startTrackingBtn.innerHTML = '<i class="bi bi-play-fill"></i> Start OpenCV';
        }
      }
    })
    .catch(function(err) {
      console.error('Start OpenCV error:', err);
      showToast('Failed to start OpenCV: ' + err.message, 'error');
      if (el.startTrackingBtn) {
        el.startTrackingBtn.disabled = false;
        el.startTrackingBtn.innerHTML = '<i class="bi bi-play-fill"></i> Start OpenCV';
      }
    });
  }

  function stopOpenCV() {
    if (!currentCharacterId) return;

    // Disable head tracking first
    if (isHeadTrackingOn) {
      disableHeadTrackingOnServer();
    }

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
    if (el.startTrackingBtn) {
      el.startTrackingBtn.disabled = active;
      el.startTrackingBtn.innerHTML = '<i class="bi bi-play-fill"></i> Start OpenCV';
    }
    if (el.stopTrackingBtn) {
      el.stopTrackingBtn.disabled = !active;
    }
    if (el.trackingDot) {
      el.trackingDot.className = 'status-dot ' + (active ? 'active' : 'inactive');
    }
    if (el.trackingStatusText) {
      el.trackingStatusText.textContent = active ? 'OpenCV Running' : 'Stopped';
    }
    updateFormState();
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
      if (el.targetStatus)   el.targetStatus.textContent = 'Target detected';
      if (el.trackingDot)    el.trackingDot.className = 'status-dot detecting';
      var pos = data.targetPosition || [50, 50];
      if (el.targetPosition) el.targetPosition.textContent = Math.round(pos[0]) + '%, ' + Math.round(pos[1]) + '%';
    } else {
      if (el.targetStatus)   el.targetStatus.textContent = 'Searching...';
      if (el.trackingDot)    el.trackingDot.className = 'status-dot active';
      if (el.targetPosition) el.targetPosition.textContent = '--';
    }

    // Update head tracking status from server response
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
    }, 200);
  }

  function sendHotUpdate() {
    if (!currentCharacterId || !isOpenCVActive) return;

    var params = {
      smoothing:                parseFloat(el.smoothingRange ? el.smoothingRange.value : 0.3),
      deadzone:                 parseInt(el.deadzoneRange ? el.deadzoneRange.value : 5, 10),
      centerDeg:                parseInt(el.centerDeg ? el.centerDeg.value : 0, 10),
      rangeDeg:                 parseInt(el.rangeDeg ? el.rangeDeg.value : 60, 10),
      invertPan:                el.invertPan ? el.invertPan.checked : false,
      motionThreshold:          parseInt(el.motionThresholdRange ? el.motionThresholdRange.value : 30, 10),
      minContourArea:           parseInt(el.minContourArea ? el.minContourArea.value : 300, 10),
      maxContourArea:           parseInt(el.maxContourArea ? el.maxContourArea.value : 30000, 10),
      backgroundLearningRate:   parseFloat(el.bgLearningRateRange ? el.bgLearningRateRange.value : 0.02),
      noiseReductionKernelSize: parseInt(el.noiseKernelRange ? el.noiseKernelRange.value : 3, 10)
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
      smoothing:                parseFloat(el.smoothingRange ? el.smoothingRange.value : 0.3),
      deadzone:                 parseInt(el.deadzoneRange ? el.deadzoneRange.value : 5, 10),
      centerDeg:                parseInt(el.centerDeg ? el.centerDeg.value : 0, 10),
      rangeDeg:                 parseInt(el.rangeDeg ? el.rangeDeg.value : 60, 10),
      invertPan:                el.invertPan ? el.invertPan.checked : false,
      motionThreshold:          parseInt(el.motionThresholdRange ? el.motionThresholdRange.value : 30, 10),
      minContourArea:           parseInt(el.minContourArea ? el.minContourArea.value : 300, 10),
      maxContourArea:           parseInt(el.maxContourArea ? el.maxContourArea.value : 30000, 10),
      backgroundLearningRate:   parseFloat(el.bgLearningRateRange ? el.bgLearningRateRange.value : 0.02),
      noiseReductionKernelSize: parseInt(el.noiseKernelRange ? el.noiseKernelRange.value : 3, 10)
    };
  }

  function saveConfiguration() {
    if (!currentCharacterId) { showToast('No character selected', 'error'); return; }

    var config = buildConfigFromForm();

    if (config.enabled && !config.panServoId) {
      showToast('Please select a pan servo when head tracking is enabled', 'error');
      return;
    }
    if (config.opencvEnabled && !config.webcamPartId) {
      showToast('Please select a webcam when OpenCV is enabled', 'error');
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
        showToast('Sweep completed (' + data.minAngle + '\u00B0\u2013' + data.maxAngle + '\u00B0)', 'success');
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
