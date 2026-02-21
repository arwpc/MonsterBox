/**
 * System Service
 * Provides system monitoring, logs, settings, SSH key management, and config templates.
 * Uses only built-in Node.js modules (os, child_process, fs).
 */

import { exec } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, '..', 'data');
const PERF_HISTORY_FILE = path.join(DATA_DIR, 'performance-history.json');
const TEMPLATES_DIR = path.join(DATA_DIR, 'system-templates');

let perfCollectorInterval = null;

// ─── Performance ───────────────────────────────────────────────────────────────

async function getCpuPercent() {
    try {
        const { stdout } = await execAsync("top -bn1 | grep 'Cpu(s)' | awk '{print $2}'", { timeout: 5000 });
        const val = parseFloat(stdout.trim());
        return isFinite(val) ? val : 0;
    } catch (_) {
        // Fallback: compute from os.cpus()
        const cpus = os.cpus();
        let totalIdle = 0, totalTick = 0;
        for (var i = 0; i < cpus.length; i++) {
            var cpu = cpus[i];
            var times = cpu.times;
            totalTick += times.user + times.nice + times.sys + times.idle + times.irq;
            totalIdle += times.idle;
        }
        return totalTick > 0 ? Math.round(((totalTick - totalIdle) / totalTick) * 100) : 0;
    }
}

async function getTemperature() {
    // Try RPi thermal zone first
    try {
        var data = await fs.readFile('/sys/class/thermal/thermal_zone0/temp', 'utf8');
        var temp = parseInt(data.trim(), 10);
        if (isFinite(temp)) return (temp / 1000).toFixed(1);
    } catch (_) { /* not RPi or no thermal zone */ }

    // Try vcgencmd
    try {
        var result = await execAsync('vcgencmd measure_temp', { timeout: 3000 });
        var match = result.stdout.match(/([\d.]+)/);
        if (match) return parseFloat(match[1]).toFixed(1);
    } catch (_) { /* vcgencmd not available */ }

    return null;
}

async function getDiskUsage() {
    try {
        var result = await execAsync("df / --output=pcent | tail -1", { timeout: 5000 });
        var pct = parseInt(result.stdout.trim().replace('%', ''), 10);
        return isFinite(pct) ? pct : null;
    } catch (_) {
        return null;
    }
}

async function getPerformanceSnapshot() {
    var totalMem = os.totalmem();
    var freeMem = os.freemem();
    var memPercent = totalMem > 0 ? Math.round(((totalMem - freeMem) / totalMem) * 100) : 0;

    var cpuPercent = await getCpuPercent();
    var temperature = await getTemperature();
    var diskPercent = await getDiskUsage();
    var loadAvg = os.loadavg();

    return {
        timestamp: Date.now(),
        cpu: cpuPercent,
        memory: memPercent,
        memoryUsedMB: Math.round((totalMem - freeMem) / (1024 * 1024)),
        memoryTotalMB: Math.round(totalMem / (1024 * 1024)),
        temperature: temperature,
        disk: diskPercent,
        loadAvg: {
            '1m': loadAvg[0] ? loadAvg[0].toFixed(2) : '0.00',
            '5m': loadAvg[1] ? loadAvg[1].toFixed(2) : '0.00',
            '15m': loadAvg[2] ? loadAvg[2].toFixed(2) : '0.00'
        }
    };
}

async function getPerformanceHistory(period) {
    try {
        var raw = await fs.readFile(PERF_HISTORY_FILE, 'utf8');
        var history = JSON.parse(raw);
        if (!Array.isArray(history)) history = [];

        var now = Date.now();
        var cutoff;
        if (period === '1w') cutoff = now - 7 * 24 * 60 * 60 * 1000;
        else if (period === '1m') cutoff = now - 30 * 24 * 60 * 60 * 1000;
        else cutoff = now - 24 * 60 * 60 * 1000; // default 24h

        return history.filter(function (entry) { return entry.timestamp >= cutoff; });
    } catch (_) {
        return [];
    }
}

