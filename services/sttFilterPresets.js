/**
 * MonsterBox 5.2 - STT Filter Presets
 * Predefined filter configurations for different environments
 */

export const STT_FILTER_PRESETS = {
    'quiet-room': {
        name: 'Quiet Room',
        description: 'Optimized for quiet environments with minimal background noise',
        icon: 'volume-mute',
        config: {
            // Audio Filtering
            audioFilterEnabled: true,
            highpassFreq: 150,        // Lower cutoff - preserve more low frequencies
            lowpassFreq: 4000,        // Higher cutoff - preserve more high frequencies
            denoiseLevel: -20,        // Less aggressive denoising

            // VAD Settings
            vadEnabled: true,
            vadThreshold: 0.35,       // More sensitive - picks up quieter speech
            vadSilenceDuration: 400,  // Shorter silence - faster response

            // Text Filtering
            filterSfx: true,
            validateEnglish: true,
            minLetterRatio: 50,       // More permissive
            requireVowels: true
        }
    },

    'noisy-environment': {
        name: 'Noisy Environment (Music/Crowds)',
        description: 'Optimized for loud background music, crowds, or ambient noise - tuned on Orlok',
        icon: 'volume-up',
        config: {
            // Audio Filtering - Aggressive music/noise rejection
            audioFilterEnabled: true,
            highpassFreq: 320,        // Cut bass and low-frequency music
            lowpassFreq: 3600,        // Narrow band focused on speech frequencies (300-3400Hz)
            denoiseLevel: -38,        // Strong noise reduction without clipping

            // VAD Settings - Balanced for speech over noise
            vadEnabled: true,
            vadThreshold: 0.38,       // Balanced - not too sensitive to avoid music triggers
            vadSilenceDuration: 550,  // Longer silence to capture full phrases

            // Text Filtering - Strict to reject music transcriptions
            filterSfx: true,
            validateEnglish: true,
            minLetterRatio: 60,       // Stricter - reject gibberish and music lyrics
            requireVowels: true
        }
    },

    'high-accuracy': {
        name: 'High Accuracy',
        description: 'Maximum filtering for best transcription quality',
        icon: 'bullseye',
        config: {
            // Audio Filtering
            audioFilterEnabled: true,
            highpassFreq: 200,        // Standard voice range
            lowpassFreq: 3800,        // Standard voice range
            denoiseLevel: -25,        // Balanced denoising

            // VAD Settings
            vadEnabled: true,
            vadThreshold: 0.50,       // Balanced sensitivity
            vadSilenceDuration: 500,  // Standard pause detection

            // Text Filtering
            filterSfx: true,
            validateEnglish: true,
            minLetterRatio: 70,       // Very strict - only high-quality text
            requireVowels: true
        }
    },

    'permissive': {
        name: 'Permissive',
        description: 'Minimal filtering for maximum recognition (may include noise)',
        icon: 'unlock',
        config: {
            // Audio Filtering
            audioFilterEnabled: true,
            highpassFreq: 100,        // Very low cutoff
            lowpassFreq: 5000,        // Very high cutoff
            denoiseLevel: -15,        // Minimal denoising

            // VAD Settings
            vadEnabled: true,
            vadThreshold: 0.25,       // Very sensitive
            vadSilenceDuration: 300,  // Very short silence

            // Text Filtering
            filterSfx: false,         // Allow sound effects
            validateEnglish: false,   // Allow non-English
            minLetterRatio: 30,       // Very permissive
            requireVowels: false      // Allow consonant-only
        }
    },

    'animatronic-show': {
        name: 'Animatronic Show',
        description: 'Optimized for animatronic performances with music and sound effects',
        icon: 'music-note-beamed',
        config: {
            // Audio Filtering
            audioFilterEnabled: true,
            highpassFreq: 250,        // Remove low-frequency rumble from speakers
            lowpassFreq: 3600,        // Remove high-frequency speaker noise
            denoiseLevel: -30,        // Aggressive denoising for music/SFX

            // VAD Settings
            vadEnabled: true,
            vadThreshold: 0.70,       // High threshold - avoid triggering on show audio
            vadSilenceDuration: 800,  // Long silence - wait for clear pauses

            // Text Filtering
            filterSfx: true,
            validateEnglish: true,
            minLetterRatio: 60,
            requireVowels: true
        }
    },

    'conversation': {
        name: 'Conversation',
        description: 'Optimized for natural back-and-forth conversation',
        icon: 'chat-dots',
        config: {
            // Audio Filtering
            audioFilterEnabled: true,
            highpassFreq: 180,
            lowpassFreq: 4200,
            denoiseLevel: -22,

            // VAD Settings
            vadEnabled: true,
            vadThreshold: 0.40,       // Sensitive enough for natural speech
            vadSilenceDuration: 450,  // Quick response for conversation flow

            // Text Filtering
            filterSfx: true,
            validateEnglish: true,
            minLetterRatio: 55,       // Balanced
            requireVowels: true
        }
    },

    'testing': {
        name: 'Testing/Debug',
        description: 'Minimal filtering for testing and debugging STT',
        icon: 'bug',
        config: {
            // Audio Filtering
            audioFilterEnabled: false, // No audio filtering
            highpassFreq: 200,
            lowpassFreq: 3800,
            denoiseLevel: -25,

            // VAD Settings
            vadEnabled: false,        // No VAD
            vadThreshold: 0.50,
            vadSilenceDuration: 500,

            // Text Filtering
            filterSfx: false,         // No text filtering
            validateEnglish: false,
            minLetterRatio: 30,
            requireVowels: false
        }
    }
};

/**
 * Get a preset configuration by ID
 */
export function getPreset(presetId) {
    return STT_FILTER_PRESETS[presetId] || null;
}

/**
 * Get all available presets
 */
export function getAllPresets() {
    return Object.keys(STT_FILTER_PRESETS).map(id => ({
        id,
        ...STT_FILTER_PRESETS[id]
    }));
}

/**
 * Apply a preset to the current configuration
 */
export function applyPreset(presetId, currentConfig = {}) {
    const preset = getPreset(presetId);
    if (!preset) {
        throw new Error(`Preset not found: ${presetId}`);
    }

    return {
        ...currentConfig,
        ...preset.config,
        _preset: presetId,
        _presetName: preset.name
    };
}

export default {
    STT_FILTER_PRESETS,
    getPreset,
    getAllPresets,
    applyPreset
};

