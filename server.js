#!/usr/bin/env node

/**
 * MonsterBox - Animatronic Control System
 * Single Node Express Server with Conversation Mode, Poses, and AI Integration
 * Unified navigation with consolidated features
 */

import { execSync } from 'child_process';
import express from 'express';
import fs from 'fs/promises';
import https from 'https';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pkg = require('./package.json');

// Route imports
import setupAudioRoutes from './routes/setup/audio.js';
import setupCalibrationRoutes from './routes/setup/calibration.js';
import panicRoutes from './routes/api/panicRoutes.js';
import setupCharactersRoutes from './routes/setup/characters.js';
import setupModelsRoutes from './routes/setup/models.js';
import setupPosesRoutes from './routes/setup/poses.js';
import setupJawAnimationRoutes from './routes/setup/jaw-animation.js';
import setupHeadAnimationRoutes from './routes/setup/head-animation.js';
import setupSystemRoutes from './routes/setup/system.js';
import calibrationApiRouter from './server/calibration/router.js';

import firstRunRoutes from './routes/firstRun.js';

import aiSettingsRoutes from './routes/aiSettingsRoutes.js';
import audioLoopApiRoutes from './routes/api/audioLoopRoutes.js';
import characterImagesApiRoutes from './routes/api/characterImagesRoutes.js';
import charactersApiRoutes from './routes/api/charactersRoutes.js';
import elevenLabsApiRoutes from './routes/api/elevenLabsApiRoutes.js';
import orchestrationRoutes from './routes/api/orchestrationRoutes.js';
import partsApiRoutes from './routes/api/partsApi.js';
import randomPoseRoutes from './routes/api/randomPoseRoutes.js';
import sceneEditorApiRoutes from './routes/api/sceneEditorApi.js';
import systemApiRoutes from './routes/api/systemRoutes.js';
import audioLibraryRoutes from './routes/audioLibrary.js';
import conversationRoutes from './routes/conversation.js';
import goblinManagementRoutes from './routes/goblinManagement.js';
import orchestrationWebRoutes from './routes/orchestration.js';
import posesRoutes from './routes/poses/index.js';
import scenesApiRoutes from './routes/scenes/api.js';
import scenesRoutes from './routes/scenes/index.js';
import { pageRouter as scheduleWebRoutes, apiRouter as scheduleApiRoutes } from './routes/scheduleRoutes.js';
import configApiRoutes from './routes/api/configRoutes.js';
import { getHostnameCharacterId, updateSelectedCharacter } from './services/configService.js';
import videoLibraryRoutes from './routes/videoLibrary.js';
import audioHealthMonitor from './services/AudioHealthMonitor.js';
import elevenLabsWebSocketService from './services/elevenLabsWebSocketService.js';
import goblinManagerService from './services/goblinManagerService.js';
import orchestrationService from './services/orchestrationService.js';
import nodeDiscoveryService from './services/nodeDiscoveryService.js';
import * as jawAnimationAudioIntegration from './services/jawAnimationAudioIntegration.js';
import jawServoDaemon from './services/jawServoDaemon.js';
import pipewireService from './services/pipewireService.js';
import serverPlaybackService from './services/serverPlaybackService.js';
import systemService from './services/systemService.js';
import movementApiRoutes from './routes/api/movement.js';
import gestureApiRoutes from './routes/api/gestures.js';
import resourceApiRoutes, { setMemoryMonitor } from './routes/api/resource.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Global safety: do not crash the process on unexpected errors
process.on('uncaughtException', function (err) {
    console.error('[FATAL] Uncaught exception:', err && err.stack || err);
});
process.on('unhandledRejection', function (reason, p) {
    console.error('[FATAL] Unhandled rejection:', reason);
});

const app = express();

let shuttingDown = false;

// --- Resource Management: Single Instance + Priority + Health ---
let singleInstance = null;
let memoryMonitorInstance = null;
try {
    singleInstance = await import('./services/resource/singleInstance.js');
    await singleInstance.acquireLock();
    console.log(`🔒 PID lock acquired (PID ${process.pid})`);
} catch (e) {
    if (e.code !== 'ERR_MODULE_NOT_FOUND') {
        console.error('Single instance lock failed:', e.message);
        process.exit(1);
    }
}

try {
    const { setProcessPriority } = await import('./services/resource/processPriority.js');
    const result = setProcessPriority();
    if (result.success) console.log(`⚡ Process priority elevated (nice ${result.nice})`);
} catch (e) {
    if (e.code !== 'ERR_MODULE_NOT_FOUND') console.warn('Process priority:', e.message);
}

try {
    const envModule = await import('./services/resource/environment.js');
    console.log(`🌍 Environment: ${envModule.getEnvironment()}`);
} catch (e) { /* optional */ }

try {
    const { MemoryMonitor } = await import('./services/resource/memoryMonitor.js');
    memoryMonitorInstance = new MemoryMonitor();
    memoryMonitorInstance.start();
    setMemoryMonitor(memoryMonitorInstance);
    console.log(`📊 Memory monitor started (30s interval)`);
} catch (e) {
    if (e.code !== 'ERR_MODULE_NOT_FOUND') console.warn('Memory monitor:', e.message);
}

// Configuration
const config = await loadConfig();

// Auto-select character based on hostname → animatronics.json mapping
const hostnameCharId = await getHostnameCharacterId();
if (hostnameCharId !== null && hostnameCharId !== config.selectedCharacter) {
    const prevChar = config.selectedCharacter;
    const updated = await updateSelectedCharacter(hostnameCharId);
    Object.assign(config, updated);
    console.log(`[startup] Hostname "${os.hostname()}" → character ${hostnameCharId} (was ${prevChar}), config updated`);
} else if (hostnameCharId !== null) {
    console.log(`[startup] Hostname "${os.hostname()}" → character ${hostnameCharId} (already correct)`);
} else {
    console.log(`[startup] Hostname "${os.hostname()}" has no animatronics mapping, keeping character ${config.selectedCharacter}`);
}

