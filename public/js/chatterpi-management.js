/**
 * ChatterPi Jaw Animation Management - Client-side JavaScript
 * 
 * Handles real-time jaw animation control, audio visualization,
 * and WebSocket communication with the servo service.
 */

// Global state
let currentCharacterId = 4; // Default to Skulltalker
let animationActive = false;
let monitoringInterval = null;
let audioContext = null;
let microphone = null;
let audioAnalyzer = null;

// Initialize page
document.addEventListener('DOMContentLoaded', function() {
    initializePage();
    checkSystemStatus();
    setupEventListeners();
});

function initializePage() {
    console.log('🎭 Initializing ChatterPi Management Interface');
    
    // Get current character from selector
    const characterSelector = document.getElementById('character-selector');
    if (characterSelector) {
        currentCharacterId = parseInt(characterSelector.value) || 4;
    }
    
    // Auto-start animation when page loads
    setTimeout(() => {
        if (confirm('Start jaw animation automatically?')) {
            startAnimation();
        }
    }, 1000);
}

function setupEventListeners() {
    // Character selector change
    const characterSelector = document.getElementById('character-selector');
    if (characterSelector) {
        characterSelector.addEventListener('change', function() {
            currentCharacterId = parseInt(this.value);
            loadCharacterConfig();
        });
    }

    // Servo slider real-time update
    const servoSlider = document.getElementById('servo-slider');
    if (servoSlider) {
        servoSlider.addEventListener('input', function() {
            updateServoDisplay(this.value);
        });
    }

    // Auto-save configuration when sliders change
    const configSliders = ['attack-slider', 'release-slider', 'sensitivity-slider'];
    configSliders.forEach(sliderId => {
        const slider = document.getElementById(sliderId);
        if (slider) {
            slider.addEventListener('input', function() {
                // Update display
                switch(sliderId) {
                    case 'attack-slider':
                        updateAttackDisplay(this.value);
                        break;
                    case 'release-slider':
                        updateReleaseDisplay(this.value);
                        break;
                    case 'sensitivity-slider':
                        updateSensitivityDisplay(this.value);
                        break;
                }

                // Auto-save after changes
                autoSaveCharacterConfig();
            });
        }
    });

    // Audio source change
    const audioSourceSelector = document.getElementById('audio-source');
    if (audioSourceSelector) {
        audioSourceSelector.addEventListener('change', function() {
            console.log(`🎤 Audio source changed to: ${this.value}`);
            // Auto-save audio source preference
            autoSaveCharacterConfig();
        });
    }
}

async function checkSystemStatus() {
    try {
        const response = await fetch('/chatterpi/api/status');
        const result = await response.json();
        
        if (result.success) {
            updateConnectionStatus(result.status);
        } else {
            showConnectionError('Failed to get system status');
        }
    } catch (error) {
        console.error('Status check failed:', error);
        showConnectionError('Connection failed');
    }
}

function updateConnectionStatus(status) {
    const statusElement = document.getElementById('connection-status');
    const statusText = document.getElementById('status-text');
    const statusSpinner = document.getElementById('status-spinner');
    const websocketStatus = document.getElementById('websocket-status');
    
    if (status.servo.connected) {
        statusElement.className = 'alert alert-success mb-6';
        statusText.textContent = `Connected to servo service (Port ${status.servo.port}, Pin ${status.servo.pin})`;
        statusSpinner.style.display = 'none';
        
        if (websocketStatus) {
            websocketStatus.textContent = 'Connected';
            websocketStatus.className = 'badge badge-success';
        }
    } else {
        statusElement.className = 'alert alert-error mb-6';
        statusText.textContent = 'Servo service disconnected';
        statusSpinner.style.display = 'none';
        
        if (websocketStatus) {
            websocketStatus.textContent = 'Disconnected';
            websocketStatus.className = 'badge badge-error';
        }
    }
}

function showConnectionError(message) {
    const statusElement = document.getElementById('connection-status');
    const statusText = document.getElementById('status-text');
    const statusSpinner = document.getElementById('status-spinner');
    
    statusElement.className = 'alert alert-error mb-6';
    statusText.textContent = message;
    statusSpinner.style.display = 'none';
}

