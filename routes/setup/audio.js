/**
 * Setup Audio Routes
 * Routes for audio configuration interface - PipeWire/WirePlumber Integration
 */

import express from 'express';
import { spawn } from 'child_process';
import { runWrapper } from '../../services/hardwareService/exec.js';
import pipewireService from '../../services/pipewireService.js';
import serverPlaybackService from '../../services/serverPlaybackService.js';

const router = express.Router();

// Setup audio page
router.get('/', async (req, res) => {
    try {
        res.renderWithLayout('setup/audio', {
            title: 'Setup Audio - MonsterBox',
            page: 'setup-audio',
            scripts: ['/js/setup-audio.js']
        });
    } catch (error) {
        console.error('Error rendering audio setup page:', error);
        res.status(500).renderWithLayout('error', {
            title: 'Error',
            page: 'error',
            error: 'Failed to load audio setup page',
            message: error.message
        });
    }
});

// Enumerate PipeWire sinks (audio outputs)
router.get('/api/outputs', async (req, res) => {
    try {
        if (process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true') {
            return res.json({
                success: true, outputs: [
                    { id: 'default', name: 'Default Output', description: 'Default Output [Recommended]' },
                    { id: 'pulse', name: 'PulseAudio Output', description: 'PulseAudio Output' }
                ]
            });
        }
        console.log('🔊 Enumerating PipeWire audio outputs...');
        const sinks = await pipewireService.listSinks();

        // Transform to match expected format
        const outputs = sinks.map(sink => ({
            id: sink.id,
            name: sink.name,
            description: sink.description
        }));

        console.log(`🔊 Found ${outputs.length} audio outputs`);
        res.json({ success: true, outputs });
    } catch (error) {
        console.error('Error enumerating PipeWire outputs:', error.message || error);
        // Fallback to basic defaults
        res.json({
            success: true,
            outputs: [
                { id: 'default', name: 'Default Output', description: 'Default Output [Recommended]' },
                { id: 'pulse', name: 'PulseAudio Output', description: 'PulseAudio Output' }
            ]
        });
    }
});

// Enumerate PipeWire sources (audio inputs/microphones)
router.get('/api/inputs', async (req, res) => {
    try {
        if (process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true') {
            return res.json({
                success: true, inputs: [
                    { id: 'default', name: 'Default Input', description: 'Default Input [Recommended]' },
                    { id: 'pulse', name: 'PulseAudio Input', description: 'PulseAudio Input' }
                ]
            });
        }
        console.log('🎤 Enumerating PipeWire audio inputs...');
        const sources = await pipewireService.listSources();

        // Transform to match expected format
        const inputs = sources.map(source => ({
            id: source.id,
            name: source.name,
            description: source.description
        }));

        console.log(`🎤 Found ${inputs.length} audio inputs`);
        res.json({ success: true, inputs });
    } catch (error) {
        console.error('Error enumerating PipeWire inputs:', error.message || error);
        // Fallback to basic defaults
        res.json({
            success: true,
            inputs: [
                { id: 'default', name: 'Default Input', description: 'Default Input [Recommended]' },
                { id: 'pulse', name: 'PulseAudio Input', description: 'PulseAudio Input' }
            ]
        });
    }
});

// Quick input level test without saving a Part (PipeWire compatible)
router.get('/api/input-level', async (req, res) => {
    try {
        if (process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true') {
            const device = String(req.query.device || 'default');
            return res.json({ success: true, device, level: 0.12, message: 'mocked in test mode', fallbackUsed: false });
        }
        let device = String(req.query.device || 'default');
        const sr = String(req.query.sr || req.query.sampleRate || '16000');
        const ch = String(req.query.ch || req.query.channels || '1');
        const duration = String(req.query.duration || '0.2');

        if (process.env.MB_DEBUG_AUDIO === '1') console.log(`🎤 Testing input level for device: ${device}`);

        async function probe(dev) {
            const out = await runWrapper('microphone_cli.py', ['get_level', dev, sr, ch, duration], { enableLogging: false, timeoutMs: 4000 });
            let parsed = null; try { parsed = JSON.parse(out); } catch (_) { }
            return parsed;
        }

        let parsed = await probe(device);
        let used = device; let fallbackUsed = false;

        if (!parsed || parsed.status !== 'success') {
            const fallbacks = ['default', 'pulse'].filter(d => d !== device);
            for (let i = 0; i < fallbacks.length; i++) {
                const p = await probe(fallbacks[i]).catch(() => null);
                if (p && p.status === 'success') { parsed = p; used = fallbacks[i]; fallbackUsed = true; break; }
            }
        }

        if (!parsed || parsed.status !== 'success') {
            return res.json({ success: false, error: parsed && parsed.message || 'Microphone level test failed' });
        }

        res.json({ success: true, device: used, level: parsed.level, message: parsed.message, fallbackUsed });
    } catch (error) {
        res.json({ success: false, error: String(error.message || error) });
    }
});

