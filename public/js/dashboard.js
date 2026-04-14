/* ==========================================================================
   MonsterBox Dashboard — combined client script
   --------------------------------------------------------------------------
   Extracted from views/conversation/index.ejs in v8.1.1. Zero EJS template
   directives — pure JavaScript — so this is a byte-for-byte lift with three
   section banners inserted between the original blocks.

   Three sections:
     1) Main dashboard FSM — chat, lurk mode, webcam, head tracking, scenes,
        poses, manual controls init, activity polling, panel sortable.
     2) Browser Audio Bridge — Listen In (SSE) + Talk Through (mic).
     3) Phase 3 Operator Command Bar wiring — mirrored Loop buttons, badge
        is-active sync, PANIC handler + double-Esc shortcut, character avatar
        image swap-in.
   ========================================================================== */

/* -- SECTION 1: main dashboard FSM ---------------------------------------- */
  (function () {
    const ui = {
      sayStatus: null,
      jawToggle: null,
      headTrackToggle: null,
      parrotToggle: null,
      idleToggle: null,
      chatModeToggle: null,
      chatInput: null,
      chatSendBtn: null,
    };

    // Unified input mode: 'ask' = AI conversation, 'say' = TTS exact text
    var chatMode = 'ask';

    let currentCharacterId = null;
    let speakers = [];
    let selectedSpeakerPartId = null;

    // Chat panel state
    let chatWs = null;
    let chatConnected = false;
    let chatAgentId = null;
    let chatVUTimer = null;
    let _lastAgentText = '';
    let _pendingChatMessage = null;
    let _audioPlaybackEnabled = true;
    let _conversationReady = false;
    let _lastPartialEl = null;
    let chatSpeakerPartId = null;

    // Mic transcript deduplication (stt_committed + user_transcript can fire for same text)
    var _recentMicTexts = [];
    var _recentMicTextMaxAge = 3000;

    // Parrot Mode
    var parrotEnabled = false;
    var lastParrotAt = 0;
    function parrotSay(text) {
      var t = (text || '').trim();
      if (!t) return;
      var now = Date.now();
      if (now - lastParrotAt < 800) {
        console.log('[Parrot] Throttled — too soon since last parrot');
        return;
      }
      lastParrotAt = now;
      var spkId = chatSpeakerPartId || selectedSpeakerPartId || undefined;
      console.log('[Parrot] Saying: "' + t.slice(0, 80) + '" via speaker=' + spkId);
      ui.sayStatus.innerHTML = '<span class="text-info">Parrot: "' + t.replace(/</g, '&lt;').slice(0, 140) + '"</span>';
      fetch('/conversation/api/say', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: t, speakerPartId: spkId })
      })
      .then(function(r) { return r.json(); })
      .then(function(j) {
        if (j && j.success) {
          console.log('[Parrot] Success');
          ui.sayStatus.innerHTML = '<span class="text-success">Parrot spoke</span>';
        } else {
          var errMsg = (j && j.error) || 'unknown';
          console.error('[Parrot] Failed:', errMsg);
          ui.sayStatus.innerHTML = '<span class="text-danger">Parrot failed: ' + errMsg.replace(/</g, '&lt;').slice(0, 100) + '</span>';
        }
      })
      .catch(function(e) {
        console.error('[Parrot] Error:', e);
        ui.sayStatus.innerHTML = '<span class="text-danger">Parrot error: ' + ((e && e.message) || '').replace(/</g, '&lt;').slice(0, 100) + '</span>';
      });
    }
    try { window.__parrotSay = parrotSay; } catch (e) { }


    // Browser PCM audio player for AI speech output
    const BrowserAudioPlayer = (() => {
      let audioCtx = null;
      let isEnabled = false;
      let nextStartTime = 0;
      const SAMPLE_RATE = 16000;

      function enable() {
        if (!audioCtx) {
          audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SAMPLE_RATE });
        }
        if (audioCtx.state === 'suspended') audioCtx.resume();
        isEnabled = true;
        nextStartTime = 0;
      }

      function disable() {
        isEnabled = false;
        nextStartTime = 0;
      }

      function playChunk(base64Pcm) {
        if (!isEnabled || !audioCtx) return;
        const raw = atob(base64Pcm);
        const bytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
        const samples = bytes.length / 2;
        if (samples === 0) return;
        const float32 = new Float32Array(samples);
        const view = new DataView(bytes.buffer);
        for (let i = 0; i < samples; i++) {
          float32[i] = view.getInt16(i * 2, true) / 32768;
        }
        const buffer = audioCtx.createBuffer(1, samples, SAMPLE_RATE);
        buffer.getChannelData(0).set(float32);
        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(audioCtx.destination);
        const now = audioCtx.currentTime;
        if (nextStartTime < now) nextStartTime = now;
        source.start(nextStartTime);
        nextStartTime += buffer.duration;
      }

      function reset() { nextStartTime = 0; }

      return { enable, disable, playChunk, reset, isEnabled: () => isEnabled };
    })();

    // Browser microphone capture and streaming
    const BrowserMicCapture = (() => {
      let stream = null;
      let micAudioCtx = null;
      let processor = null;
      let isActive = false;
      const TARGET_RATE = 16000;

      async function start() {
        if (isActive) return;

        // Check browser support — getUserMedia requires HTTPS or localhost
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          const isSecure = window.isSecureContext || window.location.protocol === 'https:' || window.location.hostname === 'localhost';
          if (!isSecure) {
            throw new Error('Browser mic requires HTTPS. Access this page via https:// or localhost.');
          }
          throw new Error('Browser does not support getUserMedia');
        }

        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: { ideal: 16000 }
          }
        });

        micAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const source = micAudioCtx.createMediaStreamSource(stream);
        processor = micAudioCtx.createScriptProcessor(4096, 1, 1);
        const nativeRate = micAudioCtx.sampleRate;

        processor.onaudioprocess = function (e) {
          if (!isActive || !chatWs || chatWs.readyState !== WebSocket.OPEN) return;
          const input = e.inputBuffer.getChannelData(0);
          const ratio = nativeRate / TARGET_RATE;
          const outputLen = Math.floor(input.length / ratio);
          const pcm16 = new Int16Array(outputLen);
          for (let i = 0; i < outputLen; i++) {
            const srcIdx = Math.floor(i * ratio);
            pcm16[i] = Math.max(-32768, Math.min(32767, Math.round(input[srcIdx] * 32768)));
          }
          const byteArr = new Uint8Array(pcm16.buffer);
          let binary = '';
          for (let j = 0; j < byteArr.length; j++) {
            binary += String.fromCharCode(byteArr[j]);
          }
          try {
            chatWs.send(JSON.stringify({ type: 'browser_audio_chunk', audio: btoa(binary) }));
          } catch (_) {}
        };

        source.connect(processor);
        processor.connect(micAudioCtx.destination);
        isActive = true;
      }

      function stop() {
        isActive = false;
        if (processor) { try { processor.disconnect(); } catch (_) {} processor = null; }
        if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
        if (micAudioCtx) { try { micAudioCtx.close(); } catch (_) {} micAudioCtx = null; }
      }

      return { start, stop, isActive: () => isActive };
    })();

    function $(id) { return document.getElementById(id); }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    // ─── Lurk Mode State ────────────────────────────────────
    let lurkModeActive = false;
    let lurkActivating = false;
    let lurkSleeping = false;
    let lurkMotionPollTimer = null;
    let lurkCapabilities = { jaw: true, headTracking: true, idle: true, motionSensor: true, ai: true };

    async function toggleLurkMode() {
      const toggle = $('lurkToggle');
      if (!toggle || lurkActivating) return;
      const enabled = toggle.checked;
      const bar = $('lurkBar');
      const statusEl = $('lurkStatus');

      lurkActivating = true;
      if (bar) bar.classList.add('lurk-activating');
      if (statusEl) statusEl.textContent = enabled ? 'Activating...' : 'Deactivating...';

      try {
        // Call the server-side lurk mode endpoint (handles jaw, head tracking, random poses)
        const r = await fetch('/conversation/api/lurk-mode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled })
        });
        const j = await r.json();

        if (j && j.success) {
          lurkModeActive = enabled;

          // Sync UI toggles with lurk state
          if (ui.jawToggle) ui.jawToggle.checked = enabled;
          if (ui.headTrackToggle) ui.headTrackToggle.checked = enabled;
          if (ui.idleToggle) {
            ui.idleToggle.checked = enabled;
            // Trigger idle start/stop
            try {
              var idleEndpoint = enabled ? '/api/movement/idle/start' : '/api/movement/idle/stop';
              fetch(idleEndpoint, { method: 'POST' }).catch(function () {});
            } catch (_) {}
          }

          // Start/stop AI chat
          const aiToggle = $('chatAiOnToggle');
          if (enabled) {
            if (aiToggle && !aiToggle.checked) {
              aiToggle.checked = true;
              _audioPlaybackEnabled = true;
              connectChatWebSocket();
            }
            startHeadTrackPolling();
          } else {
            if (aiToggle && aiToggle.checked) {
              aiToggle.checked = false;
              disconnectChat();
            }
            stopHeadTrackPolling();
          }

          // Update lurk UI
          lurkSleeping = false;
          updateLurkUI(enabled, j.results);
          if (statusEl) statusEl.textContent = enabled ? 'Active — Character is alive' : 'Off';

          // Start/stop motion status polling and activity badge polling
          if (enabled) { startLurkMotionPolling(); startActivityPolling(); }
          else { stopLurkMotionPolling(); stopActivityPolling(); }
        } else {
          toggle.checked = !enabled;
          if (statusEl) statusEl.textContent = 'Failed: ' + (j.error || 'Unknown');
        }
      } catch (e) {
        toggle.checked = !enabled;
        if (statusEl) statusEl.textContent = 'Error: ' + (e.message || '');
      } finally {
        lurkActivating = false;
        if (bar) bar.classList.remove('lurk-activating');
      }
    }

    function updateLurkUI(active, results) {
      const bar = $('lurkBar');
      if (bar) {
        bar.classList.toggle('lurk-active', active && !lurkSleeping);
        bar.classList.toggle('lurk-sleeping', active && lurkSleeping);
      }

      const badges = {
        AI: $('lurkBadgeAI'),
        Jaw: $('lurkBadgeJaw'),
        Head: $('lurkBadgeHead'),
        Idle: $('lurkBadgeIdle'),
        Motion: $('lurkBadgeMotion')
      };

      if (active && results) {
        const awake = !lurkSleeping;
        setBadge(badges.AI, awake); // AI is started client-side
        setBadge(badges.Jaw, awake && results.jaw && results.jaw.enabled);
        setBadge(badges.Head, awake && results.headTracking && results.headTracking.enabled);
        setBadge(badges.Idle, awake && results.randomPose && results.randomPose.enabled);
        setBadge(badges.Motion, results.motionSensor && results.motionSensor.enabled);
      } else {
        Object.values(badges).forEach(b => setBadge(b, false));
      }

      // Update status text for sleep state
      const statusEl = $('lurkStatus');
      if (active && lurkSleeping && statusEl) {
        statusEl.textContent = 'Sleeping — Waiting for motion...';
      }
    }

    function setBadge(el, on) {
      if (!el) return;
      el.classList.remove('lurk-badge-on', 'lurk-badge-error', 'lurk-badge-active');
      if (on) el.classList.add('lurk-badge-on');
    }

    // Real-time activity polling — green flash when hardware is firing
    var activityPollTimer = null;
    function startActivityPolling() {
      if (activityPollTimer) return;
      activityPollTimer = setInterval(pollActivity, 1000);
    }
    function stopActivityPolling() {
      if (activityPollTimer) { clearInterval(activityPollTimer); activityPollTimer = null; }
      // Clear all active badges
      ['lurkBadgeAI', 'lurkBadgeJaw', 'lurkBadgeHead', 'lurkBadgeIdle', 'lurkBadgeMotion'].forEach(function (id) {
        var el = $(id);
        if (el) el.classList.remove('lurk-badge-active');
      });
    }
    async function pollActivity() {
      try {
        var r = await fetch('/conversation/api/lurk-mode/activity-status');
        var j = await r.json();
        if (!j || !j.activity) return;
        var map = { lurkBadgeJaw: 'jaw', lurkBadgeHead: 'head', lurkBadgeIdle: 'idle', lurkBadgeMotion: 'motion', lurkBadgeAI: 'ai' };
        Object.entries(map).forEach(function (kv) {
          var el = $(kv[0]);
          if (!el) return;
          if (j.activity[kv[1]]) {
            el.classList.add('lurk-badge-active');
          } else {
            el.classList.remove('lurk-badge-active');
          }
        });
      } catch (_) {}
    }

    async function loadLurkCapabilities() {
      try {
        const r = await fetch('/conversation/api/lurk-mode/capabilities');
        const j = await r.json();
        if (j && j.success && j.capabilities) {
          lurkCapabilities = j.capabilities;
          // Mark unavailable badges
          const map = {
            lurkBadgeJaw: 'jaw',
            lurkBadgeHead: 'headTracking',
            lurkBadgeIdle: 'idle',
            lurkBadgeMotion: 'motionSensor',
            lurkBadgeAI: 'ai'
          };
          Object.entries(map).forEach(([elId, cap]) => {
            const el = $(elId);
            if (!el) return;
            if (!lurkCapabilities[cap]) {
              el.classList.add('lurk-badge-unavailable');
              el.title = el.title + ' (not available for this character)';
            } else {
              el.classList.remove('lurk-badge-unavailable');
            }
          });
        }
      } catch { /* ignore */ }
    }

    async function loadLurkState() {
      await loadLurkCapabilities();
      try {
        const r = await fetch('/conversation/api/lurk-mode');
        const j = await r.json();
        if (j && j.success && j.enabled) {
          const toggle = $('lurkToggle');
          if (toggle) toggle.checked = true;
          lurkModeActive = true;
          lurkSleeping = !!j.sleeping;
          updateLurkUI(true, j.motionWatcher ? { motionSensor: { enabled: j.motionWatcher.active } } : null);
          const statusEl = $('lurkStatus');
          if (statusEl) {
            statusEl.textContent = lurkSleeping
              ? 'Sleeping — Waiting for motion...'
              : 'Active — Character is alive';
          }
          startLurkMotionPolling();
          startActivityPolling();
        }
      } catch { /* ignore */ }
    }

    // ─── Lurk Motion Polling ──────────────────────────────────
    // Polls the motion watcher status to detect sleep/wake transitions
    // and update the dashboard in real-time.
    function startLurkMotionPolling() {
      stopLurkMotionPolling();
      lurkMotionPollTimer = setInterval(pollLurkMotionStatus, 3000);
    }

    function stopLurkMotionPolling() {
      if (lurkMotionPollTimer) {
        clearInterval(lurkMotionPollTimer);
        lurkMotionPollTimer = null;
      }
    }

    async function pollLurkMotionStatus() {
      if (!lurkModeActive) { stopLurkMotionPolling(); return; }
      try {
        const r = await fetch('/conversation/api/lurk-mode/motion-status');
        const j = await r.json();
        if (!j.success) return;

        const wasSleeping = lurkSleeping;
        lurkSleeping = !!j.sleeping;

        if (wasSleeping && !lurkSleeping) {
          // Woke up from motion! Re-enable client-side features
          const aiToggle = $('chatAiOnToggle');
          if (aiToggle && !aiToggle.checked) {
            aiToggle.checked = true;
            _audioPlaybackEnabled = true;
            connectChatWebSocket();
          }
          if (ui.jawToggle) ui.jawToggle.checked = true;
          if (ui.headTrackToggle) ui.headTrackToggle.checked = true;
          if (ui.idleToggle) {
            ui.idleToggle.checked = true;
            fetch('/api/movement/idle/start', { method: 'POST' }).catch(function () {});
          }
          startHeadTrackPolling();
          updateLurkUI(true, { jaw: { enabled: true }, headTracking: { enabled: true }, randomPose: { enabled: true }, motionSensor: { enabled: true } });
          const statusEl = $('lurkStatus');
          if (statusEl) statusEl.textContent = 'Active — Character is alive';
        } else if (!wasSleeping && lurkSleeping) {
          // Just fell asleep — disable client-side features
          const aiToggle = $('chatAiOnToggle');
          if (aiToggle && aiToggle.checked) {
            aiToggle.checked = false;
            disconnectChat();
          }
          if (ui.jawToggle) ui.jawToggle.checked = false;
          if (ui.headTrackToggle) ui.headTrackToggle.checked = false;
          if (ui.idleToggle) {
            ui.idleToggle.checked = false;
            fetch('/api/movement/idle/stop', { method: 'POST' }).catch(function () {});
          }
          stopHeadTrackPolling();
          updateLurkUI(true, { motionSensor: { enabled: true } });
          const statusEl = $('lurkStatus');
          if (statusEl) statusEl.textContent = 'Sleeping — Waiting for motion...';
        }
      } catch { /* ignore poll errors */ }
    }

    // Notify server of speech/chat activity to reset inactivity timer
    function notifyLurkActivity() {
      if (!lurkModeActive) return;
      fetch('/conversation/api/lurk-mode/activity', { method: 'POST' }).catch(function () {});
    }

    // ─── Panel Drag-Sort ──────────────────────────────────────
    function initPanelDragSort() {
      var accordion = document.getElementById('dashboardAccordion');
      if (!accordion) return;
      var dragItem = null;

      // Load saved order
      try {
        var saved = localStorage.getItem('mb_panel_order');
        if (saved) {
          var order = JSON.parse(saved);
          var items = Array.from(accordion.querySelectorAll('.accordion-item[data-panel-id]'));
          var itemMap = {};
          items.forEach(function (el) { itemMap[el.getAttribute('data-panel-id')] = el; });
          order.forEach(function (id) {
            if (itemMap[id]) accordion.appendChild(itemMap[id]);
          });
        }
      } catch (_) {}

      // Setup drag events on each accordion item
      accordion.querySelectorAll('.accordion-item[data-panel-id]').forEach(function (item) {
        item.setAttribute('draggable', 'true');

        // Only allow drag from the grip handle
        item.addEventListener('dragstart', function (e) {
          var handle = e.target.closest('.panel-drag-handle');
          if (!handle) { e.preventDefault(); return; }
          dragItem = item;
          item.style.opacity = '0.5';
          e.dataTransfer.effectAllowed = 'move';
        });

        item.addEventListener('dragend', function () {
          item.style.opacity = '';
          dragItem = null;
          // Remove all drop indicators
          accordion.querySelectorAll('.accordion-item').forEach(function (el) { el.style.borderTop = ''; });
        });

        item.addEventListener('dragover', function (e) {
          if (!dragItem || dragItem === item) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          item.style.borderTop = '2px solid #6f42c1';
        });

        item.addEventListener('dragleave', function () {
          item.style.borderTop = '';
        });

        item.addEventListener('drop', function (e) {
          e.preventDefault();
          item.style.borderTop = '';
          if (!dragItem || dragItem === item) return;
          accordion.insertBefore(dragItem, item);
          savePanelOrder();
        });
      });

      function savePanelOrder() {
        var order = [];
        accordion.querySelectorAll('.accordion-item[data-panel-id]').forEach(function (el) {
          order.push(el.getAttribute('data-panel-id'));
        });
        try { localStorage.setItem('mb_panel_order', JSON.stringify(order)); } catch (_) {}
      }
    }

    async function init() {
      ui.sayStatus = $('sayStatus');
      ui.jawToggle = $('jawToggle');
      ui.headTrackToggle = $('headTrackToggle');
      ui.parrotToggle = $('parrotToggle');
      ui.idleToggle = $('idleToggle');
      ui.chatModeToggle = $('chatModeToggle');
      ui.chatInput = $('chatInput');
      ui.chatSendBtn = $('chatSendBtn');
      currentCharacterId = getCurrentCharacterIdFromLabel();

      setCharName();
      bindEvents();
      await loadSpeakers();
      await initChat();

      await loadWebcam();
      await loadJawSettings();
      await loadHeadTrackStatus();
      await loadMotionSensorStatus();
      await loadLurkState();
      await loadScenes();
      await loadPoses();

      if (typeof ManualControls !== 'undefined') {
        await ManualControls.init({ characterId: currentCharacterId });
      }

      // Initialize Bootstrap tooltips
      document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(el => new bootstrap.Tooltip(el));

      // Bind Lurk Mode toggle
      const lurkToggle = $('lurkToggle');
      if (lurkToggle) lurkToggle.addEventListener('change', toggleLurkMode);

      // Initialize panel drag-sort
      initPanelDragSort();
    }

    function setCharName() {
      const label = document.querySelector('#charLabel');
      const nameEl = $('charName');
      if (label && nameEl) nameEl.textContent = label.textContent || 'Character';
    }

    function getCurrentCharacterIdFromLabel() {
      // Prefer server-provided character ID from master layout
      if (window.__MB_CHAR_ID) { const n = parseInt(window.__MB_CHAR_ID, 10); if (Number.isFinite(n)) return n; }
      const label = document.querySelector('#charLabel');
      if (!label) return null;
      const idAttr = label.getAttribute('data-char-id');
      const parsed = parseInt(idAttr, 10);
      return Number.isFinite(parsed) ? parsed : null;
    }

    async function refreshPageState() {
      setCharName();
      await loadSpeakers();
      await loadWebcam();
      await loadJawSettings();
      await loadHeadTrackStatus();
      await loadLurkCapabilities();
      await loadScenes();
      await loadPoses();

      // Update chat panel for new character
      const chatCharNameEl = $('chatCharacterName');
      const label = document.querySelector('#charLabel');
      if (chatCharNameEl && label) chatCharNameEl.textContent = label.textContent?.trim() || 'Character';
      chatAgentId = await getCharacterAgentId();

      if (typeof ManualControls !== 'undefined') {
        await ManualControls.reload(currentCharacterId);
      }
    }

    function bindEvents() {
      // Unified input mode toggle
      if (ui.chatModeToggle) {
        ui.chatModeToggle.addEventListener('click', function () {
          chatMode = chatMode === 'ask' ? 'say' : 'ask';
          updateChatModeUI();
        });
      }

      ui.jawToggle && ui.jawToggle.addEventListener('change', saveJawSettings);
      ui.headTrackToggle && ui.headTrackToggle.addEventListener('change', saveHeadTrackSettings);

      ui.parrotToggle && ui.parrotToggle.addEventListener('change', function () {
        parrotEnabled = !!ui.parrotToggle.checked;
        // Notify server to suppress ConvAI audio during parrot mode
        if (chatWs && chatWs.readyState === WebSocket.OPEN) {
          chatWs.send(JSON.stringify({ type: 'set_parrot_mode', enabled: parrotEnabled }));
        }
        // Auto-start AI On when parrot is enabled (single-click parrot)
        const aiToggle = $('chatAiOnToggle');
        if (parrotEnabled && (!chatWs || !chatConnected)) {
          if (aiToggle && !aiToggle.checked) aiToggle.checked = true;
          _audioPlaybackEnabled = true;
          connectChatWebSocket();
        }
      });

      // Mute Speaker toggle
      const muteToggle = $('speakerMuteToggle');
      if (muteToggle) {
        muteToggle.addEventListener('change', async function () {
          try {
            await fetch('/conversation/api/speaker-mute', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ muted: muteToggle.checked })
            });
            if (chatWs && chatConnected) {
              try { chatWs.send(JSON.stringify({ type: 'set_audio_playback', enabled: !muteToggle.checked })); } catch (_) {}
            }
          } catch (e) { console.error('Mute toggle error:', e); }
        });
      }

      // Idle movement toggle
      if (ui.idleToggle) {
        ui.idleToggle.addEventListener('change', async function () {
          const enabled = ui.idleToggle.checked;
          try {
            const endpoint = enabled ? '/api/movement/idle/start' : '/api/movement/idle/stop';
            const r = await fetch(endpoint, { method: 'POST' });
            const j = await r.json();
            if (!j.success) {
              ui.idleToggle.checked = !enabled;
              console.error('Idle toggle error:', j.error);
            }
            // Update lurk badge
            const badge = $('lurkBadgeIdle');
            if (badge) {
              badge.classList.toggle('lurk-badge-active', enabled);
            }
          } catch (e) {
            ui.idleToggle.checked = !enabled;
            console.error('Idle toggle error:', e);
          }
        });
      }

      // Motion sensor toggle
      const motionToggle = $('motionSensorToggle');
      if (motionToggle) {
        motionToggle.addEventListener('change', async function () {
          var enabled = motionToggle.checked;
          try {
            var r = await fetch('/conversation/api/motion-sensor', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ enabled: enabled })
            });
            var j = await r.json();
            if (!j.success) {
              motionToggle.checked = !enabled;
              console.error('Motion sensor toggle error:', j.error);
            }
          } catch (e) {
            motionToggle.checked = !enabled;
            console.error('Motion sensor toggle error:', e);
          }
        });
      }

      const loopBtn = $('btnLoopAll');
      const stopLoopBtn = $('btnStopLoop');
      if (loopBtn) loopBtn.addEventListener('click', loopAllScenes);
      if (stopLoopBtn) stopLoopBtn.addEventListener('click', stopLoop);

      // Stop All Audio button
      const stopAllAudioBtn = $('stopAllAudioBtn');
      if (stopAllAudioBtn) {
        stopAllAudioBtn.addEventListener('click', async () => {
          stopAllAudioBtn.disabled = true;
          stopAllAudioBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Stopping...';
          try {
            await fetch('/api/audio/stop-all', { method: 'POST' });
          } catch (e) { console.error('Stop all audio error:', e); }
          stopAllAudioBtn.disabled = false;
          stopAllAudioBtn.innerHTML = '<i class="bi bi-stop-circle"></i> Stop Audio';
        });
      }

      // Chat panel events
      bindChatEvents();
    }

    // ─── Chat Panel ──────────────────────────────────────────

    async function initChat() {
      // Resolve character name
      const label = document.querySelector('#charLabel');
      const chatCharNameEl = $('chatCharacterName');
      if (label && chatCharNameEl) {
        const name = (label.textContent || '').trim();
        if (name && name !== 'No Character') {
          chatCharNameEl.textContent = name;
        }
      }

      // Get agent ID for character
      if (currentCharacterId) {
        chatAgentId = await getCharacterAgentId();
      }

      // Load mute state
      try {
        const muteResp = await fetch('/conversation/api/speaker-mute');
        const muteJson = await muteResp.json();
        if (muteJson && muteJson.success) {
          const featureMute = $('speakerMuteToggle');
          if (featureMute) featureMute.checked = !!muteJson.muted;
        }
      } catch (_) {}

      // Poll for character changes (10 second interval)
      setInterval(async () => {
        try {
          const resp = await fetch('/setup/characters/api/current');
          const j = await resp.json();
          const newId = j && j.selectedCharacter ? parseInt(j.selectedCharacter, 10) : null;
          if (newId && newId !== currentCharacterId) {
            const newName = (j && j.characterName) ? j.characterName : ('Character ' + newId);
            currentCharacterId = newId;
            if (chatCharNameEl) chatCharNameEl.textContent = newName;
            chatAgentId = await getCharacterAgentId();
            if (chatWs && chatConnected) {
              try { chatWs.close(); } catch (_) {}
              chatWs = null;
              chatConnected = false;
              _conversationReady = false;
              appendChatMessage('System', 'Character changed to ' + newName + '. Reconnecting...');
              setTimeout(() => connectChatWebSocket(), 1000);
            }
          }
        } catch (_) {}
      }, 10000);
    }


    async function getCharacterAgentId() {
      if (!currentCharacterId) return null;
      try {
        var r = await fetch('/setup/characters/api/characters/' + currentCharacterId);
        var j = await r.json();
        return (j && j.character && (j.character.elevenLabsAgentId || j.character.agentId)) || null;
      } catch (_) { return null; }
    }

    function connectChatWebSocket() {
      if (chatWs && chatConnected) return;
      _conversationReady = false;

      if (!chatAgentId && !parrotEnabled) {
        appendChatMessage('System', 'No AI agent assigned to this character.');
        const toggle = $('chatAiOnToggle');
        if (toggle) toggle.checked = false;
        return;
      }

      const isSecure = window.location.protocol === 'https:';
      const wsProto = isSecure ? 'wss:' : 'ws:';
      const wsUrl = isSecure
        ? (wsProto + '//' + window.location.host + '/ai-chat')
        : (wsProto + '//' + window.location.hostname + ':' + (document.body.getAttribute('data-ws-port') || '8795'));

      try {
        chatWs = new WebSocket(wsUrl);

        chatWs.onopen = () => {
          chatConnected = true;
          appendChatMessage('System', 'Connected to AI service');

          if (currentCharacterId) {
            chatWs.send(JSON.stringify({ type: 'set_character', characterId: currentCharacterId }));
          }
          const useBrowserMic = $('chatBrowserMic');
          chatWs.send(JSON.stringify({ type: 'set_mic_source', source: (useBrowserMic && useBrowserMic.checked) ? 'browser' : 'server' }));
          const featureMute = $('speakerMuteToggle');
          const isMuted = featureMute && featureMute.checked;
          chatWs.send(JSON.stringify({ type: 'set_audio_playback', enabled: !isMuted && _audioPlaybackEnabled }));
          const browserSpeaker = $('chatBrowserSpeaker');
          if (browserSpeaker && browserSpeaker.checked) {
            chatWs.send(JSON.stringify({ type: 'set_output_mode', mode: 'local' }));
            BrowserAudioPlayer.enable();
          }
          if (chatSpeakerPartId) {
            chatWs.send(JSON.stringify({ type: 'set_speaker_part', speakerPartId: chatSpeakerPartId }));
          }
          if (parrotEnabled) {
            chatWs.send(JSON.stringify({ type: 'set_parrot_mode', enabled: true }));
          }
          if (chatAgentId) {
            chatWs.send(JSON.stringify({ type: 'start_conversation', agentId: chatAgentId }));
          } else if (parrotEnabled) {
            // No agent — start transcription-only mode for parrot
            chatWs.send(JSON.stringify({ type: 'start_transcription_only' }));
            appendChatMessage('System', 'Parrot mode active (transcription only)');
          }
        };

        chatWs.onmessage = (ev) => {
          try {
            const msg = JSON.parse(ev.data);
            if (msg) handleChatMessage(msg);
          } catch (e) { console.error('Chat WS parse error:', e); }
        };

        chatWs.onclose = () => {
          chatConnected = false;
          _conversationReady = false;
          chatWs = null;
          try { BrowserMicCapture.stop(); } catch (_) {}
        };

        chatWs.onerror = () => {
          chatConnected = false;
          _conversationReady = false;
        };
      } catch (e) {
        console.error('Chat WS connect error:', e);
      }
    }

    function handleChatMessage(msg) {
      if (msg.type === 'audio_chunk') {
        if (msg.audio) BrowserAudioPlayer.playChunk(msg.audio);
        return;
      }
      if (msg.type === 'audio_level') {
        updateVUMeter(msg.level || 0);
        return;
      }
      if (msg.type === 'transcription_started') {
        // Transcription-only mode started (parrot without agent)
        return;
      }
      if (msg.type === 'transcription_stopped') {
        return;
      }
      if (msg.type === 'conversation_started') {
        _conversationReady = true;
        appendChatMessage('System', 'Conversation started');
        if (_pendingChatMessage) {
          const pending = _pendingChatMessage;
          _pendingChatMessage = null;
          if (chatWs && chatConnected) chatWs.send(JSON.stringify({ type: 'send_message', text: pending }));
        }
        return;
      }
      if (msg.type === 'conversation_ended') {
        _conversationReady = false;
        appendChatMessage('System', 'Conversation ended');
        return;
      }
      if (msg.type === 'error') {
        appendChatMessage('System', 'Error: ' + (msg.message || msg.error || 'Unknown'));
        return;
      }
      if (msg.type === 'interruption') {
        _lastPartialEl = null;
        BrowserAudioPlayer.reset();
        return;
      }
      if (msg.type === 'agent_response' || msg.type === 'agent_response_event') {
        let text = '';
        if (msg.agent_response_event && msg.agent_response_event.agent_response) {
          text = msg.agent_response_event.agent_response;
        } else if (msg.agent_response) {
          text = msg.agent_response;
        } else if (msg.text) {
          text = msg.text;
        }
        if (!text || text === 'Audio response' || text === 'Text response') return;
        if (text === _lastAgentText) return;
        _lastAgentText = text;
        appendChatMessage('AI', text);
      }
      else if (msg.type === 'user_transcript' && msg.user_transcription_event) {
        const userText = msg.user_transcription_event.user_transcript;
        if (userText) {
          _lastPartialEl = null;
          appendChatMessage('You (mic)', userText);
        }
      }
      else if (msg.type === 'stt_committed' && msg.text) {
        _lastPartialEl = null;
        appendChatMessage('You (mic)', msg.text);
        // Trigger parrot mode from Scribe STT
        if (parrotEnabled) {
          try { parrotSay(msg.text); } catch (_) {}
        }
      }
      else if (msg.type === 'stt_partial' && msg.text) {
        if (msg.final) return;
        updatePartialTranscript(msg.text);
      }
    }

    function appendChatMessage(sender, text) {
      const chatLog = $('chatLog');
      if (!chatLog) return;

      // Strip stage directions from AI text
      if (sender === 'AI') {
        text = text.replace(/\[.*?\]/g, '').replace(/\s{2,}/g, ' ').trim();
        if (!text) return;
      }

      // Deduplicate mic transcripts (stt_committed and user_transcript can fire for same text)
      if (sender === 'You (mic)') {
        var now = Date.now();
        _recentMicTexts = _recentMicTexts.filter(function(e) { return now - e.ts < _recentMicTextMaxAge; });
        var normalized = (text || '').toLowerCase().trim();
        for (var i = 0; i < _recentMicTexts.length; i++) {
          if (_recentMicTexts[i].text === normalized) return;
        }
        _recentMicTexts.push({ text: normalized, ts: now });
      }

      // Remove partial transcript when committing mic text
      if (sender === 'You (mic)' && _lastPartialEl && _lastPartialEl.parentNode) {
        _lastPartialEl.parentNode.removeChild(_lastPartialEl);
        _lastPartialEl = null;
      }

      // Clear placeholder
      const placeholder = chatLog.querySelector('.text-muted.text-center');
      if (placeholder) placeholder.remove();

      const time = new Date().toLocaleTimeString();
      const msgDiv = document.createElement('div');
      msgDiv.className = 'mb-1';
      const senderClass = (sender === 'You' || sender === 'You (mic)') ? 'text-info' :
        sender === 'AI' ? 'text-success' : 'text-warning';
      msgDiv.innerHTML = '<small class="text-muted">[' + time + ']</small> ' +
        '<strong class="' + senderClass + '">' + sender + ':</strong> ' +
        '<span>' + escapeHtml(text) + '</span>';

      chatLog.appendChild(msgDiv);
      chatLog.scrollTop = chatLog.scrollHeight;
    }

    function updatePartialTranscript(text) {
      const chatLog = $('chatLog');
      if (!chatLog) return;

      if (_lastPartialEl && _lastPartialEl.parentNode === chatLog) {
        const span = _lastPartialEl.querySelector('.partial-text');
        if (span) span.textContent = text;
      } else {
        const placeholder = chatLog.querySelector('.text-muted.text-center');
        if (placeholder) placeholder.remove();
        const time = new Date().toLocaleTimeString();
        const msgDiv = document.createElement('div');
        msgDiv.className = 'mb-1';
        msgDiv.innerHTML = '<small class="text-muted">[' + time + ']</small> ' +
          '<strong class="text-info">You (mic):</strong> ' +
          '<span class="partial-text" style="opacity:0.7"></span>';
        const span = msgDiv.querySelector('.partial-text');
        if (span) span.textContent = text;
        chatLog.appendChild(msgDiv);
        _lastPartialEl = msgDiv;
      }
      chatLog.scrollTop = chatLog.scrollHeight;
    }

    function updateVUMeter(level) {
      const meter = $('chatVUMeter');
      const label = $('chatVULabel');
      if (meter) {
        meter.style.width = level + '%';
        meter.setAttribute('aria-valuenow', level);
        if (level > 70) meter.className = 'progress-bar bg-danger';
        else if (level > 40) meter.className = 'progress-bar bg-warning';
        else meter.className = 'progress-bar bg-success';
      }
      if (label) label.textContent = level + '%';
      if (chatVUTimer) clearTimeout(chatVUTimer);
      chatVUTimer = setTimeout(() => {
        if (meter) { meter.style.width = '0%'; meter.setAttribute('aria-valuenow', 0); meter.className = 'progress-bar bg-success'; }
        if (label) label.textContent = '0%';
      }, 800);
    }

    function sendChatMessage() {
      const input = $('chatInput');
      if (!input) return;
      const text = input.value.trim();
      if (!text) return;

      appendChatMessage('You', text);
      input.value = '';
      notifyLurkActivity(); // Chat counts as activity

      if (chatWs && chatConnected) {
        chatWs.send(JSON.stringify({ type: 'send_message', text: text }));
      } else {
        _pendingChatMessage = text;
        _audioPlaybackEnabled = true;
        connectChatWebSocket();
      }
    }

    function disconnectChat() {
      _audioPlaybackEnabled = false;
      _conversationReady = false;
      try { BrowserMicCapture.stop(); } catch (_) {}
      if (chatWs && chatConnected) {
        try {
          chatWs.send(JSON.stringify({ type: 'set_audio_playback', enabled: false }));
          chatWs.send(JSON.stringify({ type: 'end_conversation' }));
        } catch (_) {}
        chatWs.close();
        chatWs = null;
        chatConnected = false;
      }
      appendChatMessage('System', 'AI disconnected');
    }

    function bindChatEvents() {
      // AI On toggle
      const aiToggle = $('chatAiOnToggle');
      if (aiToggle) {
        aiToggle.addEventListener('change', () => {
          if (aiToggle.checked) {
            _audioPlaybackEnabled = true;
            connectChatWebSocket();
            // Auto-enable jaw animation when AI is turned on
            if (ui.jawToggle && !ui.jawToggle.checked) {
              ui.jawToggle.checked = true;
              saveJawSettings();
            }
          } else {
            disconnectChat();
          }
        });
      }

      // Unified send — routes to chat or say based on mode
      const chatSendBtn = $('chatSendBtn');
      const chatInput = $('chatInput');
      if (chatSendBtn) chatSendBtn.addEventListener('click', handleUnifiedSend);
      if (chatInput) chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); handleUnifiedSend(); }
      });

      // Speaker select
      const speakerSelect = $('chatSpeakerSelect');
      if (speakerSelect) {
        speakerSelect.addEventListener('change', () => {
          chatSpeakerPartId = speakerSelect.value || null;
          if (chatWs && chatConnected) {
            try { chatWs.send(JSON.stringify({ type: 'set_speaker_part', speakerPartId: chatSpeakerPartId })); } catch (_) {}
          }
        });
      }


      // Browser Speaker
      const chatBrowserSpeaker = $('chatBrowserSpeaker');
      if (chatBrowserSpeaker) {
        chatBrowserSpeaker.addEventListener('change', () => {
          const statusEl = $('chatAudioStatus');
          if (chatBrowserSpeaker.checked) {
            BrowserAudioPlayer.enable();
            if (statusEl) statusEl.textContent = 'Browser speaker active';
            if (chatWs && chatConnected) {
              try { chatWs.send(JSON.stringify({ type: 'set_output_mode', mode: 'local' })); } catch (_) {}
            }
          } else {
            BrowserAudioPlayer.disable();
            if (statusEl) statusEl.textContent = '';
            if (chatWs && chatConnected) {
              try { chatWs.send(JSON.stringify({ type: 'set_output_mode', mode: 'server' })); } catch (_) {}
            }
          }
        });
      }

      // Browser Mic
      const chatBrowserMic = $('chatBrowserMic');
      if (chatBrowserMic) {
        chatBrowserMic.addEventListener('change', async () => {
          const statusEl = $('chatAudioStatus');
          if (chatBrowserMic.checked) {
            try {
              await BrowserMicCapture.start();
              if (statusEl) statusEl.textContent = 'Browser mic active';
              if (chatWs && chatConnected) {
                try { chatWs.send(JSON.stringify({ type: 'set_mic_source', source: 'browser' })); } catch (_) {}
              }
            } catch (e) {
              chatBrowserMic.checked = false;
              if (statusEl) statusEl.innerHTML = '<span class="text-danger">' + escapeHtml(e.message || String(e)) + '</span>';
              appendChatMessage('System', 'Browser mic failed: ' + (e.message || String(e)));
            }
          } else {
            BrowserMicCapture.stop();
            if (statusEl) statusEl.textContent = '';
            if (chatWs && chatConnected) {
              try { chatWs.send(JSON.stringify({ type: 'set_mic_source', source: 'server' })); } catch (_) {}
            }
          }
        });
      }
    }

    // ─── Speakers, Webcam, Settings ──────────────────────────

    async function loadSpeakers() {
      try {
        const r = await fetch('/conversation/api/speakers');
        const j = await r.json();
        if (j && j.success) {
          speakers = j.speakers || [];
          renderSpeakerSelect();
        } else {
          renderSpeakerSelect([]);
        }
      } catch {
        renderSpeakerSelect([]);
      }
    }

    function renderSpeakerSelect() {
      // Use chatSpeakerSelect as the single speaker selector
      const sel = $('chatSpeakerSelect');
      if (!sel) return;
      sel.innerHTML = '';

      if (!speakers.length) {
        sel.appendChild(new Option('Auto', ''));
        sel.disabled = true;
        return;
      }

      sel.appendChild(new Option('Auto', ''));
      speakers.forEach(sp => {
        const label = (sp.name || ('Speaker ' + sp.id)) + (sp.characterId ? (' (Char ' + sp.characterId + ')') : '');
        const opt = new Option(label, sp.id);
        sel.appendChild(opt);
      });

      selectedSpeakerPartId = speakers[0].id;
      sel.value = String(selectedSpeakerPartId);
      sel.disabled = false;
    }

    async function loadWebcam() {
      const img = $('webcamImg');
      const status = $('webcamStatus');
      const hint = $('webcamHint');

      try {
        const r = await fetch('/conversation/api/webcam-stream-url');
        const j = await r.json();

        if (j && j.success && j.url) {
          img.src = j.url + '?_=' + Date.now();
          status.textContent = 'Streaming';
          if (hint) hint.textContent = j.url;
        } else {
          status.textContent = 'No webcam configured';
        }
      } catch {
        status.textContent = 'Failed to locate webcam';
      }
    }

    let headTrackPollTimer = null;

    function updateHeadTrackBadge(state) {
      const badge = document.getElementById('headTrackStatusBadge');
      if (!badge) return;
      if (!state || !state.enabled) {
        badge.classList.add('d-none');
        badge.textContent = 'Off';
        badge.className = 'badge bg-secondary ms-2 d-none';
        return;
      }
      badge.classList.remove('d-none');
      if (state.hasTarget) {
        badge.textContent = 'Active';
        badge.className = 'badge bg-success ms-2';
      } else {
        badge.textContent = 'Searching';
        badge.className = 'badge bg-warning text-dark ms-2';
      }
    }

    function showToast(message, type) {
      const container = document.getElementById('toastContainer') || (() => {
        const c = document.createElement('div');
        c.id = 'toastContainer';
        c.className = 'toast-container position-fixed bottom-0 end-0 p-3';
        c.style.zIndex = '1090';
        document.body.appendChild(c);
        return c;
      })();
      const id = 'toast_' + Date.now();
      const bgClass = type === 'error' ? 'bg-danger' : type === 'warning' ? 'bg-warning text-dark' : 'bg-success';
      container.insertAdjacentHTML('beforeend',
        `<div id="${id}" class="toast align-items-center text-white ${bgClass} border-0" role="alert">
          <div class="d-flex"><div class="toast-body">${message}</div>
          <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div></div>`
      );
      const el = document.getElementById(id);
      if (el && bootstrap && bootstrap.Toast) {
        new bootstrap.Toast(el, { delay: 3000 }).show();
        el.addEventListener('hidden.bs.toast', () => el.remove());
      }
    }

    async function pollHeadTrackStatus() {
      try {
        const r = await fetch('/conversation/api/head-tracking-status');
        const j = await r.json();
        if (j && j.success && j.headTracking) {
          updateHeadTrackBadge({
            enabled: !!j.headTracking.enabled,
            hasTarget: !!(j.headTracking.tracking && j.headTracking.tracking.hasTarget)
          });
        }
      } catch { }
    }

    function startHeadTrackPolling() {
      stopHeadTrackPolling();
      headTrackPollTimer = setInterval(pollHeadTrackStatus, 1000);
    }

    function stopHeadTrackPolling() {
      if (headTrackPollTimer) {
        clearInterval(headTrackPollTimer);
        headTrackPollTimer = null;
      }
    }

    async function loadHeadTrackStatus() {
      try {
        const r = await fetch('/conversation/api/head-tracking-status');
        const j = await r.json();
        if (j && j.success && ui.headTrackToggle) {
          const enabled = !!(j.headTracking && j.headTracking.enabled);
          ui.headTrackToggle.checked = enabled;
          updateHeadTrackBadge({
            enabled,
            hasTarget: !!(j.headTracking && j.headTracking.tracking && j.headTracking.tracking.hasTarget)
          });
          if (enabled) startHeadTrackPolling();
        }
      } catch { }
    }

    async function saveHeadTrackSettings() {
      const enabled = !!(ui.headTrackToggle && ui.headTrackToggle.checked);
      try {
        const r = await fetch('/conversation/api/head-tracking', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled })
        });
        const j = await r.json();
        if (j && j.success) {
          showToast(enabled ? 'Head tracking enabled' : 'Head tracking disabled', 'success');
          if (enabled) {
            startHeadTrackPolling();
            updateHeadTrackBadge({ enabled: true, hasTarget: false });
          } else {
            stopHeadTrackPolling();
            updateHeadTrackBadge({ enabled: false });
          }
        } else {
          showToast('Head tracking failed: ' + (j.error || 'Unknown error'), 'error');
          ui.headTrackToggle.checked = !enabled; // revert toggle
          if (!enabled) startHeadTrackPolling(); else stopHeadTrackPolling();
        }
      } catch (err) {
        showToast('Head tracking error: ' + err.message, 'error');
        ui.headTrackToggle.checked = !enabled; // revert toggle
      }
    }

    // Click-to-track: click webcam image to set manual target
    let clickTrackTimer = null;
    (function initClickToTrack() {
      const img = document.getElementById('webcamImg');
      if (!img) return;
      img.style.cursor = 'crosshair';
      img.addEventListener('click', async (e) => {
        const rect = img.getBoundingClientRect();
        const xPct = ((e.clientX - rect.left) / rect.width) * 100;
        const yPct = ((e.clientY - rect.top) / rect.height) * 100;

        // Show visual target box on webcam
        showTargetBox(img, xPct, yPct);

        try {
          const r = await fetch('/conversation/api/head-tracking/target', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ x: xPct, y: yPct, durationSec: 30 })
          });
          const j = await r.json();
          if (j && j.success) {
            showToast('Tracking target — keeping centered for 30s', 'success');
            startClickTrackCountdown(30);
          } else {
            removeTargetBox();
            showToast('Target failed: ' + (j.error || 'Unknown'), 'error');
          }
        } catch (err) {
          removeTargetBox();
          showToast('Target error: ' + err.message, 'error');
        }
      });
    })();

    function showTargetBox(img, xPct, yPct) {
      removeTargetBox();
      var container = img.parentElement;
      if (!container) return;
      container.style.position = 'relative';
      var box = document.createElement('div');
      box.id = 'trackTargetBox';
      box.style.cssText = 'position:absolute;width:60px;height:60px;border:2px solid #00ff88;border-radius:4px;' +
        'box-shadow:0 0 8px rgba(0,255,136,0.6);pointer-events:none;transform:translate(-50%,-50%);z-index:10;' +
        'left:' + xPct + '%;top:' + yPct + '%;';
      // Crosshair inside
      box.innerHTML = '<div style="position:absolute;left:50%;top:0;bottom:0;width:1px;background:rgba(0,255,136,0.5);"></div>' +
        '<div style="position:absolute;top:50%;left:0;right:0;height:1px;background:rgba(0,255,136,0.5);"></div>';
      container.appendChild(box);
    }
    function removeTargetBox() {
      var existing = document.getElementById('trackTargetBox');
      if (existing) existing.remove();
    }

    function startClickTrackCountdown(seconds) {
      const badge = document.getElementById('clickTrackCountdown');
      if (!badge) return;
      badge.classList.remove('d-none');
      let remaining = seconds;
      badge.textContent = remaining + 's';
      if (clickTrackTimer) clearInterval(clickTrackTimer);
      clickTrackTimer = setInterval(() => {
        remaining--;
        if (remaining <= 0) {
          clearInterval(clickTrackTimer);
          clickTrackTimer = null;
          badge.classList.add('d-none');
          removeTargetBox();
        } else {
          badge.textContent = remaining + 's';
        }
      }, 1000);
    }

    async function loadMotionSensorStatus() {
      try {
        var r = await fetch('/conversation/api/motion-sensor');
        var j = await r.json();
        var toggle = $('motionSensorToggle');
        if (toggle && j && j.success) {
          toggle.checked = !!j.active;
        }
        // Disable toggle if no sensor available
        if (j && !j.hasSensor && toggle) {
          toggle.disabled = true;
          toggle.parentElement.setAttribute('title', 'No motion sensor configured for this character');
        }
      } catch (_) {}
    }

    async function loadJawSettings() {
      try {
        const r = await fetch('/conversation/api/jaw-settings');
        const j = await r.json();
        if (j && j.success) {
          ui.jawToggle.checked = !!j.enabled;
        }
      } catch { }
    }

    async function saveJawSettings() {
      try {
        await fetch('/conversation/api/jaw-settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: ui.jawToggle.checked })
        });
      } catch { }
    }

    function updateChatModeUI() {
      var btn = ui.chatModeToggle;
      var input = ui.chatInput;
      if (!btn || !input) return;
      if (chatMode === 'say') {
        btn.innerHTML = '<i class="bi bi-megaphone"></i> Say This';
        btn.classList.remove('btn-outline-secondary');
        btn.classList.add('btn-outline-primary');
        input.placeholder = 'Type what the character should say...';
      } else {
        btn.innerHTML = '<i class="bi bi-chat-dots"></i> Ask AI';
        btn.classList.remove('btn-outline-primary');
        btn.classList.add('btn-outline-secondary');
        input.placeholder = 'Ask the character something...';
      }
    }

    function handleUnifiedSend() {
      if (chatMode === 'say') {
        sendSay();
      } else {
        sendChatMessage();
      }
    }

    async function sendSay() {
      var input = ui.chatInput || $('chatInput');
      var text = (input ? input.value : '').trim();
      if (!text) {
        if (ui.sayStatus) ui.sayStatus.innerHTML = '<span class="text-warning">Enter text</span>';
        return;
      }

      var sendBtn = ui.chatSendBtn || $('chatSendBtn');
      if (sendBtn) { sendBtn.disabled = true; sendBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>'; }

      // Check if browser speaker is enabled — request audio back for browser playback
      var browserSpk = $('chatBrowserSpeaker');
      var wantBrowser = !!(browserSpk && browserSpk.checked);

      try {
        var r = await fetch('/conversation/api/say', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: text,
            speakerPartId: chatSpeakerPartId || selectedSpeakerPartId || undefined,
            browserPlayback: wantBrowser
          })
        });
        var j = await r.json();
        notifyLurkActivity();
        if (input) input.value = '';

        if (j && j.success) {
          if (ui.sayStatus) ui.sayStatus.innerHTML = '<span class="text-success">Spoken</span>';
          appendChatMessage('Character', text);
          // Play through browser if audio was returned
          if (j.audio) {
            playBase64Audio(j.audio, j.contentType || 'audio/mpeg');
          }
        } else {
          if (ui.sayStatus) ui.sayStatus.innerHTML = '<span class="text-danger">Failed: ' + ((j && j.error) || '') + '</span>';
        }
      } catch (e) {
        if (ui.sayStatus) ui.sayStatus.innerHTML = '<span class="text-danger">Error: ' + (e && e.message ? e.message : e) + '</span>';
      } finally {
        if (sendBtn) { sendBtn.disabled = false; sendBtn.innerHTML = '<i class="bi bi-send"></i>'; }
      }
    }

    function playBase64Audio(b64, contentType) {
      try {
        var binary = atob(b64);
        var bytes = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        var blob = new Blob([bytes], { type: contentType });
        var url = URL.createObjectURL(blob);
        var audio = new Audio(url);
        audio.onended = function () { URL.revokeObjectURL(url); };
        audio.onerror = function () { URL.revokeObjectURL(url); };
        audio.play().catch(function (e) { console.warn('[BrowserAudio] Playback failed:', e.message); });
      } catch (e) {
        console.error('[BrowserAudio] Error:', e);
      }
    }

    // ─── Scenes ──────────────────────────────────────────────

    let dashboardScenes = [];
    let sceneLoopActive = false;

    async function loadScenes() {
      const container = $('scenesContainer');

      try {
        const r = await fetch('/scenes/api/');
        const j = await r.json();

        if (j && j.success && j.scenes && j.scenes.length > 0) {
          dashboardScenes = j.scenes;
          renderScenesList();
          initSceneSortable();
        } else {
          dashboardScenes = [];
          container.innerHTML = '<div class="text-center text-muted py-2 small">No scenes</div>';
        }
      } catch {
        container.innerHTML = '<div class="text-center text-danger py-2 small">Failed to load</div>';
      }
    }

    function renderScenesList() {
      const container = $('scenesContainer');
      if (!dashboardScenes.length) {
        container.innerHTML = '<div class="text-center text-muted py-2 small">No scenes</div>';
        return;
      }
      container.innerHTML = dashboardScenes.map(scene => `
        <div class="scene-row d-flex align-items-center mb-1 p-1 rounded border-bottom" data-scene-id="${scene.id}" style="cursor:grab;">
          <i class="bi bi-grip-vertical text-muted me-2 scene-drag-handle" style="opacity:0.4;"></i>
          <div class="flex-grow-1 text-truncate">
            <strong class="small">${scene.name || 'Scene ' + scene.id}</strong>
            <span class="badge bg-secondary ms-1" style="font-size:0.6rem;">${(scene.steps && scene.steps.length) || 0}</span>
          </div>
          <div class="d-flex gap-1 ms-2 flex-shrink-0">
            <button class="btn btn-sm btn-outline-success p-0 px-1 scene-play-btn" data-id="${scene.id}" title="Play"><i class="bi bi-play-fill"></i></button>
            <button class="btn btn-sm btn-outline-danger p-0 px-1 scene-del-btn" data-id="${scene.id}" title="Delete"><i class="bi bi-trash"></i></button>
          </div>
        </div>
      `).join('');

      container.querySelectorAll('.scene-play-btn').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          playScene(parseInt(btn.getAttribute('data-id'), 10));
        });
      });
      container.querySelectorAll('.scene-del-btn').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          deleteScene(parseInt(btn.getAttribute('data-id'), 10));
        });
      });
    }

    function initSceneSortable() {
      const container = $('scenesContainer');
      if (typeof Sortable !== 'undefined' && container) {
        Sortable.create(container, {
          animation: 150,
          handle: '.scene-drag-handle',
          ghostClass: 'sortable-ghost',
          onEnd: function(evt) {
            const item = dashboardScenes.splice(evt.oldIndex, 1)[0];
            dashboardScenes.splice(evt.newIndex, 0, item);
            saveSceneOrder();
          }
        });
      }
    }

    async function saveSceneOrder() {
      try {
        const orderedIds = dashboardScenes.map(s => s.id);
        await fetch('/scenes/api/reorder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderedIds })
        });
      } catch (e) {
        console.error('Failed to save scene order:', e);
      }
    }

    window.playScene = async function (sceneId) {
      try {
        const btn = document.querySelector('.scene-play-btn[data-id="' + sceneId + '"]');
        if (btn) btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
        const r = await fetch('/scenes/api/' + sceneId + '/play', { method: 'POST' });
        const j = await r.json();
        if (btn) btn.innerHTML = '<i class="bi bi-play-fill"></i>';
        if (!(j && j.success)) {
          alert('Failed to play scene');
        }
      } catch (e) {
        alert('Error playing scene: ' + e.message);
      }
    };

    async function deleteScene(sceneId) {
      const scene = dashboardScenes.find(s => s.id === sceneId);
      const name = scene ? scene.name : 'Scene ' + sceneId;
      if (!confirm('Delete "' + name + '"? This cannot be undone.')) return;
      try {
        const r = await fetch('/scenes/api/' + sceneId, { method: 'DELETE' });
        const j = await r.json();
        if (j && j.success) {
          dashboardScenes = dashboardScenes.filter(s => s.id !== sceneId);
          renderScenesList();
          initSceneSortable();
        } else {
          alert('Failed to delete scene');
        }
      } catch (e) {
        alert('Error deleting scene: ' + e.message);
      }
    }

    async function loopAllScenes() {
      if (!dashboardScenes.length) return;
      try {
        await fetch('/scenes/api/queue/clear', { method: 'POST' });
        const sceneIds = dashboardScenes.map(s => s.id);
        await fetch('/scenes/api/queue/start-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'loop_queue', scenes: sceneIds.map(id => ({ sceneId: id })) })
        });
        sceneLoopActive = true;
        updateLoopUI();
      } catch (e) {
        alert('Error starting loop: ' + e.message);
      }
    }

    async function stopLoop() {
      try {
        await fetch('/scenes/api/queue/stop', { method: 'POST' });
        sceneLoopActive = false;
        updateLoopUI();
      } catch (e) {
        alert('Error stopping loop: ' + e.message);
      }
    }

    function updateLoopUI() {
      const loopBtn = $('btnLoopAll');
      const stopBtn = $('btnStopLoop');
      const statusBadge = $('scenesQueueStatus');
      if (sceneLoopActive) {
        if (loopBtn) loopBtn.style.display = 'none';
        if (stopBtn) stopBtn.style.display = '';
        if (statusBadge) { statusBadge.style.display = ''; statusBadge.textContent = 'Looping'; statusBadge.className = 'badge bg-success small me-1'; }
      } else {
        if (loopBtn) loopBtn.style.display = '';
        if (stopBtn) stopBtn.style.display = 'none';
        if (statusBadge) statusBadge.style.display = 'none';
      }
    }

    // ─── Poses ──────────────────────────────────────────────

    var dashboardPoses = [];

    async function loadPoses() {
      var container = $('posesContainer');

      try {
        var r = await fetch('/poses/api/poses');
        var j = await r.json();

        if (j && Array.isArray(j) && j.length > 0) {
          dashboardPoses = j;
          renderPosesList();
        } else if (j && j.poses && j.poses.length > 0) {
          dashboardPoses = j.poses;
          renderPosesList();
        } else {
          dashboardPoses = [];
          container.innerHTML = '<div class="text-center text-muted py-2 small">No poses</div>';
        }
      } catch (e) {
        container.innerHTML = '<div class="text-center text-danger py-2 small">Failed to load</div>';
      }
    }

    function renderPosesList() {
      var container = $('posesContainer');
      if (!dashboardPoses.length) {
        container.innerHTML = '<div class="text-center text-muted py-2 small">No poses</div>';
        return;
      }
      container.innerHTML = dashboardPoses.map(function(pose) {
        var name = pose.name || 'Pose ' + pose.id;
        var category = pose.category || '';
        var partsCount = (pose.parts && pose.parts.length) || 0;
        var categoryBadge = category ? '<span class="badge bg-info ms-1" style="font-size:0.6rem;">' + category + '</span>' : '';
        return '<div class="pose-row d-flex align-items-center mb-1 p-1 rounded border-bottom">' +
          '<div class="flex-grow-1 text-truncate">' +
            '<strong class="small">' + name + '</strong>' +
            categoryBadge +
            '<span class="badge bg-secondary ms-1" style="font-size:0.6rem;">' + partsCount + ' parts</span>' +
          '</div>' +
          '<div class="d-flex gap-1 ms-2 flex-shrink-0">' +
            '<button class="btn btn-sm btn-outline-success p-0 px-1 pose-play-btn" data-id="' + pose.id + '" title="Play"><i class="bi bi-play-fill"></i></button>' +
            '<a href="/poses/editor/' + pose.id + '" class="btn btn-sm btn-outline-secondary p-0 px-1" title="Edit"><i class="bi bi-pencil"></i></a>' +
            '<button class="btn btn-sm btn-outline-danger p-0 px-1 pose-del-btn" data-id="' + pose.id + '" title="Delete"><i class="bi bi-trash"></i></button>' +
          '</div>' +
        '</div>';
      }).join('');

      container.querySelectorAll('.pose-play-btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          playPose(parseInt(btn.getAttribute('data-id'), 10));
        });
      });
      container.querySelectorAll('.pose-del-btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          deletePose(parseInt(btn.getAttribute('data-id'), 10));
        });
      });
    }

    async function playPose(poseId) {
      try {
        var btn = document.querySelector('.pose-play-btn[data-id="' + poseId + '"]');
        if (btn) { btn.classList.add('btn-success'); btn.classList.remove('btn-outline-success'); }
        // Fire-and-forget: respond immediately, execute in background
        var r = await fetch('/poses/api/poses/' + poseId + '/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ async: true })
        });
        var j = await r.json();
        // Brief green flash then restore
        setTimeout(function () {
          if (btn) { btn.classList.remove('btn-success'); btn.classList.add('btn-outline-success'); }
        }, 400);
        if (!(j && j.success)) {
          if (btn) { btn.classList.remove('btn-success'); btn.classList.add('btn-outline-danger'); }
          setTimeout(function () {
            if (btn) { btn.classList.remove('btn-outline-danger'); btn.classList.add('btn-outline-success'); }
          }, 1500);
        }
      } catch (e) {
        console.error('Pose execute error:', e);
      }
    }

    async function deletePose(poseId) {
      var pose = dashboardPoses.find(function(p) { return p.id === poseId; });
      var name = pose ? pose.name : 'Pose ' + poseId;
      if (!confirm('Delete "' + name + '"? This cannot be undone.')) return;
      try {
        var r = await fetch('/poses/' + poseId, { method: 'DELETE' });
        var j = await r.json();
        if (j && j.success) {
          dashboardPoses = dashboardPoses.filter(function(p) { return p.id !== poseId; });
          renderPosesList();
        } else {
          alert('Failed to delete pose');
        }
      } catch (e) {
        alert('Error deleting pose: ' + (e && e.message ? e.message : e));
      }
    }

    // ─── Live Console ────────────────────────────────────────────────────────────
    var _consoleTimer = null;

    function loadConsole() {
      var linesEl = document.getElementById('consoleLines');
      var n = linesEl ? linesEl.value : '100';
      fetch('/api/system/console?lines=' + n + '&source=stdout')
        .then(function(r) { return r.json(); })
        .then(function(data) {
          var el = document.getElementById('consoleOutput');
          if (el && data && data.output) {
            var wasAtBottom = (el.scrollHeight - el.scrollTop - el.clientHeight) < 30;
            el.textContent = data.output;
            if (wasAtBottom) el.scrollTop = el.scrollHeight;
          }
        })
        .catch(function() {});
    }

    function startConsolePolling() {
      loadConsole();
      if (_consoleTimer) clearInterval(_consoleTimer);
      _consoleTimer = setInterval(loadConsole, 3000);
    }

    function stopConsolePolling() {
      if (_consoleTimer) { clearInterval(_consoleTimer); _consoleTimer = null; }
    }

    function initConsolePanel() {
      var consoleLive = document.getElementById('consoleLive');
      var consoleRefresh = document.getElementById('btnConsoleRefresh');
      var consoleLines = document.getElementById('consoleLines');

      if (consoleLive) {
        consoleLive.addEventListener('change', function() {
          if (consoleLive.checked) startConsolePolling();
          else stopConsolePolling();
        });
      }
      if (consoleRefresh) consoleRefresh.addEventListener('click', loadConsole);
      if (consoleLines) consoleLines.addEventListener('change', loadConsole);

      if (consoleLive && consoleLive.checked) startConsolePolling();
    }

    document.addEventListener('DOMContentLoaded', function() { initConsolePanel(); });
    document.addEventListener('DOMContentLoaded', init);
    window.__conv = { loadSpeakers, loadWebcam, loadScenes, loadPoses };
  })();