function updateServoDisplay(angle) {
    const display = document.getElementById('servo-angle-display');
    if (display) {
        display.textContent = angle + '°';
    }
}

async function moveToPosition(angle) {
    try {
        const response = await fetch('/chatterpi/api/servo/move', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                angle: angle,
                duration: 0.5,
                characterId: currentCharacterId
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            updateCurrentPosition(angle);
            showMessage('success', `Moved to ${angle}°`);
        } else {
            showMessage('error', 'Failed to move servo: ' + result.error);
        }
    } catch (error) {
        console.error('Move servo error:', error);
        showMessage('error', 'Failed to move servo');
    }
}

function moveToSliderPosition() {
    const slider = document.getElementById('servo-slider');
    if (slider) {
        const angle = parseInt(slider.value);
        moveToPosition(angle);
    }
}

async function startAnimation() {
    try {
        const audioSource = document.getElementById('audio-source').value;
        
        const response = await fetch('/chatterpi/api/animation/start', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                characterId: currentCharacterId,
                audioSource: audioSource
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            animationActive = true;
            updateAnimationControls(true);
            startMonitoring();
            
            // Initialize audio processing if microphone source
            if (audioSource === 'microphone') {
                await initializeAudioProcessing();
            }
            
            showMessage('success', 'Jaw animation started');
        } else {
            showMessage('error', 'Failed to start animation: ' + result.error);
        }
    } catch (error) {
        console.error('Start animation error:', error);
        showMessage('error', 'Failed to start animation');
    }
}

async function stopAnimation() {
    try {
        const response = await fetch('/chatterpi/api/animation/stop', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                characterId: currentCharacterId
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            animationActive = false;
            updateAnimationControls(false);
            stopMonitoring();
            stopAudioProcessing();
            showMessage('success', 'Jaw animation stopped');
        } else {
            showMessage('error', 'Failed to stop animation: ' + result.error);
        }
    } catch (error) {
        console.error('Stop animation error:', error);
        showMessage('error', 'Failed to stop animation');
    }
}

function updateAnimationControls(active) {
    const startBtn = document.getElementById('start-animation');
    const stopBtn = document.getElementById('stop-animation');
    const statusBadge = document.getElementById('animation-status');
    
    if (startBtn) startBtn.disabled = active;
    if (stopBtn) stopBtn.disabled = !active;
    
    if (statusBadge) {
        statusBadge.textContent = active ? 'Running' : 'Stopped';
        statusBadge.className = active ? 'badge badge-success' : 'badge badge-outline';
    }
}

