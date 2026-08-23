/**
 * System Information API Routes
 * Provides system information, performance monitoring, logs, settings,
 * SSH key management, and config templates.
 */

import { exec } from 'child_process';
import crypto from 'crypto';
import express from 'express';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import systemService from '../../services/systemService.js';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json');

// Immutable per-boot values — os.cpus() builds a fresh per-core array on every
// call, which /info paid twice per request for values that never change.
const _cpuInfo = os.cpus();
const CPU_COUNT = _cpuInfo.length;
const CPU_MODEL = (_cpuInfo[0] && _cpuInfo[0].model) || 'Unknown';
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const router = express.Router();
const execAsync = promisify(exec);

/**
 * Guard for destructive system-control endpoints (reboot / shutdown /
 * restart-service / optimize). These execute `sudo` operations and had no
 * protection at all.
 *
 * - If MB_ADMIN_TOKEN is set, require a matching `x-mb-admin-token` header.
 * - Otherwise, reject cross-origin browser requests so a malicious page the
 *   operator visits cannot CSRF a reboot, AND reject non-browser callers that
 *   are not on this machine.
 *
 * That last rule matters: browsers send Origin on any non-GET request, so a
 * request with no Origin is a script or a curl. Allowing those unconditionally
 * meant anyone on the LAN could reboot or shut down a running animatronic. Local
 * scripts and the operator UI are unaffected; a remote caller now has to
 * configure MB_ADMIN_TOKEN, which is the supported way to do this.
 *
 * Fleet orchestration is unaffected — it drives reboot/restart over SSH, not
 * through these HTTP endpoints.
 */
function isLoopbackRequest(req) {
    const addr = (req.socket && req.socket.remoteAddress) || req.ip || '';
    return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

function requireAdmin(req, res, next) {
    // A correct token always wins — this is how a REMOTE operator or script
    // authenticates, and it is the only way in from off this machine.
    const expected = process.env.MB_ADMIN_TOKEN;
    if (expected && req.get('x-mb-admin-token') === expected) return next();

    // Setting a token must NOT lock the operator out of their own dashboard. The
    // browser cannot send a header on a plain form post and we are not shipping the
    // token into every rendered page — putting it in the HTML would hand it to
    // exactly the LAN population this guards against. So a same-origin browser
    // request still passes on its own merits, as it did before a token existed.
    const origin = req.get('origin');
    if (origin) {
        try {
            if (new URL(origin).host !== req.get('host')) {
                return res.status(403).json({ success: false, error: 'Cross-origin request rejected' });
            }
        } catch (_) {
            return res.status(403).json({ success: false, error: 'Invalid origin' });
        }
        return next();
    }
    if (isLoopbackRequest(req)) return next();
    return res.status(expected ? 401 : 403).json({
        success: false,
        error: expected
            ? 'Unauthorized — send the x-mb-admin-token header, or make this request from the MonsterBox UI.'
            : 'Remote administrative requests require MB_ADMIN_TOKEN. Set it in /etc/monsterbox/env (read by the monsterbox.service EnvironmentFile) and send it as the x-mb-admin-token header.'
    });
}

/**
 * GET /api/system/info - Get system information
 */
router.get('/info', (req, res) => {
    try {
        var systemInfo = {
            success: true,
            version: pkg.version,
            nodeVersion: process.version,
            platform: os.platform() + ' ' + os.arch(),
            hostname: os.hostname(),
            uptime: process.uptime(),
            systemUptime: os.uptime(),
            totalMemory: (os.totalmem() / (1024 * 1024 * 1024)).toFixed(2) + ' GB',
            freeMemory: (os.freemem() / (1024 * 1024 * 1024)).toFixed(2) + ' GB',
            cpuCount: CPU_COUNT,
            cpuModel: CPU_MODEL
        };

        res.json(systemInfo);
    } catch (error) {
        console.error('Error getting system info:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get system information',
            message: error.message
        });
    }
});

