/**
 * Random Pose Service
 * Generates and executes random poses during conversation for natural movement
 * Includes safety limits, cooldown periods, and configurable amplitudes
 */

import poseEngine from './poses/poseEngine.js';
import poseRepository from './poses/poseRepository.js';
import { claimServo, releaseServo, isAvailable, PRIORITY } from './movement/priorityManager.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Owner tag for priorityManager claims — random poses are conversation-scoped
// choreography, so they claim at GESTURE_STATE: above head tracking and idle
// (a deliberate pose should win over ambient motion) but below named gestures
// and scenes.
const POSE_OWNER = 'random-pose';

class RandomPoseService {
    constructor() {
        // Per-character state. The service is a node-global singleton, but
        // enabled/cooldown/settings must be keyed by character — a shared flag
        // meant enabling poses for one character left them enabled for
        // whichever character ran next on this node.
        this.characterStates = new Map(); // String(characterId) -> state
        this.defaults = {
            enabled: false,
            cooldownMs: 3000, // 3 seconds between poses
            minAmplitude: 0.2, // 20% of full range
            maxAmplitude: 0.6  // 60% of full range
        };
        this.poseTypes = ['subtle', 'moderate']; // Exclude 'dramatic' for safety
        // Legacy callers (getConfig()/updateConfig()/disable() with no
        // characterId) fall back to the most recently enabled character so a
        // single-character node keeps its old behavior.
        this.lastCharacterId = null;
        this.activePoses = new Map(); // Track active poses per character
    }

    /**
     * Get (creating on demand) the per-character state bucket.
     */
    stateFor(characterId) {
        const key = String(characterId);
        let state = this.characterStates.get(key);
        if (!state) {
            state = { ...this.defaults, lastPoseTime: 0 };
            this.characterStates.set(key, state);
        }
        return state;
    }

    /**
     * Enable random poses for a character
     */
    async enable(characterId, options = {}) {
        const state = this.stateFor(characterId);
        state.enabled = true;
        state.cooldownMs = options.cooldownMs || 3000;
        state.minAmplitude = options.minAmplitude || 0.2;
        state.maxAmplitude = options.maxAmplitude || 0.6;
        this.lastCharacterId = characterId;

        console.log(`✅ Random poses enabled for character ${characterId}`);
        console.log(`   Cooldown: ${state.cooldownMs}ms, Amplitude: ${state.minAmplitude}-${state.maxAmplitude}`);

        return { success: true, enabled: true };
    }

    /**
     * Disable random poses.
     * With a characterId, disables just that character; without one (legacy
     * callers like the lurk-stop path) disables every character so "off" still
     * means off node-wide.
     */
    disable(characterId) {
        if (characterId != null) {
            this.stateFor(characterId).enabled = false;
            console.log(`❌ Random poses disabled for character ${characterId}`);
        } else {
            for (const state of this.characterStates.values()) {
                state.enabled = false;
            }
            console.log('❌ Random poses disabled');
        }
        return { success: true, enabled: false };
    }

    /**
     * Check if enough time has passed since last pose for this character
     */
    canExecutePose(characterId) {
        const state = this.stateFor(characterId);
        const timeSinceLastPose = Date.now() - state.lastPoseTime;
        return timeSinceLastPose >= state.cooldownMs;
    }