async function loadCharacterConfig() {
    try {
        showMessage('info', 'Loading character configuration...');

        // Activate character and load full configuration
        const response = await fetch(`/chatterpi/api/character/${currentCharacterId}/activate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const result = await response.json();

        if (result.success) {
            console.log('Loaded character config:', result.config);
            console.log('Character parts:', result.parts);

            // Update UI with character-specific settings
            updateUIWithCharacterConfig(result.config, result.character);

            // Update parts information
            updatePartsDisplay(result.parts);

            showMessage('success', `Activated ${result.character.name} with loaded configuration`);
        } else {
            showMessage('error', 'Failed to load character config: ' + result.error);
        }
    } catch (error) {
        console.error('Load character config error:', error);
        showMessage('error', 'Failed to load character config');
    }
}

function updateUIWithCharacterConfig(config, character) {
    // Update jaw animation settings
    if (config.jaw && config.jaw.audioAnalysis) {
        const attackSlider = document.getElementById('attack-slider');
        const releaseSlider = document.getElementById('release-slider');
        const sensitivitySlider = document.getElementById('sensitivity-slider');

        if (attackSlider && config.jaw.audioAnalysis.attackTime !== undefined) {
            attackSlider.value = config.jaw.audioAnalysis.attackTime;
            updateAttackDisplay(config.jaw.audioAnalysis.attackTime);
        }

        if (releaseSlider && config.jaw.audioAnalysis.releaseTime !== undefined) {
            releaseSlider.value = config.jaw.audioAnalysis.releaseTime;
            updateReleaseDisplay(config.jaw.audioAnalysis.releaseTime);
        }

        if (sensitivitySlider && config.jaw.audioAnalysis.sensitivity !== undefined) {
            sensitivitySlider.value = config.jaw.audioAnalysis.sensitivity;
            updateSensitivityDisplay(config.jaw.audioAnalysis.sensitivity);
        }
    }

    // Update servo positions if available
    if (config.jaw && config.jaw.servo) {
        const servoSlider = document.getElementById('servo-slider');
        if (servoSlider) {
            // Set to closed position by default
            const closedAngle = config.jaw.servo.closedAngle || 50;
            servoSlider.value = closedAngle;
            updateServoDisplay(closedAngle);
            updateCurrentPosition(closedAngle);
        }
    }

    console.log(`🎭 Updated UI for character: ${character.name}`);
}

function updatePartsDisplay(partsInfo) {
    if (!partsInfo) return;

    console.log(`🔧 Character has ${partsInfo.totalParts} parts`);

    if (partsInfo.jawServoPart) {
        console.log(`🦴 Jaw servo found: ${partsInfo.jawServoPart.name} on pin ${partsInfo.jawServoPart.pin}`);

        // Update status display with jaw servo info
        const statusElements = document.querySelectorAll('[data-servo-info]');
        statusElements.forEach(element => {
            element.textContent = `Pin ${partsInfo.jawServoPart.pin} (${partsInfo.jawServoPart.name})`;
        });
    }
}

// Auto-save character configuration when settings change
function autoSaveCharacterConfig() {
    // Debounce auto-save to avoid too frequent saves
    if (autoSaveCharacterConfig.timeout) {
        clearTimeout(autoSaveCharacterConfig.timeout);
    }

    autoSaveCharacterConfig.timeout = setTimeout(async () => {
        try {
            const config = getCurrentConfiguration();

            const response = await fetch(`/chatterpi/api/character/${currentCharacterId}/config`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ config: { jaw: config } })
            });

            const result = await response.json();

            if (result.success) {
                console.log('✅ Auto-saved character configuration');
            }
        } catch (error) {
            console.debug('Auto-save failed:', error);
        }
    }, 2000); // Save 2 seconds after last change
}

async function testServo() {
    try {
        showMessage('info', 'Running servo test...');
        
        const response = await fetch('/chatterpi/api/test/servo', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                characterId: currentCharacterId
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showMessage('success', 'Servo test completed successfully');
        } else {
            showMessage('error', 'Servo test failed: ' + result.error);
        }
    } catch (error) {
        console.error('Servo test error:', error);
        showMessage('error', 'Servo test failed');
    }
}

function startMonitoring() {
    if (monitoringInterval) {
        clearInterval(monitoringInterval);
    }
    
    monitoringInterval = setInterval(() => {
        if (animationActive) {
            // Simulate real-time updates (in production, this would come from WebSocket)
            updateAudioVisualization();
            updateSystemMetrics();
        }
    }, 100); // 10 FPS update rate
}

function stopMonitoring() {
    if (monitoringInterval) {
        clearInterval(monitoringInterval);
        monitoringInterval = null;
    }
}

function updateAudioVisualization() {
    // Simulate audio levels for demonstration
    const rawLevel = Math.random() * 0.8;
    const smoothedLevel = rawLevel * 0.7;
    const voiceDetected = rawLevel > 0.1;
    
    // Update displays
    document.getElementById('audio-raw').textContent = rawLevel.toFixed(2);
    document.getElementById('audio-smoothed').textContent = smoothedLevel.toFixed(2);
    document.getElementById('voice-detection').textContent = voiceDetected ? 'Voice Detected' : 'No Voice';
    
    // Update progress bars
    document.getElementById('audio-raw-bar').style.width = (rawLevel * 100) + '%';
    document.getElementById('audio-smoothed-bar').style.width = (smoothedLevel * 100) + '%';
    document.getElementById('voice-detection-bar').style.width = voiceDetected ? '100%' : '0%';
}

function updateSystemMetrics() {
    // Simulate system metrics
    document.getElementById('update-rate').textContent = '50 Hz';
    document.getElementById('latency').textContent = Math.floor(Math.random() * 20 + 5) + ' ms';
}

function updateCurrentPosition(angle) {
    const positionDisplay = document.getElementById('current-servo-position');
    if (positionDisplay) {
        positionDisplay.textContent = angle + '°';
    }
}

async function initializeAudioProcessing() {
    try {
        const audioSource = document.getElementById('audio-source').value;

        switch (audioSource) {
            case 'microphone':
                await initializeMicrophoneProcessing();
                break;
            case 'tts':
                console.log('🗣️ TTS audio processing ready');
                break;
            case 'files':
                console.log('📁 File audio processing ready');
                break;
            case 'streams':
                console.log('📡 Stream audio processing ready');
                break;
            default:
                throw new Error('Unknown audio source: ' + audioSource);
        }

        console.log(`🎤 Audio processing initialized for ${audioSource}`);
    } catch (error) {
        console.error('Audio initialization failed:', error);
        showMessage('error', 'Failed to initialize audio processing');
    }
}

async function initializeMicrophoneProcessing() {
    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('Microphone access not supported');
        }

        // Start server-side microphone processing
        const response = await fetch('/chatterpi/api/audio/microphone/start', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                characterId: currentCharacterId,
                sampleRate: 44100,
                channels: 1
            })
        });

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error);
        }

        // Initialize client-side audio context for visualization
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                sampleRate: 44100,
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true
            }
        });

        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        microphone = audioContext.createMediaStreamSource(stream);
        audioAnalyzer = audioContext.createAnalyser();

        microphone.connect(audioAnalyzer);
        audioAnalyzer.fftSize = 256;
        audioAnalyzer.smoothingTimeConstant = 0.8;

        // Start real-time audio analysis
        startAudioAnalysis();

        console.log('🎤 Microphone processing initialized with WebRTC VAD');
    } catch (error) {
        console.error('Microphone initialization failed:', error);
        throw error;
    }
}

function startAudioAnalysis() {
    if (!audioAnalyzer) return;

    const bufferLength = audioAnalyzer.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    function analyze() {
        if (!animationActive || !audioAnalyzer) return;

        audioAnalyzer.getByteFrequencyData(dataArray);

        // Calculate volume level
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i];
        }
        const volume = sum / bufferLength / 255;

        // Send volume data to server for jaw animation
        sendVolumeData(volume);

        // Continue analysis
        requestAnimationFrame(analyze);
    }

    analyze();
}

async function sendVolumeData(volume) {
    try {
        await fetch('/chatterpi/api/audio/data', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                volume: volume,
                timestamp: Date.now(),
                characterId: currentCharacterId
            })
        });
    } catch (error) {
        // Silently handle errors to avoid flooding console
        console.debug('Volume data send error:', error);
    }
}

async function stopAudioProcessing() {
    try {
        const audioSource = document.getElementById('audio-source').value;

        // Stop server-side processing based on audio source
        if (audioSource === 'microphone') {
            await fetch('/chatterpi/api/audio/microphone/stop', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    characterId: currentCharacterId
                })
            });
        }

        // Clean up client-side audio context
        if (audioContext) {
            audioContext.close();
            audioContext = null;
            microphone = null;
            audioAnalyzer = null;
        }

        console.log(`🔇 Stopped audio processing for ${audioSource}`);
    } catch (error) {
        console.error('Stop audio processing error:', error);
    }
}

// TTS Processing Functions
async function processTTSAudio(text, voiceId) {
    try {
        const response = await fetch('/chatterpi/api/audio/tts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text: text,
                voiceId: voiceId,
                characterId: currentCharacterId
            })
        });

        const result = await response.json();

        if (result.success) {
            showMessage('success', 'TTS processing started with jaw animation');
        } else {
            showMessage('error', 'TTS processing failed: ' + result.error);
        }
    } catch (error) {
        console.error('TTS processing error:', error);
        showMessage('error', 'TTS processing failed');
    }
}

// Audio File Processing Functions
async function processAudioFile(filePath) {
    try {
        const response = await fetch('/chatterpi/api/audio/file', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                filePath: filePath,
                characterId: currentCharacterId
            })
        });

        const result = await response.json();

        if (result.success) {
            showMessage('success', 'Audio file processing started with jaw animation');
        } else {
            showMessage('error', 'Audio file processing failed: ' + result.error);
        }
    } catch (error) {
        console.error('Audio file processing error:', error);
        showMessage('error', 'Audio file processing failed');
    }
}

// Audio Stream Processing Functions
async function processAudioStream(streamUrl, format = 'mp3') {
    try {
        const response = await fetch('/chatterpi/api/audio/stream', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                streamUrl: streamUrl,
                format: format,
                characterId: currentCharacterId
            })
        });

        const result = await response.json();

        if (result.success) {
            showMessage('success', 'Audio stream processing started with jaw animation');
        } else {
            showMessage('error', 'Audio stream processing failed: ' + result.error);
        }
    } catch (error) {
        console.error('Audio stream processing error:', error);
        showMessage('error', 'Audio stream processing failed');
    }
}

// Advanced Configuration Functions
function updateAttackDisplay(value) {
    document.getElementById('attack-display').textContent = value + 's';
}

function updateReleaseDisplay(value) {
    document.getElementById('release-display').textContent = value + 's';
}

function updateSensitivityDisplay(value) {
    document.getElementById('sensitivity-display').textContent = value;
}

async function applyPreset(presetName) {
    try {
        const response = await fetch(`/chatterpi/api/preset/${presetName}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                characterId: currentCharacterId
            })
        });

        const result = await response.json();

        if (result.success) {
            // Update UI sliders with preset values
            updateSlidersFromPreset(result.preset);
            showMessage('success', `Applied ${presetName} preset`);
        } else {
            showMessage('error', 'Failed to apply preset: ' + result.error);
        }
    } catch (error) {
        console.error('Apply preset error:', error);
        showMessage('error', 'Failed to apply preset');
    }
}