async function recordPerformanceSnapshot() {
    try {
        var snapshot = await getPerformanceSnapshot();
        var history = [];
        try {
            var raw = await fs.readFile(PERF_HISTORY_FILE, 'utf8');
            history = JSON.parse(raw);
            if (!Array.isArray(history)) history = [];
        } catch (_) { /* file doesn't exist yet */ }

        history.push(snapshot);

        // Prune entries older than 1 month
        var cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
        history = history.filter(function (entry) { return entry.timestamp >= cutoff; });

        await fs.writeFile(PERF_HISTORY_FILE, JSON.stringify(history), 'utf8');
        return snapshot;
    } catch (err) {
        console.error('Failed to record performance snapshot:', err.message);
        return null;
    }
}

function startPerformanceCollector(intervalMs) {
    if (perfCollectorInterval) return;
    var ms = intervalMs || 300000; // default 5 minutes
    perfCollectorInterval = setInterval(function () {
        recordPerformanceSnapshot().catch(function (e) {
            console.error('Perf collector error:', e.message);
        });
    }, ms);
    // Record one immediately
    recordPerformanceSnapshot().catch(function () { });
    console.log('📊 Performance collector started (interval: ' + (ms / 1000) + 's)');
}

function stopPerformanceCollector() {
    if (perfCollectorInterval) {
        clearInterval(perfCollectorInterval);
        perfCollectorInterval = null;
        console.log('📊 Performance collector stopped');
    }
}

// ─── Logs ──────────────────────────────────────────────────────────────────────

function getAvailableServices() {
    return ['monsterbox', 'mjpg-streamer', 'pigpiod', 'pipewire'];
}

