/**
 * Auto AI Service (in-memory)
 * Provides lightweight status tracking for per-animatronic Auto AI loops
 * Used by orchestration API endpoints for test and basic runtime visibility
 */

import orchestrationService from './orchestrationService.js';

class AutoAIService {
    constructor() {
        this.statuses = {};
        // Initialize statuses for all known animatronics
        try {
            const anims = orchestrationService.getAllAnimatronics();
            for (const anim of anims) {
                this.statuses[anim.id] = {
                    id: anim.id,
                    name: anim.name,
                    characterId: anim.characterId,
                    active: false,
                    running: false,
                    enabled: false,
                    interval: 30,
                    lastRun: null,
                    lastError: null
                };
            }
        } catch (_) {
            // If orchestration service isn't ready, start empty; routes can populate on demand
        }
        this.timers = new Map();
    }

    startAutoAI(animId, ip, port, name, characterId, intervalSeconds = 30) {
        const id = parseInt(animId);
        const status = this._ensureStatus(id, { name, characterId });
        status.active = true;
        status.running = true;
        status.enabled = true;
        status.interval = intervalSeconds;
        status.lastError = null;

        // Replace any existing timer (no-op task for now)
        if (this.timers.has(id)) clearInterval(this.timers.get(id));
        const handle = setInterval(() => {
            status.lastRun = new Date().toISOString();
            // In a full implementation, we would trigger an AI-generated utterance here
        }, Math.max(5, intervalSeconds) * 1000);
        this.timers.set(id, handle);

        return { success: true, animatronic: { id, name, characterId }, interval: intervalSeconds, active: true };
    }

    stopAutoAI(animId) {
        const id = parseInt(animId);
        const status = this._ensureStatus(id);
        status.active = false;
        status.running = false;
        status.enabled = false;
        if (this.timers.has(id)) {
            clearInterval(this.timers.get(id));
            this.timers.delete(id);
        }
        return { success: true, animatronic: { id }, active: false };
    }

    stopAll() {
        for (const [id, handle] of this.timers.entries()) {
            clearInterval(handle);
            this.timers.delete(id);
        }
        Object.keys(this.statuses).forEach(k => {
            this.statuses[k].active = false;
            this.statuses[k].running = false;
            this.statuses[k].enabled = false;
        });
        return { success: true, message: 'Stopped Auto AI for all animatronics' };
    }

    getStatus(animId) {
        const id = parseInt(animId);
        const status = this._ensureStatus(id);
        return Object.assign({ success: true }, status);
    }

    getAllStatuses() {
        // Return an object keyed by animatronic id for stable lookups
        const out = {};
        for (const [id, status] of Object.entries(this.statuses)) {
            out[id] = { ...status };
        }
        return out;
    }

    _ensureStatus(id, defaults = {}) {
        if (!this.statuses[id]) {
            this.statuses[id] = Object.assign({
                id,
                name: defaults.name || `Animatronic-${id}`,
                characterId: defaults.characterId || null,
                active: false,
                running: false,
                enabled: false,
                interval: 30,
                lastRun: null,
                lastError: null
            }, defaults);
        }
        return this.statuses[id];
    }
}

export default new AutoAIService();