// Restore this node's canonical speaker level. wpctl volume is node-local
// state that reboots and test suites keep resetting — one node came back from
// a reboot too quiet to be intelligible in the yard, and the "right" level
// lived nowhere but the operator's memory. config/animatronics.json now
// carries the ear-verified level per node (sinkVolume); apply it at every
// service start. Retries cover the boot race where this system service starts
// before the user-session PipeWire is up; a node with no recorded level (not
// yet ear-verified) is left alone.
(async function applyCanonicalVolume() {
    // The single attempt lives in systemService.applyCanonicalSinkVolume (also
    // behind POST /api/system/volume/canonical for on-demand restores); startup
    // adds the retry loop for the boot race where this system service starts
    // before the user-session PipeWire is up.
    const attempt = async (triesLeft) => {
        const result = await systemService.applyCanonicalSinkVolume();
        if (result.skipped || result.success) return; // applied (logged) or nothing recorded
        if (triesLeft > 0) {
            setTimeout(() => attempt(triesLeft - 1), 10000);
        } else {
            console.warn(`Could not apply canonical sink volume ${result.sinkVolume}: ${result.error}`);
        }
    };
    attempt(6);
})();

// Restore the microphone input gain the operator calibrated. Source (capture)
// volume is the same node-local PipeWire state as the sink volume above: a
// reboot resets it, the calibration page persists the chosen gain to the mic
// part's config.inputGainPercent, and this is the only place that turns the
// persisted number back into live state (v11 audit F7 — the gain used to
// "work until the next reboot, then revert").
(async function applyPersistedMicGain() {
    let mics = [];
    try {
        const charId = config.selectedCharacter;
        if (charId == null || !/^\d+$/.test(String(charId))) return;
        const partsRaw = await fs.readFile(path.join(__dirname, 'data', `character-${charId}`, 'parts.json'), 'utf8');
        mics = JSON.parse(partsRaw).filter(p => p && p.type === 'microphone'
            && p.enabled !== false
            && p.config && typeof p.config.inputGainPercent === 'number'
            && (p.config.deviceId || p.config.device));
    } catch (_) { /* no parts file or no calibrated mic — nothing to apply */ }
    if (!mics.length) return;
    const attempt = (triesLeft) => {
        Promise.all(mics.map(m => pipewireService.setSourceVolume(
            String(m.config.deviceId || m.config.device),
            Math.max(0, Math.min(200, m.config.inputGainPercent)) / 100
        ).then(r => ({ m, r })).catch(err => ({ m, r: { success: false, error: err && err.message } }))))
            .then(results => {
                results.filter(x => x.r && x.r.success).forEach(x =>
                    console.log(`🎙️ Mic input gain restored to ${x.m.config.inputGainPercent}% (${x.m.name})`));
                const failed = results.filter(x => !(x.r && x.r.success));
                if (!failed.length) return;
                if (triesLeft > 0) {
                    setTimeout(() => attempt(triesLeft - 1), 10000); // PipeWire boot race, same as above
                } else {
                    failed.forEach(x =>
                        console.warn(`Could not restore mic input gain for ${x.m.name}: ${(x.r && x.r.error) || 'unknown'}`));
                }
            });
    };
    attempt(6);
})();

// Startup health check runs AFTER the hostname→character correction above, and
// must stay after it: the servoChannels audit shells out to servo_cli.py, which
// resolves the character from app-config.json on disk. When a stale
// selectedCharacter reached a node (observed: Sir Dragomir carrying 3), the
// audit ran against the wrong character's parts, warned about another node's
// power groups, and persisted those false warnings to startup-health.json for
// the dashboard to display.
try {
    const { runStartupHealthCheck } = await import('./services/resource/startupHealthCheck.js');
    await runStartupHealthCheck();
} catch (e) {
    if (e.code !== 'ERR_MODULE_NOT_FOUND') console.warn('Startup health check:', e.message);
}

// Clear stalled PWM at startup.
//
// The PCA9685 keeps its own LEDn registers, so a channel left energized outlives
// the process that commanded it — it survives an app restart AND a reboot. Nothing
// in this codebase ever released a channel automatically, which is how a servo
// commanded to a position it cannot physically reach ends up buzzing against a
// stop all night: locked up, drawing stall current, until the fuse opens. On
// 2026-08-21 one node's electrically dead elbow was found holding 1308.6us on the
// fused rail that keeps blowing, and a peer's ch0 was holding 2089.8us near its
// travel extreme.
//
// This deliberately does NOT release every servo. A blanket release would drop
// every rig limp on each restart. It clears only the two cases where holding is
// pure risk with no upside: channels owned by parts the operator has declared
// physically broken, and channels being driven with no part mapped to them at all.
try {
    const { releaseStalledChannels, startPeriodicStallSweep } = await import('./services/hardwareService/stallGuard.js');
    await releaseStalledChannels(config.selectedCharacter, 'startup');
    // Backstop: a full test-suite run was observed leaving a broken part's channel
    // energized through a path that produced no log line and was never identified.
    // Only broken and unmapped channels are ever released, so this cannot interrupt
    // real motion. See stallGuard.startPeriodicStallSweep.
    startPeriodicStallSweep(config.selectedCharacter);
} catch (e) {
    if (e.code !== 'ERR_MODULE_NOT_FOUND') console.warn('Stall guard (startup):', e.message);
}

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : (config.port || 3000);

// Initialize app.locals.config so the very first request gets the startup character
app.locals.config = config;
app.locals._mainPort = PORT;

// Resolve the build commit ONCE at startup. The navbar template used to shell out
// to `git rev-parse` on every single page render — a subprocess and an SD-card
// read per page view, on a Pi, with a hardcoded path that silently failed on
// every node except the primary dev box.
app.locals.gitCommit = (function () {
    try {
        return execSync('git rev-parse --short HEAD', {
            cwd: path.resolve(__dirname),
            encoding: 'utf8',
            timeout: 2000
        }).trim();
    } catch (_) {
        return 'unknown';
    }
})();

