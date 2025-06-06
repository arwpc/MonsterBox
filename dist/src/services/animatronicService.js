"use strict";
/**
 * Animatronic Service - High-level interface for animatronic operations
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.animatronicService = exports.AnimatronicService = void 0;
const events_1 = require("events");
class AnimatronicService extends events_1.EventEmitter {
    constructor(sshManager = sshManager) {
        super();
        this.sshManager = sshManager;
        this.commandHistory = new Map();
        this.commandCounter = 0;
        this.setupEventListeners();
    }
    setupEventListeners() {
        this.sshManager.on('connected', (animatronicId) => {
            this.emit('animatronicConnected', animatronicId);
        });
        this.sshManager.on('disconnected', (animatronicId) => {
            this.emit('animatronicDisconnected', animatronicId);
        });
        this.sshManager.on('connectionError', (animatronicId, error) => {
            this.emit('animatronicError', animatronicId, error);
        });
    }
    async getAnimatronics() {
        return this.sshManager.getAnimatronics();
    }
    async getAnimatronicStatuses() {
        const animatronics = this.sshManager.getAnimatronics();
        const connectionStatuses = this.sshManager.getConnectionStatus();
        const statuses = [];
        for (const animatronic of animatronics) {
            const connectionStatus = connectionStatuses.find(cs => cs.id === animatronic.id);
            let systemInfo;
            if (connectionStatus?.connected && animatronic.enabled) {
                try {
                    systemInfo = await this.getSystemInfo(animatronic.id);
                }
                catch (error) {
                    // System info collection failed, but don't throw error
                }
            }
            statuses.push({
                id: animatronic.id,
                name: animatronic.name,
                online: connectionStatus?.connected || false,
                lastSeen: connectionStatus?.lastConnected,
                health: connectionStatus?.health || 'unhealthy',
                systemInfo
            });
        }
        return statuses;
    }
    async executeCommand(animatronicId, command) {
        const commandId = `cmd_${++this.commandCounter}_${Date.now()}`;
        const startTime = Date.now();
        const animatronicCommand = {
            id: commandId,
            animatronicId,
            command,
            timestamp: new Date(),
            status: 'pending'
        };
        this.commandHistory.set(commandId, animatronicCommand);
        this.emit('commandStarted', animatronicCommand);
        try {
            animatronicCommand.status = 'executing';
            this.commandHistory.set(commandId, animatronicCommand);
            const result = await this.sshManager.executeCommandWithRetry(animatronicId, command);
            animatronicCommand.status = 'completed';
            animatronicCommand.result = result;
            animatronicCommand.executionTime = Date.now() - startTime;
            this.commandHistory.set(commandId, animatronicCommand);
            this.emit('commandCompleted', animatronicCommand);
            return animatronicCommand;
        }
        catch (error) {
            animatronicCommand.status = 'failed';
            animatronicCommand.error = error instanceof Error ? error.message : 'Unknown error';
            animatronicCommand.executionTime = Date.now() - startTime;
            this.commandHistory.set(commandId, animatronicCommand);
            this.emit('commandFailed', animatronicCommand);
            throw error;
        }
    }
    async getSystemInfo(animatronicId) {
        const commands = {
            uptime: 'uptime -p',
            temperature: 'vcgencmd measure_temp 2>/dev/null || echo "temp=N/A"',
            memoryUsage: 'free -h | grep Mem | awk \'{print $3 "/" $2}\'',
            diskUsage: 'df -h / | tail -1 | awk \'{print $3 "/" $2 " (" $5 " used)"}\''
        };
        const systemInfo = {};
        for (const [key, command] of Object.entries(commands)) {
            try {
                const result = await this.sshManager.executeCommand(animatronicId, command);
                systemInfo[key] = result.trim();
            }
            catch (error) {
                systemInfo[key] = 'N/A';
            }
        }
        return systemInfo;
    }
    async testConnectivity() {
        return await this.sshManager.checkHealth();
    }
    getCommandHistory(limit = 100) {
        const commands = Array.from(this.commandHistory.values());
        return commands
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
            .slice(0, limit);
    }
    async cleanup() {
        await this.sshManager.disconnectAll();
        this.commandHistory.clear();
    }
}
exports.AnimatronicService = AnimatronicService;
exports.animatronicService = new AnimatronicService();
exports.default = exports.animatronicService;
//# sourceMappingURL=animatronicService.js.map