function updateSlidersFromPreset(preset) {
    if (preset.attackTime !== undefined) {
        const attackSlider = document.getElementById('attack-slider');
        if (attackSlider) {
            attackSlider.value = preset.attackTime;
            updateAttackDisplay(preset.attackTime);
        }
    }

    if (preset.releaseTime !== undefined) {
        const releaseSlider = document.getElementById('release-slider');
        if (releaseSlider) {
            releaseSlider.value = preset.releaseTime;
            updateReleaseDisplay(preset.releaseTime);
        }
    }

    if (preset.sensitivity !== undefined) {
        const sensitivitySlider = document.getElementById('sensitivity-slider');
        if (sensitivitySlider) {
            sensitivitySlider.value = preset.sensitivity;
            updateSensitivityDisplay(preset.sensitivity);
        }
    }
}

async function saveConfiguration() {
    try {
        const config = getCurrentConfiguration();

        const response = await fetch(`/chatterpi/api/character/${currentCharacterId}/config`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ config })
        });

        const result = await response.json();

        if (result.success) {
            showMessage('success', 'Configuration saved successfully');
        } else {
            showMessage('error', 'Failed to save configuration: ' + result.error);
        }
    } catch (error) {
        console.error('Save configuration error:', error);
        showMessage('error', 'Failed to save configuration');
    }
}