/**
 * GET /api/system/usb-devices - USB devices currently attached to this node
 *
 * Read-only, and deliberately reports MODEL identity, not unit identity: vendor
 * id, product id and the descriptor strings, with the per-unit serial left out.
 * An identical replacement webcam must read as the SAME model — recording the
 * serial would make a like-for-like swap look like the wrong device, which is
 * the opposite of what this is for.
 *
 * Sysfs is read directly rather than shelling out to lsusb: the kernel has
 * already parsed the descriptors, so there is no subprocess and no output
 * format to re-parse. Every attribute is optional — hubs routinely have no
 * manufacturer string — so a missing file yields null, never a throw.
 */
router.get('/usb-devices', async (req, res) => {
    const usbDevicesDir = '/sys/bus/usb/devices';

    const readAttr = async (dir, name) => {
        try {
            return (await fs.readFile(path.join(dir, name), 'utf8')).trim() || null;
        } catch (error) {
            return null;
        }
    };

    try {
        let entries;
        try {
            entries = await fs.readdir(usbDevicesDir);
        } catch (error) {
            // No sysfs USB tree (dev box, container). Absence of the tree is not a failure.
            return res.json({ success: true, source: 'sysfs', available: false, devices: [] });
        }

        const devices = [];
        for (const entry of entries) {
            // Interface nodes ("1-1:1.0") carry no device descriptor, and root hubs
            // ("usb1") are the host controller itself, not anything plugged in.
            if (entry.includes(':') || /^usb\d+$/.test(entry)) continue;

            const dir = path.join(usbDevicesDir, entry);
            const idVendor = await readAttr(dir, 'idVendor');
            const idProduct = await readAttr(dir, 'idProduct');
            if (!idVendor || !idProduct) continue;

            devices.push({
                idVendor: idVendor,
                idProduct: idProduct,
                // Same "vvvv:pppp" form stored as meta.usbId on model registry entries,
                // so a caller can compare the two strings without reformatting either.
                usbId: idVendor + ':' + idProduct,
                product: await readAttr(dir, 'product'),
                manufacturer: await readAttr(dir, 'manufacturer'),
                busPath: entry
            });
        }

        devices.sort((a, b) => a.busPath.localeCompare(b.busPath));
        res.json({ success: true, source: 'sysfs', available: true, devices: devices });
    } catch (error) {
        console.error('Error listing USB devices:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to list USB devices',
            message: error.message
        });
    }
});

/**
 * GET /api/system/performance - Live performance snapshot
 */
