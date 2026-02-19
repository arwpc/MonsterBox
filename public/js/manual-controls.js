/**
 * Manual Controls Panel — spatial drag-and-drop control surface for live animatronic operation.
 * Exposed as window.ManualControls = { init, reload, destroy }
 * ES5 IIFE — no arrow functions, no template literals, no const/let in outer scope.
 */
(function () {
  'use strict';

  var canvas = null;
  var directionalEl = null;
  var controlsBodyEl = null;
  var selectedPartNameEl = null;
  var controlStatusEl = null;
  var itemCountEl = null;
  var editToggleBtn = null;
  var drawerEl = null;
  var drawerItemsEl = null;
  var layoutSelectEl = null;
  var layoutNewBtn = null;
  var layoutRenameBtn = null;
  var layoutDeleteBtn = null;

  var characterId = null;
  var editMode = false;
  var selectedPartId = null;
  var selectedPartData = null;

  var allParts = [];
  var allPoses = [];
  var allAudio = [];
  var layoutData = null;
  var currentLayoutName = 'Default';
  var saveTimer = null;

  var MOVABLE_TYPES = ['servo', 'linear_actuator', 'motor', 'stepper', 'light', 'led', 'motion_sensor'];

  // ── Helpers ──

  function $(id) { return document.getElementById(id); }

  function setStatus(text) {
    if (controlStatusEl) controlStatusEl.textContent = text || '';
  }

  function flashItem(el) {
    if (!el) return;
    el.classList.remove('mc-fired');
    void el.offsetWidth; // force reflow
    el.classList.add('mc-fired');
    setTimeout(function () { el.classList.remove('mc-fired'); }, 350);
  }

  // ── Data Loading ──

  function fetchData(charId) {
    return Promise.allSettled([
      fetch('/api/parts?characterId=' + encodeURIComponent(charId)).then(function (r) { return r.json(); }),
      fetch('/poses/api/poses').then(function (r) { return r.json(); }),
      fetch('/audio-library/api/library').then(function (r) { return r.json(); }),
      fetch('/conversation/api/manual-controls-layout?name=' + encodeURIComponent(currentLayoutName)).then(function (r) { return r.json(); })
    ]);
  }

  function processData(results) {
    var partsResult = results[0];
    var posesResult = results[1];
    var audioResult = results[2];
    var layoutResult = results[3];

    // Parts — filter to movable types
    // Parts API may return raw array or { success, parts } wrapper
    allParts = [];
    if (partsResult.status === 'fulfilled' && partsResult.value) {
      var raw = [];
      if (Array.isArray(partsResult.value)) {
        raw = partsResult.value;
      } else if (partsResult.value.success) {
        raw = partsResult.value.parts || [];
      }
      for (var i = 0; i < raw.length; i++) {
        var t = String(raw[i].type || '').toLowerCase();
        if (MOVABLE_TYPES.indexOf(t) !== -1) {
          allParts.push(raw[i]);
        }
      }
    }

    // Poses
    allPoses = [];
    if (posesResult.status === 'fulfilled' && posesResult.value && posesResult.value.success) {
      allPoses = posesResult.value.poses || [];
    }

    // Audio — cap at 20 most recent
    allAudio = [];
    if (audioResult.status === 'fulfilled' && audioResult.value && audioResult.value.success) {
      var files = audioResult.value.files || [];
      allAudio = files.slice(0, 20);
    }

    // Layout
    layoutData = null;
    if (layoutResult.status === 'fulfilled' && layoutResult.value && layoutResult.value.success) {
      layoutData = layoutResult.value.layout;
      if (layoutResult.value.layoutName) currentLayoutName = layoutResult.value.layoutName;
      updateLayoutSelector(layoutResult.value.layouts || [], layoutResult.value.activeLayout || currentLayoutName);
    }
  }

  // ── Layout Selector ──

  function updateLayoutSelector(names, active) {
    if (!layoutSelectEl) return;
    layoutSelectEl.innerHTML = '';
    if (!names || names.length === 0) names = ['Default'];
    for (var i = 0; i < names.length; i++) {
      var opt = document.createElement('option');
      opt.value = names[i];
      opt.textContent = names[i];
      if (names[i] === active) opt.selected = true;
      layoutSelectEl.appendChild(opt);
    }
  }

  function onLayoutSelect() {
    var name = layoutSelectEl ? layoutSelectEl.value : 'Default';
    if (name === currentLayoutName) return;
    currentLayoutName = name;
    // Re-fetch with this layout name
    fetch('/conversation/api/manual-controls-layout?name=' + encodeURIComponent(name))
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j && j.success) {
          layoutData = j.layout;
          renderCanvas();
        }
      })
      .catch(function () {});
  }

  function onLayoutNew() {
    var name = prompt('New layout name:');
    if (!name || !name.trim()) return;
    name = name.trim();
    currentLayoutName = name;
    // Save an empty layout with the new name
    fetch('/conversation/api/manual-controls-layout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ layoutName: name, items: [], canvasHeight: canvas ? canvas.clientHeight : 350 })
    })
    .then(function (r) { return r.json(); })
    .then(function (j) {
      if (j && j.success) {
        updateLayoutSelector(j.layouts, name);
        layoutData = { canvasHeight: 350, items: [] };
        renderCanvas();
      }
    })
    .catch(function () {});
  }

  function onLayoutRename() {
    var oldName = currentLayoutName;
    var newName = prompt('Rename layout "' + oldName + '" to:', oldName);
    if (!newName || !newName.trim() || newName.trim() === oldName) return;
    newName = newName.trim();
    fetch('/conversation/api/manual-controls-layout/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldName: oldName, newName: newName })
    })
    .then(function (r) { return r.json(); })
    .then(function (j) {
      if (j && j.success) {
        currentLayoutName = newName;
        updateLayoutSelector(j.layouts, j.activeLayout || newName);
      }
    })
    .catch(function () {});
  }

  function onLayoutDelete() {
    var name = currentLayoutName;
    if (!confirm('Delete layout "' + name + '"?')) return;
    fetch('/conversation/api/manual-controls-layout?name=' + encodeURIComponent(name), { method: 'DELETE' })
    .then(function (r) { return r.json(); })
    .then(function (j) {
      if (j && j.success) {
        currentLayoutName = j.activeLayout || 'Default';
        updateLayoutSelector(j.layouts, currentLayoutName);
        // Re-fetch active layout
        return fetch('/conversation/api/manual-controls-layout?name=' + encodeURIComponent(currentLayoutName))
          .then(function (r2) { return r2.json(); })
          .then(function (j2) {
            if (j2 && j2.success) {
              layoutData = j2.layout;
              renderCanvas();
            }
          });
      } else {
        alert(j && j.error ? j.error : 'Failed to delete layout');
      }
    })
    .catch(function () {});
  }

  // ── Canvas Rendering ──

  function renderCanvas() {
    if (!canvas) return;
    canvas.innerHTML = '';
    deselectPart();

    var savedItems = (layoutData && layoutData.items) ? layoutData.items : [];
    var placedCount = 0;

    // Only render items that are explicitly saved in the layout
    for (var s = 0; s < savedItems.length; s++) {
      var si = savedItems[s];
      var data = findItemData(si.type, si.id);
      if (!data) continue; // item no longer exists in character data

      var el = createItemElement(si.type, data);
      el.style.left = (si.x || 0) + 'px';
      el.style.top = (si.y || 0) + 'px';
      canvas.appendChild(el);
      placedCount++;
    }

    // Show empty state when no items placed
    if (placedCount === 0 && !editMode) {
      var emptyMsg = document.createElement('div');
      emptyMsg.className = 'text-center text-muted py-4';
      emptyMsg.id = 'mcEmptyState';
      emptyMsg.innerHTML = '<i class="bi bi-plus-circle" style="font-size:1.5rem"></i>' +
        '<div class="small mt-1">Click <strong>Edit Layout</strong> to add controls</div>';
      canvas.appendChild(emptyMsg);
    }

    // Update item count badge
    if (itemCountEl) {
      itemCountEl.textContent = placedCount + ' items';
    }

    // Apply edit mode if active
    if (editMode) {
      applyEditModeClass(true);
      showDrawer();
      // Remove empty state in edit mode
      var empty = $('mcEmptyState');
      if (empty) empty.remove();
    }
  }

  function findItemData(type, id) {
    var i;
    if (type === 'part') {
      for (i = 0; i < allParts.length; i++) {
        if (String(allParts[i].id) === String(id)) return allParts[i];
      }
    } else if (type === 'pose') {
      for (i = 0; i < allPoses.length; i++) {
        if (String(allPoses[i].id) === String(id)) return allPoses[i];
      }
    } else if (type === 'sound') {
      for (i = 0; i < allAudio.length; i++) {
        if (String(allAudio[i].id) === String(id)) return allAudio[i];
      }
    }
    return null;
  }

  function getPlacedKeys() {
    var keys = {};
    var savedItems = (layoutData && layoutData.items) ? layoutData.items : [];
    for (var i = 0; i < savedItems.length; i++) {
      keys[savedItems[i].type + ':' + savedItems[i].id] = true;
    }
    return keys;
  }

  function createItemElement(type, data) {
    var el = document.createElement('div');
    el.className = 'mc-item';
    el.setAttribute('data-item-type', type);

    // Remove button (visible in edit mode via CSS)
    var removeBtn = document.createElement('button');
    removeBtn.className = 'mc-remove-btn';
    removeBtn.innerHTML = '&times;';
    removeBtn.title = 'Remove from layout';
    (function (itemType, itemData) {
      removeBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        removeItemFromCanvas(itemType, String(itemData.id));
      });
    })(type, data);
    el.appendChild(removeBtn);

    if (type === 'part') {
      el.classList.add('mc-part');
      el.setAttribute('data-part-id', String(data.id));
      var pType = String(data.type || '').toLowerCase();
      el.setAttribute('data-part-type', pType);

      var labelDiv = document.createElement('div');
      labelDiv.className = 'mc-item-label text-truncate';
      labelDiv.textContent = data.name || 'Part ' + data.id;
      el.appendChild(labelDiv);

      var metaDiv = document.createElement('div');
      metaDiv.className = 'mc-item-meta';
      var badge = document.createElement('span');
      badge.className = 'badge bg-' + typeBadgeColor(pType);
      badge.style.fontSize = '0.55rem';
      badge.textContent = data.type || 'unknown';
      metaDiv.appendChild(badge);
      el.appendChild(metaDiv);

      // Mini position bar for servos
      if (pType === 'servo' && (!data.config || data.config.servoType !== 'continuous')) {
        var bar = document.createElement('div');
        bar.className = 'mc-position-bar';
        var fill = document.createElement('div');
        fill.className = 'mc-position-fill';
        fill.id = 'mc-pos-' + data.id;
        fill.style.width = '50%';
        bar.appendChild(fill);
        el.appendChild(bar);
      }

      el.addEventListener('click', function (e) {
        if (editMode) return;
        e.stopPropagation();
        selectPart(data);
      });

    } else if (type === 'pose') {
      el.classList.add('mc-pose');
      el.setAttribute('data-pose-id', String(data.id));

      var icon = document.createElement('i');
      icon.className = 'bi bi-play-circle-fill';
      icon.style.color = '#6f42c1';
      el.appendChild(icon);

      var span = document.createElement('span');
      span.className = 'mc-item-label text-truncate ms-1';
      span.textContent = data.name || 'Pose ' + data.id;
      el.appendChild(span);

      el.addEventListener('click', function (e) {
        if (editMode) return;
        e.stopPropagation();
        firePose(data.id, el);
      });

    } else if (type === 'sound') {
      el.classList.add('mc-sound');
      el.setAttribute('data-audio-id', String(data.id));

      var sIcon = document.createElement('i');
      sIcon.className = 'bi bi-volume-up-fill text-info';
      el.appendChild(sIcon);

      var sSpan = document.createElement('span');
      sSpan.className = 'mc-item-label text-truncate ms-1';
      sSpan.textContent = data.title || data.filename || 'Audio';
      el.appendChild(sSpan);

      if (data.duration) {
        var dur = document.createElement('span');
        dur.className = 'badge bg-dark ms-1';
        dur.style.fontSize = '0.5rem';
        dur.textContent = Number(data.duration).toFixed(1) + 's';
        el.appendChild(dur);
      }

      el.addEventListener('click', function (e) {
        if (editMode) return;
        e.stopPropagation();
        playSound(data.id, el);
      });
    }

    return el;
  }

  function typeBadgeColor(pType) {
    if (pType === 'servo') return 'primary';
    if (pType === 'linear_actuator') return 'warning';
    if (pType === 'motor' || pType === 'stepper') return 'success';
    if (pType === 'light' || pType === 'led') return 'warning';
    if (pType === 'motion_sensor') return 'danger';
    return 'secondary';
  }

  // ── Part Selection & Directional Controls ──

  function selectPart(part) {
    // Deselect previous
    var prev = canvas.querySelector('.mc-selected');
    if (prev) prev.classList.remove('mc-selected');

    selectedPartId = String(part.id);
    selectedPartData = part;

    var el = canvas.querySelector('[data-part-id="' + selectedPartId + '"]');
    if (el) el.classList.add('mc-selected');

    showDirectionalControls(part);
  }

  function deselectPart() {
    selectedPartId = null;
    selectedPartData = null;
    var prev = canvas ? canvas.querySelector('.mc-selected') : null;
    if (prev) prev.classList.remove('mc-selected');
    if (directionalEl) directionalEl.classList.add('d-none');
  }

  function showDirectionalControls(part) {
    if (!directionalEl || !controlsBodyEl || !selectedPartNameEl) return;

    selectedPartNameEl.textContent = part.name || 'Part ' + part.id;
    controlsBodyEl.innerHTML = '';
    setStatus('');

    var pType = String(part.type || '').toLowerCase();
    var isContinuous = part.config && part.config.servoType === 'continuous';

    if (pType === 'servo' && !isContinuous) {
      // Standard servo: up/down nudge + min/mid/max goto + position display
      controlsBodyEl.innerHTML =
        '<div class="d-flex flex-column gap-1">' +
          '<div class="d-flex gap-1 justify-content-center">' +
            '<button class="btn btn-sm btn-primary mc-nudge-btn" data-delta="0.1"><i class="bi bi-arrow-up"></i></button>' +
          '</div>' +
          '<div class="d-flex gap-1 justify-content-center">' +
            '<button class="btn btn-sm btn-outline-secondary mc-goto-btn" data-p="0">Min</button>' +
            '<button class="btn btn-sm btn-outline-secondary mc-goto-btn" data-p="0.5">Mid</button>' +
            '<button class="btn btn-sm btn-outline-secondary mc-goto-btn" data-p="1">Max</button>' +
          '</div>' +
          '<div class="d-flex gap-1 justify-content-center">' +
            '<button class="btn btn-sm btn-primary mc-nudge-btn" data-delta="-0.1"><i class="bi bi-arrow-down"></i></button>' +
          '</div>' +
          '<div class="text-center small mt-1">Position: <span id="mcPositionDisplay">--</span></div>' +
        '</div>';

      // Get current position
      fetch('/api/calibration/' + encodeURIComponent(part.id) + '/position')
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (j && j.success && j.currentP != null) {
            var disp = $('mcPositionDisplay');
            if (disp) disp.textContent = Number(j.currentP).toFixed(2);
            updatePositionBar(part.id, j.currentP);
          }
        })
        .catch(function () {});

    } else if (pType === 'servo' && isContinuous) {
      controlsBodyEl.innerHTML =
        '<div class="d-flex gap-1 justify-content-center">' +
          '<button class="btn btn-sm btn-primary mc-cont-btn" data-action="ccw">CCW</button>' +
          '<button class="btn btn-sm btn-danger mc-cont-btn" data-action="stop">Stop</button>' +
          '<button class="btn btn-sm btn-primary mc-cont-btn" data-action="cw">CW</button>' +
        '</div>';

    } else if (pType === 'linear_actuator') {
      controlsBodyEl.innerHTML =
        '<div class="d-flex gap-1 justify-content-center">' +
          '<button class="btn btn-sm btn-primary mc-nudge-btn" data-delta="0.1">Extend</button>' +
          '<button class="btn btn-sm btn-danger mc-stop-btn">Stop</button>' +
          '<button class="btn btn-sm btn-primary mc-nudge-btn" data-delta="-0.1">Retract</button>' +
        '</div>';

    } else if (pType === 'motor' || pType === 'stepper') {
      controlsBodyEl.innerHTML =
        '<div class="d-flex gap-1 justify-content-center">' +
          '<button class="btn btn-sm btn-primary mc-motor-btn" data-action="forward">Fwd</button>' +
          '<button class="btn btn-sm btn-danger mc-motor-btn" data-action="stop">Stop</button>' +
          '<button class="btn btn-sm btn-primary mc-motor-btn" data-action="reverse">Rev</button>' +
        '</div>';

    } else if (pType === 'light' || pType === 'led') {
      controlsBodyEl.innerHTML =
        '<div class="d-flex gap-1 justify-content-center">' +
          '<button class="btn btn-sm btn-warning mc-toggle-btn">Toggle</button>' +
        '</div>';

    } else {
      controlsBodyEl.innerHTML = '<div class="text-muted small">No controls for this type</div>';
    }

    directionalEl.classList.remove('d-none');
    bindDirectionalEvents(part);
  }

  function bindDirectionalEvents(part) {
    var partId = String(part.id);
    var pType = String(part.type || '').toLowerCase();

    // Nudge buttons (servo standard + linear actuator)
    var nudgeBtns = controlsBodyEl.querySelectorAll('.mc-nudge-btn');
    for (var i = 0; i < nudgeBtns.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          var delta = parseFloat(btn.getAttribute('data-delta'));
          nudgePart(partId, delta);
        });
      })(nudgeBtns[i]);
    }

    // Goto buttons (servo standard)
    var gotoBtns = controlsBodyEl.querySelectorAll('.mc-goto-btn');
    for (var g = 0; g < gotoBtns.length; g++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          var p = parseFloat(btn.getAttribute('data-p'));
          gotoPart(partId, p);
        });
      })(gotoBtns[g]);
    }

    // Continuous servo buttons
    var contBtns = controlsBodyEl.querySelectorAll('.mc-cont-btn');
    for (var c = 0; c < contBtns.length; c++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          var action = btn.getAttribute('data-action');
          if (action === 'stop') {
            stopPart(partId);
          } else {
            var delta = action === 'cw' ? 0.1 : -0.1;
            nudgePart(partId, delta, 35, 300);
          }
        });
      })(contBtns[c]);
    }

    // Stop button (linear actuator)
    var stopBtns = controlsBodyEl.querySelectorAll('.mc-stop-btn');
    for (var st = 0; st < stopBtns.length; st++) {
      stopBtns[st].addEventListener('click', function () {
        stopPart(partId);
      });
    }

    // Motor buttons
    var motorBtns = controlsBodyEl.querySelectorAll('.mc-motor-btn');
    for (var m = 0; m < motorBtns.length; m++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          var action = btn.getAttribute('data-action');
          if (action === 'stop') {
            motorStop(partId);
          } else {
            motorRun(partId, action);
          }
        });
      })(motorBtns[m]);
    }

    // Toggle button (light/led)
    var toggleBtns = controlsBodyEl.querySelectorAll('.mc-toggle-btn');
    for (var tb = 0; tb < toggleBtns.length; tb++) {
      toggleBtns[tb].addEventListener('click', function () {
        togglePart(partId);
      });
    }
  }

  // ── Hardware Command APIs (fire-and-forget) ──

  function nudgePart(partId, delta, speedPct, durationMs) {
    setStatus('Moving...');
    var body = { delta: delta };
    if (speedPct != null) body.speedPct = speedPct;
    if (durationMs != null) body.durationMs = durationMs;
    fetch('/api/calibration/' + encodeURIComponent(partId) + '/nudge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j.success) {
        setStatus('Pos: ' + (j.currentP != null ? Number(j.currentP).toFixed(2) : '?'));
        updatePositionBar(partId, j.currentP);
        var disp = $('mcPositionDisplay');
        if (disp && j.currentP != null) disp.textContent = Number(j.currentP).toFixed(2);
      } else {
        setStatus('Failed');
      }
    }).catch(function () { setStatus('Error'); });
  }

  function gotoPart(partId, p) {
    setStatus('Moving...');
    fetch('/api/calibration/' + encodeURIComponent(partId) + '/goto', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ p: p })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j.success) {
        setStatus('Pos: ' + (j.targetP != null ? Number(j.targetP).toFixed(2) : '?'));
        updatePositionBar(partId, j.targetP);
        var disp = $('mcPositionDisplay');
        if (disp && j.targetP != null) disp.textContent = Number(j.targetP).toFixed(2);
      } else {
        setStatus('Failed');
      }
    }).catch(function () { setStatus('Error'); });
  }

  function stopPart(partId) {
    setStatus('Stopping...');
    fetch('/api/calibration/' + encodeURIComponent(partId) + '/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    }).then(function (r) { return r.json(); }).then(function (j) {
      setStatus(j.success ? 'Stopped' : 'Failed');
    }).catch(function () { setStatus('Error'); });
  }

  function motorRun(partId, direction) {
    setStatus('Running ' + direction + '...');
    fetch('/api/parts/' + encodeURIComponent(partId) + '/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'control', params: { direction: direction, speed: 50, duration: 1000 } })
    }).then(function (r) { return r.json(); }).then(function (j) {
      setStatus(j.success ? 'Done' : 'Failed');
    }).catch(function () { setStatus('Error'); });
  }

  function motorStop(partId) {
    setStatus('Stopping...');
    fetch('/api/parts/' + encodeURIComponent(partId) + '/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'stop', params: {} })
    }).then(function (r) { return r.json(); }).then(function (j) {
      setStatus(j.success ? 'Stopped' : 'Failed');
    }).catch(function () { setStatus('Error'); });
  }

  function togglePart(partId) {
    setStatus('Toggling...');
    fetch('/api/parts/' + encodeURIComponent(partId) + '/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'toggle' })
    }).then(function (r) { return r.json(); }).then(function (j) {
      setStatus(j.success ? 'Toggled' : 'Failed');
    }).catch(function () { setStatus('Error'); });
  }

  function firePose(poseId, el) {
    flashItem(el);
    fetch('/poses/' + encodeURIComponent(poseId) + '/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    }).catch(function () {});
  }

  function playSound(audioId, el) {
    flashItem(el);
    fetch('/conversation/api/play-audio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioId: audioId })
    }).catch(function () {});
  }

  function updatePositionBar(partId, p) {
    var fill = $('mc-pos-' + partId);
    if (fill && p != null) {
      fill.style.width = (Number(p) * 100) + '%';
    }
  }

  // ── Edit Mode ──

  function toggleEditMode() {
    editMode = !editMode;
    if (editToggleBtn) {
      editToggleBtn.classList.toggle('active', editMode);
      editToggleBtn.classList.toggle('btn-warning', editMode);
      editToggleBtn.classList.toggle('btn-outline-warning', !editMode);
    }
    if (canvas) {
      canvas.classList.toggle('mc-edit-active', editMode);
    }
    applyEditModeClass(editMode);
    if (editMode) {
      deselectPart();
      showDrawer();
    } else {
      hideDrawer();
    }
  }

  function applyEditModeClass(on) {
    if (!canvas) return;
    var items = canvas.querySelectorAll('.mc-item');
    for (var i = 0; i < items.length; i++) {
      if (on) {
        items[i].classList.add('mc-edit-mode');
      } else {
        items[i].classList.remove('mc-edit-mode');
      }
    }
  }

  function showDrawer() {
    if (!drawerEl || !drawerItemsEl) return;
    drawerEl.classList.remove('d-none');
    renderDrawerItems();
  }

  function renderDrawerItems() {
    if (!drawerItemsEl) return;
    drawerItemsEl.innerHTML = '';
    var placedKeys = getPlacedKeys();
    var hasUnplaced = false;

    // Section helper
    function addSection(label, items, type, idField) {
      var unplaced = [];
      for (var i = 0; i < items.length; i++) {
        var key = type + ':' + items[i][idField || 'id'];
        if (!placedKeys[key]) unplaced.push(items[i]);
      }
      if (unplaced.length === 0) return;
      hasUnplaced = true;

      var heading = document.createElement('div');
      heading.className = 'text-muted small fw-bold mt-1 mb-1';
      heading.textContent = label + ' (' + unplaced.length + ')';
      drawerItemsEl.appendChild(heading);

      for (var j = 0; j < unplaced.length; j++) {
        (function (item) {
          var chip = document.createElement('span');
          chip.className = 'mc-drawer-item';
          if (type === 'part') {
            chip.textContent = (item.name || 'Part ' + item.id) + ' [' + (item.type || '') + ']';
          } else if (type === 'pose') {
            chip.textContent = item.name || 'Pose ' + item.id;
          } else {
            chip.textContent = item.title || item.filename || 'Audio';
          }
          chip.addEventListener('click', function () {
            addItemToCanvas(type, item);
          });
          drawerItemsEl.appendChild(chip);
        })(unplaced[j]);
      }
    }

    addSection('Parts', allParts, 'part', 'id');
    addSection('Poses', allPoses, 'pose', 'id');
    addSection('Audio', allAudio, 'sound', 'id');

    if (!hasUnplaced) {
      drawerItemsEl.innerHTML = '<span class="text-muted small">All available items are on the canvas.</span>';
    }
  }

  function addItemToCanvas(type, data) {
    // Add to layout data
    if (!layoutData) layoutData = { canvasHeight: 350, items: [] };
    if (!layoutData.items) layoutData.items = [];

    // Default position: center of visible canvas area
    var cx = Math.round((canvas ? canvas.clientWidth : 600) / 2 - 60);
    var cy = Math.round((canvas ? canvas.clientHeight : 350) / 2 - 20);
    // Offset slightly for each item to avoid perfect overlap
    var offset = layoutData.items.length * 8;
    cx = Math.min(cx + offset, (canvas ? canvas.clientWidth : 600) - 140);
    cy = Math.min(cy + offset, (canvas ? canvas.clientHeight : 350) - 40);

    layoutData.items.push({
      type: type,
      id: String(data.id),
      x: cx,
      y: cy
    });

    // Re-render canvas and drawer
    renderCanvas();
    debounceSaveLayout();
  }

  function removeItemFromCanvas(type, id) {
    if (!layoutData || !layoutData.items) return;
    layoutData.items = layoutData.items.filter(function (item) {
      return !(item.type === type && String(item.id) === String(id));
    });
    renderCanvas();
    debounceSaveLayout();
  }

  function hideDrawer() {
    if (drawerEl) drawerEl.classList.add('d-none');
  }

  // ── Pointer-Event Drag (edit mode only) ──

  function enableDrag() {
    if (!canvas) return;
    canvas.addEventListener('pointerdown', onPointerDown);
  }

  function onPointerDown(e) {
    var item = e.target.closest('.mc-item');
    if (!item || !editMode) return;
    e.preventDefault();
    item.setPointerCapture(e.pointerId);

    var rect = canvas.getBoundingClientRect();
    var offsetX = e.clientX - item.offsetLeft - rect.left;
    var offsetY = e.clientY - item.offsetTop - rect.top;

    function onMove(e2) {
      var newX = e2.clientX - rect.left - offsetX;
      var newY = e2.clientY - rect.top - offsetY;
      // Clamp to canvas bounds
      newX = Math.max(0, Math.min(canvas.clientWidth - item.offsetWidth, newX));
      newY = Math.max(0, Math.min(canvas.clientHeight - item.offsetHeight, newY));
      item.style.left = newX + 'px';
      item.style.top = newY + 'px';
    }

    function onUp() {
      item.removeEventListener('pointermove', onMove);
      item.removeEventListener('pointerup', onUp);
      debounceSaveLayout();
    }

    item.addEventListener('pointermove', onMove);
    item.addEventListener('pointerup', onUp);
  }

  // ── Layout Save ──

  function debounceSaveLayout() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveLayout, 500);
  }

  function saveLayout() {
    if (!canvas) return;
    var items = [];
    var els = canvas.querySelectorAll('.mc-item');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var type = el.getAttribute('data-item-type');
      var id = el.getAttribute('data-part-id') || el.getAttribute('data-pose-id') || el.getAttribute('data-audio-id');
      items.push({
        type: type,
        id: id,
        x: parseInt(el.style.left, 10) || 0,
        y: parseInt(el.style.top, 10) || 0
      });
    }
    fetch('/conversation/api/manual-controls-layout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        layoutName: currentLayoutName,
        items: items,
        canvasHeight: canvas.clientHeight
      })
    }).catch(function () {});
  }

  // ── Canvas Click Background → Deselect ──

  function onCanvasClick(e) {
    if (e.target === canvas && !editMode) {
      deselectPart();
    }
  }

  // ── Public API ──

  function init(opts) {
    opts = opts || {};
    characterId = opts.characterId || null;

    canvas = $(opts.canvasId || 'mcCanvas');
    directionalEl = $('mcDirectionalControls');
    controlsBodyEl = $('mcControlsBody');
    selectedPartNameEl = $('mcSelectedPartName');
    controlStatusEl = $('mcControlStatus');
    itemCountEl = $('mcItemCount');
    editToggleBtn = $('mcEditToggle');
    drawerEl = $('mcDrawer');
    drawerItemsEl = $('mcDrawerItems');
    layoutSelectEl = $('mcLayoutSelect');
    layoutNewBtn = $('mcLayoutNewBtn');
    layoutRenameBtn = $('mcLayoutRenameBtn');
    layoutDeleteBtn = $('mcLayoutDeleteBtn');

    var deselectBtn = $('mcDeselectBtn');
    if (deselectBtn) deselectBtn.addEventListener('click', deselectPart);
    if (editToggleBtn) editToggleBtn.addEventListener('click', toggleEditMode);
    if (canvas) canvas.addEventListener('click', onCanvasClick);
    if (layoutSelectEl) layoutSelectEl.addEventListener('change', onLayoutSelect);
    if (layoutNewBtn) layoutNewBtn.addEventListener('click', onLayoutNew);
    if (layoutRenameBtn) layoutRenameBtn.addEventListener('click', onLayoutRename);
    if (layoutDeleteBtn) layoutDeleteBtn.addEventListener('click', onLayoutDelete);

    enableDrag();

    if (!characterId) return Promise.resolve();

    return fetchData(characterId).then(function (results) {
      processData(results);
      renderCanvas();
    });
  }

  function reload(charId) {
    characterId = charId || characterId;
    editMode = false;
    if (editToggleBtn) {
      editToggleBtn.classList.remove('active', 'btn-warning');
      editToggleBtn.classList.add('btn-outline-warning');
    }
    if (canvas) canvas.classList.remove('mc-edit-active');
    hideDrawer();
    currentLayoutName = 'Default';

    if (!characterId) {
      if (canvas) canvas.innerHTML = '';
      return Promise.resolve();
    }

    return fetchData(characterId).then(function (results) {
      processData(results);
      renderCanvas();
    });
  }

  function destroy() {
    if (canvas) {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('click', onCanvasClick);
      canvas.innerHTML = '';
    }
    clearTimeout(saveTimer);
    allParts = [];
    allPoses = [];
    allAudio = [];
    layoutData = null;
    selectedPartId = null;
    selectedPartData = null;
  }

  window.ManualControls = { init: init, reload: reload, destroy: destroy };
})();
