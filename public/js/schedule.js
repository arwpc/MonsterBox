/**
 * Scheduled Events page (ES5 — var, no arrow functions, no template literals).
 *
 * The organising principle: "next run" is the loudest thing on the page. The
 * bug that motivated this feature was a Halloween crontab that looked installed
 * and correct on 16 August and did nothing for 76 days, because nothing
 * anywhere showed when it would actually fire. So every row leads with a
 * plain-language next-run time, and the summary banner answers "is anything
 * happening tonight?" before the operator has to read anything else.
 *
 * Backend: /api/schedule/* (routes/scheduleRoutes.js).
 * Fleet status is read from the existing /api/orchestration/fleet-health.
 */

(function () {
  'use strict';

  var DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  var state = {
    events: [],
    moments: [],
    scenes: [],
    nodeNames: {},
    character: null,
    fleet: null,          // { nodesById: {}, checked: bool }
    editingId: null,
    previewTimer: null,
    confirmAction: null
  };

  var el = {};

  /* ---------------------------------------------------------------- */
  /* Small helpers                                                     */
  /* ---------------------------------------------------------------- */

  function $(id) { return document.getElementById(id); }

  function show(node, visible) {
    if (!node) return;
    if (visible) node.classList.remove('sch-hidden');
    else node.classList.add('sch-hidden');
  }

  function text(node, value) {
    if (node) node.textContent = value == null ? '' : String(value);
  }

  function esc(value) {
    var div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  }

  function toast(message, kind) {
    var region = $('schToasts');
    if (!region) return;
    var node = document.createElement('div');
    node.className = 'mb-toast mb-toast-' + (kind || 'info');
    node.textContent = message;
    region.appendChild(node);
    window.setTimeout(function () {
      if (node.parentNode) node.parentNode.removeChild(node);
    }, 5000);
  }

  function showError(message) {
    var box = $('schError');
    text(box, message);
    show(box, Boolean(message));
  }

  function request(method, url, body) {
    var options = { method: method, headers: { 'Accept': 'application/json' } };
    if (body !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    return fetch(url, options).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (!response.ok || data.success === false) {
          throw new Error(data.error || ('Request failed (' + response.status + ')'));
        }
        return data;
      });
    });
  }

  /* ---------------------------------------------------------------- */
  /* Fleet awareness                                                   */
  /* ---------------------------------------------------------------- */

  /**
   * A moment casts one speech per node. With half the fleet down, half its
   * dialogue is silently dropped — perform.mjs skips unreachable nodes and
   * carries on, so the show still runs, it just quietly runs smaller. Making
   * that visible BEFORE showtime is the whole point.
   */
  function loadFleet() {
    return fetch('/api/orchestration/fleet-health', { headers: { 'Accept': 'application/json' } })
      .then(function (response) { return response.json(); })
      .then(function (data) {
        var byId = {};
        var nodes = (data && data.nodes) || [];
        for (var i = 0; i < nodes.length; i++) {
          byId[String(nodes[i].id)] = nodes[i];
        }
        state.fleet = { nodesById: byId, checked: true };
      })
      .catch(function () {
        // Never block the schedule on a fleet probe.
        state.fleet = { nodesById: {}, checked: false };
      });
  }

  function nodeStatus(id) {
    if (!state.fleet || !state.fleet.checked) return 'unknown';
    var node = state.fleet.nodesById[String(id)];
    if (!node) return 'offline';   // not in the controllable list at all
    return node.online ? 'online' : 'offline';
  }

  function nodeName(id) {
    // Registry first: fleet-health omits nodes with no usable address, and an
    // unaddressable node is precisely the one worth naming in a warning.
    if (state.nodeNames && state.nodeNames[String(id)]) return state.nodeNames[String(id)];
    var node = state.fleet && state.fleet.nodesById[String(id)];
    return (node && node.name) || ('Node ' + id);
  }

  function offlineTargets(event) {
    if (!event.targetNodes || !event.targetNodes.length) return [];
    var down = [];
    for (var i = 0; i < event.targetNodes.length; i++) {
      if (nodeStatus(event.targetNodes[i]) === 'offline') down.push(event.targetNodes[i]);
    }
    return down;
  }

  /* ---------------------------------------------------------------- */
  /* Rendering                                                         */
  /* ---------------------------------------------------------------- */

  function renderSummary() {
    var enabled = state.events.filter(function (e) { return e.enabled; });
    var soonest = null;
    for (var i = 0; i < enabled.length; i++) {
      var next = enabled[i].schedule && enabled[i].schedule.nextRun;
      if (!next) continue;
      if (!soonest || next < soonest.schedule.nextRun) soonest = enabled[i];
    }

    var parts = [];
    parts.push(state.events.length + ' event' + (state.events.length === 1 ? '' : 's') + ' managed');
    parts.push(enabled.length + ' enabled');

    var message;
    if (!soonest) {
      message = parts.join(' · ') + ' — nothing has a scheduled next run.';
    } else {
      message = parts.join(' · ') + ' — next up: "' + soonest.name + '" '
        + soonest.schedule.nextRunText + ' (' + soonest.schedule.nextRunRelative + ').';
    }
    text($('schSummaryText'), message);
  }

  function renderFleetWarning() {
    var affected = [];
    var downIds = {};
    for (var i = 0; i < state.events.length; i++) {
      var event = state.events[i];
      if (!event.enabled) continue;
      var down = offlineTargets(event);
      if (down.length) {
        affected.push(event.name + ' (' + down.length + ' of ' + event.targetNodes.length + ' targets down)');
        for (var j = 0; j < down.length; j++) downIds[String(down[j])] = true;
      }
    }

    var names = Object.keys(downIds).map(nodeName);
    if (!affected.length || !state.fleet || !state.fleet.checked) {
      show($('schFleetWarning'), false);
      return;
    }
    text($('schFleetWarningText'),
      ' Offline right now: ' + names.join(', ') + '. Affected: ' + affected.join('; ')
      + '. The show still runs — unreachable nodes are skipped instantly — but their lines will not be heard.');
    show($('schFleetWarning'), true);
  }

  function nodeBadges(event) {
    if (!event.targetNodes || !event.targetNodes.length) {
      return '<span class="mb-text-secondary mb-text-sm">this node</span>';
    }
    var html = '<span class="sch-nodes">';
    for (var i = 0; i < event.targetNodes.length; i++) {
      var id = event.targetNodes[i];
      var status = nodeStatus(id);
      var cls = status === 'online' ? 'mb-badge-success' : (status === 'offline' ? 'mb-badge-danger' : 'mb-badge-info');
      var title = nodeName(id) + ' — ' + status;
      html += '<span class="mb-badge ' + cls + '" title="' + esc(title) + '">' + esc(nodeName(id)) + '</span>';
    }
    return html + '</span>';
  }

  function nextRunCell(event) {
    var schedule = event.schedule || {};
    if (!schedule.valid) {
      return '<span class="mb-text-danger">Unreadable schedule</span>';
    }
    if (schedule.bootOnly) {
      return '<span class="sch-next"><span class="sch-next-when">At next reboot</span>'
        + '<span class="sch-next-rel mb-text-secondary">no clock time</span></span>';
    }
    if (schedule.neverFires) {
      return '<span class="mb-text-danger sch-next"><span class="sch-next-when">Never fires</span>'
        + '<span class="sch-next-rel">that date does not exist</span></span>';
    }
    var tone = event.enabled ? '' : ' mb-text-secondary';
    var relTone = event.enabled ? 'mb-text-primary' : 'mb-text-secondary';
    return '<span class="sch-next' + tone + '">'
      + '<span class="sch-next-when">' + esc(schedule.nextRunText) + '</span>'
      + '<span class="sch-next-rel ' + relTone + '">' + esc(schedule.nextRunRelative)
      + (event.enabled ? '' : ' — but DISABLED, so it will not run') + '</span></span>';
  }

  function renderTable() {
    var body = $('schBody');
    if (!body) return;

    if (!state.events.length) {
      body.innerHTML = '';
      show($('schEmpty'), true);
      show($('schTable'), false);
      return;
    }
    show($('schEmpty'), false);
    show($('schTable'), true);

    var html = '';
    for (var i = 0; i < state.events.length; i++) {
      var event = state.events[i];
      var schedule = event.schedule || {};
      var down = offlineTargets(event);

      html += '<tr class="' + (event.enabled ? '' : 'sch-row-off') + '" data-id="' + esc(event.id) + '">';

      // Enable/disable — prominent and instant.
      html += '<td><label class="mb-switch" title="'
        + (event.enabled ? 'Enabled — cron will run this' : 'Disabled — the line is commented out but kept')
        + '"><input type="checkbox" data-sch-toggle="' + esc(event.id) + '"'
        + (event.enabled ? ' checked' : '') + '>'
        + '<span class="mb-switch-track"><span class="mb-switch-thumb"></span></span></label></td>';

      html += '<td><strong>' + esc(event.name) + '</strong>';
      if (event.dryRun) html += ' <span class="mb-badge mb-badge-info">rehearsal</span>';
      if (event.description) {
        html += '<div class="mb-text-sm mb-text-secondary">' + esc(event.description.split('\n')[0]) + '</div>';
      }
      html += '<code class="sch-cmd mb-text-secondary">' + esc(event.command) + '</code></td>';

      html += '<td><span class="sch-cron">' + esc(event.expression) + '</span>'
        + '<div class="mb-text-sm mb-text-secondary">' + esc(schedule.description || '') + '</div></td>';

      html += '<td class="sch-col-next">' + nextRunCell(event) + '</td>';

      html += '<td>' + nodeBadges(event);
      if (down.length) {
        html += '<div class="mb-text-xs mb-text-warning">' + down.length + ' offline — lines dropped</div>';
      }
      html += '</td>';

      html += '<td><div class="sch-actions">'
        + '<button type="button" class="mb-btn mb-btn-sm mb-btn-secondary" data-sch-edit="' + esc(event.id) + '" title="Edit this event">'
        + '<i class="bi bi-pencil"></i></button>'
        + '<button type="button" class="mb-btn mb-btn-sm mb-btn-warning" data-sch-run="' + esc(event.id) + '" title="Run this event immediately, for real">'
        + '<i class="bi bi-play-fill"></i> Run now</button>'
        + '<button type="button" class="mb-btn mb-btn-sm mb-btn-danger" data-sch-delete="' + esc(event.id) + '" title="Delete this event from the crontab">'
        + '<i class="bi bi-trash"></i></button>'
        + '</div></td>';

      html += '</tr>';
    }
    body.innerHTML = html;
  }

  function renderAll() {
    renderSummary();
    renderFleetWarning();
    renderTable();
  }

  /* ---------------------------------------------------------------- */
  /* Loading                                                           */
  /* ---------------------------------------------------------------- */

  function loadEvents() {
    return request('GET', '/api/schedule').then(function (data) {
      state.events = data.events || [];
      state.nodeNames = data.nodeNames || {};
      showError('');
      if (data.adoptedNow) {
        toast('Adopted ' + state.events.length + ' existing crontab entries into the managed block.', 'info');
      }
      renderAll();
    }).catch(function (error) {
      showError('Could not read the schedule: ' + error.message);
      text($('schSummaryText'), 'Could not read the crontab.');
    });
  }

  function loadOptions() {
    return request('GET', '/api/schedule/options').then(function (data) {
      state.moments = data.moments || [];
      state.scenes = data.scenes || [];
      state.character = data.character || null;

      var momentSelect = $('schMoment');
      var html = '';
      for (var i = 0; i < state.moments.length; i++) {
        html += '<option value="' + esc(state.moments[i].file) + '">'
          + esc(state.moments[i].name) + '</option>';
      }
      momentSelect.innerHTML = html || '<option value="">No moments found</option>';

      var sceneSelect = $('schScene');
      var sceneHtml = '';
      for (var j = 0; j < state.scenes.length; j++) {
        sceneHtml += '<option value="' + esc(state.scenes[j].id) + '">' + esc(state.scenes[j].name) + '</option>';
      }
      sceneSelect.innerHTML = sceneHtml || '<option value="">No scenes for this character</option>';
      text($('schSceneCharacter'), state.character ? ('· ' + state.character.name) : '');

      updateMomentHint();
    }).catch(function (error) {
      showError('Could not load actions: ' + error.message);
    });
  }

  function updateMomentHint() {
    var file = $('schMoment').value;
    var moment = null;
    for (var i = 0; i < state.moments.length; i++) {
      if (state.moments[i].file === file) moment = state.moments[i];
    }
    if (!moment) { text($('schMomentHint'), ''); return; }
    var down = [];
    for (var j = 0; j < moment.nodes.length; j++) {
      if (nodeStatus(moment.nodes[j]) === 'offline') down.push(nodeName(moment.nodes[j]));
    }
    var hint = moment.stepCount + ' steps, ' + moment.nodes.length + ' target node(s).';
    if (down.length) hint += ' OFFLINE right now: ' + down.join(', ') + ' — their lines will be skipped.';
    text($('schMomentHint'), hint);
  }

  /* ---------------------------------------------------------------- */
  /* Editor                                                            */
  /* ---------------------------------------------------------------- */

  function currentActionType() {
    var radios = document.getElementsByName('schActionType');
    for (var i = 0; i < radios.length; i++) if (radios[i].checked) return radios[i].value;
    return 'moment';
  }

  function currentMode() {
    var radios = document.getElementsByName('schMode');
    for (var i = 0; i < radios.length; i++) if (radios[i].checked) return radios[i].value;
    return 'date';
  }

  function selectedDays() {
    var out = [];
    var boxes = $('schDays').getElementsByTagName('input');
    for (var i = 0; i < boxes.length; i++) if (boxes[i].checked) out.push(Number(boxes[i].value));
    return out;
  }

  function syncActionFields() {
    var type = currentActionType();
    show($('schMomentField'), type === 'moment');
    show($('schSceneField'), type === 'scene');
    show($('schRawField'), type === 'raw');
  }

  function syncModeFields() {
    var mode = currentMode();
    show($('schTimeField'), mode !== 'raw');
    show($('schDateField'), mode === 'date');
    show($('schDaysField'), mode === 'weekly');
    show($('schExpressionField'), mode === 'raw');
  }

  function buildPayload() {
    var type = currentActionType();
    var action = { type: type };
    if (type === 'moment') {
      action.moment = $('schMoment').value;
      action.dryRun = $('schDryRun').checked;
    } else if (type === 'scene') {
      action.sceneId = $('schScene').value;
      action.characterId = state.character ? state.character.id : null;
    } else {
      action.command = $('schRawCommand').value;
      action.logName = ($('schName').value || 'custom').toLowerCase().replace(/[^\w-]+/g, '-');
    }

    var mode = currentMode();
    var schedule = { mode: mode, time: $('schTime').value };
    if (mode === 'date') schedule.date = $('schDate').value;
    if (mode === 'weekly') schedule.days = selectedDays();

    var payload = {
      name: $('schName').value.trim(),
      description: $('schDescription').value.trim(),
      enabled: $('schEnabled').checked,
      action: action
    };
    if (mode === 'raw') payload.expression = $('schExpression').value.trim();
    else payload.schedule = schedule;
    return payload;
  }

  function refreshPreview() {
    var payload;
    try {
      payload = buildPayload();
    } catch (error) {
      return;
    }
    request('POST', '/api/schedule/preview', payload).then(function (data) {
      var preview = data.preview;
      text($('schPreviewLine'), preview.expression + '  ' + preview.command);
      text($('schPreviewDescription'), preview.schedule.description);
      var next = preview.schedule.bootOnly
        ? 'At next reboot'
        : (preview.schedule.nextRunText
          ? preview.schedule.nextRunText + '  —  ' + preview.schedule.nextRunRelative
          : 'never');
      text($('schPreviewNext'), next);

      var warnings = [];
      if (preview.schedule.neverFires) warnings.push('This schedule can never fire — check the day and month.');
      if (preview.commandError) warnings.push(preview.commandError);
      if (preview.targetNodes) {
        var down = [];
        for (var i = 0; i < preview.targetNodes.length; i++) {
          if (nodeStatus(preview.targetNodes[i]) === 'offline') down.push(nodeName(preview.targetNodes[i]));
        }
        if (down.length) warnings.push('Offline right now: ' + down.join(', ') + ' — their parts will be skipped.');
      }
      text($('schPreviewWarning'), warnings.join(' '));
      show($('schPreviewWarning'), warnings.length > 0);
    }).catch(function (error) {
      text($('schPreviewLine'), '—');
      text($('schPreviewDescription'), '');
      text($('schPreviewNext'), '—');
      text($('schPreviewWarning'), error.message);
      show($('schPreviewWarning'), true);
    });
  }

  function schedulePreview() {
    if (state.previewTimer) window.clearTimeout(state.previewTimer);
    state.previewTimer = window.setTimeout(refreshPreview, 250);
  }

  function openEditor(event) {
    state.editingId = event ? event.id : null;
    text($('schEditorTitle'), event ? ('Edit: ' + event.name) : 'New event');
    show($('schEditor'), true);

    $('schName').value = event ? event.name : '';
    $('schDescription').value = event && event.description ? event.description.split('\n')[0] : '';
    $('schEnabled').checked = event ? event.enabled : true;

    // Editing an existing entry always drops to raw mode: its command may have
    // been hand-tuned, and silently regenerating it would be a great way to
    // lose an operator's careful edit.
    setRadio('schActionType', event ? 'raw' : 'moment');
    setRadio('schMode', event ? 'raw' : 'date');
    $('schRawCommand').value = event ? event.command : '';
    $('schExpression').value = event ? event.expression : '';

    if (!event) {
      var today = new Date();
      $('schDate').value = today.getFullYear() + '-'
        + String(today.getMonth() + 1).padStart(2, '0') + '-'
        + String(today.getDate()).padStart(2, '0');
    }

    syncActionFields();
    syncModeFields();
    refreshPreview();
    $('schEditor').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function setRadio(name, value) {
    var radios = document.getElementsByName(name);
    for (var i = 0; i < radios.length; i++) radios[i].checked = radios[i].value === value;
  }

  function closeEditor() {
    state.editingId = null;
    show($('schEditor'), false);
  }

  function save() {
    var payload;
    try {
      payload = buildPayload();
    } catch (error) {
      showError(error.message);
      return;
    }
    if (!payload.name) { showError('Give the event a name.'); return; }

    // An edit sends the literal command/expression the operator can see in the
    // preview, so what is saved is exactly what was shown.
    if (state.editingId) {
      payload.command = $('schRawCommand').value.trim();
      payload.expression = $('schExpression').value.trim();
    }

    var method = state.editingId ? 'PUT' : 'POST';
    var url = state.editingId ? ('/api/schedule/' + encodeURIComponent(state.editingId)) : '/api/schedule';

    request(method, url, payload).then(function (data) {
      toast('Saved "' + data.event.name + '" — next run ' + (data.event.schedule.nextRunText || 'n/a'), 'success');
      showError('');
      closeEditor();
      return loadEvents();
    }).catch(function (error) {
      showError('Could not save: ' + error.message);
    });
  }

  /* ---------------------------------------------------------------- */
  /* Confirm dialog (never a native popup — it cannot show the stakes) */
  /* ---------------------------------------------------------------- */

  function openConfirmDialog(options) {
    text($('schConfirmTitle'), options.title);
    text($('schConfirmBody'), options.body);
    text($('schConfirmCommand'), options.command || '');
    text($('schConfirmWarning'), options.warning || '');
    show($('schConfirmWarning'), Boolean(options.warning));
    $('schConfirmGo').textContent = options.goLabel || 'Confirm';
    $('schConfirmGo').className = 'mb-btn ' + (options.goClass || 'mb-btn-danger');
    state.confirmAction = options.onConfirm;
    show($('schConfirmLayer'), true);
  }

  function closeConfirmDialog() {
    state.confirmAction = null;
    show($('schConfirmLayer'), false);
  }

  function findEvent(id) {
    for (var i = 0; i < state.events.length; i++) {
      if (state.events[i].id === id) return state.events[i];
    }
    return null;
  }

  /**
   * Run now. This genuinely fires the event immediately — servos move and the
   * speakers play at whatever volume the yard is set to — so it takes an
   * explicit second step and says so in as many words.
   */
  function askRunNow(id) {
    var event = findEvent(id);
    if (!event) return;
    var down = offlineTargets(event);
    openConfirmDialog({
      title: 'Run "' + event.name + '" right now?',
      body: 'This fires immediately, for real. Hardware will move and audio will play '
        + 'at current volume, wherever these animatronics are standing.'
        + (event.dryRun
          ? ' This entry carries --dry-run, so it will make no sound and no calls.'
          : ' It is not a rehearsal.'),
      command: event.command,
      warning: down.length
        ? ('Offline right now: ' + down.map(nodeName).join(', ') + '. Their parts will be skipped.')
        : '',
      goLabel: 'Yes — run it now',
      goClass: 'mb-btn-warning',
      onConfirm: function () {
        request('POST', '/api/schedule/' + encodeURIComponent(id) + '/run-now', { confirm: true })
          .then(function (data) {
            toast('Started "' + data.started.name + '" (pid ' + data.started.pid + ').', 'warning');
          })
          .catch(function (error) { showError('Could not run: ' + error.message); });
      }
    });
  }

  function askDelete(id) {
    var event = findEvent(id);
    if (!event) return;
    openConfirmDialog({
      title: 'Delete "' + event.name + '"?',
      body: 'This removes the line from the crontab. If you only want it quiet for now, '
        + 'switch it off instead — a disabled event keeps its line, commented out, and can be switched back on.',
      command: event.expression + '  ' + event.command,
      goLabel: 'Delete it',
      goClass: 'mb-btn-danger',
      onConfirm: function () {
        request('DELETE', '/api/schedule/' + encodeURIComponent(id))
          .then(function () { toast('Deleted "' + event.name + '".', 'info'); return loadEvents(); })
          .catch(function (error) { showError('Could not delete: ' + error.message); });
      }
    });
  }

  function toggle(id, enabled) {
    request('POST', '/api/schedule/' + encodeURIComponent(id) + '/toggle', { enabled: enabled })
      .then(function (data) {
        toast('"' + data.event.name + '" is now ' + (data.event.enabled ? 'ENABLED' : 'disabled')
          + (data.event.enabled ? (' — next run ' + (data.event.schedule.nextRunText || 'n/a')) : ' (line kept, commented out)'),
          data.event.enabled ? 'success' : 'info');
        return loadEvents();
      })
      .catch(function (error) {
        showError('Could not toggle: ' + error.message);
        loadEvents();
      });
  }

  /* ---------------------------------------------------------------- */
  /* Wiring                                                            */
  /* ---------------------------------------------------------------- */

  function buildDayCheckboxes() {
    var host = $('schDays');
    var html = '';
    for (var i = 0; i < DAY_NAMES.length; i++) {
      html += '<label class="mb-chip"><input type="checkbox" value="' + i + '"> ' + DAY_NAMES[i] + '</label>';
    }
    host.innerHTML = html;
  }

  function bind() {
    $('schRefresh').addEventListener('click', function () {
      loadFleet().then(loadEvents);
    });
    $('schNew').addEventListener('click', function () { openEditor(null); });
    $('schCancel').addEventListener('click', closeEditor);
    $('schSave').addEventListener('click', save);

    document.addEventListener('change', function (evt) {
      var target = evt.target;
      if (target.name === 'schActionType') { syncActionFields(); schedulePreview(); return; }
      if (target.name === 'schMode') { syncModeFields(); schedulePreview(); return; }
      if (target.id === 'schMoment') { updateMomentHint(); schedulePreview(); return; }
      if (target.getAttribute && target.getAttribute('data-sch-toggle')) {
        toggle(target.getAttribute('data-sch-toggle'), target.checked);
        return;
      }
      if (target.closest && target.closest('#schEditor')) schedulePreview();
    });

    document.addEventListener('input', function (evt) {
      if (evt.target.closest && evt.target.closest('#schEditor')) schedulePreview();
    });

    document.addEventListener('click', function (evt) {
      var node = evt.target.closest ? evt.target.closest('[data-sch-edit],[data-sch-run],[data-sch-delete],[data-sch-cancel]') : null;
      if (!node) return;
      if (node.hasAttribute('data-sch-cancel')) { closeConfirmDialog(); return; }
      if (node.hasAttribute('data-sch-edit')) { openEditor(findEvent(node.getAttribute('data-sch-edit'))); return; }
      if (node.hasAttribute('data-sch-run')) { askRunNow(node.getAttribute('data-sch-run')); return; }
      if (node.hasAttribute('data-sch-delete')) { askDelete(node.getAttribute('data-sch-delete')); }
    });

    $('schConfirmGo').addEventListener('click', function () {
      var action = state.confirmAction;
      closeConfirmDialog();
      if (action) action();
    });

    document.addEventListener('keydown', function (evt) {
      if (evt.key === 'Escape') closeConfirmDialog();
    });
  }

  function init() {
    el.body = $('schBody');
    buildDayCheckboxes();
    bind();
    syncActionFields();
    syncModeFields();
    // Events first so the page is useful immediately; the fleet probe can take
    // a few seconds against offline nodes and only enriches the display.
    loadEvents().then(loadOptions).then(loadFleet).then(function () {
      renderAll();
      updateMomentHint();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
