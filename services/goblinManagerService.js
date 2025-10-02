/**
 * Goblin Management Service
 * Handles registration, monitoring, and control of MonsterBox Goblins
 */

import { promises as fs } from 'fs';
import path from 'path';

class GoblinManagerService {
    constructor() {
        this.goblinsFile = path.resolve('./data/goblins.json');
        this.goblins = new Map(); // In-memory goblin registry
        this.lockTimeout = 3 * 60 * 1000; // 3 minutes in milliseconds
        this.heartbeatInterval = 30 * 1000; // 30 seconds
        
        this.init();
        this.startHeartbeatMonitor();
    }

    async init() {
        try {
            // Create data directory if needed
            const dataDir = path.dirname(this.goblinsFile);
            await fs.mkdir(dataDir, { recursive: true });

            // Load existing goblins from file
            await this.loadGoblins();
            
            console.log('✅ Goblin Manager Service initialized');
        } catch (error) {
            console.error('❌ Failed to initialize Goblin Manager Service:', error);
        }
    }

    async loadGoblins() {
        try {
            const data = await fs.readFile(this.goblinsFile, 'utf-8');
            const savedGoblins = JSON.parse(data);
            
            // Load saved goblins into memory map
            savedGoblins.forEach(goblin => {
                // Mark all loaded goblins as offline initially
                goblin.status = 'offline';
                goblin.lastSeen = goblin.lastSeen || new Date().toISOString();
                this.goblins.set(goblin.id, goblin);
            });
            
            console.log(`📡 Loaded ${savedGoblins.length} goblins from registry`);
        } catch (error) {
            // File doesn't exist or is invalid, start with empty registry
            console.log('📡 Starting with empty goblin registry');
            this.goblins.clear();
        }
    }

    async saveGoblins() {
        try {
            const goblinsArray = Array.from(this.goblins.values());
            await fs.writeFile(this.goblinsFile, JSON.stringify(goblinsArray, null, 2));
            return true;
        } catch (error) {
            console.error('Error saving goblins:', error);
            return false;
        }
    }

    async registerGoblin(goblinData) {
        try {
            const {
                goblinId,
                endpoint,
                capabilities = ['video', 'audio'],
                platform = 'unknown',
                version = '1.0.0'
            } = goblinData;

            if (!goblinId || !endpoint) {
                return { success: false, error: 'Missing required fields: goblinId and endpoint' };
            }

            const goblin = {
                id: goblinId,
                endpoint,
                capabilities,
                platform,
                version,
                status: 'online',
                registeredAt: this.goblins.has(goblinId) ? 
                    this.goblins.get(goblinId).registeredAt : 
                    new Date().toISOString(),
                lastSeen: new Date().toISOString(),
                lockedBy: null,
                lockedAt: null,
                settings: {
                    audioEnabled: true,
                    videoEnabled: true,
                    volume: 80,
                    autoLock: false,
                    ...this.goblins.get(goblinId)?.settings
                }
            };

            this.goblins.set(goblinId, goblin);
            await this.saveGoblins();

            console.log(`👹 Goblin registered: ${goblinId} at ${endpoint}`);
            return { success: true, goblin };
        } catch (error) {
            console.error('Error registering goblin:', error);
            return { success: false, error: error.message };
        }
    }