// Schema validation — surface per-character data shape issues at startup.
// Never crash: failing subsystems are recorded on app.locals.subsystemHealth
// so routes can degrade gracefully and the /health endpoint can surface them.
app.locals.subsystemHealth = { ok: true, failing: {}, validatedAt: null };
try {
    const { validateAll, describeErrors } = await import('./services/schemaValidator.js');
    const schemaResult = validateAll();
    app.locals.subsystemHealth.validatedAt = new Date().toISOString();
    if (!schemaResult.valid) {
        app.locals.subsystemHealth.ok = false;
        for (const charResult of schemaResult.perCharacter) {
            if (!charResult.valid) {
                app.locals.subsystemHealth.failing[`character-${charResult.charId}`] = charResult.failingSubsystems;
            }
        }
        console.error(`⚠️  Schema validation found ${schemaResult.errors.length} error(s) — affected subsystems will degrade:`);
        console.error(describeErrors(schemaResult.errors));
    } else {
        console.log(`✓ Schema validation passed for ${schemaResult.perCharacter.length} character(s).`);
    }
} catch (err) {
    console.error('⚠️  Schema validator itself failed to run:', err.message);
    app.locals.subsystemHealth.ok = false;
    app.locals.subsystemHealth.failing['_validator'] = ['all'];
}

// Ensure real hardware is enabled in production even if MB_TEST_MODE is set by accident.
// EXCEPT under CI=true: that is the explicit "no hardware exists here" signal the
// exec layer's simulation keys on (services/hardwareService/exec.js), and forcing
// MONSTERBOX_HARDWARE_AVAILABLE=1 here defeated it — CI's system tests then drove
// real python wrappers on a runner with no I2C bus and failed on 'No module named
// smbus'. A show node never runs with CI=true, so the Pi protection is untouched.
try {
    const isTestEnv = (process.env.NODE_ENV === 'test') || (PORT === 3123);
    const inCI = String(process.env.CI || '') === 'true';
    const mbTestMode = (process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true');
    const hwAvail = (process.env.MONSTERBOX_HARDWARE_AVAILABLE === '1');
    if (mbTestMode && !isTestEnv && !inCI && !hwAvail) {
        process.env.MONSTERBOX_HARDWARE_AVAILABLE = '1';
        console.warn('⚠️  MB_TEST_MODE detected on a production port; enabling MONSTERBOX_HARDWARE_AVAILABLE=1 so hardware control is real.');
    }
} catch (_) { /* ignore */ }

// Middleware
//
// Body limits (UP-10): 50mb meant a single LAN POST could buffer and parse
// 50 MB of JSON on the event loop of a 4-core Pi mid-show. The largest
// LEGITIMATE JSON body in the app is a base64 TTS clip posted to
// /api/elevenlabs/play-audio (a few MB even for a long monologue); everything
// else is KB-scale config/scene/pose data. Real file uploads (audio 50MB,
// video 500MB, images 10MB) go through multer's multipart limits and are
// unaffected by these caps. 10mb keeps generous audio headroom; forms are
// tiny.
// Health check FIRST — before body parsers and the static mounts (each static
// mount costs a disk stat per request). With zero handler work and zero
// middleware ahead of it, /health's response time measures pure event-loop
// queueing — the loop-health probe the perf runbooks curl in a tight loop.
app.get('/health', (req, res) => {
    try {
        res.status(200).json({ status: 'OK', version: pkg.version, time: new Date().toISOString() });
    } catch (e) {
        res.status(200).json({ status: 'OK' });
    }
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
// maxAge lets the operator's browser reuse big assets (bootstrap alone is
// 233KB over software-TLS on this CPU) instead of re-paying them on every
// navigation; ETag revalidation still catches a deploy within 5 minutes.
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '5m' }));
// Serve character/data assets for images and media
app.use('/data', express.static(path.join(__dirname, 'data'), { maxAge: '1m' }));

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Master layout rendering helper
app.use((req, res, next) => {
    res.renderWithLayout = function (contentTemplate, options = {}) {
        const layoutOptions = {
            title: options.title || 'MonsterBox',
            page: options.page || 'dashboard',
            config: req.app.locals.config,
            currentCharacter: res.locals.currentCharacter,
            styles: options.styles,
            scripts: options.scripts,
            headExtras: options.headExtras,
            bodyExtras: options.bodyExtras,
            includeMainWrapper: options.includeMainWrapper !== false,
            includeNavigation: options.includeNavigation,
            // Expose test mode to templates so client can adapt logging during CI
            testMode: process.env.MB_TEST_MODE === '1' || process.env.NODE_ENV === 'test',
            content: ''
        };

        // Render the content template first — include common variables
        // so content templates can access currentCharacter, config, etc.
        const contentOptions = {
            ...options,
            config: req.app.locals.config,
            currentCharacter: res.locals.currentCharacter,
            testMode: layoutOptions.testMode
        };
        res.render(contentTemplate, contentOptions, (err, html) => {
            if (err) return res.status(500).send(err.message);

            // Then render with master layout
            layoutOptions.content = html;
            res.render('layouts/master', layoutOptions);
        });
    };
    next();
});

// Global template variables
// Also initialize structured server error stats for tests/monitoring
app.locals.errorStats = { count: 0, recent: [] };
function recordServerError(err, req) {
    try {
        const stats = req.app && req.app.locals && req.app.locals.errorStats;
        if (!stats) return;
        stats.count += 1;
        stats.recent.push({
            time: Date.now(),
            method: req.method,
            path: req.originalUrl || req.url,
            message: (err && err.message) || String(err)
        });
        if (stats.recent.length > 100) stats.recent.splice(0, stats.recent.length - 100);
    } catch (_) { /* ignore */ }
}

// Expose structured error stats endpoints for CI/tests
app.get('/__errors', (req, res) => {
    const stats = req.app.locals.errorStats || { count: 0, recent: [] };
    res.json({ success: true, count: stats.count, recent: stats.recent });
});
app.post('/__errors/reset', (req, res) => {
    req.app.locals.errorStats = { count: 0, recent: [] };
    res.json({ success: true, reset: true });
});