function getCurrentConfiguration() {
    return {
        servo: {
            pin: 18,
            closedAngle: 50,
            openAngle: 30,
            stepThreshold: 0.5,
            updateRate: 50
        },
        audioAnalysis: {
            attackTime: parseFloat(document.getElementById('attack-slider').value),
            releaseTime: parseFloat(document.getElementById('release-slider').value),
            sensitivity: parseFloat(document.getElementById('sensitivity-slider').value),
            volumeThreshold: 0.005,
            silenceTimeout: 500
        }
    };
}

async function loadConfiguration() {
    await loadCharacterConfig();
}

function exportConfiguration() {
    const config = getCurrentConfiguration();
    const dataStr = JSON.stringify(config, null, 2);
    const dataBlob = new Blob([dataStr], {type: 'application/json'});

    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `chatterpi-config-character-${currentCharacterId}.json`;
    link.click();

    showMessage('success', 'Configuration exported');
}

function resetConfiguration() {
    if (confirm('Reset all settings to defaults?')) {
        // Reset sliders to default values
        document.getElementById('attack-slider').value = 0.1;
        document.getElementById('release-slider').value = 0.01;
        document.getElementById('sensitivity-slider').value = 0.005;

        // Update displays
        updateAttackDisplay(0.1);
        updateReleaseDisplay(0.01);
        updateSensitivityDisplay(0.005);

        showMessage('success', 'Configuration reset to defaults');
    }
}

