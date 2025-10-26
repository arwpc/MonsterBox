/**
 * Orchestration Service
 * Broadcast/multicast control for all animatronics and Goblins
 * Uses SSH and HTTP APIs - no new WebSocket systems
 */

import axios from 'axios';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

class OrchestrationService {
    constructor() {
        // Animatronic network map with characterId for AI Prompt Generator
        this.animatronics = [
            { id: 1, name: 'PumpkinHead', ip: '192.168.8.150', port: 3000, characterId: 27 },      // character-27
            { id: 2, name: 'Coffin Breaker', ip: '192.168.8.140', port: 3000, characterId: 2 },    // character-2 (has agent)
            { id: 3, name: 'Orlok', ip: '192.168.8.120', port: 3000, characterId: 1 },             // character-1
            { id: 4, name: 'Skulltalker', ip: '192.168.8.130', port: 3000, characterId: 3 },       // character-3
            { id: 5, name: 'Groundbreaker', ip: '192.168.8.200', port: 3000, characterId: 25 }     // character-25
        ];

        // Goblin network map
        this.goblins = [
            { id: 'chestwound', name: 'Chestwound Goblin', ip: '192.168.8.160', port: 3001 },
            { id: 'goblin2', name: 'Goblin2', ip: '192.168.8.161', port: 3001 }
        ];

        this.sshUser = 'remote';
        this.sshPassword = 'klrklr89!'; // For reference, but using SSH keys
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
                return await this.sayText(ip, port, params.text, params.characterId);

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
    async sayText(ip, port, text, characterId) {
        try {
            const response = await axios.post(
                `http://${ip}:${port}/api/elevenlabs/agent-speak`,
                { text, characterId },
                {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 30000
                }
            );
            return { success: true, data: response.data };
        } catch (error) {
            throw new Error(`Say text failed: ${error.message}`);
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
     */
    async startAllQueueLoops() {
        console.log('🎬 Starting all queue loops...');

        const sceneMap = {
            'Skulltalker': 9,
            'Groundbreaker': 1,
            'Orlok': 100,
            'PumpkinHead': 100,
            'Coffin Breaker': 1
        };

        const results = await Promise.allSettled(
            this.animatronics.map(async (animatronic) => {
                try {
                    const sceneId = sceneMap[animatronic.name];
                    if (!sceneId) {
                        return {
                            name: animatronic.name,
                            success: false,
                            error: 'No scene configured'
                        };
                    }

                    // Clear queue
                    await axios.post(`http://${animatronic.ip}:${animatronic.port}/scenes/api/queue/clear`, {}, { timeout: 5000 });

                    // Enqueue scene
                    await axios.post(
                        `http://${animatronic.ip}:${animatronic.port}/scenes/api/queue/enqueue`,
                        { sceneId },
                        { headers: { 'Content-Type': 'application/json' }, timeout: 5000 }
                    );

                    // Start queue in loop mode
                    const response = await axios.post(
                        `http://${animatronic.ip}:${animatronic.port}/scenes/api/queue/start`,
                        { mode: 'loop_queue' },
                        { headers: { 'Content-Type': 'application/json' }, timeout: 5000 }
                    );

                    return {
                        name: animatronic.name,
                        success: response.data.success || true,
                        message: `Scene ${sceneId} started`
                    };
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

