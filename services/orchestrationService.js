/**
 * Orchestration Service
 * Broadcast/multicast control for all animatronics and Goblins
 * Uses SSH and HTTP APIs - no new WebSocket systems
 */

import axios from 'axios';
import https from 'https';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import nodeDiscoveryService from './nodeDiscoveryService.js';

// HTTPS agent that accepts self-signed certificates (all MonsterBox nodes use self-signed SSL)
const httpsAgent = new https.Agent({ rejectUnauthorized: false });
const axiosHttps = axios.create({ httpsAgent });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execAsync = promisify(exec);

// The committed dev SSH password. Kept ONLY as a last-resort fallback so existing
// fleets keep working; it is a known-leaked credential and must be rotated.
const LEGACY_SSH_PASSWORD = 'klrklr89!';

// Accept only bare IPv4 / hostname characters. Node IPs can originate from mDNS
// discovery (untrusted), and several control paths interpolate the host into a
// shell string for SSH — validate before any such use to close command injection.
const HOST_RE = /^[A-Za-z0-9.\-]{1,253}$/;
function isValidHost(host) {
    return typeof host === 'string' && HOST_RE.test(host);
}

class OrchestrationService {
    constructor() {
        const config = this.loadAnimatronicsConfig();
        this.animatronics = config.animatronics;
        this.goblins = config.goblins;

        this.sshUser = 'remote';
        // Inter-node control credential. Prefer setting MONSTERBOX_SSH_PASSWORD in
        // each node's service environment (and rotating this value — it was committed
        // to git). The literal remains only as a fallback so existing deployments keep
        // working; when it is in use we warn loudly at startup.
        this.sshPassword = process.env.MONSTERBOX_SSH_PASSWORD || LEGACY_SSH_PASSWORD;
        if (this.sshPassword === LEGACY_SSH_PASSWORD) {
            console.warn('🔓 SECURITY: orchestration is using the committed fallback SSH password. '
                + 'Set MONSTERBOX_SSH_PASSWORD in the service environment on every node and rotate the leaked value. '
                + 'SSH fleet control (reboot/restart/deploy) works either way.');
        }

        // Opt-in trust enforcement: when MB_NODE_TOKEN_ENFORCE is on, nodes whose
        // mDNS token does not match are shown in the registry but excluded from the
        // control/SSH fan-out. Off by default so a partial token rollout can't silently
        // drop real nodes.
        this.enforceTrust = process.env.MB_NODE_TOKEN_ENFORCE === '1'
            || process.env.MB_NODE_TOKEN_ENFORCE === 'true';
    }

    /**
     * Nodes that are eligible for control/SSH fan-out: valid host, and (when trust
     * enforcement is on) not explicitly untrusted. Optionally filtered to a subset
     * of ids so operators can target selected animatronics instead of all.
     * @param {Array<(string|number)>} [ids]
     * @returns {Array<object>}
     */
    getControllableAnimatronics(ids = null) {
        let list = this.getAnimatronics().filter(a => isValidHost(a.ip));
        if (this.enforceTrust) list = list.filter(a => a.trusted !== false);
        if (Array.isArray(ids) && ids.length) {
            const want = new Set(ids.map(String));
            list = list.filter(a => want.has(String(a.id)));
        }
        return list;
    }