/* -- SECTION 2: browser audio bridge -------------------------------------- */
// Browser Audio Bridge — standalone Listen In / Talk Through (independent of AI chat)
(function () {
  const RATE = 48000;
  let listenInES = null, listenInCtx = null, listenInNextStart = 0;
  let listenInLeftover = null; // buffer for odd-byte chunks (PCM16 = 2 bytes/sample)
  let ttStream = null, ttCtx = null, ttProc = null, ttActive = false;

  function loadBridgeDevices() {
    fetch('/setup/audio/api/inputs').then(r => r.json()).then(data => {
      if (!data || !data.success) return;
      const sel = document.getElementById('bridge-listenin-source');
      if (!sel || !data.inputs || !data.inputs.length) return;
      sel.innerHTML = '';
      data.inputs.forEach(inp => {
        const o = document.createElement('option');
        o.value = inp.id || inp.name;
        o.textContent = inp.description || inp.name || inp.id;
        sel.appendChild(o);
      });
    }).catch(() => {});

    fetch('/setup/audio/api/outputs').then(r => r.json()).then(data => {
      if (!data || !data.success) return;
      const sel = document.getElementById('bridge-talkthrough-sink');
      if (!sel || !data.outputs || !data.outputs.length) return;
      sel.innerHTML = '';
      data.outputs.forEach(out => {
        const o = document.createElement('option');
        o.value = out.id || out.name;
        o.textContent = out.description || out.name || out.id;
        sel.appendChild(o);
      });
    }).catch(() => {});
  }

  // ------- Listen In (Browser Speaker) -------

  function startListenIn() {
    const sourceSelect = document.getElementById('bridge-listenin-source');
    const deviceId = sourceSelect ? sourceSelect.value : 'default';
    const statusBadge = document.getElementById('bridge-listenin-status');
    const toggleText = document.getElementById('bridge-listenin-text');
    const btn = document.getElementById('btn-bridge-listenin');

    if (statusBadge) { statusBadge.textContent = 'Connecting...'; statusBadge.className = 'badge bg-warning'; }
    if (toggleText) toggleText.textContent = 'Connecting...';
    if (btn) btn.disabled = true;

    const Ctx = window.AudioContext || window.webkitAudioContext;
    listenInCtx = new Ctx({ sampleRate: RATE });
    listenInNextStart = 0;

    const url = '/setup/audio/api/mic-stream?deviceId=' + encodeURIComponent(deviceId);
    listenInES = new EventSource(url);

    listenInES.onmessage = function (event) {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'started') {
          if (statusBadge) { statusBadge.textContent = 'Listening'; statusBadge.className = 'badge bg-success'; }
          if (toggleText) toggleText.textContent = 'Stop';
          if (btn) { btn.disabled = false; btn.className = 'btn btn-outline-danger btn-sm'; btn.style.fontSize = '0.75rem'; }
        } else if (msg.type === 'audio') {
          playListenInChunk(msg.audio);
        } else if (msg.type === 'error') {
          console.error('Listen In error:', msg.error);
          const statusEl = document.getElementById('bridge-listenin-status');
          if (statusEl) { statusEl.textContent = 'Error'; statusEl.className = 'badge bg-danger'; }
          stopListenIn();
        } else if (msg.type === 'ended') {
          stopListenIn();
        }
      } catch (_) {}
    };

    listenInES.onerror = function () {
      console.warn('Listen In SSE connection error');
      stopListenIn();
    };
  }

  function playListenInChunk(base64Pcm) {
    if (!listenInCtx || !base64Pcm) return;

    // Decode base64 to bytes
    var raw = atob(base64Pcm);
    var incoming = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) incoming[i] = raw.charCodeAt(i);

    // Prepend any leftover byte from previous chunk (PCM16 = 2 bytes/sample)
    var pcmBytes;
    if (listenInLeftover && listenInLeftover.length > 0) {
      pcmBytes = new Uint8Array(listenInLeftover.length + incoming.length);
      pcmBytes.set(listenInLeftover, 0);
      pcmBytes.set(incoming, listenInLeftover.length);
      listenInLeftover = null;
    } else {
      pcmBytes = incoming;
    }

    // Save odd trailing byte for next chunk
    var usable = pcmBytes.length;
    if (usable % 2 !== 0) {
      listenInLeftover = pcmBytes.slice(usable - 1);
      usable -= 1;
    }
    if (usable < 2) return;

    var samples = usable / 2;
    var float32 = new Float32Array(samples);
    var view = new DataView(pcmBytes.buffer, pcmBytes.byteOffset, usable);
    for (var j = 0; j < samples; j++) float32[j] = view.getInt16(j * 2, true) / 32768;

    // VU meter
    var sumSq = 0;
    for (var k = 0; k < float32.length; k++) sumSq += float32[k] * float32[k];
    var pct = Math.min(100, Math.round(Math.sqrt(sumSq / float32.length) * 500));
    var vuBar = document.getElementById('bridge-listenin-vu');
    var vuLabel = document.getElementById('bridge-listenin-vu-label');
    if (vuBar) vuBar.style.width = pct + '%';
    if (vuLabel) vuLabel.textContent = pct + '%';

    // Volume
    var volSlider = document.getElementById('bridge-listenin-volume');
    var volume = volSlider ? (parseInt(volSlider.value, 10) / 100) : 0.75;
    for (var m = 0; m < float32.length; m++) float32[m] *= volume;

    if (listenInCtx.state === 'suspended') listenInCtx.resume();
    var buffer = listenInCtx.createBuffer(1, samples, RATE);
    buffer.getChannelData(0).set(float32);
    var source = listenInCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(listenInCtx.destination);
    var now = listenInCtx.currentTime;
    // Jitter buffer: schedule 300ms ahead to absorb network/chunk timing variance
    if (listenInNextStart < now) listenInNextStart = now + 0.3;
    source.start(listenInNextStart);
    listenInNextStart += buffer.duration;
  }

  function stopListenIn() {
    if (listenInES) { listenInES.close(); listenInES = null; }
    if (listenInCtx) { try { listenInCtx.close(); } catch (_) {} listenInCtx = null; }
    listenInNextStart = 0;
    listenInLeftover = null;

    const statusBadge = document.getElementById('bridge-listenin-status');
    const toggleText = document.getElementById('bridge-listenin-text');
    const btn = document.getElementById('btn-bridge-listenin');
    const vuBar = document.getElementById('bridge-listenin-vu');
    const vuLabel = document.getElementById('bridge-listenin-vu-label');
    if (statusBadge) { statusBadge.textContent = 'Off'; statusBadge.className = 'badge bg-secondary'; }
    if (toggleText) toggleText.textContent = 'Start';
    if (btn) { btn.disabled = false; btn.className = 'btn btn-info btn-sm'; btn.style.fontSize = '0.75rem'; }
    if (vuBar) vuBar.style.width = '0%';
    if (vuLabel) vuLabel.textContent = '0%';
  }

  function toggleListenIn() {
    if (listenInES) stopListenIn(); else startListenIn();
  }

  // ------- Talk Through (Browser Mic) -------

  function startTalkThrough() {
    const sinkSelect = document.getElementById('bridge-talkthrough-sink');
    const deviceId = sinkSelect ? sinkSelect.value : 'default';
    const statusBadge = document.getElementById('bridge-talkthrough-status');
    const toggleText = document.getElementById('bridge-talkthrough-text');
    const btn = document.getElementById('btn-bridge-talkthrough');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;

    if (statusBadge) { statusBadge.textContent = 'Requesting...'; statusBadge.className = 'badge bg-warning'; }
    if (toggleText) toggleText.textContent = 'Requesting...';
    if (btn) btn.disabled = true;

    navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: { ideal: 16000 } }
    }).then(stream => {
      ttStream = stream;
      const Ctx = window.AudioContext || window.webkitAudioContext;
      ttCtx = new Ctx();
      const src = ttCtx.createMediaStreamSource(stream);
      ttProc = ttCtx.createScriptProcessor(4096, 1, 1);
      const nativeRate = ttCtx.sampleRate;
      const targetDevice = deviceId;

      ttProc.onaudioprocess = function (e) {
        if (!ttActive) return;
        const input = e.inputBuffer.getChannelData(0);

        // VU
        let sumSq = 0;
        for (let i = 0; i < input.length; i++) sumSq += input[i] * input[i];
        const pct = Math.min(100, Math.round(Math.sqrt(sumSq / input.length) * 500));
        const vuBar = document.getElementById('bridge-talkthrough-vu');
        const vuLabel = document.getElementById('bridge-talkthrough-vu-label');
        if (vuBar) vuBar.style.width = pct + '%';
        if (vuLabel) vuLabel.textContent = pct + '%';

        // Downsample to 16kHz PCM16LE
        const ratio = nativeRate / RATE;
        const outLen = Math.floor(input.length / ratio);
        const pcm16 = new Int16Array(outLen);
        for (let i = 0; i < outLen; i++) {
          pcm16[i] = Math.max(-32768, Math.min(32767, Math.round(input[Math.floor(i * ratio)] * 32768)));
        }
        const byteArr = new Uint8Array(pcm16.buffer);
        let binary = '';
        for (let j = 0; j < byteArr.length; j++) binary += String.fromCharCode(byteArr[j]);

        fetch('/setup/audio/api/browser-mic-chunk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audio: btoa(binary), deviceId: targetDevice })
        }).catch(() => {});
      };

      src.connect(ttProc);
      ttProc.connect(ttCtx.destination);
      ttActive = true;

      if (statusBadge) { statusBadge.textContent = 'Active'; statusBadge.className = 'badge bg-success'; }
      if (toggleText) toggleText.textContent = 'Stop';
      if (btn) { btn.disabled = false; btn.className = 'btn btn-outline-danger btn-sm'; btn.style.fontSize = '0.75rem'; }
    }).catch(err => {
      console.error('Talk Through mic error:', err);
      if (statusBadge) { statusBadge.textContent = 'Error'; statusBadge.className = 'badge bg-danger'; }
      if (toggleText) toggleText.textContent = 'Start';
      if (btn) { btn.disabled = false; btn.className = 'btn btn-warning btn-sm'; btn.style.fontSize = '0.75rem'; }
    });
  }

  function stopTalkThrough() {
    ttActive = false;
    if (ttProc) { try { ttProc.disconnect(); } catch (_) {} ttProc = null; }
    if (ttStream) { ttStream.getTracks().forEach(t => t.stop()); ttStream = null; }
    if (ttCtx) { try { ttCtx.close(); } catch (_) {} ttCtx = null; }

    fetch('/setup/audio/api/browser-mic/stop', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
    }).catch(() => {});

    const statusBadge = document.getElementById('bridge-talkthrough-status');
    const toggleText = document.getElementById('bridge-talkthrough-text');
    const btn = document.getElementById('btn-bridge-talkthrough');
    const vuBar = document.getElementById('bridge-talkthrough-vu');
    const vuLabel = document.getElementById('bridge-talkthrough-vu-label');
    if (statusBadge) { statusBadge.textContent = 'Off'; statusBadge.className = 'badge bg-secondary'; }
    if (toggleText) toggleText.textContent = 'Start';
    if (btn) { btn.disabled = false; btn.className = 'btn btn-warning btn-sm'; btn.style.fontSize = '0.75rem'; }
    if (vuBar) vuBar.style.width = '0%';
    if (vuLabel) vuLabel.textContent = '0%';
  }

  function toggleTalkThrough() {
    if (ttActive) stopTalkThrough(); else startTalkThrough();
  }

  // Init
  document.addEventListener('DOMContentLoaded', function () {
    loadBridgeDevices();

    // HTTPS check
    const isSecure = window.isSecureContext || window.location.protocol === 'https:' || /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);
    if (!isSecure) {
      const warn = document.getElementById('bridge-talkthrough-https-warn');
      if (warn) warn.classList.remove('d-none');
      const btn = document.getElementById('btn-bridge-talkthrough');
      if (btn) btn.disabled = true;
    }

    const listenBtn = document.getElementById('btn-bridge-listenin');
    const talkBtn = document.getElementById('btn-bridge-talkthrough');
    if (listenBtn) listenBtn.addEventListener('click', toggleListenIn);
    if (talkBtn) talkBtn.addEventListener('click', toggleTalkThrough);
  });

  window.addEventListener('beforeunload', function () {
    if (listenInES) stopListenIn();
    if (ttActive) stopTalkThrough();
  });
})();

