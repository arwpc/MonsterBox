/* AI Motion setup page. ES5 IIFE per public/js convention. */
(function () {
  'use strict';

  var page = document.querySelector('.ai-motion-page');
  if (!page) return;
  var charId = page.getAttribute('data-character-id');
  var API = '/setup/ai-motion/api/ai-motion/' + charId;

  var config = null;
  var allRoles = [];
  var rolesMap = {};      // role -> [ {partId,name,type,side,primary} ]
  var partsList = [];     // flattened unique parts, each with .role
  var posesList = [];
  var capabilities = [];
  var editing = null;     // draft capability being edited
  var editingSteps = [];  // draft steps
  var editingOriginalId = null;

  var EASINGS = ['ease_out', 'ease_in_out', 'ease_in', 'linear'];

  function $(id) { return document.getElementById(id); }

  function fetchJson(url, opts) {
    return fetch(url, opts).then(function (r) { return r.json(); });
  }

  function showStatus(text, isError) {
    var el = $('amStatusAlert');
    if (!el) return;
    el.textContent = text;
    el.className = 'mb-alert ' + (isError ? 'mb-alert-warning' : 'mb-alert-info');
    el.style.display = text ? '' : 'none';
  }

  function num(value, fallback) {
    var n = parseFloat(value);
    return isNaN(n) ? fallback : n;
  }

  function intOr(value, fallback) {
    var n = parseInt(value, 10);
    return isNaN(n) ? fallback : n;
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function makeSelect(className, options, value) {
    var sel = document.createElement('select');
    sel.className = className;
    for (var i = 0; i < options.length; i++) {
      var opt = document.createElement('option');
      opt.value = options[i].value;
      opt.textContent = options[i].label;
      sel.appendChild(opt);
    }
    if (value != null) sel.value = String(value);
    return sel;
  }

  function makeNumber(className, value, step, min, max) {
    var input = document.createElement('input');
    input.type = 'number';
    input.className = className;
    if (step != null) input.step = String(step);
    if (min != null) input.min = String(min);
    if (max != null) input.max = String(max);
    if (value != null) input.value = String(value);
    return input;
  }

  function partOptions() {
    var out = [];
    for (var i = 0; i < partsList.length; i++) {
      out.push({
        value: partsList[i].partId,
        label: partsList[i].name + ' [' + partsList[i].type + '] #' + partsList[i].partId
      });
    }
    if (!out.length) out.push({ value: '', label: 'No parts on this character' });
    return out;
  }

  function poseOptions() {
    var out = [];
    for (var i = 0; i < posesList.length; i++) {
      out.push({ value: posesList[i].id, label: posesList[i].name + ' (#' + posesList[i].id + ')' });
    }
    if (!out.length) out.push({ value: '', label: 'No poses on this character' });
    return out;
  }

  function partNamesForRole(role) {
    var list = rolesMap[role] || [];
    var names = [];
    for (var i = 0; i < list.length; i++) names.push(list[i].name);
    return names;
  }

  // ── Load ───────────────────────────────────────────────────────────
  function loadAll() {
    return Promise.all([
      fetchJson(API),
      fetchJson(API + '/roles'),
      fetchJson(API + '/capabilities')
    ]).then(function (results) {
      var cfgRes = results[0];
      var roleRes = results[1];
      var capRes = results[2];

      if (!cfgRes.success) { showStatus(cfgRes.error || 'Failed to load config', true); return; }
      config = cfgRes.config;

      if (roleRes.success) {
        allRoles = roleRes.allRoles || [];
        rolesMap = roleRes.roles || {};
      } else {
        allRoles = cfgRes.roles || [];
        rolesMap = {};
      }
      buildPartsList();

      renderConfig();
      renderRoles();
      renderDeniedParts();

      if (capRes.success) renderCapabilities(capRes);
      else showStatus(capRes.error || 'Failed to load capabilities', true);
    }).catch(function (e) { showStatus('Load failed: ' + e.message, true); });
  }

  function loadPoses() {
    return fetchJson('/poses/api/poses?characterId=' + charId).then(function (r) {
      if (r && r.success) posesList = r.poses || [];
    }).catch(function () { posesList = []; });
  }

  function buildPartsList() {
    partsList = [];
    var seen = {};
    var roleNames = Object.keys(rolesMap);
    for (var i = 0; i < roleNames.length; i++) {
      var list = rolesMap[roleNames[i]] || [];
      for (var j = 0; j < list.length; j++) {
        var key = String(list[j].partId);
        if (seen[key]) continue;
        seen[key] = true;
        partsList.push({
          partId: key,
          name: list[j].name,
          type: list[j].type,
          role: roleNames[i]
        });
      }
    }
  }

  // ── Section 1 + 2 rendering ────────────────────────────────────────
  function renderConfig() {
    var t = config.triggers || {};
    var p = config.permissions || {};
    $('amEnabled').checked = !!config.enabled;
    $('amTrigAgentGesture').checked = t.agentGesture !== false;
    $('amTrigGuestCommand').checked = t.guestCommand !== false;
    $('amTrigAmbient').checked = !!t.ambientDuringSpeech;
    $('amCooldownMs').value = p.cooldownMs;
    $('amMaxPerConversation').value = p.maxPerConversation;
    $('amMinConfidence').value = p.minConfidence;
    $('amAmbientMin').value = p.ambientMinAmplitude;
    $('amAmbientMax').value = p.ambientMaxAmplitude;
    $('amKidSafeOnly').checked = !!p.kidSafeOnly;
    $('amRequireAddress').checked = !!p.requireAddressByName;
  }

  function renderRoles() {
    var host = $('amRolesList');
    host.innerHTML = '';
    var allowed = (config.permissions && config.permissions.allowedRoles) || [];
    if (!allRoles.length) {
      host.appendChild(el('div', 'mb-text-sm mb-text-muted', 'No body roles are defined.'));
      return;
    }
    for (var i = 0; i < allRoles.length; i++) {
      (function (role) {
        var names = partNamesForRole(role);
        var available = names.length > 0;
        var label = el('label', 'am-check' + (available ? '' : ' am-unavailable'));
        var box = document.createElement('input');
        box.type = 'checkbox';
        box.className = 'am-role-box';
        box.setAttribute('data-role', role);
        box.checked = allowed.indexOf(role) !== -1;
        box.disabled = !available;
        label.appendChild(box);
        label.appendChild(el('span', 'am-check-name', role));
        if (available) {
          label.appendChild(el('span', 'mb-text-sm mb-text-muted', ' — ' + names.join(', ')));
        } else {
          label.appendChild(el('span', 'mb-text-sm mb-text-muted', ' — unavailable (no parts)'));
          label.title = 'This character has no parts in the "' + role + '" role.';
        }
        host.appendChild(label);
      })(allRoles[i]);
    }
  }

  function renderDeniedParts() {
    var host = $('amDeniedParts');
    host.innerHTML = '';
    var denied = ((config.permissions && config.permissions.deniedPartIds) || []).map(String);
    if (!partsList.length) {
      host.appendChild(el('div', 'mb-text-sm mb-text-muted', 'This character has no role-mapped parts to deny.'));
      return;
    }
    for (var i = 0; i < partsList.length; i++) {
      var part = partsList[i];
      var label = el('label', 'am-check');
      var box = document.createElement('input');
      box.type = 'checkbox';
      box.className = 'am-denied-box';
      box.setAttribute('data-part-id', part.partId);
      box.checked = denied.indexOf(part.partId) !== -1;
      label.appendChild(box);
      label.appendChild(el('span', 'am-check-name', part.name));
      label.appendChild(el('span', 'mb-text-sm mb-text-muted', ' — ' + part.role + ' / ' + part.type + ' #' + part.partId));
      host.appendChild(label);
    }
  }

  function collectConfig() {
    var roleBoxes = document.querySelectorAll('.am-role-box');
    var allowedRoles = [];
    var i;
    for (i = 0; i < roleBoxes.length; i++) {
      if (roleBoxes[i].checked) allowedRoles.push(roleBoxes[i].getAttribute('data-role'));
    }
    var deniedBoxes = document.querySelectorAll('.am-denied-box');
    var deniedPartIds = [];
    for (i = 0; i < deniedBoxes.length; i++) {
      if (deniedBoxes[i].checked) deniedPartIds.push(deniedBoxes[i].getAttribute('data-part-id'));
    }
    return {
      enabled: $('amEnabled').checked,
      triggers: {
        agentGesture: $('amTrigAgentGesture').checked,
        guestCommand: $('amTrigGuestCommand').checked,
        ambientDuringSpeech: $('amTrigAmbient').checked
      },
      permissions: {
        allowedRoles: allowedRoles,
        deniedPartIds: deniedPartIds,
        kidSafeOnly: $('amKidSafeOnly').checked,
        requireAddressByName: $('amRequireAddress').checked,
        cooldownMs: intOr($('amCooldownMs').value, 0),
        maxPerConversation: intOr($('amMaxPerConversation').value, 0),
        minConfidence: num($('amMinConfidence').value, 0.6),
        ambientMinAmplitude: num($('amAmbientMin').value, 0.2),
        ambientMaxAmplitude: num($('amAmbientMax').value, 0.5)
      }
    };
  }

  function saveConfig() {
    $('amSaveStatus').textContent = 'Saving…';
    fetchJson(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(collectConfig())
    }).then(function (r) {
      if (!r.success) {
        $('amSaveStatus').textContent = '';
        showStatus((r.errors && r.errors.length ? r.errors.join(' · ') : r.error) || 'Save failed', true);
        return;
      }
      config = r.config;
      $('amSaveStatus').textContent = 'Saved.';
      showStatus('', false);
      renderConfig();
      renderRoles();
      renderDeniedParts();
    }).catch(function (e) {
      $('amSaveStatus').textContent = '';
      showStatus('Save failed: ' + e.message, true);
    });
  }

  // ── Section 3: capability list ─────────────────────────────────────
  function renderCapabilities(res) {
    capabilities = res.capabilities || [];
    var rejected = res.rejected || [];

    var alert = $('amRejectedAlert');
    if (rejected.length) {
      alert.innerHTML = '';
      alert.appendChild(el('div', null, 'Refused by the runtime — fix these or they will never perform:'));
      var ul = document.createElement('ul');
      for (var r = 0; r < rejected.length; r++) ul.appendChild(el('li', null, rejected[r]));
      alert.appendChild(ul);
      alert.style.display = '';
    } else {
      alert.style.display = 'none';
      alert.innerHTML = '';
    }

    var empty = $('amCapEmpty');
    empty.style.display = (res.absent || !capabilities.length) ? '' : 'none';

    var list = $('amCapabilityList');
    list.innerHTML = '';
    capabilities.forEach(function (cap) {
      var row = el('div', 'am-row');
      var main = el('div', 'am-row-main');

      var title = el('div', 'am-cap-title');
      title.appendChild(el('strong', null, cap.label || cap.id));
      title.appendChild(el('span', 'mb-text-sm mb-text-muted', ' (' + cap.id + ')'));
      if (cap.kidSafe !== false) title.appendChild(el('span', 'am-badge am-badge-kidsafe', 'KID SAFE'));
      else title.appendChild(el('span', 'am-badge am-badge-adult', 'NOT KID SAFE'));
      title.appendChild(el(
        'span',
        'am-badge ' + (cap.performable ? 'am-badge-ok' : 'am-badge-bad'),
        cap.performable ? 'PERFORMABLE' : 'REFUSED'
      ));
      main.appendChild(title);

      var meta = el('div', 'mb-text-sm mb-text-muted');
      meta.textContent = (cap.intent || 'no intent') + ' · ' +
        ((cap.steps || []).length) + ' step(s)' +
        (cap.phrases && cap.phrases.length ? ' · says: "' + cap.phrases.join('", "') + '"' : '');
      main.appendChild(meta);
      row.appendChild(main);

      var actions = el('div', 'am-row-actions');
      var editBtn = el('button', 'mb-btn mb-btn-secondary mb-btn-sm');
      editBtn.innerHTML = '<i class="bi bi-pencil"></i> Edit';
      editBtn.addEventListener('click', function () { openEditor(cap); });
      actions.appendChild(editBtn);

      var delBtn = el('button', 'mb-btn mb-btn-warning mb-btn-sm');
      delBtn.innerHTML = '<i class="bi bi-trash"></i> Delete';
      delBtn.addEventListener('click', function () { deleteCapability(cap.id); });
      actions.appendChild(delBtn);

      row.appendChild(actions);
      list.appendChild(row);
    });
  }

  function refreshCapabilities() {
    return fetchJson(API + '/capabilities').then(function (r) {
      if (!r.success) { showStatus(r.error || 'Failed to load capabilities', true); return; }
      renderCapabilities(r);
    }).catch(function (e) { showStatus('Load failed: ' + e.message, true); });
  }

  function deleteCapability(id) {
    if (!window.confirm('Delete capability "' + id + '"? This removes it from the vocabulary.')) return;
    fetchJson(API + '/capabilities/' + encodeURIComponent(id), { method: 'DELETE' }).then(function (r) {
      if (!r.success) {
        showStatus((r.errors && r.errors.length ? r.errors.join(' · ') : r.error) || 'Delete failed', true);
        return;
      }
      showStatus('Deleted "' + id + '".', false);
      if (editing && editingOriginalId === id) closeEditor();
      refreshCapabilities();
    }).catch(function (e) { showStatus('Delete failed: ' + e.message, true); });
  }

  // ── Section 3: editor ──────────────────────────────────────────────
  function stepKind(step) {
    if (step && step.pose != null) return 'pose';
    if (step && step.type === 'light') return 'light';
    return 'servo';
  }

  function openEditor(cap) {
    editing = cap ? JSON.parse(JSON.stringify(cap)) : {
      id: '', label: '', intent: '', phrases: [], steps: [],
      holdMs: 1200, cooldownMs: 6000, maxPerConversation: 3, kidSafe: true
    };
    editingOriginalId = cap ? cap.id : null;
    editingSteps = editing.steps ? editing.steps.slice() : [];

    $('amCapEditorTitle').textContent = cap ? ('Edit "' + cap.id + '"') : 'New capability';
    $('amCapId').value = editing.id || '';
    $('amCapId').disabled = !!cap;
    $('amCapLabel').value = editing.label || '';
    $('amCapIntent').value = editing.intent || '';
    $('amCapPhrases').value = (editing.phrases || []).join(', ');
    $('amCapCooldownMs').value = editing.cooldownMs != null ? editing.cooldownMs : '';
    $('amCapMaxPerConversation').value = editing.maxPerConversation != null ? editing.maxPerConversation : '';
    $('amCapHoldMs').value = editing.holdMs != null ? editing.holdMs : '';
    $('amCapKidSafe').checked = editing.kidSafe !== false;
    $('amCapStatus').textContent = '';
    $('amCapResult').style.display = 'none';
    $('amCapResult').innerHTML = '';

    renderSteps();
    $('amCapEditor').style.display = '';
    $('amCapEditor').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function closeEditor() {
    editing = null;
    editingSteps = [];
    editingOriginalId = null;
    $('amCapEditor').style.display = 'none';
  }

  function syncSteps() {
    var rows = document.querySelectorAll('#amStepList .am-step');
    var next = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var kind = row.getAttribute('data-kind');
      var step;
      if (kind === 'pose') {
        step = {
          pose: intOr(row.querySelector('.am-step-pose').value, row.querySelector('.am-step-pose').value),
          delayMs: intOr(row.querySelector('.am-step-delay').value, 0),
          durationMs: intOr(row.querySelector('.am-step-duration').value, 0)
        };
      } else if (kind === 'light') {
        step = {
          partId: row.querySelector('.am-step-part').value,
          type: 'light',
          level: intOr(row.querySelector('.am-step-level').value, 0),
          delayMs: intOr(row.querySelector('.am-step-delay').value, 0)
        };
      } else {
        step = {
          partId: row.querySelector('.am-step-part').value,
          type: 'servo',
          target: num(row.querySelector('.am-step-target').value, 0),
          delayMs: intOr(row.querySelector('.am-step-delay').value, 0),
          durationMs: intOr(row.querySelector('.am-step-duration').value, 0),
          easing: row.querySelector('.am-step-easing').value
        };
      }
      next.push(step);
    }
    editingSteps = next;
    return next;
  }

  function labelled(text, control) {
    var wrap = el('label', 'mb-field');
    wrap.appendChild(el('span', 'mb-label', text));
    control.className = control.className ? control.className + ' mb-input' : 'mb-input';
    wrap.appendChild(control);
    return wrap;
  }

  function renderSteps() {
    var host = $('amStepList');
    host.innerHTML = '';
    if (!editingSteps.length) {
      host.appendChild(el('div', 'mb-text-sm mb-text-muted', 'No steps yet. A recipe needs at least two distinct parts, or one part plus a light.'));
      return;
    }
    editingSteps.forEach(function (step, idx) {
      var kind = stepKind(step);
      var row = el('div', 'am-step');
      row.setAttribute('data-kind', kind);

      row.appendChild(el('span', 'am-step-kind', kind));

      if (kind === 'pose') {
        var poseSel = makeSelect('am-step-pose', poseOptions(), step.pose);
        row.appendChild(labelled('Pose', poseSel));
        row.appendChild(labelled('Delay (ms)', makeNumber('am-step-delay', step.delayMs != null ? step.delayMs : 0, 10, 0)));
        row.appendChild(labelled('Duration (ms)', makeNumber('am-step-duration', step.durationMs != null ? step.durationMs : 1000, 10, 1)));
      } else if (kind === 'light') {
        row.appendChild(labelled('Part', makeSelect('am-step-part', partOptions(), step.partId)));
        row.appendChild(labelled('Level (0-100)', makeNumber('am-step-level', step.level != null ? step.level : 50, 1, 0, 100)));
        row.appendChild(labelled('Delay (ms)', makeNumber('am-step-delay', step.delayMs != null ? step.delayMs : 0, 10, 0)));
      } else {
        row.appendChild(labelled('Part', makeSelect('am-step-part', partOptions(), step.partId)));
        row.appendChild(labelled('Target', makeNumber('am-step-target', step.target != null ? step.target : 90, 1)));
        row.appendChild(labelled('Delay (ms)', makeNumber('am-step-delay', step.delayMs != null ? step.delayMs : 0, 10, 0)));
        row.appendChild(labelled('Duration (ms)', makeNumber('am-step-duration', step.durationMs != null ? step.durationMs : 900, 10, 1)));
        var easeOpts = [];
        for (var e = 0; e < EASINGS.length; e++) easeOpts.push({ value: EASINGS[e], label: EASINGS[e] });
        row.appendChild(labelled('Easing', makeSelect('am-step-easing', easeOpts, step.easing || 'ease_out')));
      }

      var rm = el('button', 'mb-btn mb-btn-secondary mb-btn-sm am-step-remove');
      rm.innerHTML = '<i class="bi bi-x-lg"></i>';
      rm.title = 'Remove step';
      rm.addEventListener('click', function () {
        syncSteps();
        editingSteps.splice(idx, 1);
        renderSteps();
      });
      row.appendChild(rm);

      host.appendChild(row);
    });
  }

  // Default a new step to a part that suits it, so the first Check is about the
  // recipe rather than about an obviously wrong default part.
  function defaultPartId(wantLight) {
    var i;
    for (i = 0; i < partsList.length; i++) {
      var isLight = partsList[i].type === 'light' || partsList[i].role === 'light';
      if (isLight === !!wantLight) return partsList[i].partId;
    }
    return partsList.length ? partsList[0].partId : '';
  }

  function addStep(kind) {
    if (!editing) openEditor(null);
    syncSteps();
    if (kind === 'pose') {
      editingSteps.push({ pose: posesList.length ? posesList[0].id : '', delayMs: 0, durationMs: 1000 });
    } else if (kind === 'light') {
      editingSteps.push({ partId: defaultPartId(true), type: 'light', level: 50, delayMs: 0 });
    } else {
      editingSteps.push({ partId: defaultPartId(false), type: 'servo', target: 90, delayMs: 0, durationMs: 900, easing: 'ease_out' });
    }
    renderSteps();
  }

  function collectDraft() {
    var steps = syncSteps();
    var phrases = $('amCapPhrases').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    var draft = {
      id: ($('amCapId').value || '').trim(),
      label: $('amCapLabel').value.trim(),
      intent: $('amCapIntent').value.trim(),
      steps: steps,
      kidSafe: $('amCapKidSafe').checked
    };
    if (phrases.length) draft.phrases = phrases;
    if ($('amCapHoldMs').value !== '') draft.holdMs = intOr($('amCapHoldMs').value, 0);
    if ($('amCapCooldownMs').value !== '') draft.cooldownMs = intOr($('amCapCooldownMs').value, 0);
    if ($('amCapMaxPerConversation').value !== '') draft.maxPerConversation = intOr($('amCapMaxPerConversation').value, 0);
    // Preserve the return-to-rest recipe authored elsewhere; the editor does not own it.
    if (editing && editing['return']) draft['return'] = editing['return'];
    return draft;
  }

  function renderCheckResult(result) {
    var box = $('amCapResult');
    box.innerHTML = '';
    box.style.display = '';
    if (result.ok) {
      box.className = 'am-result mb-alert mb-alert-info';
      box.appendChild(el('div', null, 'This recipe passes every rule the runtime enforces. It will perform.'));
      return;
    }
    box.className = 'am-result mb-alert mb-alert-warning';
    box.appendChild(el('div', null, 'Refused — the save endpoint enforces these same rules:'));
    var ul = document.createElement('ul');
    var errors = result.errors || [];
    for (var i = 0; i < errors.length; i++) ul.appendChild(el('li', null, errors[i]));
    box.appendChild(ul);
  }

  function checkDraft() {
    var draft = collectDraft();
    $('amCapStatus').textContent = 'Checking…';
    fetchJson(API + '/capabilities/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft)
    }).then(function (r) {
      $('amCapStatus').textContent = '';
      if (!r.success) { showStatus(r.error || 'Check failed', true); return; }
      renderCheckResult(r);
    }).catch(function (e) {
      $('amCapStatus').textContent = '';
      showStatus('Check failed: ' + e.message, true);
    });
  }

  function saveCapability() {
    var draft = collectDraft();
    if (!draft.id) { showStatus('A capability needs an id', true); return; }
    var url = editingOriginalId
      ? API + '/capabilities/' + encodeURIComponent(editingOriginalId)
      : API + '/capabilities';
    $('amCapStatus').textContent = 'Saving…';
    fetch(url, {
      method: editingOriginalId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft)
    }).then(function (r) { return r.json(); }).then(function (r) {
      $('amCapStatus').textContent = '';
      if (!r.success) {
        renderCheckResult({ ok: false, errors: r.errors || [r.error || 'Save failed'] });
        return;
      }
      showStatus('Saved capability "' + draft.id + '".', false);
      closeEditor();
      refreshCapabilities();
    }).catch(function (e) {
      $('amCapStatus').textContent = '';
      showStatus('Save failed: ' + e.message, true);
    });
  }

  // ── Wire up ────────────────────────────────────────────────────────
  $('amSaveBtn').addEventListener('click', saveConfig);
  $('amCapRefreshBtn').addEventListener('click', refreshCapabilities);
  $('amCapNewBtn').addEventListener('click', function () { openEditor(null); });
  $('amCapCancelBtn').addEventListener('click', closeEditor);
  $('amCapCheckBtn').addEventListener('click', checkDraft);
  $('amCapSaveBtn').addEventListener('click', saveCapability);
  $('amAddServoStep').addEventListener('click', function () { addStep('servo'); });
  $('amAddLightStep').addEventListener('click', function () { addStep('light'); });
  $('amAddPoseStep').addEventListener('click', function () { addStep('pose'); });

  loadPoses().then(loadAll);
})();