    /**
     * One audited inter-node HTTPS call. Uses an AbortController so the timeout is
     * always honored (axios' own timer misses some socket states). Returns the parsed
     * body on success and throws a concise Error otherwise.
     * @param {object} node - must have ip/port
     * @param {{method?:string, path:string, body?:object, timeout?:number}} opts
     */
    async httpNode(node, { method = 'get', path: apiPath, body, timeout = 8000 } = {}) {
        if (!isValidHost(node.ip)) throw new Error(`Invalid host: ${node.ip}`);
        const url = `https://${node.ip}:${node.port || 3000}${apiPath}`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), Math.max(1000, timeout));
        try {
            const resp = await axiosHttps.request({
                method,
                url,
                data: body,
                headers: body ? { 'Content-Type': 'application/json' } : undefined,
                timeout,
                signal: controller.signal,
            });
            return resp.data;
        } catch (error) {
            if (error?.code === 'ECONNABORTED' || error?.message?.includes('aborted') || error?.name === 'CanceledError') {
                throw new Error(`Timed out after ${timeout}ms`);
            }
            throw new Error(error?.response?.data?.error || error.message);
        } finally {
            clearTimeout(timer);
        }
    }

    /**
     * Summarize a Promise.allSettled fan-out into {total, successful, failed} plus a
     * normalized results array. Each result is expected to carry a boolean `success`.
     */
    _summarize(results, labelKey = 'animatronic') {
        const normalized = results.map(r => (r.status === 'fulfilled' ? r.value : { success: false, error: String(r.reason?.message || r.reason) }));
        const successful = normalized.filter(r => r && r.success).length;
        return {
            total: normalized.length,
            successful,
            failed: normalized.length - successful,
            results: normalized,
        };
    }

    /**
     * Load animatronic and goblin topology from config/animatronics.json
     * Uses synchronous read since this runs once at startup in the constructor
     */
    loadAnimatronicsConfig() {
        const configPath = path.resolve(__dirname, '..', 'config', 'animatronics.json');
        try {
            const raw = readFileSync(configPath, 'utf8');
            const config = JSON.parse(raw);

            const animatronics = Array.isArray(config.animatronics) ? config.animatronics : [];
            const goblins = Array.isArray(config.goblins) ? config.goblins : [];

            if (animatronics.length === 0) {
                console.warn('⚠️ config/animatronics.json contains no animatronics entries');
            }

            console.log(`📡 Loaded ${animatronics.length} animatronics and ${goblins.length} goblins from config`);
            return { animatronics, goblins };
        } catch (error) {
            console.error(`❌ Failed to load config/animatronics.json: ${error.message}`);
            console.error('   Orchestration will have no animatronics configured.');
            return { animatronics: [], goblins: [] };
        }
    }

    /**
     * Broadcast a command to all animatronics
     */
    async broadcastToAnimatronics(command, params = {}) {
        console.log(`📡 Broadcasting to all animatronics: ${command}`);

        const targets = this.getControllableAnimatronics(params.ids);
        const results = await Promise.allSettled(
            targets.map(async (animatronic) => {
                try {
                    const result = await this.executeOnAnimatronic(animatronic, command, params);
                    return {
                        animatronic: animatronic.name,
                        id: animatronic.id,
                        success: true,
                        result
                    };
                } catch (error) {
                    return {
                        animatronic: animatronic.name,
                        id: animatronic.id,
                        success: false,
                        error: error.message
                    };
                }
            })
        );

        const summary = this._summarize(results);
        return {
            // Meaningful now: true only if at least one node accepted the command.
            success: summary.successful > 0,
            command,
            ...summary,
        };
    }

    /**
     * Execute a command on a specific animatronic
     */
    async executeOnAnimatronic(animatronic, command, params = {}) {
        const { ip, port, name } = animatronic;

        switch (command) {
            case 'reboot':
                return await this.rebootDevice(ip);

            case 'restart-service':
                return await this.restartService(ip);

            case 'health-check':
                return await this.healthCheck(ip, port);

            case 'say':
                return await this.sayText(ip, port, params.text, params.characterId, { timeoutMs: params.timeoutMs });

            case 'enable-random-poses':
                return await this.enableRandomPoses(ip, port, params.characterId, params.options);

            case 'disable-random-poses':
                return await this.disableRandomPoses(ip, port);

            case 'update-config':
                return await this.updateConfig(ip, params.config);

            case 'deploy-code':
                return await this.deployCode(ip);

            default:
                throw new Error(`Unknown command: ${command}`);
        }
    }

    /**
     * Reboot a device via SSH
     */
    async rebootDevice(ip) {
        if (!isValidHost(ip)) throw new Error(`Reboot failed: invalid host ${ip}`);
        try {
            // `sshpass -e` reads the SSH password from the SSHPASS env var instead
            // of argv, keeping it out of the process table. (The remote `sudo -S`
            // still echoes it; a NOPASSWD sudoers entry for reboot would remove that.)
            const sshCmd = `sshpass -e ssh -o StrictHostKeyChecking=no ${this.sshUser}@${ip} 'echo ${this.sshPassword} | sudo -S reboot'`;
            await execAsync(sshCmd, { env: { ...process.env, SSHPASS: this.sshPassword } });
            return { success: true, message: 'Reboot command sent' };
        } catch (error) {
            throw new Error(`Reboot failed: ${error.message}`);
        }
    }

    /**
     * Restart MonsterBox service on a device
     */
    async restartService(ip) {
        if (!isValidHost(ip)) throw new Error(`Service restart failed: invalid host ${ip}`);
        try {
            const cmd = `sshpass -e ssh -o StrictHostKeyChecking=no ${this.sshUser}@${ip} "sudo systemctl restart monsterbox || (pkill -f 'node.*server.js' || true; cd ~/MonsterBox && nohup npm start > /tmp/monsterbox.log 2>&1 &)"`;
            await execAsync(cmd, { env: { ...process.env, SSHPASS: this.sshPassword } });
            return { success: true, message: 'Service restart initiated' };
        } catch (error) {
            throw new Error(`Service restart failed: ${error.message}`);
        }
    }

    /**
     * Health check via HTTP
     */
    async healthCheck(ip, port) {
        try {
            const response = await axiosHttps.get(`https://${ip}:${port}/`, { timeout: 5000 });
            return {
                success: true,
                online: response.status === 200,
                status: response.status
            };
        } catch (error) {
            return {
                success: false,
                online: false,
                error: error.message
            };
        }
    }

    /**
     * Make an animatronic say text using AI agent (personality-infused speech)
     * This processes text through the character's AI agent for authentic personality
     */
    async sayText(ip, port, text, characterId, options = {}) {
        const timeoutMs = Math.max(1000, Math.min(15000, options.timeoutMs || 5000));
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await axiosHttps.post(
                `https://${ip}:${port}/api/elevenlabs/agent-speak`,
                { text, characterId },
                {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: timeoutMs,
                    signal: controller.signal
                }
            );
            return { success: true, data: response.data };
        } catch (error) {
            if (error?.code === 'ECONNABORTED' || error?.message?.includes('aborted')) {
                throw new Error(`Timed out after ${timeoutMs}ms`);
            }
            throw new Error(`Say text failed: ${error.message}`);
        } finally {
            clearTimeout(timer);
        }
    }

    /**
     * Enable random poses on an animatronic
     */
    async enableRandomPoses(ip, port, characterId, options = {}) {
        try {
            const response = await axiosHttps.post(
                `https://${ip}:${port}/api/random-poses/enable`,
                { characterId, ...options },
                {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 5000
                }
            );
            return { success: true, data: response.data };
        } catch (error) {
            throw new Error(`Enable random poses failed: ${error.message}`);
        }
    }

    /**
     * Disable random poses on an animatronic
     */
    async disableRandomPoses(ip, port) {
        try {
            const response = await axiosHttps.post(
                `https://${ip}:${port}/api/random-poses/disable`,
                {},
                {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 5000
                }
            );
            return { success: true, data: response.data };
        } catch (error) {
            throw new Error(`Disable random poses failed: ${error.message}`);
        }
    }

    /**
     * Update configuration file on a device
     */
    async updateConfig(ip, config) {
        if (!isValidHost(ip)) throw new Error(`Config update failed: invalid host ${ip}`);
        try {
            const configJson = JSON.stringify(config, null, 2).replace(/'/g, "'\\''");
            const cmd = `sshpass -e ssh -o StrictHostKeyChecking=no ${this.sshUser}@${ip} "printf '%s' '${configJson}' | sudo tee ~/MonsterBox/config/app-config.json >/dev/null"`;
            await execAsync(cmd, { env: { ...process.env, SSHPASS: this.sshPassword } });
            return { success: true, message: 'Config updated' };
        } catch (error) {
            throw new Error(`Config update failed: ${error.message}`);
        }
    }

    /**
     * Deploy code to a device via rsync
     */
    async deployCode(ip) {
        if (!isValidHost(ip)) throw new Error(`Code deployment failed: invalid host ${ip}`);
        try {
            const cmd = `./scripts/deploy-to-animatronic.sh ${ip}`;
            // The deploy script shells out via sshpass -e like the other SSH ops, so it
            // needs SSHPASS in its environment (previously omitted here).
            const { stdout, stderr } = await execAsync(cmd, { env: { ...process.env, SSHPASS: this.sshPassword } });
            return {
                success: true,
                message: 'Code deployed',
                output: stdout,
                errors: stderr
            };
        } catch (error) {
            throw new Error(`Code deployment failed: ${error.message}`);
        }
    }

    /**
     * Get status of all animatronics
     */
    async getAllStatus() {
        const results = await Promise.allSettled(
            this.getAnimatronics().map(async (animatronic) => {
                try {
                    const health = await this.healthCheck(animatronic.ip, animatronic.port);
                    return {
                        ...animatronic,
                        ...health
                    };
                } catch (error) {
                    return {
                        ...animatronic,
                        success: false,
                        online: false,
                        error: error.message
                    };
                }
            })
        );

        const animatronics = results.map(r => r.value || r.reason);
        const online = animatronics.filter(a => a && a.online).length;
        // A status *query* always "succeeds"; the useful signal is the online count.
        return {
            success: true,
            total: animatronics.length,
            online,
            offline: animatronics.length - online,
            animatronics,
        };
    }

    /**
     * Health/status of a single animatronic by id (for the per-node status endpoint).
     */
    async getAnimatronicStatus(id) {
        const animatronic = this.getAnimatronicById(id);
        if (!animatronic) return { success: false, error: `Animatronic ${id} not found` };
        const health = await this.healthCheck(animatronic.ip, animatronic.port);
        return { success: true, ...animatronic, ...health };
    }

    /**
     * Broadcast to Goblins
     */
    async broadcastToGoblins(command, params = {}) {
        console.log(`📡 Broadcasting to all Goblins: ${command}`);

        let targets = this.goblins;
        if (Array.isArray(params.ids) && params.ids.length) {
            const want = new Set(params.ids.map(String));
            targets = targets.filter(g => want.has(String(g.id)));
        }
        const results = await Promise.allSettled(
            targets.map(async (goblin) => {
                try {
                    const result = await this.executeOnGoblin(goblin, command, params);
                    return {
                        goblin: goblin.name,
                        id: goblin.id,
                        success: true,
                        result
                    };
                } catch (error) {
                    return {
                        goblin: goblin.name,
                        id: goblin.id,
                        success: false,
                        error: error.message
                    };
                }
            })
        );

        const summary = this._summarize(results, 'goblin');
        return {
            success: summary.successful > 0,
            command,
            ...summary,
        };
    }

    /**
     * Execute a command on a Goblin
     */
    async executeOnGoblin(goblin, command, params = {}) {
        const { ip, port } = goblin;

        switch (command) {
            case 'reboot':
                return await this.rebootDevice(ip);

            case 'play-video':
                return await this.playGoblinVideo(ip, port, params.filename);

            case 'stop-video':
                return await this.stopGoblinVideo(ip, port);

            case 'health-check':
                return await this.healthCheck(ip, port);

            default:
                throw new Error(`Unknown Goblin command: ${command}`);
        }
    }

    /**
     * Play video on a Goblin
     */
    async playGoblinVideo(ip, port, filename) {
        try {
            const response = await axiosHttps.post(
                `https://${ip}:${port}/play-video`,
                { filename, loop: true },
                {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 5000
                }
            );
            return { success: true, data: response.data };
        } catch (error) {
            throw new Error(`Play video failed: ${error.message}`);
        }
    }

    /**
     * Stop video on a Goblin
     */
    async stopGoblinVideo(ip, port) {
        try {
            const response = await axiosHttps.post(
                `https://${ip}:${port}/stop-video`,
                {},
                { timeout: 5000 }
            );
            return { success: true, data: response.data };
        } catch (error) {
            throw new Error(`Stop video failed: ${error.message}`);
        }
    }

    /**
     * Start all queue loops on all animatronics
     * Uses defaultSceneId from each animatronic's config entry
     */
    async startAllQueueLoops() {
        console.log('🎬 Starting all queue loops...');

        const results = await Promise.allSettled(
            this.getAnimatronics().map(async (animatronic) => {
                try {
                    const sceneId = animatronic.defaultSceneId;
                    if (!sceneId) {
                        return {
                            name: animatronic.name,
                            success: false,
                            error: 'No defaultSceneId configured'
                        };
                    }

                    const base = `https://${animatronic.ip}:${animatronic.port}/scenes/api/queue`;
                    const postJSON = async (url, body, timeout) => axiosHttps.post(url, body, { headers: { 'Content-Type': 'application/json' }, timeout });

                    // Clear queue
                    try {
                        await postJSON(`${base}/clear`, {}, 8000);
                    } catch (e) {
                        const status = e?.response?.status;
                        const data = e?.response?.data;
                        console.error(`Queue clear failed for ${animatronic.name} -> ${base}/clear [${status || 'no-status'}]:`, e.message, data ? JSON.stringify(data).slice(0, 300) : '');
                        // Continue anyway to try enqueue/start
                    }

                    // Enqueue scene
                    try {
                        await postJSON(`${base}/enqueue`, { sceneId }, 8000);
                    } catch (e) {
                        const status = e?.response?.status;
                        const data = e?.response?.data;
                        console.error(`Queue enqueue failed for ${animatronic.name} -> ${base}/enqueue [${status || 'no-status'}]:`, e.message, data ? JSON.stringify(data).slice(0, 300) : '');
                        return {
                            name: animatronic.name,
                            success: false,
                            error: `enqueue failed: ${e.message}`,
                            status,
                            endpoint: `${base}/enqueue`,
                            details: data && (data.error || data.message)
                        };
                    }

                    // Start queue in loop mode (body is currently ignored by device but harmless)
                    try {
                        const response = await postJSON(`${base}/start`, { mode: 'loop_queue' }, 8000);
                        return {
                            name: animatronic.name,
                            success: !!(response.data && response.data.success),
                            message: `Scene ${sceneId} started`
                        };
                    } catch (e) {
                        const status = e?.response?.status;
                        const data = e?.response?.data;
                        console.error(`Queue start failed for ${animatronic.name} -> ${base}/start [${status || 'no-status'}]:`, e.message, data ? JSON.stringify(data).slice(0, 300) : '');
                        return {
                            name: animatronic.name,
                            success: false,
                            error: `start failed: ${e.message}`,
                            status,
                            endpoint: `${base}/start`,
                            details: data && (data.error || data.message)
                        };
                    }
                } catch (error) {
                    return {
                        name: animatronic.name,
                        success: false,
                        error: error.message
                    };
                }
            })
        );

        const processed = results.map(r => r.value || r.reason);
        const successful = processed.filter(r => r.success).length;

        return {
            success: successful > 0,
            total: this.getAnimatronics().length,
            successful,
            results: processed
        };
    }

    /**
     * Map of fleet "superpower" toggles to the node-local endpoint that owns them.
     * Each node resolves its OWN character (getCurrentCharacterId), so broadcasting
     * to a node acts on that node's selected animatronic — no characterId needed.
     */
    static SUPERPOWER_ENDPOINTS = {
        lurk: (on) => ({ method: 'post', path: '/conversation/api/lurk-mode', body: { enabled: on } }),
        jaw: (on) => ({ method: 'post', path: '/conversation/api/jaw-settings', body: { enabled: on } }),
        head: (on) => ({ method: 'post', path: '/conversation/api/head-tracking', body: { enabled: on } }),
        motion: (on) => ({ method: 'post', path: '/conversation/api/motion-sensor', body: { enabled: on } }),
        mute: (on) => ({ method: 'post', path: '/conversation/api/speaker-mute', body: { muted: on } }),
        idle: (on) => ({ method: 'post', path: on ? '/api/movement/idle/start' : '/api/movement/idle/stop' }),
    };

    /**
     * Toggle a superpower across the fleet (or a subset of ids).
     * @param {string} feature - one of SUPERPOWER_ENDPOINTS keys
     * @param {boolean} enabled
     * @param {Array<(string|number)>} [ids]
     */
    async broadcastSuperpower(feature, enabled, ids = null) {
        const build = OrchestrationService.SUPERPOWER_ENDPOINTS[feature];
        if (!build) throw new Error(`Unknown superpower: ${feature}`);
        const call = build(!!enabled);
        const targets = this.getControllableAnimatronics(ids);
        const results = await Promise.allSettled(targets.map(async (node) => {
            try {
                const data = await this.httpNode(node, { ...call, timeout: 8000 });
                return { animatronic: node.name, id: node.id, success: data?.success !== false, result: data };
            } catch (error) {
                return { animatronic: node.name, id: node.id, success: false, error: error.message };
            }
        }));
        return { success: true, feature, enabled: !!enabled, ...this._summarize(results) };
    }

    /**
     * Stop all scene queue loops across the fleet.
     */
    async stopAllQueueLoops(ids = null) {
        const targets = this.getControllableAnimatronics(ids);
        const results = await Promise.allSettled(targets.map(async (node) => {
            try {
                const data = await this.httpNode(node, { method: 'post', path: '/scenes/api/queue/stop', timeout: 8000 });
                return { animatronic: node.name, id: node.id, success: data?.success !== false, result: data };
            } catch (error) {
                return { animatronic: node.name, id: node.id, success: false, error: error.message };
            }
        }));
        return { success: true, ...this._summarize(results) };
    }

    /**
     * Fleet EMERGENCY STOP: halt every animatronic mid-show. Per node, best-effort in
     * parallel: emergency-stop the scene queue, stop all audio, disable random poses,
     * and mute the speaker. A node counts as stopped if any of these succeed.
     */
    async emergencyStop(ids = null) {
        const targets = this.getControllableAnimatronics(ids);
        const actions = [
            { method: 'post', path: '/scenes/api/queue/emergency-stop' },
            { method: 'post', path: '/api/audio/stop-all' },
            { method: 'post', path: '/api/random-poses/disable' },
            { method: 'post', path: '/conversation/api/speaker-mute', body: { muted: true } },
        ];
        const results = await Promise.allSettled(targets.map(async (node) => {
            const outcomes = await Promise.allSettled(
                actions.map(a => this.httpNode(node, { ...a, timeout: 6000 }))
            );
            const okCount = outcomes.filter(o => o.status === 'fulfilled').length;
            return {
                animatronic: node.name,
                id: node.id,
                success: okCount > 0,
                actionsSucceeded: okCount,
                actionsTotal: actions.length,
            };
        }));
        return { success: true, ...this._summarize(results) };
    }

    /**
     * Set master speaker volume (0-100) across the fleet.
     */
    async setMasterVolume(volume, ids = null) {
        const vol = Math.max(0, Math.min(100, parseInt(volume, 10)));
        if (!Number.isFinite(vol)) throw new Error('volume must be 0-100');
        const targets = this.getControllableAnimatronics(ids);
        const results = await Promise.allSettled(targets.map(async (node) => {
            try {
                const data = await this.httpNode(node, { method: 'put', path: '/api/system/volume', body: { volume: vol }, timeout: 8000 });
                return { animatronic: node.name, id: node.id, success: data?.success !== false, result: data };
            } catch (error) {
                return { animatronic: node.name, id: node.id, success: false, error: error.message };
            }
        }));
        return { success: true, volume: vol, ...this._summarize(results) };
    }

    /**
     * Aggregated per-node health: version + CPU/RSS/uptime + servo/idle telemetry,
     * pulled in parallel from each node's existing health endpoints. Never throws;
     * unreachable nodes report online:false. Powers the command-center health cards.
     */
    async getFleetHealth(ids = null) {
        const targets = this.getControllableAnimatronics(ids);
        const results = await Promise.allSettled(targets.map(async (node) => {
            const card = { id: node.id, name: node.name, ip: node.ip, port: node.port, source: node.source, trusted: node.trusted !== false };
            try {
                // /api/system/info carries version + uptime + cpu in one lightweight call.
                const info = await this.httpNode(node, { path: '/api/system/info', timeout: 5000 });
                card.online = true;
                card.version = info?.version || null;
                card.uptimeSec = typeof info?.uptime === 'number' ? Math.round(info.uptime) : null;
                card.cpuCount = info?.cpuCount ?? null;
                card.hostname = info?.hostname || node.hostname || null;
            } catch (error) {
                // Fall back to the bare /health ping so a node without /api/system/info
                // still reads as online.
                try {
                    const health = await this.httpNode(node, { path: '/health', timeout: 4000 });
                    card.online = true;
                    card.version = health?.version || null;
                } catch (err2) {
                    card.online = false;
                    card.error = error.message;
                    return card;
                }
            }
            // Best-effort enrichment; a node may lack a given endpoint on older builds.
            const [mem, movement] = await Promise.allSettled([
                this.httpNode(node, { path: '/api/resource/memory', timeout: 4000 }),
                this.httpNode(node, { path: '/api/movement/telemetry', timeout: 4000 }),
            ]);
            if (mem.status === 'fulfilled' && mem.value?.memory) {
                card.rssMb = mem.value.memory.rssMB ?? null;
                card.memLevel = mem.value.memory.level ?? null;
            }
            if (movement.status === 'fulfilled' && movement.value?.telemetry) {
                card.servoLatencyMs = movement.value.telemetry.latency?.avg ?? null;
            }
            return card;
        }));
        const cards = results.map(r => (r.status === 'fulfilled' ? r.value : { online: false, error: String(r.reason?.message || r.reason) }));
        const online = cards.filter(c => c.online).length;
        return { success: true, total: cards.length, online, offline: cards.length - online, nodes: cards };
    }

    /**
     * Live animatronic list: the static config from animatronics.json with each
     * entry's `ip` overlaid by mDNS discovery when the node is currently online.
     * When nothing is discovered (dev host, mDNS-blocked network) this returns the
     * static config unchanged, so behavior is identical to pre-discovery builds.
     * @returns {Array<object>}
     */
    getAnimatronics() {
        try {
            return nodeDiscoveryService.overlay(this.animatronics);
        } catch (_) {
            return this.animatronics; // never let discovery break orchestration
        }
    }

    /**
     * Get animatronic by ID
     */
    getAnimatronicById(id) {
        return this.getAnimatronics().find(a => String(a.id) === String(id));
    }

    /**
     * Get all animatronics
     */
    getAllAnimatronics() {
        return this.getAnimatronics();
    }
}

// Export singleton instance
const orchestrationService = new OrchestrationService();
export default orchestrationService;
