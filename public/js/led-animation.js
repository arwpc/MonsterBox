/**
 * LED Animation page (ES5)
 * MonsterBox — dedicated home for addressable LED-ring animation.
 * Colour per state, palette cross-fade, live colour/brightness, jaw/speech sync,
 * and a test panel (state buttons, low→high sweep, speak & drive eyes).
 */
(function() {
  'use strict';

  var LED_API = '/api/led';
  var PAGE_API = '/setup/led-animation/api';

  var currentCharacterId = null;
  var cfg = {};                 // colour config from the controller
  var ledSync = {};             // jaw/speech sync block
  var availableLedParts = [];
  var geometry = { pixelCount: 16, ringSplit: 8 };
  var palette = [];
  var colorableStates = ['idle', 'listening', 'thinking', 'speaking', 'error', 'fade'];
  var identifyTimer = null;
  var pollTimer = null;
  var pollBusy = false;   // in-flight guard: on a loaded Pi a poll can outlive the interval period
  var syncSaveTimer = null;
  var lastTimeline = null;   // last {time, amplitude, ledLevel}[] for the comparison chart
  var looping = false;       // a loop playback is active — save control changes immediately
  var el = {};

  function init() {
    cacheElements();
    bindEvents();
    readCharacterFromNav();
    if (currentCharacterId) loadConfig();
  }

  function cacheElements() {
    el = {
      allOffBtn:        document.getElementById('ledAllOffBtn'),
      saveConfigBtn:    document.getElementById('ledSaveConfigBtn'),
      noPartNotice:     document.getElementById('ledNoPartNotice'),
      leftColor:        document.getElementById('ledLeftColor'),
      rightColor:       document.getElementById('ledRightColor'),
      linkEyes:         document.getElementById('ledLinkEyes'),
      brightness:       document.getElementById('ledBrightness'),
      brightnessValue:  document.getElementById('ledBrightnessValue'),
      applyLive:        document.getElementById('ledApplyLive'),
      identify:         document.getElementById('ledIdentify'),
      liveStatus:       document.getElementById('ledLiveStatus'),
      stateRows:        document.getElementById('ledStateRows'),
      paletteSwatches:  document.getElementById('ledPaletteSwatches'),
      addSwatch:        document.getElementById('ledAddSwatch'),
      fadeMs:           document.getElementById('ledFadeMs'),
      fadeMsValue:      document.getElementById('ledFadeMsValue'),
      holdMs:           document.getElementById('ledHoldMs'),
      holdMsValue:      document.getElementById('ledHoldMsValue'),
      previewFade:      document.getElementById('ledPreviewFade'),
      syncEnabled:      document.getElementById('ledSyncEnabled'),
      syncPartSelect:   document.getElementById('ledSyncPartSelect'),
      syncColorLow:     document.getElementById('ledSyncColorLow'),
      syncColorHigh:    document.getElementById('ledSyncColorHigh'),
      syncStatus:       document.getElementById('ledSyncStatus'),
      syncSensitivity:  document.getElementById('ledSyncSensitivity'),
      syncSensitivityValue: document.getElementById('ledSyncSensitivityValue'),
      syncSmoothing:    document.getElementById('ledSyncSmoothing'),
      syncSmoothingValue: document.getElementById('ledSyncSmoothingValue'),
      syncAttack:       document.getElementById('ledSyncAttack'),
      syncRelease:      document.getElementById('ledSyncRelease'),
      syncSpeed:        document.getElementById('ledSyncSpeed'),
      syncSpeedValue:   document.getElementById('ledSyncSpeedValue'),
      syncOffset:       document.getElementById('ledSyncOffset'),
      syncOffsetValue:  document.getElementById('ledSyncOffsetValue'),
      comparePanel:     document.getElementById('ledComparePanel'),
      compareCanvas:    document.getElementById('ledCompareCanvas'),
      ttsText:          document.getElementById('ledTtsText'),
      speakBtn:         document.getElementById('ledSpeakBtn'),
      loop:             document.getElementById('ledLoop'),
      stopBtn:          document.getElementById('ledStopBtn'),
      ttsStatus:        document.getElementById('ledTtsStatus'),
      currentState:     document.getElementById('ledCurrentState'),
      levelValue:       document.getElementById('ledLevelValue'),
      levelFill:        document.getElementById('ledLevelFill'),
      stateTestButtons: document.getElementById('ledStateTestButtons'),
      sweepBtn:         document.getElementById('ledSweepBtn')
    };
  }

  function bindEvents() {
    if (el.allOffBtn)    el.allOffBtn.addEventListener('click', ledOff);
    if (el.saveConfigBtn) el.saveConfigBtn.addEventListener('click', saveColourConfig);

    if (el.leftColor) el.leftColor.addEventListener('input', function() {
      if (el.linkEyes && el.linkEyes.checked && el.rightColor) el.rightColor.value = el.leftColor.value;
      liveApply();
    });
    if (el.rightColor) el.rightColor.addEventListener('input', function() {
      if (el.linkEyes && el.linkEyes.checked && el.leftColor) el.leftColor.value = el.rightColor.value;
      liveApply();
    });
    if (el.brightness) {
      el.brightness.addEventListener('input', function() {
        if (el.brightnessValue) el.brightnessValue.textContent = el.brightness.value;
      });
      el.brightness.addEventListener('change', function() {
        api(LED_API, '/brightness', { brightness: Number(el.brightness.value) });
      });
    }
    if (el.applyLive)   el.applyLive.addEventListener('click', liveApply);
    if (el.identify)    el.identify.addEventListener('click', identifyWalk);
    if (el.addSwatch)   el.addSwatch.addEventListener('click', function() { palette.push([255, 120, 0]); renderPalette(); });
    if (el.previewFade) el.previewFade.addEventListener('click', previewFade);

    [['fadeMs', 'fadeMsValue'], ['holdMs', 'holdMsValue']].forEach(function(pair) {
      var input = el[pair[0]];
      if (!input) return;
      input.addEventListener('input', function() {
        var out = el[pair[1]];
        if (out) out.textContent = input.value;
      });
    });

    // LED sync — auto-save on any change
    if (el.syncEnabled)    el.syncEnabled.addEventListener('change', function() { updateSyncState(); scheduleSyncSave(); });
    if (el.syncPartSelect) el.syncPartSelect.addEventListener('change', function() { updateSyncState(); scheduleSyncSave(); });
    if (el.syncColorLow)   el.syncColorLow.addEventListener('change', scheduleSyncSave);
    if (el.syncColorHigh)  el.syncColorHigh.addEventListener('change', scheduleSyncSave);
    // Timing knobs: live value display + auto-save
    [['syncSensitivity', 'syncSensitivityValue'], ['syncSmoothing', 'syncSmoothingValue'], ['syncSpeed', 'syncSpeedValue']].forEach(function(pair) {
      var input = el[pair[0]];
      if (!input) return;
      input.addEventListener('input', function() { var o = el[pair[1]]; if (o) o.textContent = input.value; });
      input.addEventListener('change', scheduleSyncSave);
    });
    if (el.syncAttack)  el.syncAttack.addEventListener('change', scheduleSyncSave);
    if (el.syncRelease) el.syncRelease.addEventListener('change', scheduleSyncSave);
    if (el.syncOffset) {
      el.syncOffset.addEventListener('input', function() {
        if (el.syncOffsetValue) el.syncOffsetValue.textContent = el.syncOffset.value;
        drawComparison();   // live: shift the LED curve against the audio
      });
      el.syncOffset.addEventListener('change', scheduleSyncSave);
    }

    if (el.speakBtn) el.speakBtn.addEventListener('click', speakAndDrive);
    if (el.stopBtn)  el.stopBtn.addEventListener('click', stopPlayback);
    if (el.sweepBtn) el.sweepBtn.addEventListener('click', runSweep);

    // Delegated Test buttons inside the per-state rows
    if (el.stateRows) el.stateRows.addEventListener('click', function(ev) {
      var btn = ev.target && ev.target.closest && ev.target.closest('[data-led-test]');
      if (!btn) return;
      testState(btn.getAttribute('data-led-test'));
    });
    // Delegated palette swatch edit/remove
    if (el.paletteSwatches) {
      el.paletteSwatches.addEventListener('input', function(ev) {
        var idx = ev.target && ev.target.getAttribute && ev.target.getAttribute('data-led-swatch');
        if (idx === null || idx === undefined) return;
        palette[Number(idx)] = hexToRgb(ev.target.value);
      });
      el.paletteSwatches.addEventListener('click', function(ev) {
        var rm = ev.target && ev.target.closest && ev.target.closest('[data-led-swatch-remove]');
        if (!rm) return;
        palette.splice(Number(rm.getAttribute('data-led-swatch-remove')), 1);
        renderPalette();
      });
    }
  }

  function readCharacterFromNav() {
    var mbId = window.__MB_CHAR_ID || null;
    if (mbId) { currentCharacterId = parseInt(mbId, 10) || null; return; }
    var charLabel = document.getElementById('charLabel');
    if (charLabel) {
      var id = charLabel.getAttribute('data-char-id');
      if (id && id !== '') currentCharacterId = parseInt(id, 10);
    }
  }

  // ─── Colour helpers ───────────────────────────────────────────────
  function hexToRgb(hex) {
    var m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex || ''));
    if (!m) return [0, 0, 0];
    var n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbToHex(rgb) {
    if (!rgb || rgb.length !== 3) return '#000000';
    function h(c) { var s = Math.max(0, Math.min(255, c | 0)).toString(16); return s.length === 1 ? '0' + s : s; }
    return '#' + h(rgb[0]) + h(rgb[1]) + h(rgb[2]);
  }
  function ledDefaultFor(state) {
    var defaults = {
      idle: [120, 40, 160], listening: [0, 180, 255], thinking: [0, 120, 255],
      speaking: [255, 140, 30], error: [255, 0, 0], fade: [255, 120, 0]
    };
    return defaults[state] || [255, 255, 255];
  }

  // ─── API ──────────────────────────────────────────────────────────
  function api(base, path, body) {
    var opts = { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    var url = base + path;
    if (base === LED_API && currentCharacterId) url += (path.indexOf('?') >= 0 ? '&' : '?') + 'characterId=' + currentCharacterId;
    return fetch(url, opts).then(function(r) { return r.json(); }).catch(function() { return { success: false }; });
  }

  function liveStatus(msg) { if (el.liveStatus) el.liveStatus.textContent = msg; }

  // ─── Load & populate ──────────────────────────────────────────────
  function loadConfig() {
    fetch(PAGE_API + '/config/' + currentCharacterId)
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (!data || !data.success) { liveStatus('Could not load LED config.'); return; }
        cfg = data.config || {};
        ledSync = data.ledSync || {};
        availableLedParts = data.availableLedParts || [];
        if (data.geometry) geometry = data.geometry;
        if (Array.isArray(data.colorable) && data.colorable.length) colorableStates = data.colorable;
        palette = (cfg.palette || []).slice();

        var hasPart = availableLedParts.length > 0 || (cfg && cfg.colors);
        if (el.noPartNotice) el.noPartNotice.classList.toggle('jaw-hidden', availableLedParts.length > 0);

        populateLive();
        renderStateRows();
        renderPalette();
        renderStateTestButtons();
        populateSyncDropdown(availableLedParts);
        populateSyncControls(ledSync);
        liveStatus('Ready.');
      })
      .catch(function() { liveStatus('Failed to load LED config.'); });
  }

  function populateLive() {
    var idle = (cfg.colors && cfg.colors.idle) || {};
    var seed = idle.left || idle.right || ledDefaultFor('idle');
    if (el.leftColor)  el.leftColor.value = rgbToHex(seed);
    if (el.rightColor) el.rightColor.value = rgbToHex(idle.right || seed);
    var bri = (cfg.brightness != null) ? cfg.brightness : 60;
    if (el.brightness) el.brightness.value = bri;
    if (el.brightnessValue) el.brightnessValue.textContent = bri;
    if (el.fadeMs) el.fadeMs.value = cfg.fadeMs != null ? cfg.fadeMs : 1200;
    if (el.fadeMsValue) el.fadeMsValue.textContent = cfg.fadeMs != null ? cfg.fadeMs : 1200;
    if (el.holdMs) el.holdMs.value = cfg.holdMs != null ? cfg.holdMs : 600;
    if (el.holdMsValue) el.holdMsValue.textContent = cfg.holdMs != null ? cfg.holdMs : 600;
  }

  function renderStateRows() {
    if (!el.stateRows) return;
    el.stateRows.innerHTML = '';
    colorableStates.forEach(function(state) {
      var entry = (cfg.colors && cfg.colors[state]) || {};
      var fallback = ledDefaultFor(state);
      var row = document.createElement('div');
      row.className = 'd-flex align-items-center gap-2 mb-2';
      row.innerHTML =
        '<span class="mb-mono text-capitalize" style="width:5.5rem">' + state + '</span>' +
        '<input type="color" class="mb-color mb-color-sm" title="Left eye" data-led-state="' + state + '" data-led-eye="left" value="' + rgbToHex(entry.left || fallback) + '">' +
        '<input type="color" class="mb-color mb-color-sm" title="Right eye" data-led-state="' + state + '" data-led-eye="right" value="' + rgbToHex(entry.right || entry.left || fallback) + '">' +
        '<button type="button" class="mb-btn mb-btn-secondary mb-btn-sm" data-led-test="' + state + '" title="Run this state on the ring"><i class="bi bi-play"></i> Test</button>' +
        '<span class="mb-field-hint">' + (entry.left ? 'saved' : 'default') + '</span>';
      el.stateRows.appendChild(row);
    });
  }

  function renderPalette() {
    if (!el.paletteSwatches) return;
    el.paletteSwatches.innerHTML = '';
    if (!palette.length) {
      el.paletteSwatches.innerHTML = '<span class="mb-field-hint">No palette yet &mdash; add a colour.</span>';
      return;
    }
    palette.forEach(function(rgb, i) {
      var wrap = document.createElement('div');
      wrap.className = 'd-flex flex-column align-items-center';
      wrap.innerHTML =
        '<input type="color" class="mb-color mb-color-sm" data-led-swatch="' + i + '" value="' + rgbToHex(rgb) + '">' +
        '<button type="button" class="mb-btn mb-btn-link mb-btn-sm p-0" data-led-swatch-remove="' + i + '">remove</button>';
      el.paletteSwatches.appendChild(wrap);
    });
  }

  function renderStateTestButtons() {
    if (!el.stateTestButtons) return;
    el.stateTestButtons.innerHTML = '';
    colorableStates.forEach(function(state) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mb-btn mb-btn-secondary mb-btn-sm text-capitalize';
      btn.innerHTML = '<i class="bi bi-play"></i> ' + state;
      btn.addEventListener('click', function() { testState(state); });
      el.stateTestButtons.appendChild(btn);
    });
  }

  // ─── LED sync (jaw/speech) ────────────────────────────────────────
  function populateSyncDropdown(parts) {
    if (!el.syncPartSelect) return;
    var selected = el.syncPartSelect.value;
    el.syncPartSelect.innerHTML = '<option value="">Select an LED ring...</option>';
    parts.forEach(function(part) {
      var opt = document.createElement('option');
      opt.value = part.id;
      opt.textContent = part.name || ('LED #' + part.id);
      el.syncPartSelect.appendChild(opt);
    });
    if (selected) el.syncPartSelect.value = selected;
  }

  function populateSyncControls(sync) {
    var s = sync || {};
    if (el.syncEnabled) el.syncEnabled.checked = !!s.enabled;
    if (el.syncPartSelect) el.syncPartSelect.value = s.partId != null ? String(s.partId) : '';
    if (el.syncColorLow)  el.syncColorLow.value = rgbToHex(s.colorLow || [80, 0, 0]);
    if (el.syncColorHigh) el.syncColorHigh.value = rgbToHex(s.colorHigh || [255, 120, 0]);
    setSlider('syncSensitivity', 'syncSensitivityValue', s.sensitivity, 1.0);
    setSlider('syncSmoothing', 'syncSmoothingValue', s.smoothing, 0.5);
    setSlider('syncSpeed', 'syncSpeedValue', s.speed, 1.0);
    setSlider('syncOffset', 'syncOffsetValue', s.offsetMs, 0);
    if (el.syncAttack)  el.syncAttack.value = s.attackMs != null ? s.attackMs : 40;
    if (el.syncRelease) el.syncRelease.value = s.releaseMs != null ? s.releaseMs : 120;
    updateSyncState();
  }

  function setSlider(inputKey, valueKey, value, fallback) {
    var v = value != null ? value : fallback;
    if (el[inputKey]) el[inputKey].value = v;
    if (el[valueKey]) el[valueKey].textContent = v;
  }

  function updateSyncState() {
    var hasParts = availableLedParts.length > 0;
    var on = el.syncEnabled && el.syncEnabled.checked;
    if (el.syncEnabled) el.syncEnabled.disabled = !hasParts;
    var enable = hasParts && on;
    ['syncPartSelect', 'syncColorLow', 'syncColorHigh', 'syncSensitivity', 'syncSmoothing', 'syncAttack', 'syncRelease', 'syncSpeed', 'syncOffset'].forEach(function(k) {
      if (el[k]) el[k].disabled = !enable;
    });
    if (el.syncStatus) {
      el.syncStatus.textContent = !hasParts
        ? 'No addressable LED ring on this character.'
        : (on ? 'The eyes brighten and shift colour as the jaw opens.' : 'Turn on to react the eyes to speech.');
    }
  }

  function buildSyncFromForm() {
    return {
      enabled:   el.syncEnabled ? el.syncEnabled.checked : false,
      partId:    (el.syncPartSelect && el.syncPartSelect.value) ? el.syncPartSelect.value : null,
      colorLow:  el.syncColorLow ? hexToRgb(el.syncColorLow.value) : [80, 0, 0],
      colorHigh: el.syncColorHigh ? hexToRgb(el.syncColorHigh.value) : [255, 120, 0],
      sensitivity: el.syncSensitivity ? Number(el.syncSensitivity.value) : 1.0,
      smoothing:   el.syncSmoothing ? Number(el.syncSmoothing.value) : 0.5,
      attackMs:    el.syncAttack ? parseInt(el.syncAttack.value, 10) : 40,
      releaseMs:   el.syncRelease ? parseInt(el.syncRelease.value, 10) : 120,
      speed:       el.syncSpeed ? Number(el.syncSpeed.value) : 1.0,
      offsetMs:    el.syncOffset ? parseInt(el.syncOffset.value, 10) : 0
    };
  }

  function scheduleSyncSave() {
    // While looping, persist immediately so the very next pass uses the change.
    if (looping) { saveSync(); return; }
    if (syncSaveTimer) clearTimeout(syncSaveTimer);
    syncSaveTimer = setTimeout(saveSync, 500);
  }
  function saveSync() {
    if (!currentCharacterId) return;
    api(PAGE_API, '/led-sync/' + currentCharacterId, buildSyncFromForm()).then(function(data) {
      if (data && data.success) { ledSync = data.ledSync || ledSync; showToast('Speech sync saved', 'success'); }
    });
  }

  // ─── Live control ─────────────────────────────────────────────────
  function ledGeometry() {
    var total = Number(geometry.pixelCount) || 16;
    var split = Number(geometry.ringSplit) || Math.floor(total / 2);
    return { pixelCount: total, ringSplit: split };
  }

  function liveApply() {
    stopIdentify();
    var g = ledGeometry();
    var l = el.leftColor ? hexToRgb(el.leftColor.value) : [0, 0, 0];
    var r = el.rightColor ? hexToRgb(el.rightColor.value) : l;
    var pixels = [];
    for (var i = 0; i < g.pixelCount; i++) pixels.push(i < g.ringSplit ? l : r);
    api(LED_API, '/pixels', { pixels: pixels, target: 'both' }).then(function(j) {
      liveStatus(j && j.success ? 'Live colour applied.' : 'Apply failed: ' + ((j && j.reason) || 'unknown'));
    });
  }

  function stopIdentify() {
    if (identifyTimer) { clearInterval(identifyTimer); identifyTimer = null; }
  }
  function identifyWalk() {
    stopIdentify();
    var g = ledGeometry();
    var i = 0;
    liveStatus('Identifying pixels...');
    identifyTimer = setInterval(function() {
      var pixels = [];
      for (var j = 0; j < g.pixelCount; j++) pixels.push(j === i ? [255, 255, 255] : [0, 0, 0]);
      api(LED_API, '/pixels', { pixels: pixels, target: 'both' });
      i++;
      if (i >= g.pixelCount) { stopIdentify(); liveStatus('Identify complete.'); }
    }, 400);
  }

  function testState(state) {
    stopIdentify();
    var rowHost = el.stateRows;
    var body = { state: state };
    if (rowHost) {
      var l = rowHost.querySelector('[data-led-state="' + state + '"][data-led-eye="left"]');
      var r = rowHost.querySelector('[data-led-state="' + state + '"][data-led-eye="right"]');
      if (l) body.color = hexToRgb(l.value);
      if (r) body.colorRight = hexToRgb(r.value);
    }
    if (state === 'fade') body.palette = palette;
    api(LED_API, '/state', body).then(function(j) {
      liveStatus(j && j.success ? ('Running "' + state + '".') : ('Test failed: ' + ((j && j.reason) || 'unknown')));
    });
  }

  function previewFade() {
    stopIdentify();
    api(LED_API, '/state', {
      state: 'fade',
      palette: palette,
      fadeMs: Number(el.fadeMs ? el.fadeMs.value : 1200),
      holdMs: Number(el.holdMs ? el.holdMs.value : 600)
    }).then(function(j) { liveStatus(j && j.success ? 'Previewing fade.' : 'Preview failed.'); });
  }

  function ledOff() {
    stopIdentify();
    api(LED_API, '/off', {}).then(function() { liveStatus('Ring off.'); });
  }

  // ─── Save colour config ───────────────────────────────────────────
  function collectColorsFromRows() {
    var colors = {};
    if (!el.stateRows) return colors;
    colorableStates.forEach(function(state) {
      var l = el.stateRows.querySelector('[data-led-state="' + state + '"][data-led-eye="left"]');
      var r = el.stateRows.querySelector('[data-led-state="' + state + '"][data-led-eye="right"]');
      if (l && r) colors[state] = { left: hexToRgb(l.value), right: hexToRgb(r.value) };
    });
    return colors;
  }

  function saveColourConfig() {
    if (!currentCharacterId) return;
    var patch = {
      colors: collectColorsFromRows(),
      palette: palette,
      fadeMs: Number(el.fadeMs ? el.fadeMs.value : 1200),
      holdMs: Number(el.holdMs ? el.holdMs.value : 600),
      brightness: Number(el.brightness ? el.brightness.value : 60)
    };
    if (el.saveConfigBtn) el.saveConfigBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Saving...';
    api(PAGE_API, '/config/' + currentCharacterId, patch).then(function(data) {
      if (el.saveConfigBtn) el.saveConfigBtn.innerHTML = '<i class="bi bi-save"></i> Save';
      if (data && data.success) { showToast('LED config saved', 'success'); if (data.config) cfg = data.config; }
      else showToast('Save failed: ' + ((data && (data.reason || data.error)) || 'unknown'), 'error');
    });
  }

  // ─── Test panel: speak / sweep / meter ────────────────────────────
  function setTtsStatus(html) { if (el.ttsStatus) el.ttsStatus.innerHTML = html; }

  function speakAndDrive() {
    if (!currentCharacterId) return;
    var text = el.ttsText ? el.ttsText.value.trim() : '';
    if (!text) { showToast('Enter some text first', 'error'); return; }
    var loop = !!(el.loop && el.loop.checked);
    if (el.speakBtn) el.speakBtn.disabled = true;
    setTtsStatus('<span class="mb-badge mb-badge-info">Generating…</span>');
    startPolling();
    // Persist the on-screen timing/offset FIRST so the test uses exactly what is
    // set — the drive reads the SAVED config, and the offset only auto-saves on a
    // debounce, so without this a slider you just moved would not take effect.
    api(PAGE_API, '/led-sync/' + currentCharacterId, buildSyncFromForm()).then(function() {
      return api(PAGE_API, '/test-tts/' + currentCharacterId, { text: text, loop: loop });
    }).then(function(data) {
      if (el.speakBtn) el.speakBtn.disabled = false;
      if (data && data.success) {
        if (data.timeline && data.timeline.length) { lastTimeline = data.timeline; drawComparison(); }
        if (loop) {
          // Loop keeps running on the server; leave polling on and let the
          // operator tune the controls below (each pass re-reads them). Stop ends it.
          looping = true;
          setTtsStatus('<span class="mb-badge mb-badge-success"><i class="bi bi-arrow-repeat"></i> Looping</span>');
        } else {
          looping = false;
          setTtsStatus('<span class="mb-badge mb-badge-success">Speaking</span>');
          var dur = data.duration || 3000;
          setTimeout(function() { setTtsStatus('<span class="mb-badge">Idle</span>'); stopPolling(); }, dur + 600);
        }
      } else {
        looping = false;
        setTtsStatus('<span class="mb-badge mb-badge-danger">Failed</span>');
        showToast('Speak failed: ' + ((data && (data.message || data.error)) || 'unknown'), 'error');
        stopPolling();
      }
    });
  }

  function runSweep() {
    if (!currentCharacterId) return;
    if (el.sweepBtn) { el.sweepBtn.disabled = true; el.sweepBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Sweeping...'; }
    startPolling();
    // Save current timing first so the sweep reflects it too.
    api(PAGE_API, '/led-sync/' + currentCharacterId, buildSyncFromForm()).then(function() {
      return api(PAGE_API, '/sweep/' + currentCharacterId, {});
    }).then(function(data) {
      if (el.sweepBtn) { el.sweepBtn.disabled = false; el.sweepBtn.innerHTML = '<i class="bi bi-play-circle"></i> Low→High Sweep'; }
      showToast(data && data.success ? 'Sweep complete' : ('Sweep failed: ' + ((data && (data.message || data.error)) || 'unknown')), data && data.success ? 'success' : 'error');
      stopPolling();
    });
  }

  function stopPlayback() {
    looping = false;
    api(PAGE_API, '/stop/' + currentCharacterId, {}).then(function() {
      setTtsStatus('<span class="mb-badge">Idle</span>');
      stopPolling();
    });
  }

  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(pollStatus, 150);
  }
  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    if (el.levelFill) el.levelFill.style.width = '0%';
    if (el.levelValue) el.levelValue.textContent = '0.000';
  }
  function pollStatus() {
    // Skip if a previous poll is still in flight (they stack on a busy Pi and
    // congest the very daemon animating the eyes) or the tab is hidden.
    if (pollBusy) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    pollBusy = true;
    api(LED_API, '/status', null).then(function(d) {
      pollBusy = false;
      if (!d || !d.success) return;
      var level = Number(d.audioLevel || 0);
      if (el.levelFill) el.levelFill.style.width = Math.round(level * 100) + '%';
      if (el.levelValue) el.levelValue.textContent = level.toFixed(3);
      if (el.currentState) el.currentState.textContent = d.state || '—';
    }).catch(function() { pollBusy = false; });
  }

  // ─── Audio vs LED comparison chart ────────────────────────────────
  function drawComparison() {
    if (!lastTimeline || !lastTimeline.length || !el.compareCanvas || !el.comparePanel) return;
    el.comparePanel.style.display = 'block';
    var canvas = el.compareCanvas;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    var dpr = window.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, rect.width) * dpr;
    canvas.height = Math.max(1, rect.height) * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var w = rect.width, hgt = rect.height;

    var cs = getComputedStyle(document.documentElement);
    function tok(name, fb) { var v = cs.getPropertyValue(name).trim(); return v || fb; }
    var bg = tok('--mb-bg-1', '#151515');
    var audioColor = tok('--mb-fg-muted', '#8a8a8a');
    var ledColor = tok('--mb-primary', '#e0a030');
    var grid = tok('--mb-border-default', 'rgba(255,255,255,0.12)');

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, hgt);

    var tl = lastTimeline;
    var n = tl.length;
    var totalTime = tl[n - 1].time || (n * 20) || 1;
    var offsetMs = el.syncOffset ? Number(el.syncOffset.value) : 0;

    function xAt(t) { return (t / totalTime) * w; }
    function yAt(v) { var c = v < 0 ? 0 : (v > 1 ? 1 : v); return hgt - (c * (hgt - 4)) - 2; }

    // Audio amplitude as a filled area (muted).
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = audioColor;
    ctx.beginPath();
    ctx.moveTo(0, hgt);
    for (var i = 0; i < n; i++) ctx.lineTo(xAt(tl[i].time), yAt(tl[i].amplitude));
    ctx.lineTo(w, hgt);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    // LED level as a line, shifted horizontally by the audio offset.
    ctx.strokeStyle = ledColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (var j = 0; j < n; j++) {
      var px = xAt(tl[j].time + offsetMs);
      var py = yAt(tl[j].ledLevel);
      if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();

    ctx.strokeStyle = grid;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(0, hgt - 2);
    ctx.lineTo(w, hgt - 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // ─── Toast (reuse global if present) ───────────────────────────────
  function showToast(msg, type) {
    if (window.showToast) { window.showToast(msg, type); return; }
    liveStatus(msg);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
