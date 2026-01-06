(function(){
  const $ = (sel) => document.querySelector(sel);
  const characterSelect = $('#characterSelect');
  const servoSelect = $('#servoSelect');
  const refreshBtn = $('#refreshBtn');
  const pulseReadout = $('#pulseReadout');
  const statusMsg = $('#statusMsg');
  const functionalityBadge = $('#functionalityBadge');
  const servoInfo = $('#servoInfo');
  const servoType = $('#servoType');
  const servoModel = $('#servoModel');
  const lastCalibrated = $('#lastCalibrated');
  const calibrationProgress = $('#calibrationProgress');
  const progressIndicators = $('#progressIndicators');
  const angleInput = $('#angleInput');
  const pulseInput = $('#pulseInput');
  const moveBtn = $('#moveBtn');
  const testPulseBtn = $('#testPulseBtn');
  const autoRangeBtn = $('#autoRangeBtn');
  const results = $('#results');
  const hardwareWarning = document.getElementById('hardwareWarning');
  const serviceStatusChip = document.getElementById('serviceStatusChip');
  const reconnectBtn = document.getElementById('reconnectBtn');

  // Guided calibration elements
  const guidedCalibration = $('#guidedCalibration');
  const stepInstructions = $('#stepInstructions');
  const guidedSaveBtn = $('#guidedSaveBtn');
  const guidedNextBtn = $('#guidedNextBtn');
  const guidedSkipBtn = $('#guidedSkipBtn');
  const guidedFinishBtn = $('#guidedFinishBtn');
  const startGuidedBtn = $('#startGuidedBtn');
  const resetCalibrationBtn = $('#resetCalibrationBtn');
  const standardPositions = $('#standardPositions');
  const continuousPositions = $('#continuousPositions');

  let parts = [];
  let characters = [];
  let pollTimer = null;
  let currentCalibration = null;
  let guidedWorkflow = null;

  // Service/Retry state
  let serviceAvailable = false;
  let pollErrorCount = 0;
  let pollIntervalMs = 800;

  function setControlsEnabled(enabled){
    const buttons = [moveBtn, testPulseBtn, autoRangeBtn, guidedSaveBtn, guidedNextBtn, guidedSkipBtn, guidedFinishBtn, startGuidedBtn, resetCalibrationBtn, reconnectBtn];
    buttons.forEach(b => { if (b) b.disabled = !enabled; });
    document.querySelectorAll('.savePosBtn, .testPosBtn').forEach(b => { b.disabled = !enabled; });
  }

  function renderServiceStatus(){
    if (!serviceStatusChip) return;
    if (serviceAvailable){
      serviceStatusChip.textContent = 'SERVICE: ONLINE';
      serviceStatusChip.className = 'badge badge-success';
    } else {
      serviceStatusChip.textContent = 'SERVICE: OFFLINE';
      serviceStatusChip.className = 'badge badge-error';
    }
  }

  function log(obj){
    try {
      results.textContent = (new Date()).toISOString()+"\n"+JSON.stringify(obj,null,2)+"\n\n"+results.textContent;
    } catch(e){
      results.textContent = (new Date()).toISOString()+"\n"+String(obj)+"\n\n"+results.textContent;
    }
  }

  function showHardwareWarning(message){
    if (!hardwareWarning) return;
    hardwareWarning.style.display = 'block';
    hardwareWarning.innerHTML = `<strong>Hardware Warning:</strong> ${message || 'Servo controller not detected. You can still configure and save calibration values.'}`;
  }

  function hideHardwareWarning(){
    if (!hardwareWarning) return;
    hardwareWarning.style.display = 'none';
  }

  function handleHardwareError(err){
    const msg = (err && err.message) ? err.message : String(err || '');
    if (/pca9685|i2c|hardware|not found|no device/i.test(msg)) {
      showHardwareWarning('PCA9685/I2C hardware appears unavailable. Ensure power and wiring are correct. The page remains usable without hardware.');
    }
  }

  async function fetchJSON(url, opts){
    const res = await fetch(url, opts);
    const data = await res.json().catch(()=>({}));
    if(!res.ok){
      throw new Error(data?.message || res.statusText);
    }
    return data;
  }

  function getSelectedServoId(){
    return servoSelect.value ? parseInt(servoSelect.value) : null;
  }

  async function loadCharacters(){
    // characters are stored in service, leveraging characters API
    const res = await fetch('/api/characters');
    const data = await res.json();
    characters = data || [];
    characterSelect.innerHTML = '';
    characters.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = `${c.name} (#${c.id})`;
      characterSelect.appendChild(opt);
    });
    // try to select current session character (server sets req.session.characterId); no direct endpoint, fallback to first
    if (characters.length) characterSelect.value = characters[0].id;
  }

  async function loadParts(){
    const data = await fetchJSON('/parts/api/parts');
    parts = Array.isArray(data) ? data : [];
    refreshServoList();
  }

  function refreshServoList(){
    const charId = parseInt(characterSelect.value);
    const servos = parts.filter(p => p.type === 'servo' && p.characterId === charId);
    servoSelect.innerHTML = '';
    servos.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      const label = `${s.name || 'Servo'} (#${s.id})${s.details? ' - ' + s.details: ''}`;
      opt.textContent = label;
      servoSelect.appendChild(opt);
    });
    updateServoInfo();
  }

  async function updateServoInfo(){
    const id = getSelectedServoId();
    if(!id){
      servoInfo.style.display = 'none';
      functionalityBadge.textContent = '—';
      functionalityBadge.style.background = '#555';
      return;
    }
    try {
      const res = await fetchJSON(`/api/servo-calibration/status/${id}`);
      const cal = res?.data?.calibration || {};
      currentCalibration = cal;
      serviceAvailable = true;
      pollErrorCount = 0; pollIntervalMs = 800;
      setControlsEnabled(true);
      renderServiceStatus();

      servoType.textContent = cal.servo_type || 'Unknown';
      servoModel.textContent = cal.servo_model || cal.part_name || 'Unknown';
      lastCalibrated.textContent = cal.calibrated_date ? new Date(cal.calibrated_date).toLocaleString() : 'Never';

      const status = cal.functionality_status || 'unknown';
      functionalityBadge.textContent = status.toUpperCase();
      functionalityBadge.style.background = status === 'working' ? '#2a5' : status === 'needs_calibration' ? '#a52' : '#555';
      functionalityBadge.style.color = '#fff';

      servoInfo.style.display = 'block';
      updateCalibrationProgress(cal);
      updatePositionVisibility(cal.servo_type);
    } catch(e){
      log({updateServoInfoError: e.message});
      handleHardwareError(e);
      serviceAvailable = false;
      setControlsEnabled(false);
      functionalityBadge.textContent = 'OFFLINE';
      functionalityBadge.style.background = '#555';
      functionalityBadge.style.color = '#fff';
      renderServiceStatus();
    }
  }

  function updateCalibrationProgress(cal){
    if(!cal || !cal.positions) {
      calibrationProgress.style.display = 'none';
      return;
    }

    const isStandard = cal.servo_type !== 'continuous';
    const requiredPositions = isStandard ? ['min', 'neutral', 'max'] : ['stop', 'cw_full', 'ccw_full'];
    const requiredKeys = isStandard ? requiredPositions : ['stop_pulse_us', 'cw_pulse_us', 'ccw_pulse_us'];

    progressIndicators.innerHTML = '';

    if(isStandard){
      requiredPositions.forEach(pos => {
        const indicator = document.createElement('span');
        const calibrated = cal.positions[pos]?.calibrated || false;
        indicator.textContent = pos;
        indicator.style.padding = '2px 6px';
        indicator.style.borderRadius = '3px';
        indicator.style.fontSize = '11px';
        indicator.style.background = calibrated ? '#2a5' : '#a52';
        indicator.style.color = '#fff';
        progressIndicators.appendChild(indicator);
      });
    } else {
      const positions = [
        {key: 'stop_pulse_us', label: 'stop'},
        {key: 'cw_pulse_us', label: 'cw'},
        {key: 'ccw_pulse_us', label: 'ccw'}
      ];
      positions.forEach(({key, label}) => {
        const indicator = document.createElement('span');
        const calibrated = cal[key] != null;
        indicator.textContent = label;
        indicator.style.padding = '2px 6px';
        indicator.style.borderRadius = '3px';
        indicator.style.fontSize = '11px';
        indicator.style.background = calibrated ? '#2a5' : '#a52';
        indicator.style.color = '#fff';
        progressIndicators.appendChild(indicator);
      });
    }

    calibrationProgress.style.display = 'block';
  }

  function updatePositionVisibility(servoType){
    if(servoType === 'continuous'){
      standardPositions.style.display = 'none';
      continuousPositions.style.display = 'block';
    } else {
      standardPositions.style.display = 'block';
      continuousPositions.style.display = 'none';
    }
  }

  function startGuidedCalibration(){
    const id = getSelectedServoId();
    if(!id || !currentCalibration) return;

    const isStandard = currentCalibration.servo_type !== 'continuous';
    const steps = isStandard ?
      [
        {pos: 'min', instruction: 'Move the servo to its MINIMUM position (0°) and click "Save Current Position"'},
        {pos: 'neutral', instruction: 'Move the servo to its NEUTRAL position (90°) and click "Save Current Position"'},
        {pos: 'max', instruction: 'Move the servo to its MAXIMUM position (180°) and click "Save Current Position"'}
      ] :
      [
        {pos: 'stop', instruction: 'Ensure the servo is STOPPED (not moving) and click "Save Current Position"'},
        {pos: 'cw_full', instruction: 'Move the servo to FULL CLOCKWISE speed and click "Save Current Position"'},
        {pos: 'ccw_full', instruction: 'Move the servo to FULL COUNTER-CLOCKWISE speed and click "Save Current Position"'}
      ];

    guidedWorkflow = {steps, currentStep: 0, isStandard};
    showGuidedStep();
    guidedCalibration.style.display = 'block';
    startGuidedBtn.style.display = 'none';
  }

  function showGuidedStep(){
    if(!guidedWorkflow || guidedWorkflow.currentStep >= guidedWorkflow.steps.length){
      finishGuidedCalibration();
      return;
    }

    const step = guidedWorkflow.steps[guidedWorkflow.currentStep];
    stepInstructions.textContent = `Step ${guidedWorkflow.currentStep + 1}/${guidedWorkflow.steps.length}: ${step.instruction}`;
    guidedSaveBtn.dataset.pos = step.pos;
    guidedFinishBtn.style.display = guidedWorkflow.currentStep === guidedWorkflow.steps.length - 1 ? 'inline-block' : 'none';
  }

  function nextGuidedStep(){
    if(!guidedWorkflow) return;
    guidedWorkflow.currentStep++;
    showGuidedStep();
  }

  function skipGuidedStep(){
    nextGuidedStep();
  }

  function finishGuidedCalibration(){
    guidedCalibration.style.display = 'none';
    startGuidedBtn.style.display = 'inline-block';
    guidedWorkflow = null;
    updateServoInfo(); // Refresh status
    statusMsg.textContent = 'Guided calibration completed';
  }

  async function resetCalibration(){
    const id = getSelectedServoId();
    if(!id) return;
    if(!confirm('Are you sure you want to reset all calibration data for this servo?')) return;

    statusMsg.textContent = 'Resetting calibration...';
    try{
      const res = await fetchJSON('/api/servo-calibration/reset', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ servoId: id })});
      log(res);
      statusMsg.textContent = 'Calibration reset';
      setTimeout(()=>{ updateServoInfo(); }, 500);
    }catch(e){
      log({error:e.message});
      statusMsg.textContent = 'Reset error';
      handleHardwareError(e);
    }
  }


	  async function reconnectNow(){
	    try{
	      setControlsEnabled(false);
	      statusMsg.textContent = 'Reconnecting...';
	      await fetchJSON('/api/servo-calibration/reconnect', { method:'POST' });
	    }catch(e){
	      log({reconnectError:e.message});
	    }finally{
	      pollErrorCount = 0; pollIntervalMs = 800; serviceAvailable = false;
	      updateServoInfo();
	      pollPulse();
	      setControlsEnabled(true);
	    }
	  }

  async function pollPulse(){
    clearTimeout(pollTimer);
    const id = getSelectedServoId();
    if(!id){
      pulseReadout.textContent = '—';
      return;
    }
    try {
      const res = await fetchJSON(`/api/servo-calibration/pulse/${id}`);
      const pw = res?.data?.pulse_width ?? res?.data?.pulse ?? null;
      if (pw != null) pulseReadout.textContent = `${pw} µs`;
      serviceAvailable = true;
      pollErrorCount = 0; pollIntervalMs = 800;
      setControlsEnabled(true);
      renderServiceStatus();
      pollTimer = setTimeout(pollPulse, pollIntervalMs);
    } catch(e){
      statusMsg.textContent = 'Servo service unavailable, retrying...';
      handleHardwareError(e);

      serviceAvailable = false;
      setControlsEnabled(false);
      pollErrorCount = Math.min(pollErrorCount + 1, 8);
      pollIntervalMs = Math.min(30000, 800 * Math.pow(2, pollErrorCount));
      renderServiceStatus();
      pollTimer = setTimeout(pollPulse, pollIntervalMs);
    }
  }

  async function moveServo(){
    const id = getSelectedServoId();
    if(!id) return;
    statusMsg.textContent = 'Moving...';
    try{
      const body = { servoId: id, angle: parseFloat(angleInput.value)||90, duration: 0.5 };
      const res = await fetchJSON('/parts/servo/move', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
      log(res);
      statusMsg.textContent = 'Moved';
    }catch(e){
      log({error:e.message});
      statusMsg.textContent = 'Move error';
      handleHardwareError(e);
    }
  }

  async function testPulse(){
    const id = getSelectedServoId();
    if(!id) return;
    statusMsg.textContent = 'Testing pulse...';
    try{
      const body = { servo_id: id, pulse_width: parseInt(pulseInput.value)||1500 };
      const res = await fetchJSON('/parts/servo/test-pulse', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
      log(res);
      statusMsg.textContent = 'Pulse tested';
    }catch(e){
      log({error:e.message});
      statusMsg.textContent = 'Pulse error';
      handleHardwareError(e);
    }
  }

  async function autoRange(){
    const id = getSelectedServoId();
    if(!id) return;
    statusMsg.textContent = 'Auto-ranging...';
    try{
      const res = await fetchJSON('/api/servo-calibration/auto-range-test', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ servoId: id })});
      log(res);
      statusMsg.textContent = 'Auto-range done';
    }catch(e){
      log({error:e.message});
      statusMsg.textContent = 'Auto-range error';
      handleHardwareError(e);
    }
  }

  async function savePosition(pos){
    const id = getSelectedServoId();
    if(!id) return;
    statusMsg.textContent = `Saving ${pos}...`;
    try{
      const body = { servoId: id, position: pos };
      const res = await fetchJSON('/api/servo-calibration/save-position', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
      log(res);
      statusMsg.textContent = `Saved ${pos}`;

      // If in guided mode, auto-advance
      if(guidedWorkflow && guidedSaveBtn.dataset.pos === pos){
        setTimeout(() => nextGuidedStep(), 1000);
      }

      // Refresh calibration status
      setTimeout(() => updateServoInfo(), 500);
    }catch(e){
      log({error:e.message});
      statusMsg.textContent = `Save ${pos} error`;
      handleHardwareError(e);
    }
  }

  async function testPosition(pos){
    const id = getSelectedServoId();
    if(!id) return;
    statusMsg.textContent = `Testing ${pos}...`;
    try{
      const body = { servoId: id, position: pos, duration: 1.0 };
      const res = await fetchJSON('/api/servo-calibration/test-position', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
      log(res);
      statusMsg.textContent = `Tested ${pos}`;
    }catch(e){
      log({error:e.message});
      statusMsg.textContent = `Test ${pos} error`;
      handleHardwareError(e);
    }
  }

  function wire(){
    refreshBtn.addEventListener('click', async ()=>{ await loadParts(); await pollPulse(); updateServoInfo(); });
    characterSelect.addEventListener('change', ()=>{ refreshServoList(); pollPulse(); });
    servoSelect.addEventListener('change', ()=>{ pollPulse(); updateServoInfo(); });
    moveBtn.addEventListener('click', moveServo);
    testPulseBtn.addEventListener('click', testPulse);
    autoRangeBtn.addEventListener('click', autoRange);

    // Guided calibration
    startGuidedBtn.addEventListener('click', startGuidedCalibration);
    guidedSaveBtn.addEventListener('click', ()=>savePosition(guidedSaveBtn.dataset.pos));
    guidedNextBtn.addEventListener('click', nextGuidedStep);
    guidedSkipBtn.addEventListener('click', skipGuidedStep);
    guidedFinishBtn.addEventListener('click', finishGuidedCalibration);
    resetCalibrationBtn.addEventListener('click', resetCalibration);

    reconnectBtn && reconnectBtn.addEventListener('click', reconnectNow);

    document.querySelectorAll('.savePosBtn').forEach(btn=>btn.addEventListener('click', ()=>savePosition(btn.dataset.pos)));
    document.querySelectorAll('.testPosBtn').forEach(btn=>btn.addEventListener('click', ()=>testPosition(btn.dataset.pos)));
  }

  (async function init(){
    try{
      await loadCharacters();
      await loadParts();
      wire();
      hideHardwareWarning();
      renderServiceStatus();
      pollPulse();
      updateServoInfo();
    }catch(e){
      log({initError:e.message});
      handleHardwareError(e);
    }
  })();
})();