app.use(async (req, res, next) => {
    try {
        // Refresh non-character config from disk (theme, etc.); selectedCharacter
        // is authoritative from in-memory (set at startup via hostname detection and
        // only changed via POST /setup/characters/api/select).
        const latest = await loadConfig();
        const inMemory = req.app && req.app.locals && req.app.locals.config ? req.app.locals.config : {};
        const merged = Object.assign({}, latest, {
            selectedCharacter: inMemory.selectedCharacter || latest.selectedCharacter,
            dataPath: inMemory.dataPath || latest.dataPath
        });
        req.app.locals.config = merged;
        res.locals.config = merged;
        res.locals.currentCharacter = merged.selectedCharacter || null;
        res.locals.appVersion = pkg.version;

        // Load character name and data for navigation
        if (merged.selectedCharacter) {
            try {
                const characters = await loadCharactersCached();
                const currentChar = characters.find(c => c.id === merged.selectedCharacter);
                res.locals.currentCharacterName = currentChar ? currentChar.name : null;
                res.locals.currentCharacterObject = currentChar || null;
                // Expose active image (if any)
                res.locals.currentCharacterImage = (currentChar && currentChar.activeImage)
                    ? `/data/character-${currentChar.id}/images/${currentChar.activeImage}`
                    : null;
            } catch (e) {
                res.locals.currentCharacterName = null;
                res.locals.currentCharacterObject = null;
            }
        } else {
            res.locals.currentCharacterName = null;
            res.locals.currentCharacterObject = null;
        }
    } catch (_) {
        const fallback = req.app && req.app.locals && req.app.locals.config ? req.app.locals.config : config;
        req.app.locals.config = fallback;
        res.locals.config = fallback;
        res.locals.currentCharacter = fallback.selectedCharacter || null;
        res.locals.currentCharacterName = null;
    }
    next();
});

// Minimal diagnostics to validate Ask AI -> speaker routing for current character
app.get('/__audio/active-device', async (req, res) => {
    try {
        const characterId = (req.app.locals && req.app.locals.config && req.app.locals.config.selectedCharacter) || null;
        if (!characterId) return res.json({ success: true, characterId: null, device: 'default' });
        // Resolve without playing
        const device = await (async () => {
            try {
                // Leverage internal resolution helper indirectly via a no-op stop which returns device
                const r = await serverPlaybackService.stopForCharacter(characterId);
                return r && r.deviceId ? r.deviceId : 'default';
            } catch (_) { return 'default'; }
        })();
        res.json({ success: true, characterId, device });
    } catch (e) {
        res.json({ success: true, characterId: null, device: 'default', error: e && e.message });
    }
});

// Last playback telemetry for validation
app.get('/__audio/last-play', (req, res) => {
    try {
        const info = serverPlaybackService.getLastPlay();
        res.json({ success: true, lastPlay: info });
    } catch (e) {
        res.json({ success: false, error: e && e.message });
    }
});

// Last AI playback telemetry for validation
app.get('/__audio/last-ai', (req, res) => {
    try {
        const info = serverPlaybackService.getLastAIPlay();
        res.json({ success: true, lastAI: info });
    } catch (e) {
        res.json({ success: false, error: e && e.message });
    }
});

// Audio tooling diagnostics
app.get('/__audio/tools', (req, res) => {
    try {
        const tools = {
            mpg123: serverPlaybackService._mpg123Available || false,
            ffmpeg: serverPlaybackService._ffmpegAvailable || false,
            pwplay: serverPlaybackService._pwplayAvailable || false
        };
        res.json({ success: true, tools });
    } catch (e) {
        res.json({ success: false, error: e && e.message });
    }
});

// Routes
// Mount Unified Calibration API v1.5
app.use('/api/calibration', calibrationApiRouter);

// One-request panic. Mounted early so it is reachable even if a later route
// module fails to initialise — the stop control must be the last thing to break.
app.use('/api/panic', panicRoutes);
app.use('/setup/calibration', setupCalibrationRoutes);
app.use('/setup/audio', setupAudioRoutes);
app.use('/setup/models', setupModelsRoutes);
app.use('/setup/jaw-animation', setupJawAnimationRoutes);
app.use('/setup/head-animation', setupHeadAnimationRoutes);
app.use('/setup/super-powers', (req, res) => res.redirect(301, req.originalUrl.replace('/setup/super-powers', '/setup/jaw-animation')));
app.use('/setup/system', setupSystemRoutes);
app.use('/setup/poses', setupPosesRoutes);
app.use('/setup/characters', setupCharactersRoutes);
app.use('/audio-library', audioLibraryRoutes);
app.use('/video-library', videoLibraryRoutes);
app.use('/goblin-management', goblinManagementRoutes);
app.use('/conversation', conversationRoutes);
app.use('/orchestration', orchestrationWebRoutes);
app.use('/scenes/api', scenesApiRoutes);
app.use('/scenes', scenesRoutes);
app.use('/schedule', scheduleWebRoutes);
app.use('/first-run', firstRunRoutes);

app.use('/poses', posesRoutes);
app.use('/ai-settings', aiSettingsRoutes);

// Audio loop API routes
app.use('/api/audio-loop', audioLoopApiRoutes);
app.use('/api/parts', partsApiRoutes);
// Scheduled Events. Mounted before the generic '/api' routers below so the
// specific prefix wins, matching the '/api/parts' ordering requirement.
app.use('/api/schedule', scheduleApiRoutes);
// Alias for the character list/CRUD that otherwise only exists under
// /setup/characters/api/characters. Mounted BEFORE the bare '/api' routers so it
// wins on '/api/characters' and '/api/characters/:id'; '/api/characters/:id/images'
// is a segment deeper and still falls through to characterImagesApiRoutes.
app.use('/api/characters', charactersApiRoutes);

