/**
 * MonsterBox - AI Settings: live conversation panel + lurk preferences.
 *
 * Read-only conversation view: everything comes from
 * GET /conversation/api/ai-status (duplex mode, lurk state, per-turn latency),
 * polled every 5 s while the page is visible. Lurk preferences are read from
 * GET /conversation/api/lurk-state (its `prefs` and `capabilities`) and written
 * through POST /conversation/api/lurk-state/prefs; Wake / Sleep post to
 * /conversation/api/wake and /conversation/api/sleep and the buttons follow the
 * server's state, never a local guess.
 *
 * Character-independent: the character comes from the panel's
 * data-character-id (resolved server-side by resolveCharacter) and is passed as
 * ?characterId= on every call.
 *
 * ES5 IIFE per CLAUDE.md (no arrow functions, no template literals).
 */
(function () {
    'use strict';

    var POLL_MS = 5000;
    // The capabilities lurkStateService accepts in capabilityOptOut
    // (OPTABLE_CAPABILITIES). Only those the node actually reports are shown.
    var OPTABLE = ['agent', 'jaw', 'led', 'headTracking', 'aiMotion', 'followOrders', 'idle'];
    var CAP_LABELS = {
        agent: 'AI agent (conversation)',
        jaw: 'Jaw animation',
        led: 'LED eyes',
        headTracking: 'Head tracking',
        aiMotion: 'AI motion',
        followOrders: 'Follow orders',
        idle: 'Idle poses'
    };
    var ANSWERED_SOURCES = { 'speech': true, 'ask-ai': true, 'one-shot': true };

    var state = {
        characterId: null,
        timer: null,
        lurk: null,
        prefsDirty: false,
        busy: false
    };

    function $(id) { return document.getElementById(id); }

    function q(path) {
        if (!state.characterId) return path;
        return path + (path.indexOf('?') >= 0 ? '&' : '?') + 'characterId=' + encodeURIComponent(state.characterId);
    }

    function getJson(path) {
        return fetch(q(path), { cache: 'no-store' }).then(function (r) {
            return r.json().then(function (j) { j._status = r.status; return j; });
        });
    }

    function postJson(path, body) {
        return fetch(q(path), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body || {})
        }).then(function (r) {
            return r.json().then(function (j) { j._status = r.status; return j; });
        });
    }

    function setText(id, text) {
        var el = $(id);
        if (el) el.textContent = text;
    }

    function ms(v) {
        return (v === null || v === undefined || !isFinite(v)) ? 'n/a' : (Math.round(v) + ' ms');
    }

    function secs(v) {
        return (v === null || v === undefined || !isFinite(v)) ? 'n/a' : ((v / 1000).toFixed(1) + ' s');
    }

    function clock(iso) {
        if (!iso) return 'n/a';
        var d = new Date(iso);
        if (isNaN(d.getTime())) return String(iso);
        return d.toLocaleTimeString();
    }

    function duration(msLeft) {
        if (msLeft === null || msLeft === undefined || !isFinite(msLeft)) return '';
        var total = Math.max(0, Math.round(msLeft / 1000));
        var m = Math.floor(total / 60);
        var s = total % 60;
        return m + ':' + (s < 10 ? '0' : '') + s;
    }

    // Same nearest-rank rule as the server's percentiles() so the footer agrees
    // with the summary the service computes.
    function percentiles(values) {
        var v = [];
        for (var i = 0; i < values.length; i++) {
            if (typeof values[i] === 'number' && isFinite(values[i])) v.push(values[i]);
        }
        v.sort(function (a, b) { return a - b; });
        if (!v.length) return { n: 0, p50: null, p90: null };
        function pick(qv) { return v[Math.min(v.length - 1, Math.floor(qv * (v.length - 1) + 0.5))]; }
        return { n: v.length, p50: pick(0.5), p90: pick(0.9) };
    }

    function cell(tr, text, title) {
        var td = document.createElement('td');
        td.textContent = text;
        if (title) td.title = title;
        tr.appendChild(td);
        return td;
    }

    // ---------------------------------------------------------------- status
    function renderStatus(st) {
        var mode = st.conversationMode;
        if (mode && mode.mode) {
            setText('convDuplexMode', String(mode.mode).toUpperCase());
            setText('convDuplexReason', mode.reason || '');
        } else {
            setText('convDuplexMode', 'n/a');
            setText('convDuplexReason', 'Detected when a conversation session starts');
        }

        setText('convLurkState', st.state ? String(st.state).toUpperCase() : 'n/a');
        if (st.state === 'awake' && st.sleepInMs !== null && st.sleepInMs !== undefined) {
            setText('convSleepIn', 'Sleeps in ' + duration(st.sleepInMs) + ' without activity');
        } else if (st.state === 'awake') {
            setText('convSleepIn', 'Awake; no inactivity sleep scheduled');
        } else if (st.state === 'lurking') {
            setText('convSleepIn', 'Idle loop; nothing speaks until a wake');
        } else {
            setText('convSleepIn', '');
        }

        setText('convAgentLive', st.agentLive ? 'LIVE' : 'off');
        var lat = st.latency || {};
        setText('convTurnCount', (lat.count || 0) + ' turn' + (lat.count === 1 ? '' : 's') + ' recorded');

        renderLatency(lat);
        setText('convUpdatedAt', 'updated ' + new Date().toLocaleTimeString());
        reflectWakeSleep(st.state, st.agentLive);
    }

    function renderLatency(lat) {
        var body = $('convLatencyRows');
        var foot = $('convLatencySummary');
        if (!body || !foot) return;
        var turns = Array.isArray(lat.turns) ? lat.turns.slice() : [];
        body.innerHTML = '';
        foot.innerHTML = '';
        if (!turns.length) {
            var empty = document.createElement('tr');
            var td = cell(empty, 'No turns yet. Turns appear here as guests talk to the character.');
            td.colSpan = 8;
            td.className = 'mb-text-muted text-center';
            body.appendChild(empty);
            return;
        }
        // Newest first: the operator is watching what just happened.
        turns.reverse();
        for (var i = 0; i < turns.length; i++) {
            var t = turns[i];
            var tr = document.createElement('tr');
            tr.setAttribute('data-turn-source', t.source || '');
            cell(tr, clock(t.at), t.at || '');
            cell(tr, (t.source || '?') + (t.mode ? ' (' + t.mode + ')' : ''), t.text || '');
            cell(tr, ms(t.speechEndToTranscriptMs));
            cell(tr, ms(t.transcriptToFirstAudioMs));
            cell(tr, ms(t.firstAudioToPlaybackMs), t.coldStart ? 'speaker woke from suspend' : '');
            cell(tr, ms(t.speechEndToPlaybackMs));
            cell(tr, secs(t.replyMs));
            var it = cell(tr, t.interrupted ? 'yes' : 'no');
            if (t.interrupted) it.className = 'mb-text-warning';
            body.appendChild(tr);
        }

        var answered = [];
        for (var j = 0; j < turns.length; j++) {
            if (ANSWERED_SOURCES[turns[j].source]) answered.push(turns[j]);
        }
        var s = lat.summary || {};
        var se2t = percentiles(answered.map(function (x) { return x.speechEndToTranscriptMs; }));
        var t2a = s.transcriptToFirstAudioMs || percentiles(answered.map(function (x) { return x.transcriptToFirstAudioMs; }));
        var a2p = s.firstAudioToPlaybackMs || percentiles(turns.map(function (x) { return x.firstAudioToPlaybackMs; }));
        var tot = s.speechEndToPlaybackMs || percentiles(answered.map(function (x) { return x.speechEndToPlaybackMs; }));
        var interrupted = (typeof s.interrupted === 'number') ? s.interrupted : turns.filter(function (x) { return x.interrupted; }).length;

        ['p50', 'p90'].forEach(function (k) {
            var row = document.createElement('tr');
            row.setAttribute('data-summary', k);
            var th = document.createElement('th');
            th.scope = 'row';
            th.colSpan = 2;
            th.textContent = k;
            row.appendChild(th);
            cell(row, ms(se2t[k]), 'n=' + se2t.n);
            cell(row, ms(t2a[k]), 'n=' + t2a.n);
            cell(row, ms(a2p[k]), 'n=' + a2p.n);
            cell(row, ms(tot[k]), 'n=' + tot.n);
            cell(row, '');
            cell(row, k === 'p50' ? (interrupted + ' of ' + turns.length) : '');
            foot.appendChild(row);
        });
    }

    function poll() {
        if (document.hidden) return;
        getJson('/conversation/api/ai-status').then(function (st) {
            if (!st || st.success === false) {
                setText('convUpdatedAt', 'ai-status failed: ' + ((st && st.error) || 'no answer'));
                return;
            }
            renderStatus(st);
        }).catch(function (e) {
            setText('convUpdatedAt', 'ai-status unreachable (' + e.message + '); retrying');
        });
    }

    // ------------------------------------------------------------ lurk prefs
    function reflectWakeSleep(lurkState, agentLive) {
        var wake = $('lurkWakeBtn');
        var sleep = $('lurkSleepBtn');
        if (!wake || !sleep) return;
        var bound = state.lurk ? state.lurk.bound !== false : true;
        var awake = lurkState === 'awake' || agentLive === true;
        wake.disabled = state.busy || !bound || awake;
        sleep.disabled = state.busy || !bound || !awake;
        wake.setAttribute('data-server-state', lurkState || '');
        sleep.setAttribute('data-server-state', lurkState || '');
    }

    function renderLurk(ls) {
        state.lurk = ls;
        var status = $('lurkPrefsStatus');
        var form = $('lurkPrefsForm');
        var inputs = form ? form.querySelectorAll('input, button') : [];
        var bound = ls && ls.success !== false && ls.bound !== false && ls.prefs;
        for (var i = 0; i < inputs.length; i++) inputs[i].disabled = !bound;
        if (!bound) {
            if (status) {
                status.textContent = (ls && ls.bound === false)
                    ? 'This node does not animate this character, so it has no lurk state here. Open this page on that character\'s own node.'
                    : 'Lurk state unavailable: ' + ((ls && ls.error) || 'no answer');
            }
            reflectWakeSleep(ls ? ls.state : null, ls ? ls.agentLive : false);
            return;
        }
        if (status) {
            var hold = ls.eventHold ? ' Held for a fleet event (' + (ls.eventHold.reason || 'event') + ').' : '';
            status.textContent = 'State: ' + String(ls.state).toUpperCase() +
                (ls.wake && ls.state === 'awake' ? ' (woken by ' + (ls.wake.source || '?') + ')' : '') + '.' + hold;
        }
        if (!state.prefsDirty) {
            var p = ls.prefs;
            var inact = $('lurkInactivitySec');
            if (inact) inact.value = Math.round((Number(p.inactivityTimeoutMs) || 0) / 1000);
            var pir = $('lurkPirWake');
            if (pir) pir.checked = p.pirWake !== false;
            renderOptOut(ls.capabilities || {}, Array.isArray(p.capabilityOptOut) ? p.capabilityOptOut : []);
        }
        reflectWakeSleep(ls.state, ls.agentLive);
    }

    function renderOptOut(caps, optedOut) {
        var list = $('lurkOptOutList');
        if (!list) return;
        list.innerHTML = '';
        var shown = 0;
        OPTABLE.forEach(function (name) {
            if (!caps[name]) return;
            shown++;
            var isOut = optedOut.indexOf(name) >= 0;
            var cap = caps[name];
            var label = document.createElement('label');
            label.className = 'mb-check';
            var box = document.createElement('input');
            box.type = 'checkbox';
            box.className = 'lurk-optout';
            box.value = name;
            box.checked = isOut;
            box.title = 'Keep ' + (CAP_LABELS[name] || name) + ' off in AI mode on this node, without changing the character configuration';
            // A capability the hardware cannot provide cannot be opted into or out of;
            // one that is unavailable only because it is opted out stays editable.
            if (!cap.available && !isOut) box.disabled = true;
            var span = document.createElement('span');
            span.className = 'mb-text-sm';
            span.textContent = (CAP_LABELS[name] || name) + (!cap.available && !isOut && cap.reason ? ' (unavailable: ' + cap.reason + ')' : '');
            label.appendChild(box);
            label.appendChild(span);
            list.appendChild(label);
        });
        if (!shown) {
            var none = document.createElement('span');
            none.className = 'mb-text-sm mb-text-muted';
            none.textContent = 'The node reports no capabilities for this character.';
            list.appendChild(none);
        }
    }

    function loadLurk() {
        return getJson('/conversation/api/lurk-state').then(renderLurk).catch(function (e) {
            renderLurk({ success: false, error: e.message });
        });
    }

    function savePrefs(ev) {
        if (ev) ev.preventDefault();
        var result = $('lurkPrefsResult');
        var secsVal = parseInt(($('lurkInactivitySec') || {}).value, 10);
        if (!isFinite(secsVal) || secsVal < 0) secsVal = 0;
        var optOut = [];
        var boxes = document.querySelectorAll('#lurkOptOutList .lurk-optout');
        for (var i = 0; i < boxes.length; i++) if (boxes[i].checked) optOut.push(boxes[i].value);
        var body = {
            inactivityTimeoutMs: secsVal * 1000,
            pirWake: !!($('lurkPirWake') || {}).checked,
            capabilityOptOut: optOut
        };
        if (result) result.textContent = 'Saving…';
        postJson('/conversation/api/lurk-state/prefs', body).then(function (j) {
            if (j && j.success) {
                state.prefsDirty = false;
                if (result) result.textContent = 'Saved.';
            } else if (result) {
                result.textContent = 'Not saved: ' + ((j && j.error) || ('HTTP ' + (j && j._status)));
            }
            return loadLurk();
        }).catch(function (e) {
            if (result) result.textContent = 'Not saved: ' + e.message;
        });
    }

    function wakeOrSleep(which) {
        var result = $('lurkPrefsResult');
        state.busy = true;
        reflectWakeSleep(state.lurk ? state.lurk.state : null, state.lurk ? state.lurk.agentLive : false);
        if (result) result.textContent = which === 'wake' ? 'Waking…' : 'Going to sleep…';
        var req = which === 'wake'
            ? postJson('/conversation/api/wake', { source: 'ai-settings', explicit: true })
            : postJson('/conversation/api/sleep', {});
        req.then(function (j) {
            if (result) result.textContent = (j && j.success) ? (which === 'wake' ? 'Awake.' : 'Lurking.') : ('Refused: ' + ((j && j.error) || ('HTTP ' + (j && j._status))));
        }).catch(function (e) {
            if (result) result.textContent = 'Failed: ' + e.message;
        }).then(function () {
            state.busy = false;
            loadLurk();
            poll();
        });
    }

    function init() {
        var panel = $('conversationLivePanel');
        if (!panel) return;
        state.characterId = panel.getAttribute('data-character-id') || null;

        var form = $('lurkPrefsForm');
        if (form) {
            form.addEventListener('submit', savePrefs);
            form.addEventListener('change', function () { state.prefsDirty = true; });
            form.addEventListener('input', function () { state.prefsDirty = true; });
        }
        var wake = $('lurkWakeBtn');
        if (wake) wake.addEventListener('click', function () { wakeOrSleep('wake'); });
        var sleep = $('lurkSleepBtn');
        if (sleep) sleep.addEventListener('click', function () { wakeOrSleep('sleep'); });

        poll();
        loadLurk();
        state.timer = setInterval(function () {
            poll();
            // Lurk state rides the same cadence so Wake/Sleep and the hold notice
            // stay true; unsaved edits in the form are never overwritten.
            if (!document.hidden) loadLurk();
        }, POLL_MS);
        document.addEventListener('visibilitychange', function () { if (!document.hidden) { poll(); loadLurk(); } });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
