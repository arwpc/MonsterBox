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

    // The fleet character list lives under the setup router, not /api/characters
    // (which does not exist and returns the 404 page).
    fetch('/setup/characters/api/characters', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !nameEl) return;
        var list = data.characters || [];
        for (var i = 0; i < list.length; i++) {
          if (String(list[i].id) === String(charId)) {
            nameEl.textContent = list[i].name || list[i].char_name || ('Character ' + charId);
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
        if (!data) return;
        // Both ends of /api/system/volume speak integer percent now. volumePercent
        // is the explicit alias; volume is the same number.
        var pct = data.volumePercent != null ? data.volumePercent : data.volume;
        if (pct == null) return;
        slider.value = String(Math.round(pct));
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

  // ------------------------------------------------------------------- panic
  /**
   * Fire the stop the instant the control is pressed.
   *
   * This was a 600ms hold, on the reasoning that holding is "instant to reach but
   * impossible to hit by accident". Half of that was right. Testing what a person
   * actually does when a child starts crying — five fast jabs at the red button —
   * fired NOTHING: under adrenaline people tap harder and faster, not longer and
   * steadier, so a hold is exactly the gesture that stress removes. The asymmetry
   * settles it: an accidental stop costs a few seconds of embarrassment; a missed
   * stop costs a frightened child, or a hand in a linear actuator.
   */
  function wirePanic(el, onFire) {
    if (!el) return;
    var firing = false;

    function fire(evt) {
      if (evt && evt.type === 'mousedown' && evt.button !== 0) return;
      if (evt) evt.preventDefault();
      if (firing) return;              // ignore repeat jabs while one is in flight
      firing = true;
      el.setAttribute('data-fired', 'true');
      onFire();
      setTimeout(function () { firing = false; }, 1200);
    }

    // pointerdown covers mouse, touch and pen in one event, and fires before any
    // scroll or gesture recognition can swallow it.
    if (window.PointerEvent) {
      el.addEventListener('pointerdown', fire);
    } else {
      el.addEventListener('mousedown', fire);
      el.addEventListener('touchstart', fire, { passive: false });
    }
    el.addEventListener('keydown', function (evt) {
      if (evt.key === 'Enter' || evt.key === ' ') fire(evt);
    });
  }

  function stopEverything() {
    // ONE request. Browsers cap HTTP/1.1 at six connections per origin, the
    // dashboard holds one open forever for the MJPEG stream and several pollers
    // take more — so on degrading wifi a multi-call panic can sit in the queue and
    // never leave the handset while the UI claims success. keepalive lets it
    // survive even if the page is navigated away mid-flight.
    setStopped('Stopping…');
    fetch('/api/panic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fleet: true }),
      keepalive: true
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data) throw new Error('no response');
        var localOk = (data.local && data.local.succeeded) || 0;
        var fleetOk = (data.fleet && data.fleet.successful) || 0;
        setStopped('STOPPED — ' + localOk + ' local, ' + fleetOk + ' fleet');
      })
      .catch(function () {
        // Never claim success we did not observe. This previously announced
        // "Stop sent to all subsystems" unconditionally, before any request
        // had resolved — so every failure mode still looked reassuring.
        setStopped('STOP FAILED — check the animatronic', true);
      });
  }

  /**
   * Make the stopped state unmissable. In a dark garage at arm's length, a small
   * text toast is not feedback.
   */
  function setStopped(message, failed) {
    var btn = $('mbStopEverything');
    if (btn) {
      var label = btn.querySelector('.mb-hold-label');
      if (label) label.textContent = message;
    }
    announce(message, failed ? 'danger' : 'warning');
    if (navigator.vibrate) {
      // You cannot hear a confirmation over a fog machine and can barely see the
      // screen; touch is the only channel left.
      try { navigator.vibrate(failed ? [80, 60, 80] : 200); } catch (_) { /* unsupported */ }
    }
  }

  function announce(message, severity) {
    var region = document.querySelector('.mb-toast-region');
    if (!region) {
      region = document.createElement('div');
      region.className = 'mb-toast-region';
      region.setAttribute('role', 'status');
      region.setAttribute('aria-live', 'polite');
      document.body.appendChild(region);
    }
    var toast = document.createElement('div');
    toast.className = 'mb-toast mb-toast-' + (severity || 'warning');
    toast.textContent = message;
    region.appendChild(toast);
    setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 4000);
  }

  // --------------------------------------------------------------- wake lock
  /**
   * Keep the screen awake while the operator is running a show.
   *
   * Measured on a phone: the screen sleeps between every group of trick-or-treaters,
   * and each interaction then costs an unlock plus a probable page reload — which
   * is also when the panic button is briefly unwired. Holding a wake lock removes
   * that tax from every task. Only requested on the show-facing pages, so ordinary
   * configuration browsing does not hold the screen on.
   */
  function keepAwake() {
    if (!navigator.wakeLock || !navigator.wakeLock.request) return;
    var showPages = ['/live', '/'];
    if (showPages.indexOf(window.location.pathname) === -1) return;

    var lock = null;
    function acquire() {
      navigator.wakeLock.request('screen').then(function (l) {
        lock = l;
        l.addEventListener('release', function () { lock = null; });
      }).catch(function () { /* denied or unsupported — not worth surfacing */ });
    }
    acquire();
    // A wake lock is dropped whenever the page is hidden, so re-take it on return.
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && !lock) acquire();
    });
  }

  // -------------------------------------------------------------------- init
  // The layout reservation class is server-rendered onto <body> so it survives a
  // JS failure; this is only a belt-and-braces top-up for any page that missed it.
  document.body.classList.add('mb-has-control-bar');
  paintIdentity();
  probeHealth();
  wireVolume();
  wirePanic($('mbStopEverything'), stopEverything);
  keepAwake();

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