// Direct API endpoint for stopping audio (needed by audio-library page)
app.post('/api/audio/stop-all', async (req, res) => {
    try {
        const serverPlaybackService = (await import('./services/serverPlaybackService.js')).default;
        const audioLoopService = (await import('./services/audioLoopService.js')).default;
        
        // Stop both regular playback and loops
        await serverPlaybackService.stopAll();
        await audioLoopService.stopAllLoops();
        
        res.json({ success: true, message: 'All audio playback and loops stopped' });
    } catch (error) {
        console.error('Error stopping audio:', error);
        res.status(500).json({ success: false, error: 'Failed to stop audio playback' });
    }
});
// Debug: list registered routes once on startup.
// NOTE: this function performs NO route registration — it only inspects and
// logs. Route mounting and the test-only kill switch are registered explicitly
// at the call site below so registration order stays visible and predictable.
function printRoutes() {
    const routes = [];

    function walk(path, layer) {
        if (layer.route) {
            const routePath = path + layer.route.path;
            layer.route.stack.forEach(r => routes.push(`${(r.method || 'all').toUpperCase()} ${routePath}`));
        } else if (layer.name === 'router' && layer.handle.stack) {
            layer.handle.stack.forEach(l => walk(path + (layer.regexp?.fast_star ? '' : layer.regexp?.fast_slash ? '/' : ''), l));
        }
    }
    app._router.stack.forEach((layer) => {
        if (layer.name === 'router' && layer.handle.stack) {
            walk('', layer);
        } else if (layer.route) {
            const routePath = layer.route.path;
            layer.route.stack.forEach(r => routes.push(`${(r.method || 'all').toUpperCase()} ${routePath}`));
        }
    });
    console.log('Registered routes count:', routes.length);
    const interesting = routes.filter(r => r.includes('/setup/parts') || r.includes('/setup'));
    console.log('Some routes:', interesting.slice(0, 25));
}

// Mount character images API. Kept at this position to preserve the historical
// route-registration order (previously mounted as a side-effect of printRoutes).
app.use('/api', characterImagesApiRoutes);

// Test-only server kill switch. Previously registered unconditionally, which let
// any LAN client shut down a production animatronic via GET /__kill. Now gated so
// it exists only under test mode, matching its documented "test use only" intent.
if (process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true' || process.env.NODE_ENV === 'test') {
    app.get('/__kill', (req, res) => {
        res.status(200).send('Shutting down');
        setTimeout(() => process.exit(0), 50);
    });
}

printRoutes();

app.use('/api/elevenlabs', elevenLabsApiRoutes);
app.use('/api/random-poses', randomPoseRoutes);
app.use('/api/orchestration', orchestrationRoutes);
app.use('/api/system', systemApiRoutes);
app.use('/api/config', configApiRoutes);
app.use('/api/movement', movementApiRoutes);
app.use('/api/gestures', gestureApiRoutes);
app.use('/api/resource', resourceApiRoutes);
app.use('/api', sceneEditorApiRoutes);

// --- Goblin device compatibility API (for native Goblin auto-registration) ---
// Some Goblin builds post to /api/goblins/register and /api/goblins/:id/heartbeat
// Provide these aliases to the main Goblin Manager service so devices can self-register.
app.post('/api/goblins/register', async (req, res) => {
    try {
        const result = await goblinManagerService.registerGoblin(req.body || {});
        if (result.success) return res.json(result);
        return res.status(400).json(result);
    } catch (err) {
        console.error('Error in /api/goblins/register:', err);
        return res.status(500).json({ success: false, error: err.message || 'Internal error' });
    }
});

app.post('/api/goblins/:id/heartbeat', async (req, res) => {
    try {
        const result = await goblinManagerService.heartbeat(req.params.id, req.body || {});
        if (result.success) return res.json(result);
        return res.status(404).json(result);
    } catch (err) {
        console.error('Error in /api/goblins/:id/heartbeat:', err);
        return res.status(500).json({ success: false, error: err.message || 'Internal error' });
    }
});

// Lightweight list endpoint for debugging or device discovery
app.get('/api/goblins', async (req, res) => {
    try {
        const result = await goblinManagerService.getGoblins({});
        return res.json(result);
    } catch (err) {
        console.error('Error in GET /api/goblins:', err);
        return res.status(500).json({ success: false, error: err.message || 'Internal error' });
    }
});

// Audio Health Monitor API endpoints
app.get('/api/audio/health', (req, res) => {
    res.json(audioHealthMonitor.getStatus());
});

app.get('/api/audio/info', async (req, res) => {
    const info = await audioHealthMonitor.getAudioInfo();
    res.json(info);
});

app.post('/api/audio/test', async (req, res) => {
    const result = await audioHealthMonitor.testAudio();
    res.json(result);
});

app.post('/api/audio/reset', (req, res) => {
    audioHealthMonitor.resetRestartAttempts();
    res.json({ success: true, message: 'Restart attempts reset' });
});