    /**
     * Generate a random pose during conversation
     * This is called during TTS playback to add natural movement
     */
    async generateAndExecuteRandomPose(characterId) {
        const state = this.stateFor(characterId);

        if (!state.enabled) {
            return { success: false, reason: 'Random poses disabled' };
        }

        if (!this.canExecutePose(characterId)) {
            return { success: false, reason: 'Cooldown period active' };
        }

        try {
            // Load available poses for this character
            const posesData = await poseRepository.loadPoses(characterId);
            const poses = posesData.poses || [];

            if (poses.length === 0) {
                // Negative-cache the miss: lastPoseTime only advanced on
                // success, so a zero-pose character re-read poses.json from
                // disk on every qualifying TTS chunk just to fail again.
                state.lastPoseTime = Date.now();
                return { success: false, reason: 'No poses available' };
            }

            // Filter for safe poses (exclude dramatic movements)
            const safePoses = poses.filter(pose => {
                const category = (pose.category || '').toLowerCase();
                return category === 'subtle' || category === 'moderate' || category === 'idle';
            });

            if (safePoses.length === 0) {
                // If no categorized poses, use any pose but with reduced amplitude
                const randomPose = poses[Math.floor(Math.random() * poses.length)];
                const fallbackResult = await this.executePoseWithSafety(characterId, randomPose.id, 0.3);
                if (fallbackResult.success) {
                    state.lastPoseTime = Date.now();
                }
                return fallbackResult;
            }

            // Select a random safe pose
            const randomPose = safePoses[Math.floor(Math.random() * safePoses.length)];

            // Generate random amplitude within safe range
            const amplitude = state.minAmplitude + Math.random() * (state.maxAmplitude - state.minAmplitude);

            // Execute pose with safety limits
            const result = await this.executePoseWithSafety(characterId, randomPose.id, amplitude);

            if (result.success) {
                state.lastPoseTime = Date.now();
                console.log(`🎭 Random pose executed: ${randomPose.name} (amplitude: ${amplitude.toFixed(2)})`);
            }

            return result;

        } catch (error) {
            console.error('❌ Random pose generation failed:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Execute a pose with safety amplitude scaling
     */
    async executePoseWithSafety(characterId, poseId, amplitude = 0.5) {
        const claimedServoIds = [];
        try {
            // Load the pose
            const pose = await poseRepository.getPose(characterId, poseId);
            if (!pose) {
                throw new Error(`Pose ${poseId} not found`);
            }

            // Scale pose targets by amplitude for safety
            const scaledPose = await this.scalePoseAmplitude(pose, amplitude, characterId);

            // Arbitrate before commanding: the idle loop, head tracking and
            // scenes share these servos through priorityManager, and an
            // unclaimed pose landing mid-hold is exactly the snap-back jerk it
            // exists to prevent. isAvailable() first so a scene holding the
            // servo skips the pose without a logged DENIED per attempt.
            const servoPartIds = (scaledPose.parts || [])
                .filter(part => part.type === 'servo' && part.partId != null)
                .map(part => part.partId);
            for (const partId of servoPartIds) {
                if (!isAvailable(partId, PRIORITY.GESTURE_STATE)) {
                    return { success: false, reason: 'servo held by higher priority owner' };
                }
            }
            for (const partId of servoPartIds) {
                const claim = claimServo(partId, POSE_OWNER, PRIORITY.GESTURE_STATE);
                if (!claim.granted) {
                    return { success: false, reason: 'servo claim denied' };
                }
                claimedServoIds.push(partId);
            }

            // Execute the scaled pose. Pass the pre-scaled pose through so the
            // amplitude limit actually reaches the hardware — previously the
            // executor re-loaded the full-range pose and the scaling was a no-op.
            const result = await poseEngine.executePose({
                characterId,
                poseId,
                pose: scaledPose,
                options: {
                    amplitudeScale: amplitude,
                    safetyMode: true
                }
            });

            return result;

        } catch (error) {
            console.error(`❌ Safe pose execution failed:`, error);
            return { success: false, error: error.message };
        } finally {
            // Release exactly what we claimed (not releaseAll) so overlapping
            // executions for other characters cannot free each other's claims.
            for (const partId of claimedServoIds) {
                releaseServo(partId, POSE_OWNER);
            }
        }
    }

    /**
     * Scale pose amplitude for safety
     * Reduces movement range to prevent aggressive motions
     */
    async scalePoseAmplitude(pose, amplitude, characterId) {
        // Create a copy of the pose with scaled targets
        const scaledPose = JSON.parse(JSON.stringify(pose));

        const { getEffectiveWindow } = await import('./poses/poseBounds.js');

        scaledPose.parts = await Promise.all(scaledPose.parts.map(async part => {
            if (part.type === 'servo' && part.target && part.target.angleDeg !== undefined) {
                // Scale toward the part's own calibrated midpoint, not a literal
                // 90°. For an off-centre window (Mina's jaw is 22..91, midpoint
                // 56.5) pulling toward 90 INCREASED the deviation: a subtle
                // near-closed pose at 25° "scaled down" to 77° — nearly wide
                // open. The safety scaling was opening mouths, not closing them.
                let center = 90;
                try {
                    const win = await getEffectiveWindow(characterId, part.partId);
                    if (win && win.lo != null && win.hi != null) {
                        center = (win.lo + win.hi) / 2;
                    }
                } catch (_) { /* keep 90 for parts with no window */ }
                const offset = part.target.angleDeg - center;
                part.target.angleDeg = center + (offset * amplitude);
            } else if (part.type === 'linear_actuator' && part.target) {
                // Pose actuator targets carry `distance` (+ direction), never
                // `position` — the old `target.position` branch was dead code,
                // so actuators ran their FULL configured travel regardless of
                // the requested amplitude. Scale the distance instead.
                if (part.target.distance !== undefined) {
                    part.target.distance = Math.round(part.target.distance * amplitude);
                }
                if (part.target.duration !== undefined) {
                    part.target.duration = Math.round(part.target.duration * amplitude);
                }
            }
            return part;
        }));

        return scaledPose;
    }

    /**
     * Trigger random pose during TTS playback
     * This is the main integration point for TTS/ConvAI
     */
    async triggerDuringTTS(characterId, textLength = 0) {
        // Only trigger if text is long enough (more than 50 characters)
        if (textLength < 50) {
            return { success: false, reason: 'Text too short for pose' };
        }

        // Random chance to trigger (50% probability)
        if (Math.random() > 0.5) {
            return { success: false, reason: 'Random skip' };
        }

        return await this.generateAndExecuteRandomPose(characterId);
    }

    /**
     * Get current configuration for a character.
     * Response keys are unchanged from the singleton era — callers depend on
     * the shape. Without a characterId, falls back to the most recently
     * enabled character (or pristine defaults if none).
     */
    getConfig(characterId) {
        const cid = characterId != null ? characterId : this.lastCharacterId;
        const state = cid != null ? this.stateFor(cid) : { ...this.defaults, lastPoseTime: 0 };
        return {
            enabled: state.enabled,
            cooldownMs: state.cooldownMs,
            minAmplitude: state.minAmplitude,
            maxAmplitude: state.maxAmplitude,
            poseTypes: this.poseTypes,
            lastPoseTime: state.lastPoseTime,
            timeSinceLastPose: Date.now() - state.lastPoseTime
        };
    }

    /**
     * Update configuration for a character (same fallback as getConfig; with
     * no character at all, the defaults future characters inherit are updated)
     */
    updateConfig(config, characterId) {
        const cid = characterId != null ? characterId : this.lastCharacterId;
        const target = cid != null ? this.stateFor(cid) : this.defaults;

        if (config.cooldownMs !== undefined) {
            target.cooldownMs = Math.max(1000, config.cooldownMs); // Min 1 second
        }
        if (config.minAmplitude !== undefined) {
            target.minAmplitude = Math.max(0.1, Math.min(0.5, config.minAmplitude));
        }
        if (config.maxAmplitude !== undefined) {
            target.maxAmplitude = Math.max(0.3, Math.min(0.8, config.maxAmplitude));
        }
        if (config.enabled !== undefined) {
            target.enabled = config.enabled;
        }

        console.log('🔧 Random pose config updated:', this.getConfig(cid));
        return { success: true, config: this.getConfig(cid) };
    }

    /**
     * Create default subtle poses for a character if none exist
     */
    async ensureDefaultPoses(characterId) {
        try {
            const posesData = await poseRepository.loadPoses(characterId);
            const poses = posesData.poses || [];

            // Check if there are any subtle/idle poses
            const subtlePoses = poses.filter(p => {
                const cat = (p.category || '').toLowerCase();
                return cat === 'subtle' || cat === 'idle';
            });

            if (subtlePoses.length > 0) {
                return { success: true, message: 'Default poses already exist' };
            }

            // Create a simple idle pose (small head movement)
            // This would need to be customized based on available parts
            console.log('ℹ️  No subtle poses found. Create poses via web UI for best results.');

            return { success: true, message: 'No default poses created - use web UI' };

        } catch (error) {
            console.error('Error checking default poses:', error);
            return { success: false, error: error.message };
        }
    }
}

// Export singleton instance
const randomPoseService = new RandomPoseService();
export default randomPoseService;
