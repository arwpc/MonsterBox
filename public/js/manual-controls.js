/**
 * Manual Controls — Interactive SVG body map for live animatronic control.
 *
 * Renders a humanoid silhouette with clickable body regions.
 * Parts are auto-mapped to regions by name analysis.
 * Clicking a region shows the parts and their hardware controls.
 *
 * Exposed as window.ManualControls = { init, reload, destroy }
 * ES5 IIFE — no arrow functions, no template literals, no const/let.
 */
(function () {
  'use strict';

  // ── DOM refs ──
  var svgEl = null;         // #mcBodyMap (SVG element)
  var periphEl = null;      // #mcPeripherals
  var controlPanel = null;  // #mcControlPanel
  var quickActions = null;  // #mcQuickActions
  var tooltipEl = null;     // floating tooltip
  var itemCountEl = null;   // badge

  var characterId = null;
  var allParts = [];
  var allPoses = [];
  var allAudio = [];
  var regionMap = {};       // { regionName: [part, ...] }
  var periphParts = [];     // parts that go in the peripheral bar
  var selectedRegion = null;
  var selectedPartId = null;
  var selectedPartData = null;

  // ── Body regions definition (viewBox 0 0 200 340) ──
  var REGIONS = {
    head:       { label: 'Head',       cx: 100, cy: 52,  path: 'M100,18 C120,18 134,30 134,52 C134,72 128,82 120,88 L80,88 C72,82 66,72 66,52 C66,30 80,18 100,18 Z' },
    neck:       { label: 'Neck',       cx: 100, cy: 96,  path: 'M88,88 L112,88 L110,106 L90,106 Z' },
    torso:      { label: 'Torso',      cx: 100, cy: 155, path: 'M75,106 L125,106 L132,210 L68,210 Z' },
    waist:      { label: 'Waist',      cx: 100, cy: 220, path: 'M68,210 L132,210 L136,232 L64,232 Z' },
    leftArm:    { label: 'Left Arm',   cx: 52,  cy: 148, path: 'M75,108 L65,112 L42,160 L36,195 L50,198 L54,168 L62,130 L75,118 Z' },
    rightArm:   { label: 'Right Arm',  cx: 148, cy: 148, path: 'M125,108 L135,112 L158,160 L164,195 L150,198 L146,168 L138,130 L125,118 Z' },
    leftHand:   { label: 'Left Hand',  cx: 36,  cy: 212, path: 'M36,195 L28,220 L32,228 L50,228 L54,220 L50,198 Z' },
    rightHand:  { label: 'Right Hand', cx: 164, cy: 212, path: 'M164,195 L172,220 L168,228 L150,228 L146,220 L150,198 Z' },
    leftLeg:    { label: 'Left Leg',   cx: 82,  cy: 280, path: 'M72,232 L98,232 L94,310 L88,340 L68,340 L64,310 Z' },
    rightLeg:   { label: 'Right Leg',  cx: 118, cy: 280, path: 'M102,232 L128,232 L136,310 L132,340 L112,340 L106,310 Z' }
  };

  // Types that go in the peripheral bar instead of the body
  var PERIPH_TYPES = ['speaker', 'microphone', 'webcam'];

  // ── Helpers ──

  function $(id) { return document.getElementById(id); }

  function flashBtn(el) {
    if (!el) return;
    el.classList.remove('bm-fired');
    void el.offsetWidth;
    el.classList.add('bm-fired');
    setTimeout(function () { el.classList.remove('bm-fired'); }, 400);
  }

  function typeBadge(pType) {
    if (pType === 'servo') return 'primary';
    if (pType === 'linear_actuator') return 'warning';
    if (pType === 'motor' || pType === 'stepper') return 'success';
    if (pType === 'light' || pType === 'led') return 'info';
    if (pType === 'motion_sensor') return 'danger';
    return 'secondary';
  }

  function typeIcon(pType) {
    if (pType === 'servo') return 'bi-gear-fill';
    if (pType === 'linear_actuator') return 'bi-arrows-expand';
    if (pType === 'motor' || pType === 'stepper') return 'bi-fan';
    if (pType === 'light' || pType === 'led') return 'bi-lightbulb-fill';
    if (pType === 'motion_sensor') return 'bi-broadcast';
    if (pType === 'speaker') return 'bi-volume-up-fill';
    if (pType === 'microphone') return 'bi-mic-fill';
    if (pType === 'webcam') return 'bi-camera-video-fill';
    return 'bi-circle';
  }

  function periphIcon(pType) {
    if (pType === 'speaker') return 'bi-volume-up-fill';
    if (pType === 'microphone') return 'bi-mic-fill';
    if (pType === 'webcam') return 'bi-camera-video-fill';
    return 'bi-circle';
  }

  // ── Smart region mapping ──

  function guessRegion(part) {
    var name = (part.name || '').toLowerCase();
    var pType = (part.type || '').toLowerCase();

    // Non-body peripherals
    if (PERIPH_TYPES.indexOf(pType) !== -1) return '__periph__';

    // Head-related
    if (name.indexOf('jaw') >= 0) return 'head';
    if (name.indexOf('eye') >= 0 && pType !== 'webcam') return 'head';
    if (name.indexOf('head') >= 0) return 'head';
    if (name.indexOf('neck') >= 0) return 'neck';

    // Arms — check left/right
    if (name.indexOf('elbow') >= 0) return 'leftArm';
    if (name.indexOf('forearm') >= 0) return 'leftArm';
    if (name.indexOf('left arm') >= 0 || name.indexOf('left_arm') >= 0) return 'leftArm';
    if (name.indexOf('right arm') >= 0 || name.indexOf('right_arm') >= 0) return 'rightArm';
    if (name.indexOf('arm') >= 0) {
      if (name.indexOf('left') >= 0) return 'leftArm';
      if (name.indexOf('right') >= 0) return 'rightArm';
      return 'rightArm';
    }

    // Hands
    if (name.indexOf('hand') >= 0) {
      if (name.indexOf('left') >= 0) return 'leftHand';
      return 'rightHand';
    }

    // Torso/body
    if (name.indexOf('waist') >= 0 || name.indexOf('bow') >= 0 || name.indexOf('hip') >= 0) return 'waist';
    if (name.indexOf('torso') >= 0 || name.indexOf('body') >= 0 || name.indexOf('chest') >= 0) return 'torso';

    // Legs
    if (name.indexOf('leg') >= 0 || name.indexOf('knee') >= 0) {
      if (name.indexOf('left') >= 0) return 'leftLeg';
      return 'rightLeg';
    }

    // Doors/external actuators
    if (name.indexOf('door') >= 0 || name.indexOf('coffin') >= 0) return 'torso';

    // Lights
    if (pType === 'light' || pType === 'led') {
      if (name.indexOf('rose') >= 0 || name.indexOf('candle') >= 0) return 'torso';
      if (name.indexOf('laser') >= 0) return 'head';
      return 'rightHand';
    }

    // Motion sensor
    if (pType === 'motion_sensor') return 'torso';

    // Motors
    if (pType === 'motor' || pType === 'stepper') return 'torso';

    return 'torso';
  }

  // ── Data Loading ──

  function fetchData(charId) {
    return Promise.allSettled([
      fetch('/api/parts?characterId=' + encodeURIComponent(charId)).then(function (r) { return r.json(); }),
      fetch('/poses/api/poses').then(function (r) { return r.json(); }),
      fetch('/audio-library/api/library').then(function (r) { return r.json(); })
    ]);
  }

  function processData(results) {
    var partsResult = results[0];
    var posesResult = results[1];
    var audioResult = results[2];

    allParts = [];
    if (partsResult.status === 'fulfilled' && partsResult.value) {
      var raw = Array.isArray(partsResult.value) ? partsResult.value
              : (partsResult.value.parts || []);
      allParts = raw;
    }

    allPoses = [];
    if (posesResult.status === 'fulfilled' && posesResult.value && posesResult.value.success) {
      allPoses = posesResult.value.poses || [];
    }

    allAudio = [];
    if (audioResult.status === 'fulfilled' && audioResult.value && audioResult.value.success) {
      allAudio = (audioResult.value.files || []).slice(0, 20);
    }

    // Map parts to regions
    regionMap = {};
    periphParts = [];
    for (var i = 0; i < allParts.length; i++) {
      var part = allParts[i];
      var region = guessRegion(part);
      if (region === '__periph__') {
        periphParts.push(part);
      } else {
        if (!regionMap[region]) regionMap[region] = [];
        regionMap[region].push(part);
      }
    }
  }

  // ── SVG Rendering ──

  function svgNS(tag) {
    return document.createElementNS('http://www.w3.org/2000/svg', tag);
  }

  function buildSVG() {
    if (!svgEl) return;
    svgEl.innerHTML = '';
    svgEl.setAttribute('viewBox', '0 0 200 340');

    var regionNames = Object.keys(REGIONS);
    for (var r = 0; r < regionNames.length; r++) {
      var rName = regionNames[r];
      var rDef = REGIONS[rName];
      var parts = regionMap[rName] || [];
      var hasParts = parts.length > 0;

      var g = svgNS('g');
      g.setAttribute('class', 'bm-region' + (hasParts ? ' bm-has-parts' : ''));
      g.setAttribute('data-region', rName);

      // Body fill path
      var pathEl = svgNS('path');
      pathEl.setAttribute('d', rDef.path);
      pathEl.setAttribute('class', 'bm-fill');
      g.appendChild(pathEl);

      // Region label
      var label = svgNS('text');
      label.setAttribute('x', rDef.cx);
      label.setAttribute('y', rDef.cy - (hasParts ? 8 : 0));
      label.setAttribute('class', 'bm-label');
      label.textContent = rDef.label;
      g.appendChild(label);

      // Part indicators
      if (hasParts) {
        renderIndicators(g, rDef, parts);

        // Part count badge
        var badgeY = rDef.cy + 6;
        var bgRect = svgNS('rect');
        bgRect.setAttribute('x', rDef.cx - 7);
        bgRect.setAttribute('y', badgeY - 5);
        bgRect.setAttribute('width', '14');
        bgRect.setAttribute('height', '10');
        bgRect.setAttribute('class', 'bm-count-bg');
        bgRect.setAttribute('rx', '5');
        g.appendChild(bgRect);

        var countText = svgNS('text');
        countText.setAttribute('x', rDef.cx);
        countText.setAttribute('y', badgeY);
        countText.setAttribute('class', 'bm-count-text');
        countText.textContent = parts.length;
        g.appendChild(countText);
      }

      svgEl.appendChild(g);
    }
  }

  function renderIndicators(g, rDef, parts) {
    var count = Math.min(parts.length, 5);
    var spacing = 10;
    var startX = rDef.cx - ((count - 1) * spacing) / 2;

    for (var i = 0; i < count; i++) {
      var part = parts[i];
      var pType = (part.type || '').toLowerCase();
      var ix = startX + i * spacing;
      var iy = rDef.cy + 16;

      if (pType === 'servo') {
        var c = svgNS('circle');
        c.setAttribute('cx', ix);
        c.setAttribute('cy', iy);
        c.setAttribute('r', '3');
        c.setAttribute('class', 'bm-indicator bm-ind-servo');
        g.appendChild(c);
      } else if (pType === 'linear_actuator') {
        var rect = svgNS('rect');
        rect.setAttribute('x', ix - 2.5);
        rect.setAttribute('y', iy - 2.5);
        rect.setAttribute('width', '5');
        rect.setAttribute('height', '5');
        rect.setAttribute('transform', 'rotate(45 ' + ix + ' ' + iy + ')');
        rect.setAttribute('class', 'bm-indicator bm-ind-actuator');
        g.appendChild(rect);
      } else if (pType === 'motor' || pType === 'stepper') {
        var mc = svgNS('circle');
        mc.setAttribute('cx', ix);
        mc.setAttribute('cy', iy);
        mc.setAttribute('r', '3');
        mc.setAttribute('class', 'bm-indicator bm-ind-motor');
        g.appendChild(mc);
      } else if (pType === 'light' || pType === 'led') {
        var lc = svgNS('circle');
        lc.setAttribute('cx', ix);
        lc.setAttribute('cy', iy);
        lc.setAttribute('r', '3');
        lc.setAttribute('class', 'bm-indicator bm-ind-light');
        g.appendChild(lc);
      } else if (pType === 'motion_sensor') {
        var sc = svgNS('circle');
        sc.setAttribute('cx', ix);
        sc.setAttribute('cy', iy);
        sc.setAttribute('r', '3');
        sc.setAttribute('class', 'bm-indicator');
        sc.setAttribute('fill', 'var(--bs-danger, #dc3545)');
        sc.setAttribute('stroke', 'rgba(255,255,255,0.5)');
        sc.setAttribute('stroke-width', '0.8');
        g.appendChild(sc);
      }
    }
  }

  // ── Peripheral Bar ──

  function renderPeripherals() {
    if (!periphEl) return;
    periphEl.innerHTML = '';

    for (var i = 0; i < periphParts.length; i++) {
      (function (part) {
        var pType = (part.type || '').toLowerCase();
        var btn = document.createElement('button');
        btn.className = 'bm-periph bm-periph-' + pType;
        btn.setAttribute('data-part-id', String(part.id));
        btn.innerHTML = '<i class="bi ' + periphIcon(pType) + '"></i>' +
          '<span>' + (part.name || 'Part ' + part.id) + '</span>';
        btn.addEventListener('click', function () {
          selectPeripheral(part, btn);
        });
        periphEl.appendChild(btn);
      })(periphParts[i]);
    }

    // Also show motion sensors as peripheral badges
    for (var r in regionMap) {
      if (regionMap.hasOwnProperty(r)) {
        var rParts = regionMap[r];
        for (var j = 0; j < rParts.length; j++) {
          if ((rParts[j].type || '').toLowerCase() === 'motion_sensor') {
            (function (part) {
              var btn = document.createElement('button');
              btn.className = 'bm-periph bm-periph-sensor';
              btn.setAttribute('data-part-id', String(part.id));
              btn.innerHTML = '<i class="bi bi-broadcast"></i>' +
                '<span>' + (part.name || 'Sensor') + '</span>';
              btn.addEventListener('click', function () {
                selectPeripheral(part, btn);
              });
              periphEl.appendChild(btn);
            })(rParts[j]);
          }
        }
      }
    }
  }

  // ── Region Selection ──

  function onSVGClick(e) {
    var target = e.target;
    var g = findRegion(target);

    if (!g) {
      deselectAll();
      return;
    }

    if (!g.classList.contains('bm-has-parts')) return;

    var region = g.getAttribute('data-region');

    if (selectedRegion === region) {
      deselectAll();
      return;
    }

    deselectAll();
    selectedRegion = region;
    g.classList.add('bm-active');
    showRegionParts(region);
  }

  function selectPeripheral(part, btnEl) {
    deselectAll();

    var allBtns = periphEl.querySelectorAll('.bm-periph');
    for (var i = 0; i < allBtns.length; i++) {
      allBtns[i].classList.remove('bm-periph-active');
    }
    if (btnEl) btnEl.classList.add('bm-periph-active');

    selectedPartId = String(part.id);
    selectedPartData = part;
    showPartControls(part);
  }

  function deselectAll() {
    selectedRegion = null;
    selectedPartId = null;
    selectedPartData = null;

    if (svgEl) {
      var active = svgEl.querySelectorAll('.bm-active');
      for (var i = 0; i < active.length; i++) active[i].classList.remove('bm-active');
    }

    if (periphEl) {
      var pBtns = periphEl.querySelectorAll('.bm-periph-active');
      for (var j = 0; j < pBtns.length; j++) pBtns[j].classList.remove('bm-periph-active');
    }

    showEmptyState();
  }

  // ── Control Panel ──

  function showEmptyState() {
    if (!controlPanel) return;
    controlPanel.innerHTML = '<div class="bm-empty-hint">' +
      '<i class="bi bi-hand-index"></i>' +
      'Click a body region or device to control it</div>';
  }

  function showRegionParts(region) {
    if (!controlPanel) return;
    var parts = regionMap[region] || [];
    var rDef = REGIONS[region];

    var html = '<div class="mc-ctrl-title"><i class="bi bi-cursor-fill me-1" style="color:#fd7e14;"></i>' +
      (rDef ? rDef.label : region) + '</div>';

    html += '<ul class="bm-part-list">';
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      var pType = (p.type || '').toLowerCase();
      html += '<li class="bm-part-item" data-part-id="' + p.id + '">' +
        '<span class="bm-part-icon"><i class="bi ' + typeIcon(pType) + '" style="color:var(--bs-' + typeBadge(pType) + ');"></i></span>' +
        '<span class="bm-part-name">' + (p.name || 'Part ' + p.id) + '</span>' +
        '<span class="badge bg-' + typeBadge(pType) + ' bm-part-badge">' + (p.type || '?') + '</span>' +
        '</li>';
    }
    html += '</ul>';

    controlPanel.innerHTML = html;

    var items = controlPanel.querySelectorAll('.bm-part-item');
    for (var j = 0; j < items.length; j++) {
      (function (item) {
        item.addEventListener('click', function () {
          var partId = item.getAttribute('data-part-id');
          var part = findPartById(partId);
          if (part) selectPartInRegion(part, item);
        });
      })(items[j]);
    }

    // Auto-select if only one part
    if (parts.length === 1) {
      var firstItem = controlPanel.querySelector('.bm-part-item');
      if (firstItem) selectPartInRegion(parts[0], firstItem);
    }
  }

  function selectPartInRegion(part, itemEl) {
    var allItems = controlPanel.querySelectorAll('.bm-part-item');
    for (var i = 0; i < allItems.length; i++) allItems[i].classList.remove('bm-part-selected');
    if (itemEl) itemEl.classList.add('bm-part-selected');

    selectedPartId = String(part.id);
    selectedPartData = part;
    showPartControls(part);
  }

  function showPartControls(part) {
    if (!controlPanel) return;
    var pType = (part.type || '').toLowerCase();
    var isContinuous = part.config && part.config.servoType === 'continuous';

    var html = '<div class="mc-ctrl-title">' +
      '<i class="bi ' + typeIcon(pType) + ' me-1" style="color:var(--bs-' + typeBadge(pType) + ');"></i>' +
      (part.name || 'Part ' + part.id) +
      '<span class="mc-ctrl-type ms-2">' + (part.type || '') + '</span></div>';

    html += '<div class="bm-hw-controls">';

    if (pType === 'servo' && !isContinuous) {
      html += '<div class="mb-2">' +
        '<input type="range" class="bm-position-slider" id="bmSlider" min="0" max="100" value="50">' +
        '<div class="bm-pos-display">Position: <span id="bmPosText">--</span></div>' +
        '</div>' +
        '<div class="d-flex gap-1 justify-content-center flex-wrap">' +
          '<button class="btn btn-sm btn-outline-primary bm-goto-btn" data-p="0">Min</button>' +
          '<button class="btn btn-sm btn-outline-primary bm-goto-btn" data-p="0.25">25%</button>' +
          '<button class="btn btn-sm btn-outline-secondary bm-goto-btn" data-p="0.5">Mid</button>' +
          '<button class="btn btn-sm btn-outline-primary bm-goto-btn" data-p="0.75">75%</button>' +
          '<button class="btn btn-sm btn-outline-primary bm-goto-btn" data-p="1">Max</button>' +
        '</div>' +
        '<div class="d-flex gap-1 justify-content-center mt-1">' +
          '<button class="btn btn-sm btn-primary bm-nudge-btn" data-delta="-0.1"><i class="bi bi-dash-lg"></i></button>' +
          '<button class="btn btn-sm btn-primary bm-nudge-btn" data-delta="0.1"><i class="bi bi-plus-lg"></i></button>' +
        '</div>';
      fetchPosition(part.id);

    } else if (pType === 'servo' && isContinuous) {
      html += '<div class="d-flex gap-1 justify-content-center">' +
        '<button class="btn btn-sm btn-primary bm-cont-btn" data-action="ccw"><i class="bi bi-arrow-counterclockwise"></i> CCW</button>' +
        '<button class="btn btn-sm btn-danger bm-cont-btn" data-action="stop"><i class="bi bi-stop-fill"></i></button>' +
        '<button class="btn btn-sm btn-primary bm-cont-btn" data-action="cw">CW <i class="bi bi-arrow-clockwise"></i></button>' +
      '</div>';

    } else if (pType === 'linear_actuator') {
      html += '<div class="mb-2">' +
        '<input type="range" class="bm-position-slider" id="bmSlider" min="0" max="100" value="50">' +
        '<div class="bm-pos-display">Position: <span id="bmPosText">--</span></div>' +
        '</div>' +
        '<div class="d-flex gap-1 justify-content-center flex-wrap">' +
          '<button class="btn btn-sm btn-outline-warning bm-goto-btn" data-p="0">Retract</button>' +
          '<button class="btn btn-sm btn-outline-secondary bm-goto-btn" data-p="0.5">Mid</button>' +
          '<button class="btn btn-sm btn-outline-warning bm-goto-btn" data-p="1">Extend</button>' +
        '</div>' +
        '<div class="d-flex gap-1 justify-content-center mt-1">' +
          '<button class="btn btn-sm btn-warning bm-nudge-btn" data-delta="-0.1"><i class="bi bi-dash-lg"></i></button>' +
          '<button class="btn btn-sm btn-danger bm-stop-btn"><i class="bi bi-stop-fill"></i> Stop</button>' +
          '<button class="btn btn-sm btn-warning bm-nudge-btn" data-delta="0.1"><i class="bi bi-plus-lg"></i></button>' +
        '</div>';
      fetchPosition(part.id);

    } else if (pType === 'motor' || pType === 'stepper') {
      html += '<div class="d-flex gap-1 justify-content-center flex-wrap">' +
        '<button class="btn btn-sm btn-success bm-motor-btn" data-dir="forward"><i class="bi bi-play-fill"></i> Forward</button>' +
        '<button class="btn btn-sm btn-danger bm-stop-btn"><i class="bi bi-stop-fill"></i> Stop</button>' +
        '<button class="btn btn-sm btn-success bm-motor-btn" data-dir="reverse"><i class="bi bi-play-fill"></i> Reverse</button>' +
      '</div>';

    } else if (pType === 'light' || pType === 'led') {
      html += '<div class="d-flex gap-1 justify-content-center">' +
        '<button class="btn btn-sm btn-warning bm-toggle-btn"><i class="bi bi-lightbulb-fill"></i> Toggle</button>' +
      '</div>';

    } else if (pType === 'motion_sensor') {
      html += '<div class="text-center small text-muted"><i class="bi bi-broadcast me-1"></i>Passive infrared sensor</div>' +
        '<div class="d-flex gap-1 justify-content-center mt-1">' +
          '<button class="btn btn-sm btn-outline-info bm-test-btn"><i class="bi bi-lightning"></i> Test Read</button>' +
        '</div>';

    } else if (pType === 'speaker') {
      html += '<div class="text-center small text-muted"><i class="bi bi-volume-up me-1"></i>Audio output device</div>';

    } else if (pType === 'microphone') {
      html += '<div class="text-center small text-muted"><i class="bi bi-mic me-1"></i>Audio input device</div>';

    } else if (pType === 'webcam') {
      html += '<div class="text-center small text-muted"><i class="bi bi-camera-video me-1"></i>Video input device</div>';

    } else {
      html += '<div class="text-center small text-muted">No controls for this type</div>';
    }

    html += '<div class="text-center mt-1"><small class="text-muted" id="bmStatus"></small></div>';
    html += '</div>';

    controlPanel.innerHTML = html;
    bindControlEvents(part);
  }

  function findPartById(partId) {
    for (var i = 0; i < allParts.length; i++) {
      if (String(allParts[i].id) === String(partId)) return allParts[i];
    }
    return null;
  }

  // ── Event Binding ──

  function bindControlEvents(part) {
    var partId = String(part.id);

    // Slider
    var slider = $('bmSlider');
    if (slider) {
      slider.addEventListener('input', function () {
        var p = parseFloat(slider.value) / 100;
        var disp = $('bmPosText');
        if (disp) disp.textContent = p.toFixed(2);
      });
      slider.addEventListener('change', function () {
        var p = parseFloat(slider.value) / 100;
        gotoPart(partId, p);
      });
    }

    // Goto buttons
    var gotoBtns = controlPanel.querySelectorAll('.bm-goto-btn');
    for (var g = 0; g < gotoBtns.length; g++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          gotoPart(partId, parseFloat(btn.getAttribute('data-p')));
        });
      })(gotoBtns[g]);
    }

    // Nudge buttons
    var nudgeBtns = controlPanel.querySelectorAll('.bm-nudge-btn');
    for (var n = 0; n < nudgeBtns.length; n++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          nudgePart(partId, parseFloat(btn.getAttribute('data-delta')));
        });
      })(nudgeBtns[n]);
    }

    // Continuous servo
    var contBtns = controlPanel.querySelectorAll('.bm-cont-btn');
    for (var c = 0; c < contBtns.length; c++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          var action = btn.getAttribute('data-action');
          if (action === 'stop') { stopPart(partId); }
          else { nudgePart(partId, action === 'cw' ? 0.1 : -0.1, 35, 300); }
        });
      })(contBtns[c]);
    }

    // Stop
    var stopBtns = controlPanel.querySelectorAll('.bm-stop-btn');
    for (var s = 0; s < stopBtns.length; s++) {
      stopBtns[s].addEventListener('click', function () { stopPart(partId); });
    }

    // Toggle (lights)
    var toggleBtns = controlPanel.querySelectorAll('.bm-toggle-btn');
    for (var t = 0; t < toggleBtns.length; t++) {
      toggleBtns[t].addEventListener('click', function () { togglePart(partId); });
    }

    // Motor
    var motorBtns = controlPanel.querySelectorAll('.bm-motor-btn');
    for (var m = 0; m < motorBtns.length; m++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          motorRun(partId, btn.getAttribute('data-dir'));
        });
      })(motorBtns[m]);
    }

    // Test (sensor)
    var testBtns = controlPanel.querySelectorAll('.bm-test-btn');
    for (var tb = 0; tb < testBtns.length; tb++) {
      testBtns[tb].addEventListener('click', function () { testSensor(partId); });
    }
  }

  // ── Hardware Command APIs ──

  function setCtrlStatus(text) {
    var el = $('bmStatus');
    if (el) el.textContent = text || '';
  }

  function fetchPosition(partId) {
    fetch('/api/calibration/' + encodeURIComponent(partId) + '/position')
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j.success && j.currentP != null) {
          var slider = $('bmSlider');
          var disp = $('bmPosText');
          if (slider) slider.value = Math.round(j.currentP * 100);
          if (disp) disp.textContent = Number(j.currentP).toFixed(2);
        }
      })
      .catch(function () {});
  }

  function nudgePart(partId, delta, speedPct, durationMs) {
    setCtrlStatus('Moving...');
    var body = { delta: delta };
    if (speedPct != null) body.speedPct = speedPct;
    if (durationMs != null) body.durationMs = durationMs;
    fetch('/api/calibration/' + encodeURIComponent(partId) + '/nudge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j.success) {
        setCtrlStatus('Position: ' + (j.currentP != null ? Number(j.currentP).toFixed(2) : '?'));
        var slider = $('bmSlider');
        var disp = $('bmPosText');
        if (slider && j.currentP != null) slider.value = Math.round(j.currentP * 100);
        if (disp && j.currentP != null) disp.textContent = Number(j.currentP).toFixed(2);
      } else {
        setCtrlStatus('Failed');
      }
    }).catch(function () { setCtrlStatus('Error'); });
  }

  function gotoPart(partId, p) {
    setCtrlStatus('Moving...');
    fetch('/api/calibration/' + encodeURIComponent(partId) + '/goto', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ p: p })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j.success) {
        var pos = j.targetP != null ? j.targetP : p;
        setCtrlStatus('Position: ' + Number(pos).toFixed(2));
        var slider = $('bmSlider');
        var disp = $('bmPosText');
        if (slider) slider.value = Math.round(pos * 100);
        if (disp) disp.textContent = Number(pos).toFixed(2);
      } else {
        setCtrlStatus('Failed');
      }
    }).catch(function () { setCtrlStatus('Error'); });
  }

  function stopPart(partId) {
    setCtrlStatus('Stopping...');
    fetch('/api/calibration/' + encodeURIComponent(partId) + '/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    }).then(function (r) { return r.json(); }).then(function (j) {
      setCtrlStatus(j.success ? 'Stopped' : 'Failed');
    }).catch(function () { setCtrlStatus('Error'); });
  }

  function motorRun(partId, direction) {
    setCtrlStatus('Running ' + direction + '...');
    fetch('/api/parts/' + encodeURIComponent(partId) + '/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'control', params: { direction: direction, speed: 50, duration: 1000 } })
    }).then(function (r) { return r.json(); }).then(function (j) {
      setCtrlStatus(j.success ? 'Done' : 'Failed');
    }).catch(function () { setCtrlStatus('Error'); });
  }

  function togglePart(partId) {
    setCtrlStatus('Toggling...');
    fetch('/api/parts/' + encodeURIComponent(partId) + '/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'toggle' })
    }).then(function (r) { return r.json(); }).then(function (j) {
      setCtrlStatus(j.success ? 'Toggled' : 'Failed');
    }).catch(function () { setCtrlStatus('Error'); });
  }

  function testSensor(partId) {
    setCtrlStatus('Reading...');
    fetch('/api/parts/' + encodeURIComponent(partId) + '/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'read' })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j.success) {
        setCtrlStatus('Sensor: ' + (j.value != null ? j.value : 'OK'));
      } else {
        setCtrlStatus('Read failed');
      }
    }).catch(function () { setCtrlStatus('Error'); });
  }

  function firePose(poseId, el) {
    flashBtn(el);
    fetch('/poses/' + encodeURIComponent(poseId) + '/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ async: true })
    }).catch(function () {});
  }

  function playSound(audioId, el) {
    flashBtn(el);
    fetch('/conversation/api/play-audio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioId: audioId })
    }).catch(function () {});
  }

  // ── Quick Actions (Poses & Sounds) ──

  function renderQuickActions() {
    if (!quickActions) return;
    quickActions.innerHTML = '';

    if (allPoses.length === 0 && allAudio.length === 0) return;

    var html = '';

    if (allPoses.length > 0) {
      html += '<div class="bm-quick-section-label">Quick Poses</div><div class="mb-2">';
      for (var i = 0; i < allPoses.length; i++) {
        html += '<button class="bm-quick-btn bm-pose-btn" data-pose-id="' + allPoses[i].id + '">' +
          '<i class="bi bi-play-circle-fill"></i>' +
          (allPoses[i].name || 'Pose ' + allPoses[i].id) + '</button>';
      }
      html += '</div>';
    }

    if (allAudio.length > 0) {
      html += '<div class="bm-quick-section-label">Quick Sounds</div><div>';
      for (var j = 0; j < allAudio.length; j++) {
        var a = allAudio[j];
        html += '<button class="bm-quick-btn bm-sound-btn" data-audio-id="' + a.id + '">' +
          '<i class="bi bi-volume-up-fill"></i>' +
          (a.title || a.filename || 'Audio') + '</button>';
      }
      html += '</div>';
    }

    quickActions.innerHTML = html;

    var poseBtns = quickActions.querySelectorAll('.bm-pose-btn');
    for (var p = 0; p < poseBtns.length; p++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          firePose(btn.getAttribute('data-pose-id'), btn);
        });
      })(poseBtns[p]);
    }

    var soundBtns = quickActions.querySelectorAll('.bm-sound-btn');
    for (var s = 0; s < soundBtns.length; s++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          playSound(btn.getAttribute('data-audio-id'), btn);
        });
      })(soundBtns[s]);
    }
  }

  // ── Tooltip ──

  function onSVGMouseover(e) {
    var g = findRegion(e.target);
    if (!g || !tooltipEl) return;

    var region = g.getAttribute('data-region');
    var parts = regionMap[region] || [];
    var rDef = REGIONS[region];
    var text = rDef ? rDef.label : region;

    if (parts.length > 0) {
      var names = [];
      for (var i = 0; i < Math.min(parts.length, 3); i++) {
        names.push(parts[i].name || parts[i].type);
      }
      text += ': ' + names.join(', ');
      if (parts.length > 3) text += ' +' + (parts.length - 3);
    } else {
      text += ' (empty)';
    }

    tooltipEl.textContent = text;
    tooltipEl.style.display = 'block';
  }

  function onSVGMouseout(e) {
    var g = findRegion(e.target);
    if (!g) return;
    if (tooltipEl) tooltipEl.style.display = 'none';
  }

  function onSVGMousemove(e) {
    if (tooltipEl && tooltipEl.style.display !== 'none') {
      tooltipEl.style.left = (e.clientX + 14) + 'px';
      tooltipEl.style.top = (e.clientY - 10) + 'px';
    }
  }

  function findRegion(el) {
    while (el && el !== svgEl) {
      if (el.classList && el.classList.contains('bm-region')) return el;
      el = el.parentNode;
    }
    return null;
  }

  // ── Render All ──

  function renderAll() {
    buildSVG();
    renderPeripherals();
    renderQuickActions();
    showEmptyState();
    updateItemCount();
  }

  function updateItemCount() {
    if (!itemCountEl) return;
    var bodyCount = 0;
    for (var r in regionMap) {
      if (regionMap.hasOwnProperty(r)) bodyCount += regionMap[r].length;
    }
    var total = bodyCount + periphParts.length;
    itemCountEl.textContent = total + ' part' + (total !== 1 ? 's' : '');
  }

  // ── Public API ──

  function init(opts) {
    opts = opts || {};
    characterId = opts.characterId || null;

    svgEl = $('mcBodyMap');
    periphEl = $('mcPeripherals');
    controlPanel = $('mcControlPanel');
    quickActions = $('mcQuickActions');
    itemCountEl = $('mcItemCount');

    // Create tooltip
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'bm-tooltip';
    document.body.appendChild(tooltipEl);

    if (svgEl) {
      svgEl.addEventListener('click', onSVGClick);
      svgEl.addEventListener('mouseover', onSVGMouseover);
      svgEl.addEventListener('mouseout', onSVGMouseout);
      svgEl.addEventListener('mousemove', onSVGMousemove);
    }

    if (!characterId) return Promise.resolve();

    return fetchData(characterId).then(function (results) {
      processData(results);
      renderAll();
    });
  }

  function reload(charId) {
    characterId = charId || characterId;
    deselectAll();

    if (!characterId) {
      if (svgEl) svgEl.innerHTML = '';
      if (periphEl) periphEl.innerHTML = '';
      if (quickActions) quickActions.innerHTML = '';
      showEmptyState();
      return Promise.resolve();
    }

    return fetchData(characterId).then(function (results) {
      processData(results);
      renderAll();
    });
  }

  function destroy() {
    if (svgEl) {
      svgEl.removeEventListener('click', onSVGClick);
      svgEl.removeEventListener('mouseover', onSVGMouseover);
      svgEl.removeEventListener('mouseout', onSVGMouseout);
      svgEl.removeEventListener('mousemove', onSVGMousemove);
    }
    if (tooltipEl && tooltipEl.parentNode) {
      tooltipEl.parentNode.removeChild(tooltipEl);
    }
    allParts = [];
    allPoses = [];
    allAudio = [];
    regionMap = {};
    periphParts = [];
    selectedRegion = null;
    selectedPartId = null;
    selectedPartData = null;
  }

  window.ManualControls = { init: init, reload: reload, destroy: destroy };
})();
