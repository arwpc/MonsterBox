/* Follow Orders setup page. ES5 IIFE per public/js convention. */
(function () {
  'use strict';

  var page = document.querySelector('.follow-orders-page');
  if (!page) return;
  var charId = page.getAttribute('data-character-id');
  var API = '/setup/follow-orders/api';

  var config = null;
  var candidates = { poses: [], gestures: [], parts: [] };

  function $(id) { return document.getElementById(id); }

  function fetchJson(url, opts) {
    return fetch(url, opts).then(function (r) { return r.json(); });
  }

  function showStatus(text, isError) {
    var el = $('foStatusAlert');
    if (!el) return;
    el.textContent = text;
    el.className = 'mb-alert ' + (isError ? 'mb-alert-warning' : 'mb-alert-info');
    el.style.display = text ? '' : 'none';
  }

  // ── Load ───────────────────────────────────────────────────────────
  function loadAll() {
    return Promise.all([
      fetchJson(API + '/follow-orders/' + charId),
      fetchJson(API + '/candidates/' + charId)
    ]).then(function (results) {
      var cfgRes = results[0];
      var candRes = results[1];
      if (!cfgRes.success) { showStatus(cfgRes.error || 'Failed to load config', true); return; }
      config = cfgRes.config;
      if (candRes.success) candidates = candRes;
      if (cfgRes.canPerform && !cfgRes.canPerform.ok) {
        showStatus('This character cannot follow orders yet: ' + cfgRes.canPerform.reason, true);
      }
      renderConfig(cfgRes.listener);
      renderTargets();
      renderCommands();
      renderAliases();
      refreshHistory();
    }).catch(function (e) { showStatus('Load failed: ' + e.message, true); });
  }

  function renderConfig(listener) {
    $('foEnabled').checked = !!config.enabled;
    $('foRequireName').checked = !!config.requireAddressByName;
    $('foAckSpeak').checked = config.ackMode !== 'silent';
    $('foMinConfidence').value = config.minConfidence;
    $('foCooldownMs').value = config.cooldownMs;
    $('foDefaultDurationMs').value = config.defaultDurationMs;
    $('foMaxDurationMs').value = config.maxDurationMs;
    $('foAddressAliases').value = (config.addressAliases || []).join(', ');
    $('foAckPhrases').value = (config.ackPhrases || []).join('\n');
    $('foRefusalPhrases').value = (config.refusalPhrases || []).join('\n');
    $('foMatchPoses').checked = config.enablePoseMatching !== false;
    $('foMatchGestures').checked = config.enableGestureMatching !== false;
    $('foMatchParts').checked = config.enablePartMatching !== false;
    var badge = $('foListeningBadge');
    if (badge) {
      var listening = listener && listener.listening && listener.listening !== 'off';
      badge.style.display = listening ? '' : 'none';
      badge.textContent = listener && listener.listening === 'conversation' ? 'IN CONVO' : 'LISTENING';
    }
  }

  // ── Builders ───────────────────────────────────────────────────────
  function renderTargets() {
    var kind = $('foCmdKind').value;
    var target = $('foCmdTarget');
    var verb = $('foCmdVerb');
    target.innerHTML = '';
    verb.style.display = kind === 'part' ? '' : 'none';
    target.style.display = kind === 'stop' ? 'none' : '';
    var list = kind === 'pose' ? candidates.poses : kind === 'gesture' ? candidates.gestures : candidates.parts;
    var i, opt, item;
    for (i = 0; i < list.length; i++) {
      item = list[i];
      opt = document.createElement('option');
      if (kind === 'pose') { opt.value = item.id; opt.textContent = item.name + ' (#' + item.id + ')'; }
      else if (kind === 'gesture') { opt.value = item.id; opt.textContent = item.id + (item.intent ? ' — ' + item.intent : ''); }
      else { opt.value = item.partId; opt.textContent = item.name + ' [' + item.type + ']'; }
      target.appendChild(opt);
    }

    var aliasPart = $('foAliasPart');
    aliasPart.innerHTML = '';
    for (i = 0; i < candidates.parts.length; i++) {
      item = candidates.parts[i];
      opt = document.createElement('option');
      opt.value = item.partId;
      opt.textContent = item.name + ' [' + item.type + ']';
      aliasPart.appendChild(opt);
    }
  }

  function removeButton(onClick) {
    var btn = document.createElement('button');
    btn.className = 'mb-btn mb-btn-secondary mb-btn-sm';
    btn.innerHTML = '<i class="bi bi-x-lg"></i>';
    btn.addEventListener('click', onClick);
    return btn;
  }

  function renderCommands() {
    var list = $('foCommandsList');
    list.innerHTML = '';
    var cmds = config.commands || [];
    if (!cmds.length) { list.innerHTML = '<div class="mb-text-sm mb-text-muted">No custom commands yet.</div>'; return; }
    cmds.forEach(function (cmd, idx) {
      var row = document.createElement('div');
      row.className = 'fo-row';
      var desc = document.createElement('span');
      var a = cmd.action || {};
      var actionText = a.kind === 'pose' ? 'pose #' + a.poseId
        : a.kind === 'gesture' ? 'gesture ' + a.gestureId
        : a.kind === 'part' ? (a.verb || 'open') + ' part #' + a.partId
        : 'stop all';
      desc.textContent = '"' + (cmd.phrases || []).join('" / "') + '" → ' + actionText;
      row.appendChild(desc);
      row.appendChild(removeButton(function () {
        config.commands.splice(idx, 1);
        renderCommands();
      }));
      list.appendChild(row);
    });
  }

  function renderAliases() {
    var list = $('foAliasList');
    list.innerHTML = '';
    var aliases = config.partAliases || [];
    if (!aliases.length) { list.innerHTML = '<div class="mb-text-sm mb-text-muted">No aliases yet.</div>'; return; }
    aliases.forEach(function (alias, idx) {
      var row = document.createElement('div');
      row.className = 'fo-row';
      var desc = document.createElement('span');
      desc.textContent = '"' + alias.alias + '" → part #' + alias.partId + (alias.invertOpenClose ? ' (inverted open/close)' : '');
      row.appendChild(desc);
      row.appendChild(removeButton(function () {
        config.partAliases.splice(idx, 1);
        renderAliases();
      }));
      list.appendChild(row);
    });
  }

  // ── Save ───────────────────────────────────────────────────────────
  function collectConfig() {
    function lines(id) {
      return $(id).value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    }
    return {
      enabled: $('foEnabled').checked,
      requireAddressByName: $('foRequireName').checked,
      ackMode: $('foAckSpeak').checked ? 'speak' : 'silent',
      minConfidence: parseFloat($('foMinConfidence').value) || 0.6,
      cooldownMs: parseInt($('foCooldownMs').value, 10) || 0,
      defaultDurationMs: parseInt($('foDefaultDurationMs').value, 10) || 1200,
      maxDurationMs: parseInt($('foMaxDurationMs').value, 10) || 3000,
      addressAliases: $('foAddressAliases').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean),
      ackPhrases: lines('foAckPhrases'),
      refusalPhrases: lines('foRefusalPhrases'),
      enablePoseMatching: $('foMatchPoses').checked,
      enableGestureMatching: $('foMatchGestures').checked,
      enablePartMatching: $('foMatchParts').checked,
      commands: config.commands || [],
      partAliases: config.partAliases || []
    };
  }

  function save() {
    var body = collectConfig();
    $('foSaveStatus').textContent = 'Saving…';
    fetchJson(API + '/follow-orders/' + charId, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) {
      if (!r.success) {
        $('foSaveStatus').textContent = '';
        showStatus(r.error || 'Save failed', true);
        return;
      }
      config = r.config;
      $('foSaveStatus').textContent = 'Saved.';
      showStatus('', false);
      loadAll();
    }).catch(function (e) {
      $('foSaveStatus').textContent = '';
      showStatus('Save failed: ' + e.message, true);
    });
  }

  // ── Try a phrase ───────────────────────────────────────────────────
  function tryPhrase(execute) {
    var text = $('foTryText').value.trim();
    if (!text) return;
    var url = API + (execute ? '/test-execute/' : '/test-match/') + charId;
    fetchJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text })
    }).then(function (r) {
      var pre = $('foTryResult');
      pre.style.display = '';
      pre.textContent = JSON.stringify(r, null, 2);
      if (execute) refreshHistory();
    }).catch(function (e) { showStatus('Test failed: ' + e.message, true); });
  }

  // ── History ────────────────────────────────────────────────────────
  function refreshHistory() {
    fetchJson(API + '/history/' + charId).then(function (r) {
      if (!r.success) return;
      var list = $('foHistoryList');
      list.innerHTML = '';
      var items = (r.history || []).slice().reverse();
      if (!items.length) { list.innerHTML = '<div class="mb-text-sm mb-text-muted">No orders heard yet.</div>'; return; }
      items.forEach(function (h) {
        var row = document.createElement('div');
        row.className = 'fo-row';
        var when = new Date(h.at).toLocaleTimeString();
        var outcome = h.suppressed ? 'suppressed'
          : h.cooldown ? 'cooldown'
          : h.match && h.match.matched ? (h.match.kind + (h.execution && h.execution.success ? ' ✓' : ' ✗'))
          : 'refused: ' + (h.match ? h.match.reason : '?');
        row.textContent = when + ' [' + (h.source || '?') + '] "' + h.transcript + '" → ' + outcome;
        list.appendChild(row);
      });
    }).catch(function () { });
  }

  // ── Wire up ────────────────────────────────────────────────────────
  $('foCmdKind').addEventListener('change', renderTargets);
  $('foCmdAddBtn').addEventListener('click', function () {
    var phrases = $('foCmdPhrases').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    if (!phrases.length) { showStatus('A command needs at least one phrase', true); return; }
    var kind = $('foCmdKind').value;
    var action = { kind: kind };
    if (kind === 'pose') action.poseId = parseInt($('foCmdTarget').value, 10);
    else if (kind === 'gesture') action.gestureId = $('foCmdTarget').value;
    else if (kind === 'part') { action.partId = $('foCmdTarget').value; action.verb = $('foCmdVerb').value; }
    if (!config.commands) config.commands = [];
    config.commands.push({ phrases: phrases, action: action });
    $('foCmdPhrases').value = '';
    renderCommands();
  });

  $('foAliasAddBtn').addEventListener('click', function () {
    var alias = $('foAliasText').value.trim();
    if (!alias) { showStatus('Alias text is required', true); return; }
    if (!config.partAliases) config.partAliases = [];
    config.partAliases.push({
      alias: alias,
      partId: $('foAliasPart').value,
      invertOpenClose: $('foAliasInvert').checked
    });
    $('foAliasText').value = '';
    $('foAliasInvert').checked = false;
    renderAliases();
  });

  $('foSaveBtn').addEventListener('click', save);
  $('foTryBtn').addEventListener('click', function () { tryPhrase(false); });
  $('foTryExecBtn').addEventListener('click', function () { tryPhrase(true); });
  $('foHistoryRefreshBtn').addEventListener('click', refreshHistory);
  $('foHistoryClearBtn').addEventListener('click', function () {
    fetchJson(API + '/history/' + charId, { method: 'DELETE' }).then(refreshHistory);
  });

  loadAll();
})();
