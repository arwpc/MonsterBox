(function(){
  // Minimal client for Unified Calibration
  const partSelect = document.getElementById('partSelect');
  const presetsList = document.getElementById('presetsList');
  const partDetails = document.getElementById('partDetails');
  const speedCap = document.getElementById('speedCap');
  const speedCapVal = document.getElementById('speedCapVal');

  let parts = [];
  let currentPartId = null;

  function fetchParts() {
    fetch('/setup/calibration/api/parts')
      .then(r => r.json())
      .then(data => {
        if (data && data.parts) {
          parts = data.parts;
          renderParts();
        } else {
          console.error('No parts returned');
        }
      }).catch(console.error);
  }

  function renderParts() {
    partSelect.innerHTML = '';
    parts.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.name} (${p.type})`;
      partSelect.appendChild(opt);
    });
    if (parts.length) {
      currentPartId = parts[0].id;
      partSelect.value = currentPartId;
      loadPartDetails(currentPartId);
    }
  }

  function loadPartDetails(id) {
    currentPartId = id;
    fetch(`/api/calibration/${id}/profile`)
      .then(r => r.json())
      .then(data => {
        if (data.success && data.profile) {
          renderProfile(data.profile);
        } else {
          partDetails.innerHTML = '<em>No profile found (create one)</em>';
          presetsList.innerHTML = '';
        }
      }).catch(err => {
        console.error('Profile fetch failed', err);
        partDetails.innerHTML = '<em>Error loading profile</em>';
        presetsList.innerHTML = '';
      });
  }

  function renderProfile(profile) {
    partDetails.innerHTML = `<pre>${JSON.stringify(profile, null, 2)}</pre>`;
    presetsList.innerHTML = '';
    (profile.presets || []).forEach(p => {
      const li = document.createElement('li');
      li.className = 'list-group-item d-flex justify-content-between align-items-center';
      li.innerHTML = `<span>${p.name} — ${p.p.toFixed(2)}</span>`;
      const btnGroup = document.createElement('div');
      const goBtn = document.createElement('button');
      goBtn.className = 'btn btn-sm btn-primary me-2';
      goBtn.textContent = 'Go';
      goBtn.onclick = () => gotoPosition(p.p);
      btnGroup.appendChild(goBtn);
      li.appendChild(btnGroup);
      presetsList.appendChild(li);
    });
  }

  function gotoPosition(p) {
    if (!currentPartId) return;
    fetch(`/api/calibration/${currentPartId}/goto`, {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ p })
    }).then(r => r.json()).then(console.log).catch(console.error);
  }

  function nudge(dir, scale) {
    if (!currentPartId) return;
    fetch(`/api/calibration/${currentPartId}/nudge`, {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ dir, scale })
    }).then(r => r.json()).then(console.log).catch(console.error);
  }

  function stop() {
    if (!currentPartId) return;
    fetch(`/api/calibration/${currentPartId}/stop`, { method: 'POST' }).then(r => r.json()).then(console.log).catch(console.error);
  }

  function setMin() {
    if (!currentPartId) return;
    fetch(`/api/calibration/${currentPartId}/set-min`, { method: 'POST' }).then(r => r.json()).then(console.log).catch(console.error);
  }
  function setMax() {
    if (!currentPartId) return;
    fetch(`/api/calibration/${currentPartId}/set-max`, { method: 'POST' }).then(r => r.json()).then(console.log).catch(console.error);
  }

  // Probes
  document.getElementById('runProbes').addEventListener('click', () => {
    const probes = [
      { pwmPct: Number(document.getElementById('probe1Pwm').value), msRun: Number(document.getElementById('probe1Ms').value), fromP: 0.1, toP: 0.3 },
      { pwmPct: Number(document.getElementById('probe2Pwm').value), msRun: Number(document.getElementById('probe2Ms').value), fromP: 0.3, toP: 0.5 },
      { pwmPct: Number(document.getElementById('probe3Pwm').value), msRun: Number(document.getElementById('probe3Ms').value), fromP: 0.5, toP: 0.8 }
    ];
    fetch(`/api/calibration/${currentPartId}/learn-openloop`, {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ probes })
    }).then(r => r.json()).then(data => {
      document.getElementById('learnOutput').textContent = JSON.stringify(data, null, 2);
    }).catch(console.error);
  });

  // Event wiring
  partSelect.addEventListener('change', (e) => loadPartDetails(e.target.value));
  document.getElementById('nudgeMinFine').addEventListener('click', () => nudge('min','fine'));
  document.getElementById('nudgeMaxFine').addEventListener('click', () => nudge('max','fine'));
  document.getElementById('nudgeMinMed').addEventListener('click', () => nudge('min','med'));
  document.getElementById('nudgeMaxMed').addEventListener('click', () => nudge('max','med'));
  document.getElementById('nudgeMinCoarse').addEventListener('click', () => nudge('min','coarse'));
  document.getElementById('nudgeMaxCoarse').addEventListener('click', () => nudge('max','coarse'));
  document.getElementById('stopBtn').addEventListener('click', stop);
  document.getElementById('setMin').addEventListener('click', setMin);
  document.getElementById('setMax').addEventListener('click', setMax);

  speedCap.addEventListener('input', (e) => {
    speedCapVal.textContent = e.target.value + '%';
    fetch('/api/calibration/global-speed-cap', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ speedPct: Number(e.target.value) })
    }).then(r => r.json()).then(console.log).catch(console.error);
  });

  // E-STOP and Power Enable (UI only: power toggle simulated)
  document.getElementById('estopBtn').addEventListener('click', () => {
    stop();
    alert('E-STOP sent');
  });
  document.getElementById('powerBtn').addEventListener('click', () => alert('Power toggled (UI only)'));

  // Boot
  fetch('/setup/calibration/api/parts').then(r => r.json()).then(data => {
    if (data && data.parts) {
      parts = data.parts;
      renderParts();
    }
  }).catch(console.error);
})();
