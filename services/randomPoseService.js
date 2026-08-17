/**
 * Random Pose Service
 * Generates and executes random poses during conversation for natural movement
 * Includes safety limits, cooldown periods, and configurable amplitudes
 */

import poseEngine from './poses/poseEngine.js';
import poseRepository from './poses/poseRepository.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class RandomPoseService {
    constructor() {
        this.enabled = false;
        this.lastPoseTime = 0;
        this.cooldownMs = 3000; // 3 seconds between poses
        this.minAmplitude = 0.2; // 20% of full range
        this.maxAmplitude = 0.6; // 60% of full range
        this.poseTypes = ['subtle', 'moderate']; // Exclude 'dramatic' for safety
        this.activePoses = new Map(); // Track active poses per character
    }

    /**
     * Enable random poses for a character
     */
    async enable(characterId, options = {}) {
        this.enabled = true;
        this.cooldownMs = options.cooldownMs || 3000;
        this.minAmplitude = options.minAmplitude || 0.2;
        this.maxAmplitude = options.maxAmplitude || 0.6;
        
        console.log(`✅ Random poses enabled for character ${characterId}`);
        console.log(`   Cooldown: ${this.cooldownMs}ms, Amplitude: ${this.minAmplitude}-${this.maxAmplitude}`);
        
        return { success: true, enabled: true };
    }

    /**
     * Disable random poses
     */
    disable() {
        this.enabled = false;
        console.log('❌ Random poses disabled');
        return { success: true, enabled: false };
    }

    /**
     * Check if enough time has passed since last pose
     */
    canExecutePose() {
        const now = Date.now();
        const timeSinceLastPose = now - this.lastPoseTime;
        return timeSinceLastPose >= this.cooldownMs;
    }

    /**
     * Generate a random pose during conversation
     * This is called during TTS playback to add natural movement
     */
    async generateAndExecuteRandomPose(characterId) {
        if (!this.enabled) {
            return { success: false, reason: 'Random poses disabled' };
        }

        if (!this.canExecutePose()) {
            return { success: false, reason: 'Cooldown period active' };
        }

        try {
            // Load available poses for this character
            const posesData = await poseRepository.loadPoses(characterId);
            const poses = posesData.poses || [];

            if (poses.length === 0) {
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
                return await this.executePoseWithSafety(characterId, randomPose.id, 0.3);
            }

            // Select a random safe pose
            const randomPose = safePoses[Math.floor(Math.random() * safePoses.length)];
            
            // Generate random amplitude within safe range
            const amplitude = this.minAmplitude + Math.random() * (this.maxAmplitude - this.minAmplitude);

            // Execute pose with safety limits
            const result = await this.executePoseWithSafety(characterId, randomPose.id, amplitude);

            if (result.success) {
                this.lastPoseTime = Date.now();
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
        try {
            // Load the pose
            const pose = await poseRepository.getPose(characterId, poseId);
            if (!pose) {
                throw new Error(`Pose ${poseId} not found`);
            }

            // Scale pose targets by amplitude for safety
            const scaledPose = await this.scalePoseAmplitude(pose, amplitude, characterId);

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
     * Get current configuration
     */
    getConfig() {
        return {
            enabled: this.enabled,
            cooldownMs: this.cooldownMs,
            minAmplitude: this.minAmplitude,
            maxAmplitude: this.maxAmplitude,
            poseTypes: this.poseTypes,
            lastPoseTime: this.lastPoseTime,
            timeSinceLastPose: Date.now() - this.lastPoseTime
        };
    }

    /**
     * Update configuration
     */
    updateConfig(config) {
        if (config.cooldownMs !== undefined) {
            this.cooldownMs = Math.max(1000, config.cooldownMs); // Min 1 second
        }
        if (config.minAmplitude !== undefined) {
            this.minAmplitude = Math.max(0.1, Math.min(0.5, config.minAmplitude));
        }
        if (config.maxAmplitude !== undefined) {
            this.maxAmplitude = Math.max(0.3, Math.min(0.8, config.maxAmplitude));
        }
        if (config.enabled !== undefined) {
            this.enabled = config.enabled;
        }

        console.log('🔧 Random pose config updated:', this.getConfig());
        return { success: true, config: this.getConfig() };
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