// Help Modal Functions
function showHelpModal() {
    const modal = document.getElementById('helpModal');
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('modal-open');
    }
}

function closeHelpModal() {
    const modal = document.getElementById('helpModal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('modal-open');
    }
}

// Real-time Feedback Functions
function showFeedback(message, duration = 3000) {
    const overlay = document.getElementById('feedbackOverlay');
    const text = document.getElementById('feedbackText');

    if (overlay && text) {
        text.textContent = message;
        overlay.style.display = 'block';

        setTimeout(() => {
            overlay.style.display = 'none';
        }, duration);
    }
}

function showConfigurationFeedback(parameterName, value) {
    showFeedback(`${parameterName} updated to ${value}`, 2000);
}

// Enhanced display update functions with feedback
function updateAttackDisplay(value) {
    document.getElementById('attack-display').textContent = value + 's';
    showConfigurationFeedback('Response Speed', value + 's');
}

function updateReleaseDisplay(value) {
    document.getElementById('release-display').textContent = value + 's';
    showConfigurationFeedback('Decay Speed', value + 's');
}

function updateSensitivityDisplay(value) {
    document.getElementById('sensitivity-display').textContent = value;
    showConfigurationFeedback('Voice Sensitivity', value);
}

// Enhanced preset application with visual feedback
async function applyPreset(presetName) {
    try {
        showFeedback(`Applying ${presetName} preset...`);

        const response = await fetch(`/chatterpi/api/preset/${presetName}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                characterId: currentCharacterId
            })
        });

        const result = await response.json();

        if (result.success) {
            // Update UI sliders with preset values
            updateSlidersFromPreset(result.preset);
            showMessage('success', `Applied ${presetName} preset`);
            showFeedback(`${presetName} preset applied successfully!`);
        } else {
            showMessage('error', 'Failed to apply preset: ' + result.error);
        }
    } catch (error) {
        console.error('Apply preset error:', error);
        showMessage('error', 'Failed to apply preset');
    }
}

// Enhanced configuration management with feedback
async function saveConfiguration() {
    try {
        showFeedback('Saving configuration...');

        const config = getCurrentConfiguration();

        const response = await fetch(`/chatterpi/api/character/${currentCharacterId}/config`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ config: { jaw: config } })
        });

        const result = await response.json();

        if (result.success) {
            showMessage('success', 'Configuration saved successfully');
            showFeedback('Configuration saved and applied!');
        } else {
            showMessage('error', 'Failed to save configuration: ' + result.error);
        }
    } catch (error) {
        console.error('Save configuration error:', error);
        showMessage('error', 'Failed to save configuration');
    }
}

function showMessage(type, message) {
    const container = document.getElementById('messageContainer');
    if (!container) return;

    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} shadow-lg max-w-md`;
    alertDiv.innerHTML = `
        <div>
            <span>${message}</span>
        </div>
    `;

    container.appendChild(alertDiv);

    // Remove after 3 seconds
    setTimeout(() => {
        alertDiv.remove();
    }, 3000);
}
