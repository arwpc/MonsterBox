/* ════════════════════════════════════════════════════════════════════════
   SCARE CONSOLE deck + stage behaviors (dashboard v2, 2026-08).

   dashboard.js remains the behavior engine for everything it already owns
   (lurk FSM, chat/ConvAI, webcam, click-to-track, audio bridge, console).
   This file only adds the v2 surface: the one-tap deck (scenes/poses/sounds),
   quick scare lines, and the stage Listen/PTT buttons that proxy the audio
   bridge controls. ES5 on purpose — see CLAUDE.md client-JS style rule.
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var deckData = { scenes: [], poses: [], sounds: [] };
  var activeDeck = 'scenes';
  var playingSceneId = null;

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Shared with dashboard.js and manual-controls.js, which ask for the same
  // pose list and audio library on the same page load.
  function getJSON(url, cb) {
    var p = (window.MonsterBox && typeof window.MonsterBox.sharedJson === 'function')
      ? window.MonsterBox.sharedJson(url)
      : fetch(url).then(function (r) { return r.json(); });
    p.then(function (d) { cb(null, d); }).catch(function (e) { cb(e); });
  }

  function postJSON(url, body, cb) {
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) { return r.json(); }).then(function (d) { cb(null, d); })
      .catch(function (e) { cb(e); });
  }

  /* ── Deck data ─────────────────────────────────────────────────────── */

  // ── Machine vitals ────────────────────────────────────────────────────
  // The strip shipped as static placeholders; these fill them from endpoints
  // that already exist. A value that cannot be read stays an em dash rather
  // than showing a zero — an honest gap beats a confident wrong number.
  function setTele(id, text) {
    var el = $(id);
    if (el) el.textContent = text;
  }

  function paintWs() {
    var state = (typeof window.mbChatWsState === 'function') ? window.mbChatWsState() : 'closed';
    var el = $('scTeleWs');
    if (!el) return;
    el.textContent = state === 'open' ? 'WS ●' : (state === 'connecting' ? 'WS ◐' : 'WS ○');
    // Amber is reserved for happening-now, and a live agent socket qualifies.
    el.classList.toggle('sc-tele-live', state === 'open');
  }

  function loadTelemetry() {
    getJSON('/health', function (err, d) {
      if (!err && d && d.version) setTele('scTeleVer', 'v' + d.version);
    });
    getJSON('/api/resource/status', function (err, d) {
      if (err || !d || !d.success || !d.status) return;
      var s = d.status;
      if (s.memory && typeof s.memory.rssMB === 'number') setTele('scTeleRss', 'RSS ' + Math.round(s.memory.rssMB) + 'MB');
      if (s.uptimeFormatted) setTele('scTeleUp', 'UP ' + s.uptimeFormatted);
    });
    getJSON('/api/movement/telemetry', function (err, d) {
      if (err || !d || !d.success || !d.telemetry || !d.telemetry.latency) return;
      var lat = d.telemetry.latency;
      // count 0 means nothing has moved yet this period — say so rather than
      // reporting a 0 ms servo latency the hardware never achieved.
      setTele('scTeleServo', lat.count ? 'SERVO ' + Math.round(lat.avg) + 'ms' : 'SERVO idle');
    });
    paintWs();
  }

  function loadDeck() {
    getJSON('/scenes/api/', function (err, d) {
      deckData.scenes = (!err && d && d.success && d.scenes) ? d.scenes : [];
      if (activeDeck === 'scenes') renderDeck();
    });
    getJSON('/poses/api/poses', function (err, d) {
      var poses = [];
      if (!err && d) poses = Array.isArray(d) ? d : (d.poses || []);
      deckData.poses = poses;
      if (activeDeck === 'poses') renderDeck();
    });
    getJSON('/audio-library/api/library', function (err, d) {
      var sounds = [];
      if (!err && d) sounds = Array.isArray(d) ? d : (d.files || d.library || d.audio || []);
      deckData.sounds = sounds;
      if (activeDeck === 'sounds') renderDeck();
    });
  }

  function tileNameOf(item) {
    return item.scene_name || item.name || item.title || item.filename || ('#' + item.id);
  }

  // The AI deck is a conversation, not a tile grid: it swaps in place of the
  // grid and hides the tile tools, which have nothing to filter or loop.
  function showDeckPane() {
    var ai = activeDeck === 'ai';
    var grid = $('scDeckGrid');
    var pane = $('scDeckAi');
    var tools = document.querySelector('.sc-deck-tools');
    if (grid) grid.classList.toggle('mb-hidden', ai);
    if (pane) pane.classList.toggle('mb-hidden', !ai);
    if (tools) tools.classList.toggle('mb-hidden', ai);
    // Opening the tab should land on the newest line, not wherever the log
    // happened to be scrolled while it was hidden.
    if (ai) {
      var log = $('chatLog');
      if (log) log.scrollTop = log.scrollHeight;
    }
  }

  function renderDeck() {
    var grid = $('scDeckGrid');
    if (!grid) return;
    if (activeDeck === 'ai') return;  // the AI pane owns its own content
    var filter = ($('scDeckFilter') && $('scDeckFilter').value || '').toLowerCase();
    var items = deckData[activeDeck] || [];
    if (filter) {
      items = items.filter(function (it) { return tileNameOf(it).toLowerCase().indexOf(filter) !== -1; });
    }
    var icons = { scenes: 'bi-film', poses: 'bi-person-arms-up', sounds: 'bi-music-note-beamed' };
    if (!items.length) {
      grid.innerHTML = '<div class="sc-deck-empty">' +
        (filter ? 'Nothing matches the filter.' :
          (activeDeck === 'poses' ? 'No poses yet — build some in the Pose Editor.' :
           activeDeck === 'sounds' ? 'No sounds in the audio library.' :
           'No scenes yet — build some in the Animation Studio.')) + '</div>';
      return;
    }
    var html = '';
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var name = tileNameOf(it);
      html += '<button type="button" class="sc-tile sc-tile-' + activeDeck + '"' +
        ' data-deck="' + activeDeck + '" data-id="' + esc(it.id) + '"' +
        (activeDeck === 'scenes' && String(it.id) === String(playingSceneId) ? ' data-playing="1"' : '') +
        ' title="Play &quot;' + esc(name) + '&quot; now" aria-label="Play ' + esc(name) + '">' +
        '<i class="bi ' + icons[activeDeck] + '"></i>' +
        '<span class="sc-tile-name">' + esc(name) + '</span>' +
        '</button>';
    }
    grid.innerHTML = html;
  }

  /* ── Firing tiles (busy state + honest failure detail) ─────────────── */

  function setStatus(msg) {
    var st = $('sayStatus');
    if (st) st.textContent = msg || '';
  }

  function fireTile(btn) {
    var kind = btn.getAttribute('data-deck');
    var id = btn.getAttribute('data-id');
    // A servo move takes 500ms+; without a busy state an unacknowledged tap
    // gets tapped again, and a double tap double-fires the hardware.
    btn.setAttribute('data-busy', '1');
    var done = function () { btn.removeAttribute('data-busy'); };

    if (kind === 'scenes') {
      postJSON('/scenes/api/' + encodeURIComponent(id) + '/play', null, function (err, res) {
        done();
        if (!err && res && res.success) {
          playingSceneId = id;
          setStatus('Scene playing.');
          renderDeck();
        } else {
          setStatus('Scene did not play — ' + ((res && res.error) || (err && err.message) || 'no reason given'));
        }
      });
    } else if (kind === 'poses') {
      postJSON('/poses/' + encodeURIComponent(id) + '/execute', null, function (err, res) {
        done();
        if (!err && res && res.success) {
          setStatus('Pose played.');
        } else {
          // Say WHICH parts refused and why — a bare "failed" next to a pose
          // that partly moved tells the operator nothing they can act on.
          var failed = (res && res.failedParts) || [];
          var detail = failed.length
            ? failed.map(function (f) { return 'part ' + f.partId + ': ' + (f.error || 'refused'); }).join(' · ')
            : ((res && res.error) || (err && err.message) || 'no reason given');
          setStatus(((res && res.partialFailure) ? 'Played, but ' : 'Did not play — ') + detail);
        }
      });
    } else if (kind === 'sounds') {
      postJSON('/audio-library/api/audio/' + encodeURIComponent(id) + '/play', null, function (err, res) {
        done();
        if (!err && res && res.success) setStatus('Sound playing.');
        else setStatus('Sound did not play — ' + ((res && res.error) || (err && err.message) || 'no reason given'));
      });
    } else {
      done();
    }
  }

  /* ── Quick scare lines ─────────────────────────────────────────────── */

  var DEFAULT_LINES = ['Boo!', 'I can seeee you…', 'Come closer…', 'Leaving so soon?'];
  var LINES_KEY = 'mb-scare-lines';

  function loadLines() {
    try {
      var saved = JSON.parse(localStorage.getItem(LINES_KEY) || '[]');
      return saved.concat(DEFAULT_LINES).slice(0, 8);
    } catch (e) { return DEFAULT_LINES.slice(); }
  }

  function rememberLine(text) {
    if (!text || text.length > 120) return;
    try {
      var saved = JSON.parse(localStorage.getItem(LINES_KEY) || '[]');
      saved = saved.filter(function (l) { return l !== text; });
      saved.unshift(text);
      localStorage.setItem(LINES_KEY, JSON.stringify(saved.slice(0, 4)));
    } catch (e) { /* private mode etc. — chips just stay default */ }
    renderLines();
  }

  function renderLines() {
    var wrap = $('scQuickLines');
    if (!wrap) return;
    var lines = loadLines();
    var html = '';
    for (var i = 0; i < lines.length; i++) {
      html += '<button type="button" class="sc-qline" data-line="' + esc(lines[i]) + '"' +
        ' title="Send this line in the current mode">' + esc(lines[i]) + '</button>';
    }
    wrap.innerHTML = html;
  }

  function fireLine(btn) {
    var input = $('chatInput');
    var send = $('chatSendBtn');
    if (!input || !send) return;
    btn.setAttribute('data-busy', '1');
    input.value = btn.getAttribute('data-line') || '';
    send.click(); // dashboard.js owns the send path (Ask AI / Say This mode)
    setTimeout(function () { btn.removeAttribute('data-busy'); }, 1200);
  }

  /* ── Stage proxies: Listen + PTT drive the audio-bridge controls ───── */

  function syncProxies() {
    var listenBtn = $('scListenBtn');
    var listenReal = $('bridge-listenin-status');
    if (listenBtn && listenReal) {
      var on = /on|live|listening/i.test(listenReal.textContent || '');
      listenBtn.classList.toggle('sc-on', on);
      var lbl = $('scListenLabel');
      if (lbl) lbl.textContent = on ? 'Listening' : 'Listen';
    }
    var ptt = $('scPttBtn');
    var pttReal = $('bridge-talkthrough-status');
    if (ptt && pttReal) {
      ptt.classList.toggle('sc-on', /on|live|talking/i.test(pttReal.textContent || ''));
    }
  }

  /* ── Wire-up ───────────────────────────────────────────────────────── */

  function init() {
    // Deck tabs
    var tabs = document.querySelectorAll('.sc-tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener('click', function () {
        activeDeck = this.getAttribute('data-deck');
        for (var j = 0; j < tabs.length; j++) tabs[j].classList.remove('active');
        this.classList.add('active');
        var pe = $('scPoseEditorLink'); var st = $('scStudioLink');
        if (pe) pe.classList.toggle('d-none', activeDeck !== 'poses');
        if (st) st.classList.toggle('d-none', activeDeck === 'poses');
        showDeckPane();
        renderDeck();
      });
    }

    // Deck grid delegation
    var grid = $('scDeckGrid');
    if (grid) {
      grid.addEventListener('click', function (ev) {
        var btn = ev.target;
        while (btn && btn !== grid && !btn.classList.contains('sc-tile')) btn = btn.parentNode;
        if (btn && btn !== grid) fireTile(btn);
      });
    }

    var filter = $('scDeckFilter');
    if (filter) filter.addEventListener('input', renderDeck);

    // Quick lines
    renderLines();
    var qwrap = $('scQuickLines');
    if (qwrap) {
      qwrap.addEventListener('click', function (ev) {
        var btn = ev.target;
        while (btn && btn !== qwrap && !btn.classList.contains('sc-qline')) btn = btn.parentNode;
        if (btn && btn !== qwrap) fireLine(btn);
      });
    }
    var send = $('chatSendBtn');
    if (send) {
      send.addEventListener('click', function () {
        var input = $('chatInput');
        if (input && input.value) rememberLine(input.value.trim());
      });
    }

    // Stage proxies → real bridge buttons (dashboard.js owns the streams)
    var listenBtn = $('scListenBtn');
    if (listenBtn) {
      listenBtn.addEventListener('click', function () {
        var real = $('btn-bridge-listenin');
        if (real) real.click();
      });
    }
    var ptt = $('scPttBtn');
    if (ptt) {
      ptt.addEventListener('click', function () {
        var real = $('btn-bridge-talkthrough');
        if (real) real.click();
      });
    }
    setInterval(syncProxies, 1000);

    // Scene loop transport clears the playing highlight when stopped
    var stopBtns = ['btnStopLoop', 'opbarStopLoop', 'mbPanicBtn', 'stopAllAudioBtn'];
    for (var s = 0; s < stopBtns.length; s++) {
      var b = $(stopBtns[s]);
      if (b) b.addEventListener('click', function () { playingSceneId = null; renderDeck(); });
    }

    loadDeck();
    // Scenes/poses can change in the studio while this page is open.
    setInterval(loadDeck, 60000);

    // The say bar is the composer for the AI tab too — it sits beside the deck
    // and is always visible, so joining in means focusing it rather than
    // maintaining a second input bound to the same socket.
    var join = $('scAiJoinBtn');
    if (join) {
      join.addEventListener('click', function () {
        var input = $('chatInput');
        if (!input) return;
        input.scrollIntoView({ block: 'center', behavior: 'smooth' });
        input.focus();
      });
    }

    loadTelemetry();
    // Slow on purpose: this strip is ambient reassurance, not an instrument.
    // Every poll is SD-card-free but still three requests on a shared Pi.
    setInterval(loadTelemetry, 15000);
    setInterval(paintWs, 2000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