// Main dashboard route — renders Conversation Control as the dashboard
app.get('/', (req, res) => {
    // If in test mode and no character selected, default to character 1 to avoid redirect churn
    const inTest = (process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true');
    if (!res.locals.config) res.locals.config = {};
    if (inTest && !res.locals.config.selectedCharacter) {
        res.locals.config.selectedCharacter = 1;
        if (req.app && req.app.locals) {
            req.app.locals.config = Object.assign({}, req.app.locals.config || {}, { selectedCharacter: 1 });
        }
    }
    // Redirect to first-run if no character selected
    if (!res.locals.config || !res.locals.config.selectedCharacter) {
        return res.redirect('/first-run');
    }

    res.renderWithLayout('conversation/showtime', {
        title: 'MonsterBox Dashboard',
        page: 'dashboard'
    });
});

// The pre-v9.5 dashboard layout, kept while the Scare Console beds in.
app.get('/dashboard/classic', (req, res) => {
    if (!res.locals.config || !res.locals.config.selectedCharacter) {
        return res.redirect('/first-run');
    }
    res.renderWithLayout('conversation/index', {
        title: 'MonsterBox Dashboard (classic)',
        page: 'dashboard'
    });
});

// Show Mode (/live) is absorbed into the dashboard (v9.5): whole-tile tap
// targets, busy states, and honest per-part failures now live on the deck.
app.get('/live', (req, res) => {
    res.redirect('/');
});

// Setup routes
app.get('/setup', (req, res) => {
    res.renderWithLayout('setup/index', {
        title: 'Setup - MonsterBox',
        page: 'setup',
        currentCharacter: (req.app && req.app.locals && req.app.locals.config && req.app.locals.config.selectedCharacter) || null
    });
});

// UX design-system reference — dev/internal only, not in main nav.
// See docs/UX_REDESIGN_PLAN.md (Phase 2).
app.get('/setup/style-guide', (req, res) => {
    res.renderWithLayout('setup/style-guide', {
        title: 'Style Guide - MonsterBox',
        page: 'setup',
        currentCharacter: (req.app && req.app.locals && req.app.locals.config && req.app.locals.config.selectedCharacter) || null
    });
});


// MB_TEST_MODE: Convert unexpected 5xx into benign responses to enforce UI stability during tests
if (process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true') {
    app.use((err, req, res, next) => {
        try {
            // Record server error for structured monitoring
            recordServerError(err, req);
            // Respect explicit statuses < 500: a deliberate client error
            // (oversized body: 413, malformed JSON: 400) is the CONTRACT under
            // test, not an "unexpected 5xx" to downgrade. This comment always
            // claimed that; the code never did it, so the body-limit 413 came
            // back as a 200 and was untestable on the test listener.
            const clientStatus = Number(err && (err.status || err.statusCode));
            if (Number.isFinite(clientStatus) && clientStatus >= 400 && clientStatus < 500) {
                return res.status(clientStatus).json({ success: false, error: (err && err.message) || 'Bad request' });
            }
            const wantsJSON = (req.get('accept') || '').includes('application/json') || req.path.startsWith('/api/') || req.path.includes('/scenes/api');
            const payload = wantsJSON
                ? { success: false, testMode: true, downgraded: true, error: (err && err.message) || 'Internal error (test mode)' }
                : null;
            if (wantsJSON) return res.status(200).json(payload);
            // For HTML pages, render a minimal placeholder with 200 status to avoid 5xx during navigation
            res.status(200).render('error', { title: 'Test Mode Placeholder', error: 'Test mode placeholder', message: (err && err.message) || 'Internal error (test mode)' });
        } catch (e) {
            // If rendering fails, last resort: plain text 200
            res.status(200).send('OK (test mode)');
        }
    });
}

// Error handling
app.use((err, req, res, next) => {
    console.error('Error:', err);
    // Record for structured monitoring
    try { recordServerError(err, req); } catch { }
    // A deliberate client error carries its own status (body-parser sets 413
    // for an oversized body, 400 for malformed JSON). Reporting those as 500
    // told the caller the SERVER was broken when the request was.
    const clientStatus = Number(err && (err.status || err.statusCode));
    if (Number.isFinite(clientStatus) && clientStatus >= 400 && clientStatus < 500) {
        return res.status(clientStatus).json({ success: false, error: err.message || 'Bad request' });
    }
    res.status(500).json({
        error: 'Internal server error',
        message: err.message
    });
});

// 404 handler
app.use((req, res) => {
    // An unmatched API path used to render the HTML error page. A client that did
    // not check content-type parsed that HTML as JSON and reported a syntax error
    // somewhere in its own parsing code — a failure that points at the wrong file
    // entirely. API paths get a JSON 404 that names the path that was missed.
    const wantsJson = req.path.startsWith('/api/')
        || req.path.includes('/api/')
        || (req.get('accept') || '').includes('application/json');
    if (wantsJson) {
        return res.status(404).json({
            success: false,
            error: 'Not found',
            message: `No API endpoint matches ${req.method} ${req.path}`,
            path: req.path
        });
    }
    res.status(404);
    res.renderWithLayout('error', {
        title: 'Page Not Found',
        page: 'error',
        error: 'Page not found',
        message: `The page ${req.url} was not found.`
    });
});

// Load configuration.
//
// Both loadConfig() and loadCharactersCached() run inside the global
// middleware on EVERY request; without the memo that was 2 SD-card reads +
// 2 JSON.parse per request, multiplied by the dashboard's ~2-4 polls/second.
// A 2s TTL is imperceptible for what these feed (theme, character name in
// the nav) — selectedCharacter stays authoritative from in-memory config,
// so character switches are never delayed by this cache.
// var (not let/const): loadConfig() is called at module top level, above this
// point in the file — a let binding would still be in its temporal dead zone
// on that first call. var hoists; the guards below tolerate undefined.
var MW_CACHE_TTL_MS = 2000;
var _cfgCache = null;
var _charsCache = null;

async function loadConfig() {
    if (_cfgCache && _cfgCache.data && (Date.now() - _cfgCache.at) < MW_CACHE_TTL_MS) {
        return _cfgCache.data;
    }
    try {
        const configPath = path.join(__dirname, 'config/app-config.json');
        const configData = await fs.readFile(configPath, 'utf8');
        _cfgCache = { at: Date.now(), data: JSON.parse(configData) };
        return _cfgCache.data;
    } catch (error) {
        console.warn('Config file not found, using defaults');
        return {
            port: 3000,
            theme: 'dark',
            selectedCharacter: null
        };
    }
}

async function loadCharactersCached() {
    if (_charsCache && _charsCache.data && (Date.now() - _charsCache.at) < MW_CACHE_TTL_MS) {
        return _charsCache.data;
    }
    const charactersData = await fs.readFile(path.join(__dirname, 'data', 'characters.json'), 'utf8');
    _charsCache = { at: Date.now(), data: JSON.parse(charactersData) };
    return _charsCache.data;
}

// Health check for mjpg-streamer service
async function checkMjpgStreamerHealth() {
    try {
        // Create AbortController for better timeout management
        const abortController = new AbortController();
        const timeoutId = setTimeout(() => {
            abortController.abort();
        }, 2000); // Reduced timeout to 2 seconds for startup check

        const response = await fetch('http://localhost:8090/', {
            method: 'GET',
            signal: abortController.signal
        });

        clearTimeout(timeoutId);
        // mjpg-streamer is running if we get any response (even 400/500)
        return response.status !== 0;
    } catch (error) {
        // Connection refused means service is not running - don't log timeout errors
        return false;
    }
}


function getLanAddresses() {
    const ifaces = os.networkInterfaces();
    const addrs = [];
    for (const name of Object.keys(ifaces)) {
        for (const i of ifaces[name] || []) {
            if (i && i.family === 'IPv4' && !i.internal) addrs.push(i.address);
        }
    }
    return addrs;
}



// HTTPS setup: if certs exist, primary port serves HTTPS; otherwise plain HTTP
let httpsServer = null;
let sslOptions = null;
try {
    const certsDir = path.join(__dirname, 'certs');
    const keyPath = path.join(certsDir, 'server.key');
    const certPath = path.join(certsDir, 'server.cert');
    const [keyFile, certFile] = await Promise.all([
        fs.readFile(keyPath, 'utf8'),
        fs.readFile(certPath, 'utf8')
    ]);
    sslOptions = { key: keyFile, cert: certFile };
    console.log(`🔒 SSL certificates loaded from certs/`);
} catch (e) {
    console.warn(`⚠️  No SSL certs found — running HTTP only. Browser mic requires HTTPS.`);
    console.log(`   Generate certs: openssl req -x509 -newkey rsa:2048 -nodes -keyout certs/server.key -out certs/server.cert -days 3650 -subj "/CN=monsterbox"`);
}

// Start primary server: HTTPS if certs available, HTTP otherwise
let server;
if (sslOptions) {
    httpsServer = https.createServer(sslOptions, app);
    server = httpsServer;
    httpsServer.listen(PORT, '0.0.0.0', async () => {
        await onServerReady('https');
    });
    httpsServer.on('error', (e) => {
        console.error(`❌ HTTPS server failed:`, e.message);
    });
} else {
    server = app.listen(PORT, '0.0.0.0', async () => {
        await onServerReady('http');
    });
}

async function onServerReady(protocol) {
    console.log(`🎭 MonsterBox ${pkg.version} server running on ${protocol}://localhost:${PORT}`);
    console.log(`📱 Dashboard: ${protocol}://localhost:${PORT}`);
    console.log(`⚙️  Setup: ${protocol}://localhost:${PORT}/setup`);
    console.log(`🎬 Live Mode: ${protocol}://localhost:${PORT}/live`);

    // LAN addresses for convenience
    try {
        const ips = getLanAddresses();
        if (ips.length) {
            console.log('🌐 LAN access:');
            for (const ip of ips) {
                console.log(`   - ${protocol}://${ip}:${PORT} (Dashboard)`);
                if (protocol === 'https') console.log(`   - wss://${ip}:${PORT}/ai-chat (Secure chat WS)`);
                else console.log(`   - ws://${ip}:8795 (Real-time chat WS)`);
            }
        }
    } catch (e) { /* ignore */ }


    // Check mjpg-streamer service availability
    console.log(`📹 Checking mjpg-streamer service...`);
    const mjpgHealthy = await checkMjpgStreamerHealth();
    if (mjpgHealthy) {
        console.log(`✅ mjpg-streamer service is running on port 8090`);
        console.log(`🎥 Webcam streaming: http://localhost:8090/?action=stream`);
    } else {
        console.log(`⚠️  mjpg-streamer service not detected on port 8090`);
        console.log(`   To enable webcam streaming, run: sudo systemctl start mjpg-streamer`);
    }

    // Start WebSocket server for real-time AI chat (pass httpsServer for WSS support)
    try {
        await elevenLabsWebSocketService.startWebSocketServer(httpsServer);
        console.log(`🚀 Real-time AI chat: ws://localhost:8795`);
        if (httpsServer) console.log(`🔒 Secure AI chat: wss://localhost:${PORT}/ai-chat`);
    } catch (error) {
        console.error(`❌ Failed to start WebSocket server:`, error.message);
        console.log(`   AI chat will use HTTP fallback (slower responses)`);
    }

    // Start Audio Health Monitor (it announces its own start — a second log
    // line here read as a stacked monitor during the 2026-08-23 perf triage)
    try {
        audioHealthMonitor.start();
    } catch (error) {
        console.error(`❌ Failed to start Audio Health Monitor:`, error.message);
    }

    // Zero-config node discovery (mDNS): advertise this node and browse for peers so
    // orchestration finds animatronics without hand-typed IPs. Degrades silently when
    // avahi is absent. See docs/development/NODE-DISCOVERY.md.
    try {
        const selfId = config && config.selectedCharacter;
        let selfName = '';
        try { selfName = (orchestrationService.getAnimatronicById(selfId) || {}).name || ''; } catch (_) { /* best-effort */ }
        nodeDiscoveryService.start(selfId != null ? {
            id: selfId,
            character: selfName,
            port: PORT,
            version: pkg.version,
        } : null);
    } catch (error) {
        console.error(`❌ Failed to start node discovery:`, error.message);
    }

    // Initialize jaw animation audio integration
    try {
        await jawAnimationAudioIntegration.initialize();
        console.log(`🦷 Jaw animation audio integration started`);
    } catch (error) {
        console.error(`❌ Failed to initialize jaw animation:`, error.message);
    }

    // Start movement telemetry auto-flush and servo command buffer
    try {
        const { startAutoFlush } = await import('./services/movement/movementTelemetry.js');
        startAutoFlush(30000);
        console.log(`📊 Movement telemetry auto-flush started (30s interval)`);
    } catch (error) {
        if (error.code !== 'ERR_MODULE_NOT_FOUND') {
            console.error(`❌ Failed to start movement telemetry:`, error.message);
        }
    }

    // Start system performance collector (records snapshots every 5 minutes)
    try {
        systemService.startPerformanceCollector(300000);
    } catch (error) {
        console.error(`❌ Failed to start performance collector:`, error.message);
    }

    // Console performance monitor (CPU, Memory, Audio streams, WS clients, Webcam)
    try {
        let lastVideoOk = mjpgHealthy;
        let lastVideoCheck = Date.now();
        let __perfIterations = 0;
        let __perfTick = 0;
        const __perfTestMode = (process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true');
        const __perfInterval = setInterval(async () => {
            __perfTick += 1;
            // In production only run the expensive pipewire query + verbose log once
            // a minute (every 12th 5s tick) to avoid constant CPU/SD churn on the RPi.
            // Test mode keeps the 5s cadence so its 10-iteration cap still works.
            if (__perfTestMode || (__perfTick % 12 === 0)) {
                const load1 = (os.loadavg?.()[0] || 0).toFixed(2);
                const rssMb = (process.memoryUsage().rss / (1024 * 1024)).toFixed(0);
                let audioStreams = 0;
                try { const streams = await pipewireService.listActiveStreams(); audioStreams = streams.length; } catch { }
                const wsClients = (typeof elevenLabsWebSocketService.getActiveConnectionsCount === 'function') ? elevenLabsWebSocketService.getActiveConnectionsCount() : 0;
                if ((Date.now() - lastVideoCheck) > 15000) { try { lastVideoOk = await checkMjpgStreamerHealth(); } catch { } lastVideoCheck = Date.now(); }
                console.log(`Perf | CPU(load1): ${load1} | Mem(RSS): ${rssMb}MB | Audio streams: ${audioStreams} | WS clients: ${wsClients} | Webcam: ${lastVideoOk ? 'OK' : 'NO'}`);
            }
            if (__perfTestMode) {
                __perfIterations += 1;
                if (__perfIterations >= 10) {
                    clearInterval(__perfInterval);
                    console.log('Perf monitor stopped after 10 iterations (test mode)');
                    if (process.env.KILL_SERVER_AFTER_TESTS === '1' || process.env.KILL_SERVER_AFTER_TESTS === 'true') {
                        console.log('Test mode: auto-exiting server after perf iterations cap');
                        setTimeout(() => process.exit(0), 200);
                    }
                }
            }
        }, 5000);
        // Don't let this monitor hold the event loop open during shutdown.
        __perfInterval.unref?.();
    } catch { }
}

// Expose HTTP test port(s) for CI and Playwright tests
// Default: 3100 (for system tests). TEST_PORT env var adds an extra listener (for Playwright).
try {
    const testPorts = new Set([3100]);
    if (process.env.TEST_PORT) testPorts.add(parseInt(process.env.TEST_PORT, 10));
    for (const tp of testPorts) {
        if (tp === PORT) continue;
        import('http').then(({ default: http }) => {
            const testServer = http.createServer(app);
            // Bind to loopback only. This listener serves the ENTIRE app over
            // plaintext HTTP; on a production RPi (HTTPS on the main port) binding
            // to 0.0.0.0 silently re-exposed every hardware/calibration endpoint
            // to the whole LAN without TLS. On-box Mocha/Playwright tests and the
            // SSH-tunnel workflow all use localhost, so loopback is sufficient.
            testServer.listen(tp, '127.0.0.1', () => {
                console.log(`🧪 Test port listener active on ${tp} (loopback)`);
            });
            testServer.on('error', (e) => {
                console.warn(`Test port ${tp} listener setup failed:`, e.message);
            });
        });
    }
} catch (e) {
    console.warn('Test port listener setup failed:', (e && e.message) || e);
}

// Graceful shutdown handling
async function gracefulShutdown(signal) {
    if (shuttingDown) {
        return;
    }
    shuttingDown = true;
    console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);

    const hardExitTimer = setTimeout(function () {
        console.warn('Force exiting after timeout...');
        process.exit(1);
    }, 10000);

    // Stop idle loop if running
    try {
        const idleLoop = await import('./services/movement/idleLoopService.js');
        await idleLoop.stop();
        console.log('  ✓ Idle loop stopped');
    } catch (e) {
        if (e.code !== 'ERR_MODULE_NOT_FOUND') console.warn('Idle loop cleanup:', (e && e.message) || e);
    }

    try {
        // Import and call motion tracking cleanup
        const { cleanup: motionTrackingCleanup } = await import('./controllers/motionTrackingController.js');
        await motionTrackingCleanup();
    } catch (error) {
        console.warn('Motion tracking cleanup error:', (error && error.message) || error);
    }

    try {
        // Stop performance collector (flushes the un-persisted history tail)
        await systemService.stopPerformanceCollector();
    } catch (error) {
        console.warn('Performance collector cleanup error:', (error && error.message) || error);
    }

    try {
        // Stop WebSocket server
        await elevenLabsWebSocketService.stopWebSocketServer();
    } catch (error) {
        console.warn('WebSocket server cleanup error:', (error && error.message) || error);
    }

    try {
        // Close primary server (HTTP or HTTPS)
        if (server) server.close();
    } catch (error) {
        console.warn('Server cleanup error:', (error && error.message) || error);
    }

    try {
        // Stop jaw animation monitoring
        jawAnimationAudioIntegration.stopAudioMonitoring();
    } catch (error) {
        console.warn('Jaw animation cleanup error:', (error && error.message) || error);
    }

    try {
        // Shut down persistent jaw servo daemon
        await jawServoDaemon.shutdown();
    } catch (error) {
        console.warn('Jaw servo daemon cleanup error:', (error && error.message) || error);
    }

    // Stop memory monitor
    try {
        if (memoryMonitorInstance) {
            memoryMonitorInstance.stop();
            console.log('  ✓ Memory monitor stopped');
        }
    } catch (e) { /* ignore */ }

    // Persist actuator positions for clean restart
    try {
        const actuatorPositionStore = (await import('./services/actuatorPositionStore.js')).default;
        actuatorPositionStore.markCleanShutdown();
        console.log('  ✓ Actuator positions persisted');
    } catch (e) {
        console.warn('Actuator position save error:', (e && e.message) || e);
    }

    // Clear stalled PWM before we go away. The PCA9685 keeps emitting whatever it
    // was last told, so a channel left energized here keeps drawing current for as
    // long as the service is down — a stall survives the restart that was supposed
    // to fix it. Only broken-part and orphaned channels are released; see stallGuard.
    try {
        const { releaseStalledChannels, stopPeriodicStallSweep } = await import('./services/hardwareService/stallGuard.js');
        stopPeriodicStallSweep();
        await releaseStalledChannels(config.selectedCharacter, 'shutdown');
    } catch (e) {
        if (e.code !== 'ERR_MODULE_NOT_FOUND') console.warn('Stall guard (shutdown):', (e && e.message) || e);
    }

    // Remove PID lock file
    try {
        if (singleInstance) {
            await singleInstance.removeLock();
            console.log('  ✓ PID lock released');
        }
    } catch (e) {
        console.warn('PID cleanup error:', (e && e.message) || e);
    }

    clearTimeout(hardExitTimer);
    console.log('✅ Shutdown complete');
    process.exit(0);
}

// Handle termination signals (guard prevents re-entry)
process.on('SIGTERM', function () { gracefulShutdown('SIGTERM'); });
process.on('SIGINT', function () { gracefulShutdown('SIGINT'); });
process.on('SIGHUP', function () { gracefulShutdown('SIGHUP'); });