    async unregisterGoblin(goblinId) {
        try {
            if (!this.goblins.has(goblinId)) {
                return { success: false, error: 'Goblin not found' };
            }

            this.goblins.delete(goblinId);
            await this.saveGoblins();

            console.log(`👋 Goblin unregistered: ${goblinId}`);
            return { success: true, message: 'Goblin unregistered successfully' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async getGoblins(options = {}) {
        try {
            let goblins = Array.from(this.goblins.values());

            // Apply filters
            if (options.status) {
                goblins = goblins.filter(g => g.status === options.status);
            }

            if (options.capability) {
                goblins = goblins.filter(g => g.capabilities.includes(options.capability));
            }

            if (options.available) {
                goblins = goblins.filter(g => g.status === 'online' && !g.lockedBy);
            }

            // Sort by last seen (most recent first)
            goblins.sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen));

            return {
                success: true,
                goblins,
                total: goblins.length,
                online: goblins.filter(g => g.status === 'online').length,
                available: goblins.filter(g => g.status === 'online' && !g.lockedBy).length
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async getGoblin(goblinId) {
        try {
            const goblin = this.goblins.get(goblinId);
            
            if (!goblin) {
                return { success: false, error: 'Goblin not found' };
            }

            return { success: true, goblin };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async updateGoblinSettings(goblinId, settings) {
        try {
            const goblin = this.goblins.get(goblinId);
            
            if (!goblin) {
                return { success: false, error: 'Goblin not found' };
            }

            // Update settings
            goblin.settings = { ...goblin.settings, ...settings };
            goblin.lastUpdated = new Date().toISOString();

            this.goblins.set(goblinId, goblin);
            await this.saveGoblins();

            // Push settings to Goblin if it's online
            if (goblin.status === 'online') {
                try {
                    await fetch(`${goblin.endpoint}/settings`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(settings),
                        timeout: 5000
                    });
                } catch (error) {
                    console.warn(`Failed to push settings to goblin ${goblinId}:`, error.message);
                }
            }

            return { success: true, goblin };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async lockGoblin(goblinId, lockingEntity) {
        try {
            const goblin = this.goblins.get(goblinId);
            
            if (!goblin) {
                return { success: false, error: 'Goblin not found' };
            }

            if (goblin.status !== 'online') {
                return { success: false, error: 'Goblin is not online' };
            }

            if (goblin.lockedBy && goblin.lockedBy !== lockingEntity) {
                const lockAge = Date.now() - new Date(goblin.lockedAt).getTime();
                if (lockAge < this.lockTimeout) {
                    return { 
                        success: false, 
                        error: `Goblin is locked by ${goblin.lockedBy}`,
                        lockedBy: goblin.lockedBy,
                        lockedAt: goblin.lockedAt,
                        timeRemaining: this.lockTimeout - lockAge
                    };
                }
                // Lock expired, proceed with new lock
            }

            goblin.lockedBy = lockingEntity;
            goblin.lockedAt = new Date().toISOString();
            
            this.goblins.set(goblinId, goblin);
            await this.saveGoblins();

            console.log(`🔒 Goblin locked: ${goblinId} by ${lockingEntity}`);
            return { success: true, goblin };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async unlockGoblin(goblinId, unlockingEntity) {
        try {
            const goblin = this.goblins.get(goblinId);
            
            if (!goblin) {
                return { success: false, error: 'Goblin not found' };
            }

            // Allow unlocking by the same entity or if lock expired
            const lockAge = goblin.lockedAt ? Date.now() - new Date(goblin.lockedAt).getTime() : 0;
            const canUnlock = !goblin.lockedBy || 
                             goblin.lockedBy === unlockingEntity || 
                             lockAge >= this.lockTimeout;

            if (!canUnlock) {
                return { success: false, error: 'Cannot unlock goblin' };
            }

            goblin.lockedBy = null;
            goblin.lockedAt = null;
            
            this.goblins.set(goblinId, goblin);
            await this.saveGoblins();

            console.log(`🔓 Goblin unlocked: ${goblinId}`);
            return { success: true, goblin };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async heartbeat(goblinId, statusUpdate = {}) {
        try {
            const goblin = this.goblins.get(goblinId);
            
            if (!goblin) {
                return { success: false, error: 'Goblin not registered' };
            }

            // Update status
            goblin.status = 'online';
            goblin.lastSeen = new Date().toISOString();
            
            // Update any provided status fields
            if (statusUpdate.memory) goblin.memory = statusUpdate.memory;
            if (statusUpdate.uptime) goblin.uptime = statusUpdate.uptime;
            if (statusUpdate.currentVideo) goblin.currentVideo = statusUpdate.currentVideo;
            if (statusUpdate.currentAudio) goblin.currentAudio = statusUpdate.currentAudio;

            this.goblins.set(goblinId, goblin);

            // Check for lock expiration
            if (goblin.lockedBy && goblin.lockedAt) {
                const lockAge = Date.now() - new Date(goblin.lockedAt).getTime();
                if (lockAge >= this.lockTimeout) {
                    console.log(`⏰ Lock expired for goblin: ${goblinId}`);
                    goblin.lockedBy = null;
                    goblin.lockedAt = null;
                    this.goblins.set(goblinId, goblin);
                }
            }

            return { success: true, goblin };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async deployVideoToGoblin(goblinId, videoData) {
        try {
            const goblin = this.goblins.get(goblinId);
            
            if (!goblin) {
                return { success: false, error: 'Goblin not found' };
            }

            if (goblin.status !== 'online') {
                return { success: false, error: 'Goblin is not online' };
            }

            // Deploy video to Goblin
            const response = await fetch(`${goblin.endpoint}/deploy-video`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(videoData),
                timeout: 30000 // 30 second timeout for video uploads
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            
            if (result.success) {
                console.log(`📹 Video deployed to goblin ${goblinId}: ${videoData.title}`);
            }

            return result;
        } catch (error) {
            console.error(`Error deploying video to goblin ${goblinId}:`, error);
            return { success: false, error: error.message };
        }
    }

    async playVideoOnGoblin(goblinId, filename, options = {}) {
        try {
            const goblin = this.goblins.get(goblinId);
            
            if (!goblin) {
                return { success: false, error: 'Goblin not found' };
            }

            if (goblin.status !== 'online') {
                return { success: false, error: 'Goblin is not online' };
            }

            // Play video on Goblin
            const response = await fetch(`${goblin.endpoint}/play-video`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename, ...options }),
                timeout: 10000
            });

            const result = await response.json();
            return result;
        } catch (error) {
            console.error(`Error playing video on goblin ${goblinId}:`, error);
            return { success: false, error: error.message };
        }
    }

    startHeartbeatMonitor() {
        setInterval(async () => {
            const now = Date.now();
            let changed = false;

            for (const [goblinId, goblin] of this.goblins) {
                const lastSeen = new Date(goblin.lastSeen).getTime();
                const timeSinceLastSeen = now - lastSeen;

                // Mark as offline if no heartbeat for 2 minutes
                if (goblin.status === 'online' && timeSinceLastSeen > 2 * 60 * 1000) {
                    console.log(`💀 Goblin went offline: ${goblinId}`);
                    goblin.status = 'offline';
                    changed = true;
                }

                // Auto-unlock if locked too long without heartbeat
                if (goblin.lockedBy && goblin.lockedAt) {
                    const lockAge = now - new Date(goblin.lockedAt).getTime();
                    if (lockAge >= this.lockTimeout) {
                        console.log(`🔓 Auto-unlocked goblin: ${goblinId}`);
                        goblin.lockedBy = null;
                        goblin.lockedAt = null;
                        changed = true;
                    }
                }
            }

            if (changed) {
                await this.saveGoblins();
            }
        }, this.heartbeatInterval);

        console.log('💓 Goblin heartbeat monitor started');
    }

    getStats() {
        const goblins = Array.from(this.goblins.values());

        return {
            total: goblins.length,
            online: goblins.filter(g => g.status === 'online').length,
            offline: goblins.filter(g => g.status === 'offline').length,
            locked: goblins.filter(g => g.lockedBy).length,
            available: goblins.filter(g => g.status === 'online' && !g.lockedBy).length,
            capabilities: {
                video: goblins.filter(g => g.capabilities && g.capabilities.video && g.capabilities.video.length > 0).length,
                audio: goblins.filter(g => g.capabilities && g.capabilities.audio && g.capabilities.audio.length > 0).length
            }
        };
    }

    async restartGoblin(goblinId) {
        try {
            const goblin = this.goblins.get(goblinId);

            if (!goblin) {
                return { success: false, error: 'Goblin not found' };
            }

            // Extract IP from endpoint (e.g., "http://192.168.8.160:3001" -> "192.168.8.160")
            const ipMatch = goblin.endpoint.match(/\/\/([^:]+)/);
            if (!ipMatch) {
                return { success: false, error: 'Invalid goblin endpoint format' };
            }

            const goblinIP = ipMatch[1];

            // Use sshpass to restart the goblin service
            const { exec } = await import('child_process');
            const { promisify } = await import('util');
            const execAsync = promisify(exec);

            console.log(`🔄 Restarting goblin service on ${goblinIP}...`);

            try {
                const { stdout, stderr } = await execAsync(
                    `sshpass -p 'klrklr89!' ssh -o StrictHostKeyChecking=no remote@${goblinIP} "sudo systemctl restart goblin"`
                );

                // Mark goblin as offline temporarily (it will come back online via heartbeat)
                goblin.status = 'offline';
                goblin.lastSeen = new Date().toISOString();
                await this.saveGoblins();

                console.log(`✅ Goblin ${goblinId} restart command sent successfully`);

                return {
                    success: true,
                    message: `Goblin ${goblinId} restart initiated. Service will be back online shortly.`,
                    goblin: goblin
                };
            } catch (sshError) {
                console.error(`❌ SSH error restarting goblin ${goblinId}:`, sshError.message);
                return {
                    success: false,
                    error: `Failed to restart goblin: ${sshError.message}`
                };
            }
        } catch (error) {
            console.error('Error in restartGoblin:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

export default new GoblinManagerService();