router.get('/performance', async (req, res) => {
    try {
        var snapshot = await systemService.getPerformanceSnapshot();
        res.json({ success: true, performance: snapshot });
    } catch (error) {
        console.error('Error getting performance:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/system/performance/history - Historical performance data
 */
router.get('/performance/history', async (req, res) => {
    try {
        var period = req.query.period || '24h';
        var history = await systemService.getPerformanceHistory(period);
        res.json({ success: true, period: period, data: history });
    } catch (error) {
        console.error('Error getting performance history:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/system/logs - Service journal logs
 */
router.get('/logs', async (req, res) => {
    try {
        var service = req.query.service || 'monsterbox';
        var lines = req.query.lines || 100;
        var since = req.query.since || null;
        var logs = await systemService.getServiceLogs(service, lines, since);
        res.json({ success: true, service: service, logs: logs });
    } catch (error) {
        console.error('Error getting logs:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/system/logs/services - Available log services
 */
router.get('/logs/services', (req, res) => {
    res.json({ success: true, services: systemService.getAvailableServices() });
});

/**
 * GET /api/system/console - Console output from /var/log/monsterbox.log or .err
 */
router.get('/console', async (req, res) => {
    try {
        var lines = req.query.lines || 100;
        var source = req.query.source || 'stdout';
        var output = await systemService.getConsoleOutput(lines, source);
        res.json({ success: true, source: source, output: output });
    } catch (error) {
        console.error('Error getting console output:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * System volume is expressed in ONE scale on this endpoint: integer percent, 0-100.
 *
 * GET used to answer with the raw `wpctl` 0.0-1.0 fraction while PUT took percent,
 * so a client that read its own value and wrote it back turned 65% into `parseInt(0.65)`
 * = 0 and silently muted the character. Both ends now speak percent. `volumeFraction`
 * carries the raw sink value for anything that genuinely wants it, and `volumePercent`
 * is kept as an explicit alias so a reader never has to guess which scale `volume` is in.
 */
function volumePayload(fraction) {
    const clamped = Math.max(0, Math.min(1, Number(fraction) || 0));
    const percent = Math.round(clamped * 100);
    return {
        success: true,
        volume: percent,
        volumePercent: percent,
        volumeFraction: clamped,
        scale: 'percent'
    };
}

/**
 * GET /api/system/volume - Get system audio output volume
 * Response: { volume: 0-100, volumePercent: 0-100, volumeFraction: 0.0-1.0, scale: 'percent' }
 */
router.get('/volume', async (req, res) => {
    try {
        if (process.env.MB_TEST_MODE === '1') {
            return res.json(volumePayload(0.9));
        }
        const { stdout } = await execAsync('wpctl get-volume @DEFAULT_AUDIO_SINK@', { timeout: 5000 });
        const match = stdout.match(/Volume:\s+([\d.]+)/);
        res.json(volumePayload(match ? parseFloat(match[1]) : 0.9));
    } catch (error) {
        console.error('Error getting volume:', error.message);
        res.json(volumePayload(0.9));
    }
});

/**
 * PUT /api/system/volume - Set system audio output volume
 * Body: { volume: 0-100 }
 */
router.put('/volume', express.json(), async (req, res) => {
    try {
        // A fractional value is still a loud 400 rather than a silent zero: older
        // clients written against the pre-fix GET may still send 0.65, and a muted
        // animatronic looks broken while giving no clue why.
        const raw = req.body && req.body.volume;
        const vol = Number(raw);
        if (!Number.isFinite(vol) || vol < 0 || vol > 100) {
            return res.status(400).json({ success: false, error: 'volume must be a number 0-100' });
        }
        if (!Number.isInteger(vol)) {
            return res.status(400).json({
                success: false,
                error: `volume must be an integer 0-100 percent, not a 0.0-1.0 fraction (received ${raw}). `
                     + `GET /api/system/volume also returns percent. `
                     + `Did you mean ${Math.round(vol * 100)}?`
            });
        }
        if (process.env.MB_TEST_MODE === '1') {
            return res.json(volumePayload(vol / 100));
        }
        const linear = (vol / 100).toFixed(2);
        await execAsync(`wpctl set-volume @DEFAULT_AUDIO_SINK@ ${linear}`, { timeout: 5000 });
        res.json(volumePayload(parseFloat(linear)));
    } catch (error) {
        console.error('Error setting volume:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/system/volume/canonical - Re-apply THIS node's ear-verified
 * canonical speaker level from config/animatronics.json (sinkVolume).
 *
 * The canon can exceed 1.0 (one live node's is 1.3 = 130%), so it is unreachable
 * through PUT /volume's 0-100% contract — this endpoint is the only way to
 * put the level back without restarting the service. Used by test-suite
 * restore hooks (the suite used to leave the whole fleet at 65%) and safe
 * for operators any time the level has drifted.
 */
router.post('/volume/canonical', async (req, res) => {
    try {
        if (process.env.MB_TEST_MODE === '1') {
            return res.json({ success: true, testMode: true, skipped: true, reason: 'test mode' });
        }
        const result = await systemService.applyCanonicalSinkVolume();
        res.status(result.success ? 200 : 500).json(result);
    } catch (error) {
        console.error('Error restoring canonical volume:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/system/presets - Performance presets for RPi models
 */
router.get('/presets', (req, res) => {
    res.json({ success: true, presets: systemService.getPerformancePresets() });
});

/**
 * POST /api/system/presets/apply - Apply a performance preset
 */
router.post('/presets/apply', express.json(), async (req, res) => {
    try {
        var presetId = req.body && req.body.presetId;
        if (!presetId) return res.status(400).json({ success: false, error: 'presetId required' });
        var result = await systemService.applyPerformancePreset(presetId);
        res.json(result);
    } catch (error) {
        console.error('Error applying preset:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/system/settings - All system settings
 */
router.get('/settings', async (req, res) => {
    try {
        var settings = await systemService.getSystemSettings();
        res.json({ success: true, settings: settings });
    } catch (error) {
        console.error('Error getting settings:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * PUT /api/system/settings - Update a system setting
 */
router.put('/settings', express.json(), async (req, res) => {
    try {
        var category = req.body.category;
        var key = req.body.key;
        var value = req.body.value;
        if (!category || !key) {
            return res.status(400).json({ success: false, error: 'category and key required' });
        }
        var result = await systemService.updateSystemSetting(category, key, value);
        res.json(result);
    } catch (error) {
        console.error('Error updating setting:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/system/settings/startup - Startup tasks
 */
router.get('/settings/startup', async (req, res) => {
    try {
        var tasks = await systemService.getStartupTasks();
        res.json({ success: true, tasks: tasks });
    } catch (error) {
        console.error('Error getting startup tasks:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * PUT /api/system/settings/startup - Enable/disable startup task
 */
router.put('/settings/startup', express.json(), async (req, res) => {
    try {
        var service = req.body.service;
        var enabled = req.body.enabled;
        if (!service) {
            return res.status(400).json({ success: false, error: 'service required' });
        }
        var result = await systemService.setStartupTask(service, !!enabled);
        res.json(result);
    } catch (error) {
        console.error('Error updating startup task:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/system/ssh/keys - List SSH keys
 */
router.get('/ssh/keys', async (req, res) => {
    try {
        var keys = await systemService.listSSHKeys();
        res.json({ success: true, keys: keys });
    } catch (error) {
        console.error('Error listing SSH keys:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/system/ssh/keys/generate - Generate new keypair
 */
router.post('/ssh/keys/generate', requireAdmin, express.json(), async (req, res) => {
    try {
        var type = req.body.type || 'ed25519';
        var comment = req.body.comment || '';
        var result = await systemService.generateSSHKey(type, comment);
        res.json(result);
    } catch (error) {
        console.error('Error generating SSH key:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/system/ssh/keys/deploy - Deploy key to host
 */
router.post('/ssh/keys/deploy', requireAdmin, express.json(), async (req, res) => {
    try {
        var host = req.body.host;
        var keyName = req.body.keyName;
        if (!host || !keyName) {
            return res.status(400).json({ success: false, error: 'host and keyName required' });
        }
        var result = await systemService.deployKeyToHost(host, keyName);
        res.json(result);
    } catch (error) {
        console.error('Error deploying SSH key:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * DELETE /api/system/ssh/keys/:name - Delete SSH key
 */
router.delete('/ssh/keys/:name', requireAdmin, async (req, res) => {
    try {
        var result = await systemService.deleteSSHKey(req.params.name);
        res.json(result);
    } catch (error) {
        console.error('Error deleting SSH key:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/system/ssh/authorized - Get authorized keys
 */
router.get('/ssh/authorized', async (req, res) => {
    try {
        var keys = await systemService.getAuthorizedKeys();
        res.json({ success: true, authorizedKeys: keys });
    } catch (error) {
        console.error('Error getting authorized keys:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/system/templates - List config templates
 */
router.get('/templates', async (req, res) => {
    try {
        var templates = await systemService.listTemplates();
        res.json({ success: true, templates: templates });
    } catch (error) {
        console.error('Error listing templates:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/system/templates - Save current config as template
 */
router.post('/templates', express.json(), async (req, res) => {
    try {
        var name = req.body.name;
        var description = req.body.description || '';
        var result = await systemService.saveTemplate(name, description);
        res.json(result);
    } catch (error) {
        console.error('Error saving template:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/system/templates/:id/apply - Apply template
 */
router.post('/templates/:id/apply', express.json(), async (req, res) => {
    try {
        var targetHost = req.body.targetHost || 'localhost';
        var result = await systemService.applyTemplate(req.params.id, targetHost);
        res.json(result);
    } catch (error) {
        console.error('Error applying template:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * DELETE /api/system/templates/:id - Delete template
 */
router.delete('/templates/:id', async (req, res) => {
    try {
        var result = await systemService.deleteTemplate(req.params.id);
        res.json(result);
    } catch (error) {
        console.error('Error deleting template:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/system/restart-service - Restart the MonsterBox service
 */
router.post('/restart-service', requireAdmin, express.json(), async (req, res) => {
    try {
        console.log('⚠️ MonsterBox service restart requested');

        res.json({
            success: true,
            message: 'MonsterBox service restart initiated. Page will reload in ~10 seconds.'
        });

        // Delay restart to allow response to be sent
        setTimeout(function () {
            console.log('🔄 Restarting monsterbox.service...');
            exec('sudo systemctl restart monsterbox.service', function (error) {
                if (error) {
                    console.error('Service restart failed:', error);
                }
            });
        }, 500);

    } catch (error) {
        console.error('Error restarting service:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to restart service',
            message: error.message
        });
    }
});

/**
 * POST /api/system/optimize - Run the animatronic optimization script
 */
router.post('/optimize', requireAdmin, express.json(), async (req, res) => {
    try {
        console.log('⚠️ Animatronic optimization requested');

        const path = await import('path');
        const { fileURLToPath } = await import('url');
        const scriptPath = path.default.resolve(
            path.default.dirname(fileURLToPath(import.meta.url)),
            '../../scripts/optimize-animatronic.sh'
        );

        // Run script and capture output
        const { stdout, stderr } = await execAsync(`sudo bash "${scriptPath}" 2>&1`, { timeout: 120000 });

        console.log('Optimization output:', stdout);

        res.json({
            success: true,
            message: 'Optimization complete. A reboot is recommended.',
            output: stdout
        });

    } catch (error) {
        console.error('Optimization error:', error);
        res.status(500).json({
            success: false,
            error: 'Optimization failed',
            message: error.message,
            output: error.stdout || ''
        });
    }
});

/**
 * POST /api/system/reboot - Reboot the animatronic
 */
router.post('/reboot', requireAdmin, express.json(), async (req, res) => {
    try {
        console.log('⚠️ System reboot requested');

        // Send success response immediately before reboot
        res.json({
            success: true,
            message: 'System reboot initiated. Device will be unavailable for about 60 seconds.'
        });

        // Delay reboot slightly to allow response to be sent
        setTimeout(function () {
            console.log('🔄 Initiating system reboot...');
            exec('sudo reboot', function (error) {
                if (error) {
                    console.error('Reboot failed:', error);
                }
            });
        }, 1000);

    } catch (error) {
        console.error('Error initiating reboot:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to initiate reboot',
            message: error.message
        });
    }
});

/**
 * POST /api/system/shutdown - Shutdown the system
 */
router.post('/shutdown', requireAdmin, express.json(), async (req, res) => {
    try {
        console.log('⚠️ System shutdown requested');

        res.json({
            success: true,
            message: 'System shutdown initiated.'
        });

        setTimeout(function () {
            exec('sudo shutdown -h now', function (error) {
                if (error) {
                    console.error('Shutdown failed:', error);
                }
            });
        }, 1000);

    } catch (error) {
        console.error('Error initiating shutdown:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to initiate shutdown',
            message: error.message
        });
    }
});

/* ─────────────────────────── Configuration posture ───────────────────────────
 *
 * GET /api/system/posture — what is actually configured on THIS node.
 *
 * Misconfiguration here is invisible by design: an unset environment variable
 * produces no error, no log line and no UI change; it just quietly removes a
 * capability. Two live examples on this fleet:
 *
 *   - `.env` is NEVER read by this application (nothing calls dotenv). Putting
 *     credentials there looks correct, changes nothing, and leaves SSH fleet
 *     control disabled. The only place that works is monsterbox.service.
 *   - MB_ADMIN_TOKEN unset means anything running on this node — or anyone with a
 *     shell on it — can POST /api/system/reboot and /shutdown with no token.
 *
 * This endpoint turns that silence into an answer. It reports NAMES and BOOLEANS
 * only. No handler below may ever put an environment variable's VALUE in the
 * response — the whole point is that this can be read out loud safely.
 */

/** Environment variables that change what this node can do. Names only. */
const POSTURE_ENV_VARS = [
    {
        name: 'MONSTERBOX_SSH_PASSWORD',
        purpose: 'SSH into other fleet nodes (deploy, remote reboot, service restart, config push)',
        ifUnset: 'SSH fleet control is DISABLED. Those actions fail loudly with a clear error rather than silently.'
    },
    {
        name: 'MB_ADMIN_TOKEN',
        purpose: 'Authenticates destructive system endpoints (reboot, shutdown, restart-service, optimize)',
        ifUnset: 'Remote unauthenticated callers are refused, but any LOCAL caller on this node can reboot or shut it down without a token.'
    },
    {
        name: 'ELEVENLABS_API_KEY',
        purpose: 'Text-to-speech and speech-to-text (fallback — /etc/monsterbox/elevenlabs.key is the preferred source)',
        ifUnset: 'Only a problem if /etc/monsterbox/elevenlabs.key is also missing — see the ai-voice capability, which checks both.'
    },
    {
        name: 'MB_TEST_MODE',
        purpose: 'Test mode — hardware is simulated and inter-node WRITES are refused at the orchestration egress point',
        ifUnset: 'Normal operation: commands reach real hardware and the real fleet.'
    },
    {
        name: 'MONSTERBOX_HARDWARE_AVAILABLE',
        purpose: 'Explicit declaration that GPIO/I2C hardware is present',
        ifUnset: 'Hardware presence is inferred rather than declared.'
    },
    {
        name: 'MB_NODE_TOKEN',
        purpose: 'Shared secret for node-to-node API calls',
        ifUnset: 'Inter-node calls are not token-authenticated.'
    }
];

/** Is this an environment-variable NAME? Used so a malformed .env line can't leak. */
function looksLikeEnvName(candidate) {
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(candidate);
}

/**
 * Measure, rather than assert, whether a .env file is doing anything.
 *
 * Claiming "dotenv is not used" would go stale the day someone adds it. Instead:
 * read the KEY NAMES out of .env (never the values) and count how many of those
 * names actually made it into process.env.
 *
 * The test is ALL of them, not any of them: a loader sets every key it reads, so
 * anything short of a full house means the file is not being loaded and the keys
 * that happen to be set (NODE_ENV, PORT — names the runtime sets on its own)
 * arrived from somewhere else. "Any" would have called this file loaded on the
 * strength of NODE_ENV alone, which is exactly the false all-clear this endpoint
 * exists to prevent.
 */
async function inspectEnvFile() {
    const envPath = path.join(appRoot, '.env');
    try {
        const raw = await fs.readFile(envPath, 'utf8');
        const keyNames = [];
        raw.split(/\r?\n/).forEach((line) => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) return;
            const name = trimmed.replace(/^export\s+/, '').split('=')[0].trim();
            if (looksLikeEnvName(name) && keyNames.indexOf(name) === -1) keyNames.push(name);
        });
        const present = keyNames.filter((name) => process.env[name] !== undefined);
        return {
            path: '.env',
            present: true,
            keyNames,
            keyCount: keyNames.length,
            keysReachingProcessEnv: present.length,
            keysMissingFromProcessEnv: keyNames.filter((name) => process.env[name] === undefined),
            // null when the file has no keys to judge by.
            appearsLoaded: keyNames.length === 0 ? null : present.length === keyNames.length,
            note: keyNames.length > 0 && present.length < keyNames.length
                ? `This .env file is INERT — only ${present.length} of its ${keyNames.length} keys are set in the process, and those came from elsewhere. This application does not load .env. Set variables in monsterbox.service (or a systemd drop-in).`
                : 'Every key in this file is also set in the process. That does not prove .env was read — this application does not load one; check monsterbox.service.'
        };
    } catch (err) {
        if (err && err.code === 'ENOENT') {
            return {
                path: '.env',
                present: false,
                keyNames: [],
                keyCount: 0,
                keysReachingProcessEnv: 0,
                appearsLoaded: null,
                note: 'No .env file. Correct — this application never reads one; monsterbox.service is the only place environment variables take effect.'
            };
        }
        return { path: '.env', present: null, error: err.message };
    }
}

/** TLS: is the certificate this node serves self-signed, and is it still valid? */
async function inspectTls() {
    const certPath = path.join(appRoot, 'certs', 'server.cert');
    try {
        const pem = await fs.readFile(certPath, 'utf8');
        const result = { enabled: true, source: 'certs/server.cert' };
        try {
            const cert = new crypto.X509Certificate(pem);
            const notAfter = new Date(cert.validTo);
            result.selfSigned = cert.subject === cert.issuer;
            result.subjectMatchesIssuer = result.selfSigned;
            result.validFrom = cert.validFrom;
            result.validTo = cert.validTo;
            result.expired = Number.isFinite(notAfter.getTime()) ? notAfter.getTime() < Date.now() : null;
            result.daysUntilExpiry = Number.isFinite(notAfter.getTime())
                ? Math.floor((notAfter.getTime() - Date.now()) / 86400000)
                : null;
        } catch (parseErr) {
            // Certificate present but unparseable — say so rather than guessing.
            result.selfSigned = null;
            result.parseError = parseErr.message;
        }
        return result;
    } catch (err) {
        if (err && err.code === 'ENOENT') {
            return {
                enabled: false,
                selfSigned: null,
                source: null,
                note: 'No certificate — this node serves plain HTTP. Browser microphone access requires HTTPS, and inter-node calls expect https://.'
            };
        }
        return { enabled: null, selfSigned: null, error: err.message };
    }
}

/**
 * The ElevenLabs key has TWO sources and the file is the preferred one, so an
 * unset ELEVENLABS_API_KEY does not mean the voice is down. Reporting "cannot
 * speak" off the env var alone would be a confident wrong answer — the exact
 * failure mode this endpoint exists to remove. Presence only; never the contents.
 */
async function inspectElevenLabsKey() {
    const keyPath = '/etc/monsterbox/elevenlabs.key';
    let fileHasKey = false;
    try {
        const raw = await fs.readFile(keyPath, 'utf8');
        const trimmed = (raw || '').trim();
        fileHasKey = trimmed.length > 0 && trimmed !== 'your_elevenlabs_api_key_here';
    } catch (_) { /* absent or unreadable — env var is the fallback */ }
    const envHasKey = !!process.env.ELEVENLABS_API_KEY
        && process.env.ELEVENLABS_API_KEY !== 'your_elevenlabs_api_key_here';
    return {
        configured: fileHasKey || envHasKey,
        fromKeyFile: fileHasKey,
        fromEnvVar: envHasKey,
        keyFilePath: keyPath
    };
}

router.get('/posture', async (req, res) => {
    try {
        const [envFile, tls, elevenLabs] = await Promise.all([
            inspectEnvFile(), inspectTls(), inspectElevenLabsKey()
        ]);

        // Booleans only — process.env values never leave this function.
        const environment = POSTURE_ENV_VARS.map((entry) => ({
            name: entry.name,
            set: process.env[entry.name] !== undefined && process.env[entry.name] !== '',
            purpose: entry.purpose,
            ifUnset: entry.ifUnset
        }));
        const isSet = (name) => environment.some((e) => e.name === name && e.set);

        const capabilities = [
            {
                name: 'ssh-fleet-control',
                available: isSet('MONSTERBOX_SSH_PASSWORD'),
                description: 'Deploy, remote reboot, service restart and config push to other nodes over SSH',
                reason: isSet('MONSTERBOX_SSH_PASSWORD')
                    ? 'MONSTERBOX_SSH_PASSWORD is set.'
                    : 'MONSTERBOX_SSH_PASSWORD is unset, so every SSH path refuses by design.'
            },
            {
                name: 'admin-token-auth',
                available: isSet('MB_ADMIN_TOKEN'),
                description: 'Token authentication for reboot / shutdown / restart-service / optimize',
                reason: isSet('MB_ADMIN_TOKEN')
                    ? 'MB_ADMIN_TOKEN is set — remote scripts can authenticate with the x-mb-admin-token header.'
                    : 'MB_ADMIN_TOKEN is unset. Remote unauthenticated callers are refused, but LOCAL callers (anything on this node, or anyone with a shell on it) reach reboot/shutdown with no token.'
            },
            {
                name: 'unauthenticated-local-shutdown',
                available: !isSet('MB_ADMIN_TOKEN'),
                description: 'Whether a local caller can reboot or shut down this node without a token (a risk, not a feature)',
                reason: isSet('MB_ADMIN_TOKEN')
                    ? 'Closed — a token is required.'
                    : 'OPEN — set MB_ADMIN_TOKEN in monsterbox.service to close it.'
            },
            {
                name: 'ai-voice',
                available: elevenLabs.configured,
                description: 'Text-to-speech and speech-to-text',
                reason: elevenLabs.fromKeyFile
                    ? `Key present at ${elevenLabs.keyFilePath} (the preferred source).`
                    : (elevenLabs.fromEnvVar
                        ? 'Key comes from the ELEVENLABS_API_KEY environment variable.'
                        : `No key in ${elevenLabs.keyFilePath} and ELEVENLABS_API_KEY is unset — the character cannot speak or listen.`)
            },
            {
                name: 'https',
                available: tls.enabled === true,
                description: 'HTTPS on the primary port; required for browser microphone access and for inter-node calls',
                reason: tls.enabled === true
                    ? (tls.selfSigned === true
                        ? 'Serving a SELF-SIGNED certificate. Clients must skip verification (curl -k); browsers show a warning until the certificate is trusted.'
                        : 'Serving a certificate from certs/server.cert.')
                    : 'No certificate found — this node is HTTP only.'
            },
            {
                name: 'fleet-writes',
                available: process.env.MB_TEST_MODE !== '1',
                description: 'Whether inter-node WRITE commands actually reach the fleet',
                reason: process.env.MB_TEST_MODE === '1'
                    ? 'MB_TEST_MODE=1 — the orchestration egress point refuses writes and reports them as refused. Reads still pass.'
                    : 'Normal operation — inter-node writes reach real animatronics.'
            }
        ];

        const warnings = [];
        environment.filter((e) => !e.set && ['MONSTERBOX_SSH_PASSWORD', 'MB_ADMIN_TOKEN'].includes(e.name))
            .forEach((e) => warnings.push(`${e.name} is not set. ${e.ifUnset}`));
        if (!elevenLabs.configured) {
            warnings.push(`No ElevenLabs key — neither ${elevenLabs.keyFilePath} nor ELEVENLABS_API_KEY. The character cannot speak or listen.`);
        }
        if (envFile.present && envFile.appearsLoaded === false) {
            warnings.push(`A .env file exists with ${envFile.keyCount} key(s), of which only ${envFile.keysReachingProcessEnv} are set in this process. It is not being loaded — this application never reads .env. Move those settings into monsterbox.service.`);
        }
        if (tls.enabled === true && tls.selfSigned === true) {
            warnings.push('TLS certificate is self-signed — clients must skip verification.');
        }
        if (tls.enabled === true && tls.expired === true) {
            warnings.push('TLS certificate has EXPIRED.');
        }
        if (tls.enabled === false) {
            warnings.push('No TLS certificate — serving plain HTTP. Browser microphone capture will not work.');
        }

        res.json({
            success: true,
            version: pkg.version,
            hostname: os.hostname(),
            nodeEnv: process.env.NODE_ENV || null,
            runningAsRoot: typeof process.getuid === 'function' ? process.getuid() === 0 : null,
            envFile,
            environment,
            elevenLabs,
            tls,
            capabilities,
            warnings,
            // Stated on the response so a reader never has to trust that it was obeyed.
            disclosure: 'Environment variable NAMES and set/unset booleans only. No value is ever included in this response.'
        });
    } catch (error) {
        console.error('Error building system posture:', error);
        res.status(500).json({ success: false, error: 'Failed to build system posture', message: error.message });
    }
});

export default router;