async function getServiceLogs(service, lines, since) {
    var svc = getAvailableServices().includes(service) ? service : 'monsterbox';
    var n = parseInt(lines, 10) || 100;
    if (n > 1000) n = 1000;

    var cmd = 'journalctl -u ' + svc + ' --no-pager -n ' + n;
    if (since) {
        // Sanitize since param (e.g. "1 hour ago", "today")
        cmd += ' --since "' + String(since).replace(/"/g, '') + '"';
    }

    try {
        var result = await execAsync(cmd, { timeout: 10000, maxBuffer: 1024 * 1024 });
        return result.stdout || '';
    } catch (err) {
        return err.stdout || err.message || 'Failed to retrieve logs';
    }
}

// ─── System Settings ───────────────────────────────────────────────────────────

async function getSystemSettings() {
    var settings = {
        cpu: {},
        gpu: {},
        memory: {},
        startup: []
    };

    // CPU Governor
    try {
        var gov = await fs.readFile('/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor', 'utf8');
        settings.cpu.governor = gov.trim();
    } catch (_) {
        settings.cpu.governor = 'unknown';
    }

    // Available governors
    try {
        var avail = await fs.readFile('/sys/devices/system/cpu/cpu0/cpufreq/scaling_available_governors', 'utf8');
        settings.cpu.availableGovernors = avail.trim().split(/\s+/);
    } catch (_) {
        settings.cpu.availableGovernors = [];
    }

    // GPU memory (RPi only)
    try {
        var gpuResult = await execAsync('vcgencmd get_mem gpu', { timeout: 3000 });
        var gpuMatch = gpuResult.stdout.match(/gpu=(\d+)/);
        settings.gpu.memory = gpuMatch ? gpuMatch[1] + 'M' : 'unknown';
    } catch (_) {
        settings.gpu.memory = 'N/A (not RPi)';
    }

    // Swap info
    try {
        var swapResult = await execAsync('free -m | grep Swap', { timeout: 3000 });
        var parts = swapResult.stdout.trim().split(/\s+/);
        settings.memory.swapTotalMB = parseInt(parts[1], 10) || 0;
        settings.memory.swapUsedMB = parseInt(parts[2], 10) || 0;
    } catch (_) {
        settings.memory.swapTotalMB = 0;
        settings.memory.swapUsedMB = 0;
    }

    return settings;
}

async function updateSystemSetting(category, key, value) {
    if (category === 'cpu' && key === 'governor') {
        try {
            await execAsync('echo ' + String(value).replace(/[^a-z_-]/gi, '') + ' | sudo tee /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor', { timeout: 5000 });
            return { success: true, message: 'CPU governor set to ' + value };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }
    return { success: false, error: 'Unknown setting: ' + category + '/' + key };
}

async function getStartupTasks() {
    var services = ['monsterbox', 'mjpg-streamer', 'pigpiod'];
    var tasks = [];
    for (var i = 0; i < services.length; i++) {
        var svc = services[i];
        try {
            var result = await execAsync('systemctl is-enabled ' + svc + ' 2>/dev/null || echo disabled', { timeout: 5000 });
            var status = result.stdout.trim();
            tasks.push({ service: svc, enabled: status === 'enabled' });
        } catch (_) {
            tasks.push({ service: svc, enabled: false });
        }
    }
    return tasks;
}

async function setStartupTask(service, enabled) {
    var allowedServices = ['monsterbox', 'mjpg-streamer', 'pigpiod'];
    if (!allowedServices.includes(service)) {
        return { success: false, error: 'Service not allowed: ' + service };
    }
    try {
        var action = enabled ? 'enable' : 'disable';
        await execAsync('sudo systemctl ' + action + ' ' + service, { timeout: 10000 });
        return { success: true, message: service + ' ' + action + 'd' };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

// ─── SSH Keys ──────────────────────────────────────────────────────────────────

async function listSSHKeys() {
    var sshDir = path.join(os.homedir(), '.ssh');
    try {
        var files = await fs.readdir(sshDir);
        var keys = [];
        for (var i = 0; i < files.length; i++) {
            var f = files[i];
            if (f.endsWith('.pub')) {
                var baseName = f.replace('.pub', '');
                var fingerprint = '';
                try {
                    var fp = await execAsync('ssh-keygen -lf ' + path.join(sshDir, f), { timeout: 5000 });
                    fingerprint = fp.stdout.trim();
                } catch (_) { /* ignore */ }

                var stat = null;
                try { stat = await fs.stat(path.join(sshDir, f)); } catch (_) { /* ignore */ }

                keys.push({
                    name: baseName,
                    publicFile: f,
                    fingerprint: fingerprint,
                    created: stat ? stat.birthtime.toISOString() : null
                });
            }
        }
        return keys;
    } catch (_) {
        return [];
    }
}

async function generateSSHKey(type, comment) {
    var keyType = (type === 'rsa') ? 'rsa' : 'ed25519';
    var sshDir = path.join(os.homedir(), '.ssh');
    await fs.mkdir(sshDir, { recursive: true });

    var timestamp = Date.now();
    var keyName = 'monsterbox_' + keyType + '_' + timestamp;
    var keyPath = path.join(sshDir, keyName);
    var commentStr = comment || ('MonsterBox ' + keyType + ' key');

    try {
        var bits = keyType === 'rsa' ? ' -b 4096' : '';
        await execAsync('ssh-keygen -t ' + keyType + bits + ' -C "' + commentStr.replace(/"/g, '') + '" -f ' + keyPath + ' -N ""', { timeout: 15000 });
        var pubKey = await fs.readFile(keyPath + '.pub', 'utf8');
        return { success: true, name: keyName, publicKey: pubKey.trim() };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

async function deployKeyToHost(host, keyName) {
    var sshDir = path.join(os.homedir(), '.ssh');
    var pubPath = path.join(sshDir, keyName + '.pub');

    try {
        await fs.access(pubPath);
    } catch (_) {
        return { success: false, error: 'Public key not found: ' + keyName };
    }

    try {
        await execAsync('ssh-copy-id -i ' + pubPath + ' ' + String(host).replace(/[;&|`$]/g, ''), { timeout: 30000 });
        return { success: true, message: 'Key deployed to ' + host };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

async function deleteSSHKey(name) {
    var sshDir = path.join(os.homedir(), '.ssh');
    var privatePath = path.join(sshDir, name);
    var publicPath = path.join(sshDir, name + '.pub');

    try {
        try { await fs.unlink(privatePath); } catch (_) { /* may not exist */ }
        try { await fs.unlink(publicPath); } catch (_) { /* may not exist */ }
        return { success: true, message: 'Key deleted: ' + name };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

async function getAuthorizedKeys() {
    var authFile = path.join(os.homedir(), '.ssh', 'authorized_keys');
    try {
        var content = await fs.readFile(authFile, 'utf8');
        var lines = content.trim().split('\n').filter(function (l) { return l.trim() && !l.startsWith('#'); });
        return lines;
    } catch (_) {
        return [];
    }
}

// ─── Config Templates ──────────────────────────────────────────────────────────

async function listTemplates() {
    try {
        await fs.mkdir(TEMPLATES_DIR, { recursive: true });
        var files = await fs.readdir(TEMPLATES_DIR);
        var templates = [];
        for (var i = 0; i < files.length; i++) {
            if (!files[i].endsWith('.json')) continue;
            try {
                var raw = await fs.readFile(path.join(TEMPLATES_DIR, files[i]), 'utf8');
                var tpl = JSON.parse(raw);
                templates.push(tpl);
            } catch (_) { /* skip bad files */ }
        }
        return templates;
    } catch (_) {
        return [];
    }
}

async function saveTemplate(name, description) {
    try {
        await fs.mkdir(TEMPLATES_DIR, { recursive: true });
        var settings = await getSystemSettings();
        var id = 'tpl_' + Date.now();
        var template = {
            id: id,
            name: name || 'Untitled Template',
            description: description || '',
            created: new Date().toISOString(),
            settings: settings
        };
        await fs.writeFile(path.join(TEMPLATES_DIR, id + '.json'), JSON.stringify(template, null, 2), 'utf8');
        return { success: true, template: template };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

async function applyTemplate(templateId, targetHost) {
    try {
        var filePath = path.join(TEMPLATES_DIR, templateId + '.json');
        var raw = await fs.readFile(filePath, 'utf8');
        var template = JSON.parse(raw);

        // For local apply, set CPU governor from template
        if (!targetHost || targetHost === 'localhost') {
            if (template.settings && template.settings.cpu && template.settings.cpu.governor) {
                await updateSystemSetting('cpu', 'governor', template.settings.cpu.governor);
            }
            return { success: true, message: 'Template applied locally' };
        }

        // Remote apply via SSH (basic)
        return { success: false, error: 'Remote template application not yet implemented' };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

async function deleteTemplate(id) {
    try {
        var filePath = path.join(TEMPLATES_DIR, id + '.json');
        await fs.unlink(filePath);
        return { success: true, message: 'Template deleted' };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

// ─── Console Output (reads /var/log/monsterbox.log or .err) ────────────────────

async function getConsoleOutput(lines, source) {
    var n = parseInt(lines, 10) || 100;
    if (n > 2000) n = 2000;

    var logFile = (source === 'stderr')
        ? '/var/log/monsterbox.err'
        : '/var/log/monsterbox.log';

    try {
        var result = await execAsync(
            'tail -n ' + n + ' ' + logFile,
            { timeout: 10000, maxBuffer: 2 * 1024 * 1024 }
        );
        return result.stdout || '';
    } catch (err) {
        return err.stdout || err.message || 'Failed to read console output';
    }
}

// ─── RPi Performance Presets ───────────────────────────────────────────────────

var RPI_PRESETS = {
    'rpi3b-performance': {
        label: 'RPi 3B — Performance',
        description: 'Max CPU for real-time audio and servo control on Pi 3B',
        model: 'Raspberry Pi 3 Model B',
        settings: {
            governor: 'performance',
            gpu_mem: 32,
            arm_freq: 1200,
            over_voltage: 0,
            i2c_baudrate: 400000
        }
    },
    'rpi3bplus-performance': {
        label: 'RPi 3B+ — Performance',
        description: 'Max CPU for real-time audio and servo control on Pi 3B+',
        model: 'Raspberry Pi 3 Model B Plus',
        settings: {
            governor: 'performance',
            gpu_mem: 32,
            arm_freq: 1400,
            over_voltage: 0,
            i2c_baudrate: 400000
        }
    },
    'rpi4b-performance': {
        label: 'RPi 4B — Performance (Lifelike)',
        description: 'Max CPU, fast I2C for smooth servo motion and low-latency audio/TTS',
        model: 'Raspberry Pi 4 Model B',
        settings: {
            governor: 'performance',
            gpu_mem: 64,
            arm_freq: 1800,
            over_voltage: 0,
            i2c_baudrate: 400000
        }
    },
    'rpi4b-balanced': {
        label: 'RPi 4B — Balanced',
        description: 'Dynamic CPU scaling, moderate power usage',
        model: 'Raspberry Pi 4 Model B',
        settings: {
            governor: 'ondemand',
            gpu_mem: 64,
            arm_freq: 1800,
            over_voltage: 0,
            i2c_baudrate: 100000
        }
    },
    'rpi5-performance': {
        label: 'RPi 5 — Performance (Lifelike)',
        description: 'Max CPU on Pi 5 for ultra-smooth animation and real-time audio',
        model: 'Raspberry Pi 5',
        settings: {
            governor: 'performance',
            gpu_mem: 64,
            arm_freq: 2400,
            over_voltage: 0,
            i2c_baudrate: 400000
        }
    },
    'rpi5-balanced': {
        label: 'RPi 5 — Balanced',
        description: 'Dynamic CPU scaling on Pi 5, moderate power usage',
        model: 'Raspberry Pi 5',
        settings: {
            governor: 'ondemand',
            gpu_mem: 64,
            arm_freq: 2400,
            over_voltage: 0,
            i2c_baudrate: 100000
        }
    }
};

function getPerformancePresets() {
    return RPI_PRESETS;
}

async function applyPerformancePreset(presetId) {
    var preset = RPI_PRESETS[presetId];
    if (!preset) return { success: false, error: 'Unknown preset: ' + presetId };

    var results = [];

    // Apply CPU governor (immediate, no reboot required)
    if (preset.settings.governor) {
        try {
            await execAsync(
                'echo ' + preset.settings.governor + ' | sudo tee /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor',
                { timeout: 5000 }
            );
            results.push({ key: 'governor', success: true, value: preset.settings.governor });
        } catch (e) {
            results.push({ key: 'governor', success: false, error: e.message });
        }
    }

    // Boot config changes require editing /boot/firmware/config.txt and rebooting
    var bootChanges = [];
    if (preset.settings.gpu_mem) bootChanges.push('gpu_mem=' + preset.settings.gpu_mem);
    if (preset.settings.arm_freq) bootChanges.push('arm_freq=' + preset.settings.arm_freq);
    if (preset.settings.over_voltage != null) bootChanges.push('over_voltage=' + preset.settings.over_voltage);
    if (preset.settings.i2c_baudrate) bootChanges.push('dtparam=i2c_arm=on,i2c_arm_baudrate=' + preset.settings.i2c_baudrate);

    if (bootChanges.length > 0) {
        results.push({
            key: 'boot_config',
            success: true,
            requiresReboot: true,
            message: 'Add to /boot/firmware/config.txt and reboot: ' + bootChanges.join(', ')
        });
    }

    return { success: true, preset: presetId, label: preset.label, results: results };
}

export default {
    getPerformanceSnapshot,
    getPerformanceHistory,
    recordPerformanceSnapshot,
    startPerformanceCollector,
    stopPerformanceCollector,
    getAvailableServices,
    getServiceLogs,
    getConsoleOutput,
    getPerformancePresets,
    applyPerformancePreset,
    getSystemSettings,
    updateSystemSetting,
    getStartupTasks,
    setStartupTask,
    listSSHKeys,
    generateSSHKey,
    deployKeyToHost,
    deleteSSHKey,
    getAuthorizedKeys,
    listTemplates,
    saveTemplate,
    applyTemplate,
    deleteTemplate
};