// List active sink inputs (playing streams)
router.get('/api/sink-inputs', async (req, res) => {
    try {
        const sinkInputs = await pipewireService.listSinkInputs();
        res.json({ success: true, sinkInputs });
    } catch (error) {
        console.error('Error listing sink inputs:', error.message);
        res.json({ success: false, error: error.message });
    }
});

// Move a sink input to a different sink
router.post('/api/move-stream', async (req, res) => {
    try {
        const { streamId, sinkId } = req.body;
        if (!streamId || !sinkId) {
            return res.status(400).json({ success: false, error: 'streamId and sinkId are required' });
        }

        console.log(`🔄 Moving stream ${streamId} to sink ${sinkId}`);
        const result = await pipewireService.moveSinkInput(streamId, sinkId);

        if (result.success) {
            res.json({ success: true, message: `Stream moved to ${sinkId}`, method: result.method });
        } else {
            res.status(500).json({ success: false, error: result.error });
        }
    } catch (error) {
        console.error('Error moving stream:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Set default sink
router.post('/api/set-default-sink', async (req, res) => {
    try {
        const { sinkId } = req.body;
        if (!sinkId) {
            return res.status(400).json({ success: false, error: 'sinkId is required' });
        }

        console.log(`🔊 Setting default sink to: ${sinkId}`);
        const result = await pipewireService.setDefaultSink(sinkId);

        if (result.success) {
            res.json({ success: true, message: `Default sink set to ${sinkId}` });
        } else {
            res.status(500).json({ success: false, error: result.error });
        }
    } catch (error) {
        console.error('Error setting default sink:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Set default source
router.post('/api/set-default-source', async (req, res) => {
    try {
        const { sourceId } = req.body;
        if (!sourceId) {
            return res.status(400).json({ success: false, error: 'sourceId is required' });
        }

        console.log(`🎤 Setting default source to: ${sourceId}`);
        const result = await pipewireService.setDefaultSource(sourceId);

        if (result.success) {
            res.json({ success: true, message: `Default source set to ${sourceId}` });
        } else {
            res.status(500).json({ success: false, error: result.error });
        }
    } catch (error) {
        console.error('Error setting default source:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get current system audio configuration
router.get('/api/system-config', async (req, res) => {
    try {
        if (process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true') {
            const config = {
                defaultSink: 'default',
                defaultSource: 'default',
                availableSinks: [
                    { id: 'default', name: 'Default Output', description: 'Default Output [Recommended]' },
                    { id: 'pulse', name: 'PulseAudio Output', description: 'PulseAudio Output' }
                ],
                availableSources: [
                    { id: 'default', name: 'Default Input', description: 'Default Input [Recommended]' },
                    { id: 'pulse', name: 'PulseAudio Input', description: 'PulseAudio Input' }
                ],
                pipewireStatus: { wpctl: true, pactl: true, pwplay: true }
            };
            return res.json({ success: true, config });
        }
        console.log('🔧 Getting system audio configuration...');

        const [sinks, sources, defaultSink, defaultSource] = await Promise.all([
            pipewireService.listSinks(),
            pipewireService.listSources(),
            pipewireService.getDefaultSink(),
            pipewireService.getDefaultSource()
        ]);

        const config = {
            defaultSink: defaultSink || 'auto',
            defaultSource: defaultSource || 'auto',
            availableSinks: sinks,
            availableSources: sources,
            pipewireStatus: await pipewireService.checkTools()
        };

        console.log(`🔧 System config: ${config.availableSinks.length} sinks, ${config.availableSources.length} sources`);
        res.json({ success: true, config });
    } catch (error) {
        console.error('Error getting system config:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Save system audio configuration
router.post('/api/system-config', async (req, res) => {
    try {
        const { defaultSink, defaultSource } = req.body;
        console.log(`🔧 Saving system config: sink=${defaultSink}, source=${defaultSource}`);

        // In test mode, do not attempt to call system tools; return success to avoid 5xx in CI
        if (process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true') {
            return res.json({
                success: true,
                message: 'System audio configuration skipped in test mode',
                results: [
                    { type: 'sink', requested: defaultSink || 'default', applied: defaultSink || 'default', success: true, testMode: true },
                    { type: 'source', requested: defaultSource || 'default', applied: defaultSource || 'default', success: true, testMode: true }
                ]
            });
        }

        const results = [];

        if (defaultSink && defaultSink !== 'auto') {
            let sinkToSet = defaultSink;
            try {
                if (String(defaultSink).startsWith('hw:')) {
                    const devices = await pipewireService.listHardwareDevices();
                    const alsaOut = (devices.outputs || []).find(d => d.id === defaultSink);
                    const sinks = await pipewireService.listSinks();
                    if (alsaOut && sinks && sinks.length) {
                        const match = sinks.find(s => (s.name && alsaOut.name && s.name.indexOf(alsaOut.name) !== -1)
                            || (s.description && alsaOut.name && s.description.indexOf(alsaOut.name) !== -1)
                            || (s.name && alsaOut.description && alsaOut.description.indexOf(s.name) !== -1));
                        if (match) sinkToSet = match.id || match.name;
                    }
                }
            } catch (_) { /* best-effort mapping */ }

            const sinkResult = await pipewireService.setDefaultSink(sinkToSet);
            results.push({ type: 'sink', requested: defaultSink, applied: sinkToSet, success: sinkResult.success, error: sinkResult.error });
        }

        if (defaultSource && defaultSource !== 'auto') {
            let toSet = defaultSource;
            try {
                // Map ALSA-style id (hw:...) to a PipeWire/Pulse source id/name
                if (String(defaultSource).startsWith('hw:')) {
                    const devices = await pipewireService.listHardwareDevices();
                    const alsa = (devices.inputs || []).find(d => d.id === defaultSource);
                    const sources = await pipewireService.listSources();
                    if (alsa && sources && sources.length) {
                        const match = sources.find(s => (s.name && alsa.name && s.name.indexOf(alsa.name) !== -1)
                            || (s.description && alsa.name && s.description.indexOf(alsa.name) !== -1)
                            || (s.name && alsa.description && alsa.description.indexOf(s.name) !== -1));
                        if (match) toSet = match.id || match.name;
                    }
                }
            } catch (_) { /* best-effort mapping */ }

            const sourceResult = await pipewireService.setDefaultSource(toSet);
            results.push({ type: 'source', requested: defaultSource, applied: toSet, success: sourceResult.success, error: sourceResult.error });
        }

        const allSuccessful = results.every(r => r.success);

        if (allSuccessful) {
            res.json({
                success: true,
                message: 'System audio configuration saved successfully',
                results
            });
        } else {
            // Avoid hard 5xx in environments without audio tooling; surface as success:false 200
            if (process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true') {
                return res.json({
                    success: false,
                    error: 'Some configuration changes failed (test mode)',
                    results
                });
            }
            res.status(500).json({
                success: false,
                error: 'Some configuration changes failed',
                results
            });
        }
    } catch (error) {
        console.error('Error saving system config:', error.message);
        if (process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true') {
            return res.json({ success: false, error: String(error.message || error), testMode: true });
        }
        res.status(500).json({ success: false, error: error.message });
    }
});

// Test audio system
router.post('/api/test-system', async (req, res) => {
    try {
        const { testType, deviceId } = req.body;
        if (!['speaker', 'microphone'].includes(testType)) {
            return res.status(400).json({ success: false, error: 'Invalid test type' });
        }
        if (process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true') {
            return res.json({ success: true, testType, deviceId: deviceId || 'default', result: 'skipped in test mode' });
        }
        console.log(`🧪 Testing audio system: ${testType} on ${deviceId}`);

        let result;

        if (testType === 'speaker') {
            // Test speaker playback
            console.log(`🔊 Playing test sound on device: ${deviceId}`);
            result = await runWrapper('speaker_cli.py', [
                'play',
                'public/sounds/monster-howl-85304.mp3',
                '25',  // volume as positional argument
                '--device', deviceId || 'default'
            ]);
        } else if (testType === 'microphone') {
            // Test microphone level with fallback (mirrors input-level endpoint logic)
            const dev = deviceId || 'default';
            async function probeMic(d) {
                const out = await runWrapper('microphone_cli.py', [
                    'get_level', d, '16000', '1', '1.0'
                ], { enableLogging: false, timeoutMs: 5000 });
                let p = null;
                try { p = JSON.parse(out); } catch (_) { /* ignore */ }
                return p;
            }

            let parsed = null;
            let usedDevice = dev;
            try {
                parsed = await probeMic(dev);
            } catch (_) {
                parsed = null;
            }
            if (!parsed || parsed.status !== 'success') {
                // Fallback to other device IDs
                const fallbacks = ['default', 'pulse'].filter(d => d !== dev);
                for (const fb of fallbacks) {
                    try {
                        const p = await probeMic(fb);
                        if (p && p.status === 'success') {
                            parsed = p;
                            usedDevice = fb;
                            break;
                        }
                    } catch (_) { /* continue */ }
                }
            }
            if (!parsed || parsed.status !== 'success') {
                return res.json({
                    success: false,
                    testType,
                    deviceId: dev,
                    error: (parsed && parsed.message) || 'Microphone test failed — no input device responded'
                });
            }
            return res.json({
                success: true,
                testType,
                deviceId: usedDevice,
                output: JSON.stringify(parsed),
                parsed,
                message: parsed.message || 'Microphone test completed',
                fallbackUsed: usedDevice !== dev
            });
        } else {
            return res.status(400).json({ success: false, error: 'Invalid test type' });
        }

        // runWrapper returns a string (stdout). Parse if JSON, otherwise return raw string
        let parsed = null;
        let message = '';
        try { parsed = typeof result === 'string' ? JSON.parse(result) : null; } catch (_) { parsed = null; }
        if (parsed && parsed.message) message = parsed.message;
        else if (typeof result === 'string' && result.trim()) message = result.trim();
        else message = 'Test completed';

        res.json({
            success: true,
            testType,
            deviceId: deviceId || 'default',
            output: typeof result === 'string' ? result : String(result || ''),
            parsed,
            message
        });
    } catch (error) {
        console.error('Error testing audio system:', error.message);
        // Return as JSON 200 with success:false rather than HTTP 500
        res.json({ success: false, testType: req.body && req.body.testType, error: error.message });
    }
});

// Get hardware devices (actual devices, not just sinks/sources)
router.get('/api/hardware-devices', async (req, res) => {
    try {
        // Fast path for tests/CI: avoid shelling out to system tools
        if (process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true') {
            return res.json({
                success: true,
                devices: {
                    outputs: [
                        { id: 'default', name: 'System Default', description: 'Default Audio Output (Recommended)', type: 'system', isDefault: true },
                        { id: 'pulse', name: 'PulseAudio Output', description: 'PulseAudio Output', type: 'system', isDefault: false }
                    ],
                    inputs: [
                        { id: 'default', name: 'System Default', description: 'Default Audio Input (Recommended)', type: 'system', isDefault: true },
                        { id: 'pulse', name: 'PulseAudio Input', description: 'PulseAudio Input', type: 'system', isDefault: false }
                    ]
                }
            });
        }

        console.log('🔧 Getting hardware devices...');
        const devices = await pipewireService.listHardwareDevices();

        console.log(`🔧 Found ${devices.outputs.length} output devices, ${devices.inputs.length} input devices`);
        res.json({ success: true, devices });
    } catch (error) {
        console.error('Error getting hardware devices:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Set input gain (source volume)
router.post('/api/set-input-gain', async (req, res) => {
    try {
        const { sourceId, deviceId, gain, gainPercent } = req.body || {};
        // Accept either sourceId or deviceId
        const id = sourceId || deviceId;
        if (!id) {
            return res.status(400).json({ success: false, error: 'sourceId or deviceId is required' });
        }
        // gain is linear 0..2; gainPercent 0..200
        let vol = typeof gain === 'number' ? gain : undefined;
        if (vol == null && typeof gainPercent === 'number') {
            vol = Math.max(0, Math.min(200, gainPercent)) / 100.0;
        }
        if (vol == null) {
            return res.status(400).json({ success: false, error: 'gain (0..2) or gainPercent (0..200) required' });
        }
        const result = await pipewireService.setSourceVolume(String(id), Number(vol));
        if (!result.success) {
            return res.status(500).json({ success: false, error: result.error || 'Failed to set source volume' });
        }
        res.json({ success: true, method: result.method, sourceId: id, gain: vol });
    } catch (error) {
        console.error('Error setting input gain:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get active audio streams
router.get('/api/active-streams', async (req, res) => {
    try {
        // In tests/CI, return empty list quickly to avoid shelling out
        if (process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true') {
            return res.json({ success: true, streams: [] });
        }
        if (process.env.MB_DEBUG_AUDIO === '1') console.log('🎵 Getting active streams...');
        const streams = await pipewireService.listActiveStreams();

        if (process.env.MB_DEBUG_AUDIO === '1') console.log(`🎵 Found ${streams.length} active streams`);
        res.json({ success: true, streams });
    } catch (error) {
        console.error('Error getting active streams:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Move stream to different sink
router.post('/api/move-stream', async (req, res) => {
    try {
        const { streamId, sinkId } = req.body;
        if (!streamId || !sinkId) {
            return res.status(400).json({ success: false, error: 'streamId and sinkId are required' });
        }

        console.log(`🎵 Moving stream ${streamId} to sink ${sinkId}`);
        const result = await pipewireService.moveSinkInput(streamId, sinkId);

        if (result.success) {
            res.json({ success: true, message: `Stream moved to ${sinkId}` });
        } else {
            res.status(500).json({ success: false, error: result.error });
        }
    } catch (error) {
        console.error('Error moving stream:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Real-time audio level monitoring with caching for performance
const audioLevelCache = new Map();
const CACHE_TTL = 80; // Cache for 80ms — short enough for responsive VU meters

// Periodic cache cleanup to prevent memory leaks
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of audioLevelCache.entries()) {
        if (now - value.timestamp > CACHE_TTL * 10) {
            audioLevelCache.delete(key);
        }
    }
}, 5000); // Clean up every 5 seconds

router.get('/api/audio-levels', async (req, res) => {
    try {
        const { deviceId, deviceType } = req.query;
        if (process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true') {
            return res.json({ success: true, level: 0.05, deviceId: deviceId || 'default', type: deviceType || 'input' });
        }

        if (deviceType === 'input') {
            const cacheKey = `input:${deviceId || 'default'}`;
            const cached = audioLevelCache.get(cacheKey);
            const now = Date.now();

            // Return cached value if still fresh
            if (cached && (now - cached.timestamp) < CACHE_TTL) {
                return res.json(cached.data);
            }

            // Get microphone level — 100ms sample for reliable peak detection
            if (process.env.MB_DEBUG_AUDIO === '1') console.log(`🎤 Getting level for input device: ${deviceId}`);
            const result = await runWrapper('microphone_cli.py', [
                'get_level',
                deviceId || 'default',
                '16000',  // Sample rate
                '1',
                '0.1'     // 100ms sample for accurate peak detection
            ], { timeoutMs: 2000, enableLogging: false });

            if (result) {
                try {
                    const data = JSON.parse(result);
                    const level = data.level || 0;
                    if (process.env.MB_DEBUG_AUDIO === '1') console.log(`🎤 Input level: ${level} for device: ${deviceId}`);

                    const responseData = {
                        success: true,
                        level: level,
                        deviceId: deviceId || 'default',
                        type: 'input'
                    };

                    // Cache the result
                    audioLevelCache.set(cacheKey, { data: responseData, timestamp: now });

                    res.json(responseData);
                } catch (parseError) {
                    console.warn('Failed to parse microphone level:', parseError);
                    res.json({ success: true, level: 0, deviceId: deviceId || 'default', type: 'input' });
                }
            } else {
                console.warn('No output from microphone_cli.py');
                res.json({ success: true, level: 0, deviceId: deviceId || 'default', type: 'input' });
            }
        } else {
            // For output, try to get sink volume level as a proxy for activity
            try {
                const sinks = await pipewireService.listSinks();
                const targetSink = sinks.find(sink =>
                    sink.name === deviceId ||
                    sink.description.includes(deviceId) ||
                    (deviceId === 'default' && sink.default)
                );

                if (targetSink && targetSink.volume) {
                    // Use volume as a proxy for output level (0-1 range)
                    const volumeLevel = parseFloat(targetSink.volume) || 0;
                    res.json({
                        success: true,
                        level: volumeLevel * 0.1, // Scale down for VU meter display
                        deviceId: deviceId || 'default',
                        type: 'output'
                    });
                } else {
                    res.json({ success: true, level: 0, deviceId: deviceId || 'default', type: 'output' });
                }
            } catch (error) {
                console.warn('Failed to get output level:', error.message);
                res.json({ success: true, level: 0, deviceId: deviceId || 'default', type: 'output' });
            }
        }
    } catch (error) {
        console.error('Error getting audio levels:', error.message);
        res.json({ success: true, level: 0, deviceId: deviceId || 'default', type: deviceType || 'unknown' });
    }
});

// Track active mic-stream SSE connections for cleanup
const activeMicStreams = new Map();

// GET /api/mic-stream — SSE endpoint: streams character mic audio as base64 PCM16LE chunks
// Used by Browser Speaker (Listen In) on the audio config page
router.get('/api/mic-stream', (req, res) => {
    // Test mode: send a few silent chunks then close
    if (process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true') {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        });
        res.write('data: {"type":"started","deviceId":"default"}\n\n');
        const silent = Buffer.alloc(3200).toString('base64'); // 100ms of silence at 16kHz
        res.write('data: {"type":"audio","audio":"' + silent + '"}\n\n');
        setTimeout(() => { try { res.end(); } catch (_) {} }, 200);
        return;
    }

    const deviceId = String(req.query.deviceId || 'default').replace(/[^a-zA-Z0-9._:\-]/g, '');
    const streamId = Date.now() + '_' + Math.random().toString(36).slice(2, 8);

    console.log(`🎧 Starting mic-stream SSE: device=${deviceId}, stream=${streamId}`);

    // SSE headers
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
    });

    // Spawn pw-record to capture from the specified PipeWire source
    const pwArgs = ['--format', 's16', '--rate', '16000', '--channels', '1'];
    if (deviceId && deviceId !== 'default') {
        pwArgs.push('--target', deviceId);
    }
    pwArgs.push('-'); // write to stdout

    let proc;
    try {
        proc = spawn('pw-record', pwArgs);
    } catch (err) {
        console.error('Failed to spawn pw-record:', err.message);
        res.write('data: {"type":"error","error":"pw-record not available"}\n\n');
        res.end();
        return;
    }

    activeMicStreams.set(streamId, proc);

    // Notify client that streaming has started
    res.write('data: {"type":"started","deviceId":"' + deviceId + '","streamId":"' + streamId + '"}\n\n');

    // Buffer pw-record output into fixed-size chunks for smooth browser playback.
    // pw-record emits arbitrary-sized data events (4KB-64KB). Sending them raw causes
    // choppy/static audio in the browser because AudioContext scheduling gaps.
    // Fixed 200ms chunks (6400 bytes at 16kHz/16-bit/mono) give consistent timing.
    const CHUNK_BYTES = 6400; // 200ms at 16kHz mono 16-bit
    let pcmBuffer = Buffer.alloc(0);

    proc.stdout.on('data', (chunk) => {
        try {
            pcmBuffer = Buffer.concat([pcmBuffer, chunk]);
            // Emit fixed-size chunks
            while (pcmBuffer.length >= CHUNK_BYTES) {
                const slice = pcmBuffer.subarray(0, CHUNK_BYTES);
                pcmBuffer = pcmBuffer.subarray(CHUNK_BYTES);
                const b64 = slice.toString('base64');
                res.write('data: {"type":"audio","audio":"' + b64 + '"}\n\n');
            }
        } catch (_) {
            // Client likely disconnected
        }
    });

    proc.stderr.on('data', (data) => {
        const msg = data.toString().trim();
        if (msg) console.warn(`pw-record stderr [${streamId}]:`, msg);
    });

    proc.on('error', (err) => {
        console.error(`pw-record error [${streamId}]:`, err.message);
        try {
            res.write('data: {"type":"error","error":"' + err.message.replace(/"/g, '\\"') + '"}\n\n');
            res.end();
        } catch (_) {}
        activeMicStreams.delete(streamId);
    });

    proc.on('exit', (code, signal) => {
        console.log(`pw-record exited [${streamId}]: code=${code}, signal=${signal}`);
        try {
            res.write('data: {"type":"ended","code":' + code + '}\n\n');
            res.end();
        } catch (_) {}
        activeMicStreams.delete(streamId);
    });

    // Cleanup when client disconnects
    req.on('close', () => {
        console.log(`🎧 Mic-stream client disconnected [${streamId}]`);
        if (proc && !proc.killed) {
            try { proc.kill('SIGTERM'); } catch (_) {}
        }
        activeMicStreams.delete(streamId);
    });
});

// POST /api/mic-stream/stop — Stop a specific mic stream (or all)
router.post('/api/mic-stream/stop', express.json(), (req, res) => {
    const { streamId } = req.body || {};
    if (streamId) {
        const proc = activeMicStreams.get(streamId);
        if (proc && !proc.killed) {
            try { proc.kill('SIGTERM'); } catch (_) {}
        }
        activeMicStreams.delete(streamId);
        return res.json({ success: true, stopped: streamId });
    }
    // Stop all
    for (const [id, proc] of activeMicStreams) {
        if (proc && !proc.killed) {
            try { proc.kill('SIGTERM'); } catch (_) {}
        }
    }
    const count = activeMicStreams.size;
    activeMicStreams.clear();
    res.json({ success: true, stoppedAll: count });
});

// POST /api/browser-mic-chunk — Receive base64 PCM16LE audio from browser mic, play on character speaker
router.post('/api/browser-mic-chunk', express.json({ limit: '1mb' }), async (req, res) => {
    try {
        const { audio, deviceId } = req.body || {};
        if (!audio) {
            return res.status(400).json({ success: false, error: 'audio (base64 PCM16LE) required' });
        }

        // Test mode: acknowledge without playing
        if (process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true') {
            return res.json({ success: true, played: false, testMode: true });
        }

        const buffer = Buffer.from(audio, 'base64');
        if (buffer.length === 0) {
            return res.json({ success: true, played: false, error: 'empty audio' });
        }

        const result = await serverPlaybackService.writePcmStream(buffer, {
            deviceId: deviceId || 'default',
            sampleRate: 16000,
            volume: 100,
            kind: 'browser-mic'
        });

        res.json({ success: true, played: true, deviceId: deviceId || 'default', streamed: buffer.length });
    } catch (error) {
        console.error('Error playing browser mic audio:', error.message);
        res.json({ success: false, error: error.message });
    }
});

// POST /api/browser-mic/stop — Stop the pw-play PCM stream used for browser mic playback
router.post('/api/browser-mic/stop', express.json(), async (req, res) => {
    try {
        await serverPlaybackService.stopPcmStream({ characterId: 'default' });
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

export default router;
