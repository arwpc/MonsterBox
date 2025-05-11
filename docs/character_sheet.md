# Cyberpunk Character Sheet

<style>
.cyberpunk-sheet {
  background: #0d0d0d;
  color: #00ff99;
  font-family: 'Fira Mono', 'Consolas', 'Monaco', monospace;
  border: 2px solid #00ff99;
  border-radius: 10px;
  padding: 2em;
  max-width: 800px;
  margin: 2em auto;
  box-shadow: 0 0 20px #00ff9944, 0 0 5px #00ff9922;
}
.cyberpunk-sheet h1, .cyberpunk-sheet h2 {
  color: #00ff99;
  letter-spacing: 0.1em;
  border-bottom: 1px solid #00ff9944;
  padding-bottom: 0.2em;
}
.cyberpunk-sheet img {
  border: 2px solid #00ff99;
  border-radius: 8px;
  max-width: 200px;
  margin-bottom: 1em;
  box-shadow: 0 0 10px #00ff9977;
}
.cyberpunk-sheet .section {
  margin-bottom: 1.5em;
}
.cyberpunk-sheet .label {
  color: #00ffcc;
  font-weight: bold;
  margin-right: 0.5em;
}
.cyberpunk-sheet .hardware-list, .cyberpunk-sheet .sound-list {
  background: #111;
  border: 1px solid #00ff99;
  border-radius: 6px;
  padding: 0.5em 1em;
  margin: 0.5em 0;
}
.cyberpunk-sheet .note {
  background: #1a1a1a;
  border-left: 4px solid #00ff99;
  padding: 0.5em 1em;
  color: #baffd9;
  margin: 0.5em 0;
  font-size: 1em;
}
</style>

<div class="cyberpunk-sheet">
  <h1>Cyberpunk Character Sheet</h1>

  <div class="section">
    <span class="label">Name:</span> <span>NeoSynth</span>
  </div>
  <div class="section">
    <img src="img/character_sample.png" alt="Character Picture">
  </div>
  <div class="section">
    <span class="label">Description:</span>
    <span>Elite netrunner with a mysterious past. Master of digital infiltration.</span>
  </div>
  <div class="section">
    <span class="label">IP Address:</span> <span>192.168.1.42</span>
  </div>
  <div class="section">
    <span class="label">Samba Login:</span> <span>neosynth</span><br>
    <span class="label">Samba Password:</span> <span>********</span>
  </div>
  <div class="section">
    <span class="label">SSH Login:</span> <span>neo@cyberdeck</span><br>
    <span class="label">SSH Password:</span> <span>********</span>
  </div>
  <div class="section">
    <span class="label">Hardware Overview:</span>
    <div class="hardware-list">
      <ul>
        <li>Raspberry Pi 4B</li>
        <li>USB Camera (active)</li>
        <li>Adafruit Audio FX Sound Board</li>
        <li>Servo Controller (PCA9685)</li>
      </ul>
    </div>
  </div>
  <div class="section">
    <span class="label">Video Usage:</span> <span>Camera active, streaming to HQ</span>
  </div>
  <div class="section">
    <span class="label">Sound List:</span>
    <div class="sound-list">
      <ul>
        <li>startup.wav (2s)</li>
        <li>alarm.wav (5s)</li>
        <li>greeting.wav (3s)</li>
      </ul>
    </div>
  </div>
  <div class="section">
    <span class="label">Notes/Improvements:</span>
    <div class="note">Upgrade to infrared camera. Add voice modulation for disguise operations.</div>
  </div>
</div>
