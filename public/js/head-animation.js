/**
 * Head Animation Configuration JavaScript (ES5)
 * MonsterBox — Head tracking tuning page with webcam overlay
 * Handles webcam preview, tracking overlay, start/stop, save, and hot-update.
 */

(function() {
  'use strict';

  var currentCharacterId = null;
  var pollingInterval = null;
  var isTracking = false;
  var currentConfig = {};
  var availableServos = [];
  var availableWebcams = [];
  var hotUpdateTimer = null;
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
      htEnabled:            document.getElementById('htEnabled'),
      panServoSelect:       document.getElementById('panServoSelect'),
      webcamSelect:         document.getElementById('webcamSelect'),
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
      targetPosition:       document.getElementById('targetPosition')
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
    if (el.startTrackingBtn) el.startTrackingBtn.addEventListener('click', startTracking);
    if (el.stopTrackingBtn)  el.stopTrackingBtn.addEventListener('click', stopTracking);
    if (el.testSweepBtn)     el.testSweepBtn.addEventListener('click', testSweep);
    if (el.emergencyStopBtn) el.emergencyStopBtn.addEventListener('click', emergencyStop);

    // Webcam dropdown — show stream on selection
    if (el.webcamSelect) el.webcamSelect.addEventListener('change', onWebcamChange);

    // Enable toggle
    if (el.htEnabled) el.htEnabled.addEventListener('change', updateFormState);

    // Page unload — stop tracking to clean up Python process
    window.addEventListener('beforeunload', function() {
      if (isTracking && currentCharacterId) {
        navigator.sendBeacon(
          '/setup/head-animation/api/head-tracking/' + currentCharacterId + '/stop',
          ''
        );
      }
    });
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

          // If tracking was already active, resume polling
          if (data.trackingActive) {
            isTracking = true;
            updateTrackingUI(true);
            startPolling();
          }
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
      var statusText = servo.calibrated
        ? ' (calibrated, ' + servo.minAngle + '\u00B0\u2013' + servo.maxAngle + '\u00B0)'
        : ' (not calibrated)';
      opt.textContent = servo.name + statusText;
      if (currentConfig.panServoId === servo.id) opt.selected = true;
      el.panServoSelect.appendChild(opt);
    });
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
    if (el.htEnabled) el.htEnabled.checked = config.enabled || false;
    if (config.panServoId && el.panServoSelect) el.panServoSelect.value = config.panServoId;
    if (config.webcamPartId && el.webcamSelect) el.webcamSelect.value = config.webcamPartId;

    if (el.smoothingRange)       { el.smoothingRange.value = config.smoothing || 0.3; }
    if (el.smoothingValue)       el.smoothingValue.textContent = config.smoothing || 0.3;
    if (el.deadzoneRange)        { el.deadzoneRange.value = config.deadzone || 5; }
    if (el.deadzoneValue)        el.deadzoneValue.textContent = config.deadzone || 5;
    if (el.centerDeg)            el.centerDeg.value = config.centerDeg || 0;
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
    var enabled = el.htEnabled ? el.htEnabled.checked : false;
    var inputs = [
      el.panServoSelect, el.webcamSelect, el.smoothingRange, el.deadzoneRange,
      el.centerDeg, el.rangeDeg, el.invertPan,
      el.motionThresholdRange, el.minContourArea, el.maxContourArea,
      el.bgLearningRateRange, el.noiseKernelRange
    ];
    inputs.forEach(function(inp) { if (inp) inp.disabled = !enabled; });

    var hasServo = el.panServoSelect && el.panServoSelect.value;
    var hasWebcam = el.webcamSelect && el.webcamSelect.value;
    if (el.startTrackingBtn) el.startTrackingBtn.disabled = !enabled || !hasServo || !hasWebcam || isTracking;
    if (el.stopTrackingBtn)  el.stopTrackingBtn.disabled = !isTracking;
    if (el.testSweepBtn)     el.testSweepBtn.disabled = !enabled || !hasServo;
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
    // Reuse existing calibration webcam proxy
    el.webcamStream.src = '/setup/calibration/api/webcam/parts/' + webcamId + '/stream';
    el.webcamStream.style.display = 'block';
    el.webcamPlaceholder.style.display = 'none';

    // Size overlay canvas to match stream once loaded
    el.webcamStream.onload = function() {
      sizeOverlayCanvas();
    };
  }

  function hideWebcamStream() {
    if (el.webcamStream) {
      el.webcamStream.src = '';
      el.webcamStream.style.display = 'none';
    }
    if (el.webcamPlaceholder) el.webcamPlaceholder.style.display = 'flex';
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

    var pos = status.targetPosition || [50, 50];
    var x = (pos[0] / 100) * w;
    var y = (pos[1] / 100) * h;

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

  // ─── Start / Stop Tracking ────────────────────────────────────────

  function startTracking() {
    if (!currentCharacterId || isTracking) return;

    if (el.startTrackingBtn) {
      el.startTrackingBtn.disabled = true;
      el.startTrackingBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Starting...';
    }

    fetch('/setup/head-animation/api/head-tracking/' + currentCharacterId + '/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.success) {
        isTracking = true;
        updateTrackingUI(true);
        startPolling();
        showToast('Head tracking started', 'success');
      } else {
        showToast('Start failed: ' + (data.error || 'Unknown'), 'error');
        if (el.startTrackingBtn) {
          el.startTrackingBtn.disabled = false;
          el.startTrackingBtn.innerHTML = '<i class="bi bi-play-fill"></i> Start Tracking';
        }
      }
    })
    .catch(function(err) {
      console.error('Start tracking error:', err);
      showToast('Failed to start tracking', 'error');
      if (el.startTrackingBtn) {
        el.startTrackingBtn.disabled = false;
        el.startTrackingBtn.innerHTML = '<i class="bi bi-play-fill"></i> Start Tracking';
      }
    });
  }

  function stopTracking() {
    if (!currentCharacterId) return;

    stopPolling();
    isTracking = false;
    updateTrackingUI(false);
    clearOverlay();
    updateStatusDisplay(null);

    fetch('/setup/head-animation/api/head-tracking/' + currentCharacterId + '/stop', {
      method: 'POST'
    }).catch(function() {});

    showToast('Head tracking stopped', 'success');
  }

  function emergencyStop() {
    stopTracking();
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

  function updateTrackingUI(active) {
    if (el.startTrackingBtn) {
      el.startTrackingBtn.disabled = active;
      el.startTrackingBtn.innerHTML = '<i class="bi bi-play-fill"></i> Start Tracking';
    }
    if (el.stopTrackingBtn) {
      el.stopTrackingBtn.disabled = !active;
    }
    if (el.trackingDot) {
      el.trackingDot.className = 'status-dot ' + (active ? 'active' : 'inactive');
    }
    if (el.trackingStatusText) {
      el.trackingStatusText.textContent = active ? 'Running' : 'Stopped';
    }
  }

  // ─── Status Polling ───────────────────────────────────────────────

  function startPolling() {
    stopPolling();
    pollingInterval = setInterval(function() {
      if (!isTracking || !currentCharacterId) { stopPolling(); return; }
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
  }

  // ─── Hot-Update Parameters ────────────────────────────────────────

  function scheduleHotUpdate() {
    if (!isTracking) return;
    if (hotUpdateTimer) clearTimeout(hotUpdateTimer);
    hotUpdateTimer = setTimeout(function() {
      hotUpdateTimer = null;
      sendHotUpdate();
    }, 200);
  }

  function sendHotUpdate() {
    if (!currentCharacterId || !isTracking) return;

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

  function saveConfiguration() {
    if (!currentCharacterId) { showToast('No character selected', 'error'); return; }

    var config = {
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

    if (config.enabled && !config.panServoId) {
      showToast('Please select a pan servo when head tracking is enabled', 'error');
      return;
    }
    if (config.enabled && !config.webcamPartId) {
      showToast('Please select a webcam when head tracking is enabled', 'error');
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
        showToast('Sweep completed', 'success');
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
