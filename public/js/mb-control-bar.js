/**
 * MonsterBox Global Control Bar
 * ---------------------------------------------------------------------------
 * Behaviour for views/components/control-bar.ejs — the controls that appear in
 * the same place on every page: character identity, live subsystem health,
 * master volume, and stop-everything.
 *
 * Two principles this file exists to enforce:
 *
 *  1. Health is a LIVE PROBE, never persisted state. A stored "enabled: true"
 *     has already been caught in this codebase claiming a connection that did
 *     not exist, so every dot here reflects a request made just now.
 *
 *  2. Stopping everything must be instant to reach but impossible to hit by
 *     accident. A confirm dialog fails the first; a bare button fails the
 *     second. Holding satisfies both.
 *
 * ES5 IIFE, no arrow functions / template literals / const — matches the rest
 * of public/js per CLAUDE.md.
 */
(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  var bar = $('mbControlBar');
  if (!bar) return;

  // ---------------------------------------------------------------- identity
  function paintIdentity() {
    var nameEl = $('mbControlBarName');
    var avatarEl = $('mbControlBarAvatar');
    var charId = window.__MB_CHAR_ID;

    if (window.__MB_CHAR_IMAGE && avatarEl) {
      avatarEl.src = window.__MB_CHAR_IMAGE;
      avatarEl.style.display = '';
    }

    if (charId == null) {
      if (nameEl) nameEl.textContent = 'No character';
      return;
    }

    fetch('/api/characters', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !nameEl) return;
        var list = data.characters || data;
        if (!list || !list.length) return;
        for (var i = 0; i < list.length; i++) {
          if (String(list[i].id) === String(charId)) {
            nameEl.textContent = list[i].char_name || list[i].name || ('Character ' + charId);
            return;
          }
        }
        nameEl.textContent = 'Character ' + charId;
      })
      .catch(function () {
        if (nameEl) nameEl.textContent = 'Character ' + charId;
      });
  }

  // ------------------------------------------------------------------ health
  function setDot(el, state) {
    if (!el) return;
    el.className = 'mb-dot mb-dot-' + state;
  }

  function probeHealth() {
    var dot = $('mbHealthService');
    var text = $('mbHealthText');
    var started = Date.now();

    fetch('/api/system/info', { headers: { Accept: 'application/json' } })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (info) {
        var ms = Date.now() - started;
        setDot(dot, 'live');
        if (dot) dot.title = 'Server healthy — v' + (info.version || '?') + ' · ' + ms + 'ms';
        if (text) text.textContent = 'v' + (info.version || '?') + ' · ' + ms + 'ms';
      })
      .catch(function (err) {
        setDot(dot, 'danger');
        if (dot) dot.title = 'Server unreachable: ' + err.message;
        if (text) text.textContent = 'offline';
      });
  }

  // ------------------------------------------------------------------ volume
  function wireVolume() {
    var slider = $('mbControlBarVolume');
    if (!slider) return;

    fetch('/api/system/volume', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (data && data.volume != null) slider.value = data.volume;
      })
      .catch(function () { /* leave the default — not worth an error here */ });

    // Only write on release. Firing a PUT per pixel of drag would hammer the
    // SD card and the audio stack for values the operator never settled on.
    var commit = function () {
      var value = parseInt(slider.value, 10);
      fetch('/api/system/volume', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ volume: value })
      }).catch(function () { /* surfaced by the health dot if the server is down */ });
    };
    slider.addEventListener('change', commit);
  }

  // --------------------------------------------------------- hold-to-confirm
  /**
   * Turn an element into a hold-to-fire control. The visual fill is driven by
   * --mb-hold-progress so CSS owns the appearance and this owns only the timing.
   */
  function wireHold(el, onFire) {
    if (!el) return;
    var holdMs = parseInt(el.getAttribute('data-hold-ms'), 10) || 600;
    var raf = null;
    var startedAt = 0;

    function reset() {
      if (raf) { cancelAnimationFrame(raf); raf = null; }
      el.style.setProperty('--mb-hold-progress', '0');
      el.removeAttribute('data-holding');
    }

    function tick() {
      var progress = (Date.now() - startedAt) / holdMs;
      if (progress >= 1) {
        reset();
        onFire();
        return;
      }
      el.style.setProperty('--mb-hold-progress', String(progress));
      raf = requestAnimationFrame(tick);
    }

    function begin(evt) {
      // Ignore secondary mouse buttons; a right-click should never arm this.
      if (evt.type === 'mousedown' && evt.button !== 0) return;
      evt.preventDefault();
      startedAt = Date.now();
      el.setAttribute('data-holding', 'true');
      raf = requestAnimationFrame(tick);
    }

    el.addEventListener('mousedown', begin);
    el.addEventListener('touchstart', begin, { passive: false });
    ['mouseup', 'mouseleave', 'touchend', 'touchcancel', 'blur'].forEach(function (evtName) {
      el.addEventListener(evtName, reset);
    });

    // Keyboard equivalent: hold Enter/Space. Without this the control is
    // unreachable for anyone not using a pointer.
    el.addEventListener('keydown', function (evt) {
      if ((evt.key === 'Enter' || evt.key === ' ') && !raf) {
        evt.preventDefault();
        startedAt = Date.now();
        el.setAttribute('data-holding', 'true');
        raf = requestAnimationFrame(tick);
      }
    });
    el.addEventListener('keyup', reset);
  }

  function stopEverything() {
    // Fire every stop we have and do not wait on any of them — this runs when
    // something is already going wrong, so a hung endpoint must not block the
    // others. Each is independently safe to call when nothing is running.
    var endpoints = [
      '/api/orchestration/stop-all',
      '/api/audio/stop-all',
      '/scenes/api/queue/stop'
    ];
    for (var i = 0; i < endpoints.length; i++) {
      fetch(endpoints[i], { method: 'POST' }).catch(function () { /* best effort */ });
    }
    announce('Stop sent to all subsystems');
  }

  function announce(message) {
    var region = document.querySelector('.mb-toast-region');
    if (!region) {
      region = document.createElement('div');
      region.className = 'mb-toast-region';
      region.setAttribute('role', 'status');
      region.setAttribute('aria-live', 'polite');
      document.body.appendChild(region);
    }
    var toast = document.createElement('div');
    toast.className = 'mb-toast mb-toast-warning';
    toast.textContent = message;
    region.appendChild(toast);
    setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 4000);
  }

  // -------------------------------------------------------------------- init
  document.body.classList.add('mb-has-control-bar');
  paintIdentity();
  probeHealth();
  wireVolume();
  wireHold($('mbStopEverything'), stopEverything);

  // Re-probe periodically. 30s is frequent enough to notice a dead server
  // during a show without adding meaningful load on an RPi.
  setInterval(probeHealth, 30000);

  // Double-Esc is the existing panic shortcut on the dashboard; honour it
  // everywhere now that the bar is global.
  var lastEsc = 0;
  document.addEventListener('keydown', function (evt) {
    if (evt.key !== 'Escape') return;
    var now = Date.now();
    if (now - lastEsc < 600) {
      lastEsc = 0;
      stopEverything();
    } else {
      lastEsc = now;
    }
  });
})();
