/**
 * Orchestration Service
 * Broadcast/multicast control for all animatronics and Goblins
 * Uses SSH and HTTP APIs - no new WebSocket systems
 */

import axios from 'axios';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execAsync = promisify(exec);

class OrchestrationService {
    constructor() {
        const config = this.loadAnimatronicsConfig();
        this.animatronics = config.animatronics;
        this.goblins = config.goblins;

        this.sshUser = 'remote';
        this.sshPassword = 'klrklr89!'; // For reference, but using SSH keys
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

        const results = await Promise.allSettled(
            this.animatronics.map(async (animatronic) => {
                try {
                    const result = await this.executeOnAnimatronic(animatronic, command, params);
                    return {
                        animatronic: animatronic.name,
                        success: true,
                        result
                    };
                } catch (error) {
                    return {
                        animatronic: animatronic.name,
                        success: false,
                        error: error.message
                    };
                }
            })
        );

        return {
            success: true,
            command,
            results: results.map(r => r.value || r.reason)
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
        try {
            const sshCmd = `sshpass -p '${this.sshPassword}' ssh -o StrictHostKeyChecking=no ${this.sshUser}@${ip} 'echo ${this.sshPassword} | sudo -S reboot'`;
            await execAsync(sshCmd);
            return { success: true, message: 'Reboot command sent' };
        } catch (error) {
            throw new Error(`Reboot failed: ${error.message}`);
        }
    }

    /**
     * Restart MonsterBox service on a device
     */
    async restartService(ip) {
        try {
            const cmd = `sshpass -p '${this.sshPassword}' ssh -o StrictHostKeyChecking=no ${this.sshUser}@${ip} "sudo systemctl restart monsterbox || (pkill -f 'node.*server.js' || true; cd ~/MonsterBox && nohup npm start > /tmp/monsterbox.log 2>&1 &)"`;
            await execAsync(cmd);
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
            const response = await axios.get(`http://${ip}:${port}/`, { timeout: 5000 });
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
            const response = await axios.post(
                `http://${ip}:${port}/api/elevenlabs/agent-speak`,
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
            const response = await axios.post(
                `http://${ip}:${port}/api/random-poses/enable`,
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
            const response = await axios.post(
                `http://${ip}:${port}/api/random-poses/disable`,
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
        try {
            const configJson = JSON.stringify(config, null, 2).replace(/'/g, "'\\''");
            const cmd = `sshpass -p '${this.sshPassword}' ssh -o StrictHostKeyChecking=no ${this.sshUser}@${ip} "printf '%s' '${configJson}' | sudo tee ~/MonsterBox/config/app-config.json >/dev/null"`;
            await execAsync(cmd);
            return { success: true, message: 'Config updated' };
        } catch (error) {
            throw new Error(`Config update failed: ${error.message}`);
        }
    }

    /**
     * Deploy code to a device via rsync
     */
    async deployCode(ip) {
        try {
            const cmd = `./scripts/deploy-to-animatronic.sh ${ip}`;
            const { stdout, stderr } = await execAsync(cmd);
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
            this.animatronics.map(async (animatronic) => {
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

        return {
            success: true,
            animatronics: results.map(r => r.value || r.reason)
        };
    }

    /**
     * Broadcast to Goblins
     */
    async broadcastToGoblins(command, params = {}) {
        console.log(`📡 Broadcasting to all Goblins: ${command}`);

        const results = await Promise.allSettled(
            this.goblins.map(async (goblin) => {
                try {
                    const result = await this.executeOnGoblin(goblin, command, params);
                    return {
                        goblin: goblin.name,
                        success: true,
                        result
                    };
                } catch (error) {
                    return {
                        goblin: goblin.name,
                        success: false,
                        error: error.message
                    };
                }
            })
        );

        return {
            success: true,
            command,
            results: results.map(r => r.value || r.reason)
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
            const response = await axios.post(
                `http://${ip}:${port}/play-video`,
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
            const response = await axios.post(
                `http://${ip}:${port}/stop-video`,
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
            this.animatronics.map(async (animatronic) => {
                try {
                    const sceneId = animatronic.defaultSceneId;
                    if (!sceneId) {
                        return {
                            name: animatronic.name,
                            success: false,
                            error: 'No defaultSceneId configured'
                        };
                    }

                    const base = `http://${animatronic.ip}:${animatronic.port}/scenes/api/queue`;
                    const postJSON = async (url, body, timeout) => axios.post(url, body, { headers: { 'Content-Type': 'application/json' }, timeout });

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
            total: this.animatronics.length,
            successful,
            results: processed
        };
    }

    /**
     * Get animatronic by ID
     */
    getAnimatronicById(id) {
        return this.animatronics.find(a => a.id === parseInt(id));
    }

    /**
     * Get all animatronics
     */
    getAllAnimatronics() {
        return this.animatronics;
    }
}

// Export singleton instance
const orchestrationService = new OrchestrationService();
export default orchestrationService;
