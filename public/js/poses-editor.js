/* ==========================================================================
   MonsterBox Pose Editor — client script
   --------------------------------------------------------------------------
   Extracted from views/poses/editor.ejs in v8.1.1.

   Two values previously injected server-side via EJS now come from a
   bootstrap <script id="mbPoseEditorBoot" type="application/json"> block
   placed above this script in the view. The json shape is:
     { "editPoseId": <number|null>, "characterId": <number|null> }
   ========================================================================== */
(function() {
  'use strict';

  var __boot = (function () {
    try {
      var el = document.getElementById('mbPoseEditorBoot');
      if (!el) return {};
      return JSON.parse(el.textContent || '{}') || {};
    } catch (e) { return {}; }
  })();

  /* -- Feedback + destructive confirm -------------------------------------
     Uses the shared helpers from /js/mb-dialogs.js. Both degrade safely if
     that script is missing so the editor never silently swallows an error or
     silently deletes a pose. */
  function notify(message, severity) {
    if (window.mbToast) { window.mbToast(message, severity || 'info'); return; }
    setStatus(message);
  }

  function confirmDestructive(title, detail, confirmLabel, onConfirm) {
    if (window.mbConfirm) {
      window.mbConfirm({ title: title, detail: detail, confirmLabel: confirmLabel })
        .then(function (ok) { if (ok) onConfirm(); });
      return;
    }
    if (window.confirm(title + '\n\n' + detail)) onConfirm();
  }
  var editingPoseId = (__boot.editPoseId === 0 || __boot.editPoseId) ? __boot.editPoseId : null;
  var characterId   = (__boot.characterId === 0 || __boot.characterId) ? __boot.characterId : null;

  var allParts = [];
  var allPoses = [];
  var sounds = [];
  // partId (string) -> safety descriptor from /poses/api/part-safety
  var partSafety = {};

  function $(id) { return document.getElementById(id); }

  function safetyFor(partId) {
    return partSafety[String(partId)] || null;
  }

  function isQuarantined(partId) {
    var s = safetyFor(partId);
    return !!(s && s.blocked);
  }

  // Text from hardware-safety.json is operator-facing instructions. It goes on the
  // page verbatim, so it must be escaped rather than interpolated into markup.
  function escapeHtml(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function setStatus(msg) {
    var el = $('poseEditorStatus');
    if (el) el.textContent = msg;
    if (msg) setTimeout(function() { if (el && el.textContent === msg) el.textContent = ''; }, 5000);
  }

  function apiGet(url) {
    return fetch(url).then(function(r) { return r.json(); });
  }

  function apiPost(url, data) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(function(r) { return r.json(); });
  }

  function apiPut(url, data) {
    return fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(function(r) { return r.json(); });
  }

  function apiDelete(url) {
    return fetch(url, { method: 'DELETE' }).then(function(r) { return r.json(); });
  }

  // ============ LOAD DATA ============
  function loadAll() {
    Promise.all([
      apiGet('/api/parts').then(function(j) { allParts = (j.success && j.parts) ? j.parts : []; }),
      apiGet('/poses/api/poses').then(function(j) { allPoses = (j.success && j.poses) ? j.poses : []; }),
      apiGet('/api/sounds').then(function(j) { sounds = (j.success && j.sounds) ? j.sounds : []; }).catch(function() { sounds = []; }),
      apiGet('/poses/api/part-safety').then(function(j) { partSafety = (j.success && j.parts) ? j.parts : {}; }).catch(function() { partSafety = {}; })
    ]).then(function() {
      renderParts();
      renderPosesList();
      renderSoundSelect();
      if (editingPoseId) loadPoseIntoEditor(editingPoseId);
    });
  }

  // ============ RENDER PARTS ============
  function renderParts() {
    var container = $('partsContainer');
    // Filter to controllable parts (servo, motor, linear_actuator, light, led)
    var controllable = allParts.filter(function(p) {
      return ['servo', 'motor', 'linear_actuator', 'light', 'led'].indexOf(p.type) !== -1 && p.enabled !== false;
    });
    $('partCount').textContent = controllable.length + ' parts';

    if (controllable.length === 0) {
      container.innerHTML = '<div class="text-muted text-center py-3 small">No controllable hardware parts found for this character.</div>';
      return;
    }

    var html = '';
    controllable.forEach(function(part) {
      html += renderPartCard(part);
    });
    container.innerHTML = html;

    // Bind events
    controllable.forEach(function(part) {
      bindPartEvents(part);
    });
  }

  function renderPartCard(part) {
    var typeColors = {
      servo: 'var(--mb-step-servo)', motor: 'var(--mb-step-motor)', linear_actuator: 'var(--mb-step-linear-actuator)', light: 'var(--mb-step-light)', led: 'var(--mb-step-light)'
    };
    var color = typeColors[part.type] || 'var(--mb-secondary)';
    var typeLabel = (part.type || '').replace(/_/g, ' ');

    var safety = safetyFor(part.id);
    var blocked = isQuarantined(part.id);

    var html = '<div class="part-card' + (blocked ? ' part-card-blocked' : '') + '" id="part-card-' + part.id + '">';
    html += '<div class="part-header">';
    html += '<div class="form-check"><input type="checkbox" class="form-check-input part-include" id="inc-' + part.id + '" data-part-id="' + part.id + '"' +
            (blocked ? ' disabled' : '') + '></div>';
    html += '<span class="part-type-badge text-white" style="background:' + color + ';">' + typeLabel + '</span>';
    html += '<strong class="small">' + escapeHtml(part.name || 'Part ' + part.id) + '</strong>';
    if (blocked) {
      html += '<span class="badge bg-danger ms-1" style="font-size:0.6rem;"><i class="bi bi-slash-circle"></i> QUARANTINED</span>';
    }
    html += '<button class="btn btn-sm btn-outline-info p-0 px-1 ms-auto part-test-btn" data-part-id="' + part.id + '"' +
            (blocked ? ' disabled title="Quarantined — motion is refused by hardware safety limits"' : ' title="Test this part"') +
            '><i class="bi bi-play-fill"></i></button>';
    html += '</div>';

    if (blocked) {
      // blockReason verbatim. It is already written, it is good, and it names the
      // physical step needed to clear the block — paraphrasing it loses that.
      html += '<div class="alert alert-danger py-2 px-2 mb-0 mt-1" style="font-size:0.75rem;">';
      html += '<strong>Cannot be added to a pose.</strong> The hardware safety layer refuses all motion on this part.';
      if (safety && safety.blockReason) {
        html += '<div class="mt-1" style="white-space:pre-wrap;">' + escapeHtml(safety.blockReason) + '</div>';
      }
      html += '</div>';
      html += '</div>';
      return html;
    }

    html += '<div class="part-controls">';
    html += renderPartControls(part);
    html += renderPartSafetyNote(part);
    html += '</div></div>';
    return html;
  }

  // Non-blocking cautions: a capped speed/duration, a shared fused rail, or an
  // angle window that is a guess rather than a measurement.
  function renderPartSafetyNote(part) {
    var safety = safetyFor(part.id);
    if (!safety) return '';
    var notes = [];

    if (part.type === 'servo' && (safety.minAngle != null || safety.maxAngle != null)) {
      notes.push('Safe window ' + (safety.minAngle != null ? safety.minAngle : '?') + '&deg;–' +
                 (safety.maxAngle != null ? safety.maxAngle : '?') + '&deg;');
    }
    if (part.type === 'servo' && safety.placeholderCalibration) {
      notes.push('Uncalibrated — bounds are an auto-generated placeholder, not a measurement');
    }
    if (safety.powerGroup) {
      notes.push('Shares the &quot;' + escapeHtml(safety.powerGroup) + '&quot; fused rail — moves are serialized');
    }
    if (safety.maxSpeedPct != null) notes.push('Speed capped at ' + safety.maxSpeedPct + '%');
    if (safety.maxDurationMs != null) notes.push('Duration capped at ' + safety.maxDurationMs + 'ms');
    if (safety.noRetractBelowMin) notes.push('Retraction is disabled (part is at its mechanical minimum)');

    if (notes.length === 0) return '';
    return '<div class="mb-text-muted mt-1" style="font-size:0.7rem;"><i class="bi bi-shield-exclamation"></i> ' +
           notes.join(' &middot; ') + '</div>';
  }

  function renderPartControls(part) {
    var html = '';
    if (part.type === 'servo') {
      var min = 0, max = 180, val = 90;
      // Read calibration markers
      if (part.markers && part.markers.length) {
        part.markers.forEach(function(m) {
          if (m.name === 'Min' && m.value != null) min = m.value;
          if (m.name === 'Max' && m.value != null) max = m.value;
        });
        val = Math.round((min + max) / 2);
      }
      // The effective safe window always wins over the markers: authoring an angle
      // the hardware layer is going to clamp anyway just hides the clamp.
      var sSafety = safetyFor(part.id);
      if (sSafety) {
        if (sSafety.minAngle != null && sSafety.minAngle > min) min = sSafety.minAngle;
        if (sSafety.maxAngle != null && sSafety.maxAngle < max) max = sSafety.maxAngle;
        if (val < min || val > max) val = Math.round((min + max) / 2);
      }
      html += '<div class="d-flex align-items-center gap-2">';
      html += '<small class="text-muted">' + min + '&deg;</small>';
      html += '<input type="range" class="form-range flex-grow-1 part-servo-angle" data-part-id="' + part.id + '" min="' + min + '" max="' + max + '" value="' + val + '">';
      html += '<small class="text-muted">' + max + '&deg;</small>';
      html += '<span class="angle-display badge bg-dark part-angle-val" data-part-id="' + part.id + '">' + val + '&deg;</span>';
      html += '</div>';
    } else if (part.type === 'motor') {
      html += '<div class="d-flex align-items-center gap-2 flex-wrap">';
      html += '<select class="form-select form-select-sm part-motor-dir" data-part-id="' + part.id + '" style="width:auto;">';
      html += '<option value="forward">Forward</option><option value="backward">Backward</option>';
      html += '</select>';
      html += '<label class="small text-muted">Speed:</label>';
      html += '<input type="range" class="form-range part-motor-speed" data-part-id="' + part.id + '" min="0" max="100" value="75" style="width:100px;">';
      html += '<span class="badge bg-dark part-speed-val" data-part-id="' + part.id + '">75%</span>';
      html += '<label class="small text-muted">Duration:</label>';
      html += '<input type="number" class="form-control form-control-sm part-motor-dur" data-part-id="' + part.id + '" value="1000" min="100" max="10000" style="width:80px;">';
      html += '<small class="text-muted">ms</small>';
      html += '</div>';
    } else if (part.type === 'linear_actuator') {
      html += '<div class="d-flex align-items-center gap-2 flex-wrap">';
      html += '<select class="form-select form-select-sm part-actuator-dir" data-part-id="' + part.id + '" style="width:auto;">';
      html += '<option value="extend">Extend</option><option value="retract">Retract</option>';
      html += '</select>';
      html += '<label class="small text-muted">Speed:</label>';
      html += '<input type="range" class="form-range part-actuator-speed" data-part-id="' + part.id + '" min="0" max="100" value="75" style="width:100px;">';
      html += '<span class="badge bg-dark part-act-speed-val" data-part-id="' + part.id + '">75%</span>';
      html += '<label class="small text-muted">Duration:</label>';
      html += '<input type="number" class="form-control form-control-sm part-actuator-dur" data-part-id="' + part.id + '" value="1000" min="100" max="10000" style="width:80px;">';
      html += '<small class="text-muted">ms</small>';
      html += '</div>';
    } else if (part.type === 'light' || part.type === 'led') {
      html += '<div class="d-flex align-items-center gap-2">';
      html += '<select class="form-select form-select-sm part-light-state" data-part-id="' + part.id + '" style="width:auto;">';
      html += '<option value="on">On</option><option value="off">Off</option>';
      html += '</select>';
      html += '<label class="small text-muted">Brightness:</label>';
      html += '<input type="range" class="form-range part-light-brightness" data-part-id="' + part.id + '" min="0" max="100" value="100" style="width:120px;">';
      html += '<span class="badge bg-dark part-bright-val" data-part-id="' + part.id + '">100%</span>';
      html += '</div>';
    }
    return html;
  }

  function bindPartEvents(part) {
    var card = $('part-card-' + part.id);
    if (!card) return;
    // A quarantined part has no controls to bind — and must have no way to be
    // included, tested, or saved into a pose.
    if (isQuarantined(part.id)) return;

    // Include checkbox styling
    var inc = card.querySelector('.part-include');
    if (inc) {
      inc.addEventListener('change', function() {
        card.classList.toggle('included', inc.checked);
      });
    }

    // Servo slider live display
    if (part.type === 'servo') {
      var slider = card.querySelector('.part-servo-angle');
      var display = card.querySelector('.part-angle-val');
      if (slider && display) {
        slider.addEventListener('input', function() {
          display.textContent = slider.value + '\u00B0';
        });
      }
    }

    // Motor speed display
    if (part.type === 'motor') {
      var speedSlider = card.querySelector('.part-motor-speed');
      var speedVal = card.querySelector('.part-speed-val');
      if (speedSlider && speedVal) {
        speedSlider.addEventListener('input', function() {
          speedVal.textContent = speedSlider.value + '%';
        });
      }
    }

    // Actuator speed display
    if (part.type === 'linear_actuator') {
      var actSpeed = card.querySelector('.part-actuator-speed');
      var actVal = card.querySelector('.part-act-speed-val');
      if (actSpeed && actVal) {
        actSpeed.addEventListener('input', function() {
          actVal.textContent = actSpeed.value + '%';
        });
      }
    }

    // Light brightness display
    if (part.type === 'light' || part.type === 'led') {
      var brightSlider = card.querySelector('.part-light-brightness');
      var brightVal = card.querySelector('.part-bright-val');
      if (brightSlider && brightVal) {
        brightSlider.addEventListener('input', function() {
          brightVal.textContent = brightSlider.value + '%';
        });
      }
    }

    // Test button
    var testBtn = card.querySelector('.part-test-btn');
    if (testBtn) {
      testBtn.addEventListener('click', function() {
        testSinglePart(part);
      });
    }
  }

  // ============ COLLECT PART DATA ============
  function collectPoseParts() {
    var parts = [];
    allParts.forEach(function(part) {
      var card = $('part-card-' + part.id);
      if (!card) return;
      // Second gate. The checkbox is disabled for quarantined parts, but a pose is
      // persisted data on a machine that moves — this must not depend on the DOM.
      if (isQuarantined(part.id)) return;
      var inc = card.querySelector('.part-include');
      if (!inc || !inc.checked) return;

      var partData = { partId: parseInt(part.id, 10), type: part.type, target: {} };

      if (part.type === 'servo') {
        var angle = card.querySelector('.part-servo-angle');
        partData.target = { angleDeg: parseInt(angle ? angle.value : 90, 10) };
      } else if (part.type === 'motor') {
        var dir = card.querySelector('.part-motor-dir');
        var speed = card.querySelector('.part-motor-speed');
        var dur = card.querySelector('.part-motor-dur');
        partData.target = {
          direction: dir ? dir.value : 'forward',
          speed: parseInt(speed ? speed.value : 75, 10),
          duration: parseInt(dur ? dur.value : 1000, 10)
        };
      } else if (part.type === 'linear_actuator') {
        var adir = card.querySelector('.part-actuator-dir');
        var aspeed = card.querySelector('.part-actuator-speed');
        var adur = card.querySelector('.part-actuator-dur');
        partData.target = {
          direction: adir ? adir.value : 'extend',
          speed: parseInt(aspeed ? aspeed.value : 75, 10),
          duration: parseInt(adur ? adur.value : 1000, 10)
        };
      } else if (part.type === 'light' || part.type === 'led') {
        var state = card.querySelector('.part-light-state');
        var bright = card.querySelector('.part-light-brightness');
        partData.target = {
          state: state ? state.value : 'on',
          brightness: parseInt(bright ? bright.value : 100, 10)
        };
      }

      parts.push(partData);
    });
    return parts;
  }

  // ============ TEST ============
  function testSinglePart(part) {
    var card = $('part-card-' + part.id);
    if (!card) return;

    var body = {};
    if (part.type === 'servo') {
      var angle = card.querySelector('.part-servo-angle');
      body = { action: 'moveToAngle', params: { angleDeg: parseInt(angle ? angle.value : 90, 10) } };
    } else if (part.type === 'motor') {
      var dir = card.querySelector('.part-motor-dir');
      var speed = card.querySelector('.part-motor-speed');
      var dur = card.querySelector('.part-motor-dur');
      body = { action: 'control', params: { direction: dir ? dir.value : 'forward', speed: parseInt(speed ? speed.value : 75, 10), duration: parseInt(dur ? dur.value : 1000, 10) } };
    } else if (part.type === 'linear_actuator') {
      var adir = card.querySelector('.part-actuator-dir');
      var aspeed = card.querySelector('.part-actuator-speed');
      var adur = card.querySelector('.part-actuator-dur');
      var action = (adir && adir.value === 'retract') ? 'retract' : 'extend';
      body = { action: action, params: { speed: parseInt(aspeed ? aspeed.value : 75, 10), duration: parseInt(adur ? adur.value : 1000, 10) } };
    } else if (part.type === 'light' || part.type === 'led') {
      var state = card.querySelector('.part-light-state');
      body = { action: (state && state.value === 'off') ? 'turnOff' : 'turnOn' };
    }

    setStatus('Testing ' + (part.name || 'part') + '...');
    apiPost('/api/parts/' + part.id + '/test', body).then(function(j) {
      setStatus(j.success ? 'Test complete' : 'Test failed');
    }).catch(function() {
      setStatus('Test error');
    });
  }

  function testFullPose() {
    var parts = collectPoseParts();
    if (parts.length === 0) {
      setStatus('No parts selected for pose');
      return;
    }
    setStatus('Testing pose (' + parts.length + ' parts)...');

    // Test all parts simultaneously
    var promises = parts.map(function(p) {
      var body = {};
      if (p.type === 'servo') {
        body = { action: 'moveToAngle', params: { angleDeg: p.target.angleDeg } };
      } else if (p.type === 'motor') {
        body = { action: 'control', params: p.target };
      } else if (p.type === 'linear_actuator') {
        var action = (p.target.direction === 'retract') ? 'retract' : 'extend';
        body = { action: action, params: { speed: p.target.speed, duration: p.target.duration } };
      } else if (p.type === 'light' || p.type === 'led') {
        body = { action: (p.target.state === 'off') ? 'turnOff' : 'turnOn' };
      }
      return apiPost('/api/parts/' + p.partId + '/test', body);
    });

    Promise.all(promises).then(function() {
      setStatus('Pose test complete');
    }).catch(function() {
      setStatus('Pose test error');
    });
  }

  // ============ SAVE ============
  function savePose() {
    var name = ($('poseName') || {}).value || '';
    if (!name.trim()) {
      notify('Please enter a pose name.', 'warning');
      return;
    }

    var parts = collectPoseParts();
    if (parts.length === 0) {
      notify('Please select at least one part for the pose.', 'warning');
      return;
    }

    var poseData = {
      name: name.trim(),
      category: (($('poseCategory') || {}).value || '').trim() || 'custom',
      description: (($('poseDescription') || {}).value || '').trim(),
      concurrent: !!($('poseConcurrent') || {}).checked,
      parts: parts
    };

    var durationRaw = (($('poseTransitionDuration') || {}).value || '').trim();
    if (durationRaw !== '') {
      var duration = parseInt(durationRaw, 10);
      if (!isNaN(duration) && duration > 0) poseData.transitionDurationMs = duration;
    }
    var profile = (($('poseTransitionProfile') || {}).value || '').trim();
    if (profile) poseData.transitionProfile = profile;

    var jitterRaw = (($('poseJitter') || {}).value || '').trim();
    if (jitterRaw !== '') {
      var jitter = parseFloat(jitterRaw);
      // Mirrors MAX_JITTER_DEG in services/poses/poseBounds.js, which enforces it
      // again server-side — this is convenience, not the guarantee.
      if (!isNaN(jitter) && jitter > 0) poseData.jitterDeg = Math.min(jitter, 15);
    }

    // Add audio info as notes
    var audioType = ($('audioType') || {}).value;
    if (audioType === 'file') {
      var audioId = ($('audioFile') || {}).value;
      if (audioId) poseData.notes = 'Audio: ' + audioId;
    } else if (audioType === 'tts') {
      var ttsText = ($('audioTtsText') || {}).value;
      if (ttsText) poseData.notes = 'TTS: ' + ttsText;
    }

    setStatus('Saving pose...');

    if (editingPoseId) {
      apiPut('/poses/' + editingPoseId, poseData).then(function(j) {
        if (j.success) {
          setStatus('Pose updated!');
          loadAll();
        } else {
          setStatus('Save failed: ' + (j.error || j.message || 'unknown'));
        }
      }).catch(function() { setStatus('Save error'); });
    } else {
      apiPost('/poses', poseData).then(function(j) {
        if (j.success) {
          editingPoseId = j.pose.id;
          setStatus('Pose created!');
          // Update URL without reload
          history.replaceState(null, '', '/poses/editor/' + editingPoseId);
          loadAll();
        } else {
          setStatus('Save failed: ' + (j.error || j.message || 'unknown'));
        }
      }).catch(function() { setStatus('Save error'); });
    }
  }

  // ============ LOAD POSE INTO EDITOR ============
  function loadPoseIntoEditor(poseId) {
    var pose = allPoses.find(function(p) { return p.id === poseId; });
    if (!pose) { setStatus('Pose not found'); return; }

    editingPoseId = poseId;
    history.replaceState(null, '', '/poses/editor/' + poseId);

    $('poseName').value = pose.name || '';
    $('poseCategory').value = pose.category || '';
    $('poseDescription').value = pose.description || '';
    $('poseConcurrent').checked = !!pose.concurrent;
    $('poseTransitionDuration').value = pose.transitionDurationMs != null ? pose.transitionDurationMs : '';
    $('poseTransitionProfile').value = pose.transitionProfile || 'ease_in_out';
    $('poseJitter').value = pose.jitterDeg != null ? pose.jitterDeg : '';

    // Parse audio from notes
    var notes = pose.notes || '';
    if (notes.indexOf('Audio: ') === 0) {
      $('audioType').value = 'file';
      $('audioFile').value = notes.substring(7);
      toggleAudioSection();
    } else if (notes.indexOf('TTS: ') === 0) {
      $('audioType').value = 'tts';
      $('audioTtsText').value = notes.substring(5);
      toggleAudioSection();
    } else {
      $('audioType').value = 'none';
      toggleAudioSection();
    }

    // Set part states
    // First uncheck all
    document.querySelectorAll('.part-include').forEach(function(cb) {
      cb.checked = false;
      var card = cb.closest('.part-card');
      if (card) card.classList.remove('included');
    });

    // Check and set values for pose parts
    var quarantinedInPose = [];
    (pose.parts || []).forEach(function(pp) {
      var partId = String(pp.partId);
      var card = $('part-card-' + partId);
      if (!card) return;

      // An existing pose can reference a part that has since been quarantined.
      // Surface it instead of silently re-checking a control that is now disabled.
      if (isQuarantined(partId)) {
        quarantinedInPose.push(partId);
        return;
      }

      var inc = card.querySelector('.part-include');
      if (inc) { inc.checked = true; card.classList.add('included'); }

      if (pp.type === 'servo' && pp.target) {
        var slider = card.querySelector('.part-servo-angle');
        var display = card.querySelector('.part-angle-val');
        if (slider && pp.target.angleDeg != null) {
          slider.value = pp.target.angleDeg;
          if (display) display.textContent = pp.target.angleDeg + '\u00B0';
        }
      } else if (pp.type === 'motor' && pp.target) {
        var dir = card.querySelector('.part-motor-dir');
        var speed = card.querySelector('.part-motor-speed');
        var dur = card.querySelector('.part-motor-dur');
        var sVal = card.querySelector('.part-speed-val');
        if (dir && pp.target.direction) dir.value = pp.target.direction;
        if (speed && pp.target.speed != null) { speed.value = pp.target.speed; if (sVal) sVal.textContent = pp.target.speed + '%'; }
        if (dur && pp.target.duration != null) dur.value = pp.target.duration;
      } else if (pp.type === 'linear_actuator' && pp.target) {
        var adir = card.querySelector('.part-actuator-dir');
        var aspeed = card.querySelector('.part-actuator-speed');
        var adur = card.querySelector('.part-actuator-dur');
        var asVal = card.querySelector('.part-act-speed-val');
        if (adir && pp.target.direction) adir.value = pp.target.direction;
        if (aspeed && pp.target.speed != null) { aspeed.value = pp.target.speed; if (asVal) asVal.textContent = pp.target.speed + '%'; }
        if (adur && pp.target.duration != null) adur.value = pp.target.duration;
      } else if ((pp.type === 'light' || pp.type === 'led') && pp.target) {
        var st = card.querySelector('.part-light-state');
        var br = card.querySelector('.part-light-brightness');
        var bVal = card.querySelector('.part-bright-val');
        if (st && pp.target.state) st.value = pp.target.state;
        if (br && pp.target.brightness != null) { br.value = pp.target.brightness; if (bVal) bVal.textContent = pp.target.brightness + '%'; }
      }
    });

    updateDeleteButton();
    if (quarantinedInPose.length > 0) {
      setStatus('Loaded "' + pose.name + '" — part(s) ' + quarantinedInPose.join(', ') +
                ' are quarantined and were left out. Saving will drop them.');
    } else {
      setStatus('Loaded pose: ' + pose.name);
    }
  }

  // ============ DELETE POSE ============
  function deletePose(poseId) {
    var pose = allPoses.find(function(p) { return p.id === poseId; });
    var name = pose ? pose.name : 'Pose ' + poseId;
    // Styled, named confirmation — a native confirm dialog cannot show WHAT is
    // about to be destroyed and is a poor target one-handed on a phone.
    confirmDestructive(
      'Delete this pose?',
      '"' + name + '" will be removed permanently. This cannot be undone.',
      'Delete pose',
      function () {
        setStatus('Deleting...');
        apiDelete('/poses/' + poseId).then(function(j) {
          if (j.success) {
            setStatus('Pose deleted');
            if (editingPoseId === poseId) clearForm();
            loadAll();
          } else {
            setStatus('Delete failed: ' + (j.error || j.message || 'unknown'));
          }
        }).catch(function() { setStatus('Delete error'); });
      }
    );
  }

  function updateDeleteButton() {
    var btn = $('btnDeletePose');
    if (!btn) return;
    if (editingPoseId) {
      btn.classList.remove('d-none');
    } else {
      btn.classList.add('d-none');
    }
  }

  // ============ RENDER POSES LIST ============
  function renderPosesList() {
    var container = $('posesList');
    updateDeleteButton();
    if (allPoses.length === 0) {
      container.innerHTML = '<div class="text-muted text-center py-2 small">No poses saved</div>';
      return;
    }
    var html = '';
    allPoses.forEach(function(p) {
      var isActive = editingPoseId === p.id;
      var status = (p.health && p.health.status) || null;
      var statusTitle = '';
      if (p.health && p.health.reasons && p.health.reasons.length) {
        statusTitle = p.health.reasons.map(function(r) {
          return r.message + (r.blockReason ? ' — ' + r.blockReason : '');
        }).join('\n');
      }
      html += '<div class="d-flex align-items-center py-1 px-1 rounded mb-1 pose-list-item' + (isActive ? ' bg-primary bg-opacity-10' : '') + '" data-pose-id="' + p.id + '" style="cursor:pointer;">';
      if (status === 'blocked') {
        html += '<span class="badge bg-danger me-1" style="font-size:0.6rem;" title="' + escapeHtml(statusTitle) + '"><i class="bi bi-slash-circle"></i></span>';
      } else if (status === 'degraded') {
        html += '<span class="badge bg-warning text-dark me-1" style="font-size:0.6rem;" title="' + escapeHtml(statusTitle) + '"><i class="bi bi-exclamation-triangle"></i></span>';
      }
      html += '<span class="badge bg-secondary me-1" style="font-size:0.6rem;">' + escapeHtml(p.category || '') + '</span>';
      html += '<span class="small flex-grow-1 text-truncate">' + escapeHtml(p.name || 'Pose ' + p.id) + '</span>';
      html += '<span class="badge bg-dark me-1" style="font-size:0.6rem;">' + ((p.parts && p.parts.length) || 0) + '</span>';
      html += '<button class="btn btn-sm btn-outline-danger p-0 px-1 pose-delete-btn" data-pose-id="' + p.id + '" title="Delete pose"><i class="bi bi-trash"></i></button>';
      html += '</div>';
    });
    container.innerHTML = html;

    container.querySelectorAll('.pose-list-item').forEach(function(el) {
      el.addEventListener('click', function(e) {
        if (e.target.closest('.pose-delete-btn')) return;
        var id = parseInt(el.getAttribute('data-pose-id'), 10);
        loadPoseIntoEditor(id);
      });
    });

    container.querySelectorAll('.pose-delete-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var id = parseInt(btn.getAttribute('data-pose-id'), 10);
        deletePose(id);
      });
    });
  }

  // ============ RENDER SOUND SELECT ============
  function renderSoundSelect() {
    var sel = $('audioFile');
    if (!sel) return;
    sel.innerHTML = '<option value="">Select audio...</option>';
    sounds.forEach(function(s) {
      var opt = document.createElement('option');
      opt.value = s.id || s.filename || s.path;
      opt.textContent = s.name || s.filename || s.id;
      sel.appendChild(opt);
    });
  }

  // ============ AUDIO TOGGLE ============
  function toggleAudioSection() {
    var type = ($('audioType') || {}).value;
    var fileSection = $('audioFileSection');
    var ttsSection = $('audioTtsSection');
    if (fileSection) fileSection.style.display = (type === 'file') ? '' : 'none';
    if (ttsSection) ttsSection.style.display = (type === 'tts') ? '' : 'none';
  }

  // ============ NEW POSE (CLEAR FORM) ============
  function clearForm() {
    editingPoseId = null;
    history.replaceState(null, '', '/poses/editor');
    $('poseName').value = '';
    $('poseCategory').value = '';
    $('poseDescription').value = '';
    $('poseConcurrent').checked = false;
    $('poseTransitionDuration').value = '';
    $('poseTransitionProfile').value = 'ease_in_out';
    $('poseJitter').value = '';
    $('audioType').value = 'none';
    toggleAudioSection();
    document.querySelectorAll('.part-include').forEach(function(cb) {
      cb.checked = false;
      var card = cb.closest('.part-card');
      if (card) card.classList.remove('included');
    });
    updateDeleteButton();
    renderPosesList();
    setStatus('Ready for new pose');
  }

  // ============ BIND EVENTS ============
  function bindEvents() {
    $('btnSavePose').addEventListener('click', savePose);
    $('btnTestPose').addEventListener('click', testFullPose);
    $('btnNewPose').addEventListener('click', clearForm);
    $('btnDeletePose').addEventListener('click', function() { if (editingPoseId) deletePose(editingPoseId); });
    $('audioType').addEventListener('change', toggleAudioSection);
  }

  // ============ INIT ============
  function init() {
    bindEvents();
    loadAll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
