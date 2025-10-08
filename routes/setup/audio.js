/**
 * Setup Audio Routes
 * Routes for audio configuration interface - PipeWire/WirePlumber Integration
 */

import express from 'express';
import { runWrapper } from '../../services/hardwareService/exec.js';
import pipewireService from '../../services/pipewireService.js';

const router = express.Router();

// Setup audio page
router.get('/', async (req, res) => {
    try {
        res.render('setup/audio', {
            title: 'Setup Audio - MonsterBox 4.0',
            page: 'setup-audio',
            config: { theme: 'dark' }
        });
    } catch (error) {
        console.error('Error rendering audio setup page:', error);
        res.status(500).render('error', {
            title: 'Error',
            page: 'error',
            config: { theme: 'dark' },
            error: 'Failed to load audio setup page',
            message: error.message
        });
    }
});

// Enumerate PipeWire sinks (audio outputs)
router.get('/api/outputs', async (req, res) => {
    try {
        if (process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true') {
            return res.json({ success: true, outputs: [
                { id: 'default', name: 'Default Output', description: 'Default Output [Recommended]' },
                { id: 'pulse', name: 'PulseAudio Output', description: 'PulseAudio Output' }
            ]});
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
            return res.json({ success: true, inputs: [
                { id: 'default', name: 'Default Input', description: 'Default Input [Recommended]' },
                { id: 'pulse', name: 'PulseAudio Input', description: 'PulseAudio Input' }
            ]});
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
                pipewireStatus: { wpctl: false, pactl: false, pwplay: false }
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
            // Test microphone level
            result = await runWrapper('microphone_cli.py', [
                'get_level',
                deviceId || 'default',
                '16000',
                '1',
                '1.0'
            ]);
        } else {
            return res.status(400).json({ success: false, error: 'Invalid test type' });
        }

        res.json({
            success: true,
            testType,
            deviceId: deviceId || 'default',
            result: result.stdout || result.stderr || 'Test completed'
        });
    } catch (error) {
        console.error('Error testing audio system:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get hardware devices (actual devices, not just sinks/sources)
router.get('/api/hardware-devices', async (req, res) => {
    try {
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

// Real-time audio level monitoring
router.get('/api/audio-levels', async (req, res) => {
    try {
        const { deviceId, deviceType } = req.query;
        if (process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true') {
            return res.json({ success: true, level: 0.05, deviceId: deviceId || 'default', type: deviceType || 'input' });
        }

        if (deviceType === 'input') {
            // Get microphone level with shorter duration for real-time response
            if (process.env.MB_DEBUG_AUDIO === '1') console.log(`🎤 Getting level for input device: ${deviceId}`);
            const result = await runWrapper('microphone_cli.py', [
                'get_level',
                deviceId || 'default',
                '16000',  // Sample rate
                '1',
                '0.03'     // Short duration for snappy VU (30ms)
            ], { timeoutMs: 2000, enableLogging: false });

            if (result) {
                try {
                    const data = JSON.parse(result);
                    const level = data.level || 0;
                    if (process.env.MB_DEBUG_AUDIO === '1') console.log(`🎤 Input level: ${level} for device: ${deviceId}`);
                    res.json({
                        success: true,
                        level: level,
                        deviceId: deviceId || 'default',
                        type: 'input'
                    });
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

export default router;