/* -- SECTION 3: Operator Command Bar wiring + PANIC ----------------------- */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  // ---- Proxy the new top-bar Loop buttons to the accordion buttons. ----
  function proxyClick(fromId, toId) {
    var src = $(fromId), dst = $(toId);
    if (!src || !dst) return;
    src.addEventListener('click', function () { dst.click(); });
  }
  proxyClick('opbarLoopAll', 'btnLoopAll');
  proxyClick('opbarStopLoop', 'btnStopLoop');

  // Mirror visibility of the accordion's Stop Loop into the top bar.
  var accordionStop = $('btnStopLoop');
  var opbarStop = $('opbarStopLoop');
  if (accordionStop && opbarStop) {
    var sync = function () {
      var hidden = accordionStop.style.display === 'none' || accordionStop.hasAttribute('hidden');
      opbarStop.style.display = hidden ? 'none' : '';
    };
    new MutationObserver(sync).observe(accordionStop, { attributes: true, attributeFilter: ['style', 'hidden', 'class'] });
    sync();
  }

  // ---- Sync lurk-status badge "is-active" glow from the underlying toggles. ----
  var badgeMap = [
    { toggle: 'chatAiOnToggle',    badge: 'lurkBadgeAI' },
    { toggle: 'jawToggle',         badge: 'lurkBadgeJaw' },
    { toggle: 'headTrackToggle',   badge: 'lurkBadgeHead' },
    { toggle: 'idleToggle',        badge: 'lurkBadgeIdle' },
    { toggle: 'motionSensorToggle',badge: 'lurkBadgeMotion' }
  ];
  function refreshBadges() {
    badgeMap.forEach(function (m) {
      var t = $(m.toggle), b = $(m.badge);
      if (!t || !b) return;
      b.classList.toggle('is-active', !!t.checked);
    });
  }
  badgeMap.forEach(function (m) {
    var t = $(m.toggle);
    if (t) t.addEventListener('change', refreshBadges);
  });
  // Initial state + polling catch-up for handlers that only flip the box without dispatching change
  refreshBadges();
  setInterval(refreshBadges, 1500);

  // Also light up the Lurk label glow when lurk is on.
  var lurkBar = $('lurkBar');
  var lurkToggle = $('lurkToggle');
  if (lurkBar && lurkToggle) {
    var syncLurk = function () { lurkBar.classList.toggle('is-on', !!lurkToggle.checked); };
    lurkToggle.addEventListener('change', syncLurk);
    syncLurk();
    setInterval(syncLurk, 1500);
  }

  // ---- Character avatar: use image if one exists for the current character. ----
  (function loadAvatar() {
    var charId = window.__MB_CHAR_ID;
    if (!charId) return;
    var avatar = $('opbarAvatar');
    if (!avatar) return;
    var url = '/images/characters/character-' + charId + '.png';
    var img = new Image();
    img.onload = function () {
      avatar.innerHTML = '';
      img.alt = '';
      avatar.appendChild(img);
    };
    img.src = url;
  })();

  // ---- PANIC — stop everything. ----
  function firePanic(reason) {
    try { console.log('[PANIC]', reason || 'triggered'); } catch (_) {}

    // Visual flash
    try {
      var flash = document.createElement('div');
      flash.className = 'mb-panic-flash';
      document.body.appendChild(flash);
      setTimeout(function () { flash.remove(); }, 650);
    } catch (_) {}

    // Turn off every toggle that could be animating/speaking.
    ['lurkToggle', 'chatAiOnToggle', 'jawToggle', 'headTrackToggle',
     'parrotToggle', 'idleToggle', 'motionSensorToggle']
      .forEach(function (id) {
        var el = $(id);
        if (el && el.checked) {
          el.checked = false;
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });

    // Force mute speaker.
    var mute = $('speakerMuteToggle');
    if (mute && !mute.checked) {
      mute.checked = true;
      mute.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Stop all audio + scene loop via their existing buttons.
    var stopAudio = $('stopAllAudioBtn'); if (stopAudio) stopAudio.click();
    var stopLoop  = $('btnStopLoop');     if (stopLoop && stopLoop.style.display !== 'none') stopLoop.click();

    // Best-effort: also hit the orchestration stop endpoint if available.
    try {
      fetch('/api/orchestration/stop-all', { method: 'POST' }).catch(function () {});
    } catch (_) {}
  }

  var panicBtn = $('mbPanicBtn');
  if (panicBtn) {
    panicBtn.addEventListener('click', function () { firePanic('button'); });
  }

  // Double-Escape shortcut.
  var lastEsc = 0;
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') { lastEsc = 0; return; }
    var now = Date.now();
    if (now - lastEsc < 500) {
      firePanic('esc-esc');
      lastEsc = 0;
    } else {
      lastEsc = now;
    }
  });

  // Expose for console/testing.
  window.mbPanic = firePanic;
})();
