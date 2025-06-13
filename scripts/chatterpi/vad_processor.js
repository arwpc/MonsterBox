/**
 * Voice Activity Detection Processor for ChatterPi
 * Uses @echogarden/fvad-wasm for WebRTC-based VAD
 */

const fs = require('fs');
const path = require('path');

class VADProcessor {
    constructor(options = {}) {
        this.options = {
            sampleRate: options.sampleRate || 16000,
            frameSize: options.frameSize || 320, // 20ms at 16kHz
            mode: options.mode || 3, // VAD aggressiveness (0-3, 3 = most aggressive)
            silenceThreshold: options.silenceThreshold || 0.005,
            silenceTimeout: options.silenceTimeout || 500, // ms
            ...options
        };
        
        this.fvad = null;
        this.isInitialized = false;
        this.lastVoiceTime = Date.now();
        this.isVoiceActive = false;
        
        // Statistics
        this.stats = {
            framesProcessed: 0,
            voiceFrames: 0,
            silenceFrames: 0,
            startTime: Date.now()
        };
        
        console.log('VAD Processor initialized with options:', this.options);
    }
    
    async initialize() {
        try {
            // Try to load the WebRTC VAD module
            try {
                const { Fvad } = await import('@echogarden/fvad-wasm');
                this.fvad = new Fvad();
                await this.fvad.init();
                this.fvad.setMode(this.options.mode);
                this.isInitialized = true;
                console.log('✅ WebRTC VAD initialized successfully');
                return true;
            } catch (importError) {
                console.warn('⚠️ WebRTC VAD not available, falling back to amplitude-based VAD');
                console.warn('Install with: npm install @echogarden/fvad-wasm');
                this.isInitialized = true; // Use fallback method
                return true;
            }
        } catch (error) {
            console.error('❌ Failed to initialize VAD processor:', error);
            return false;
        }
    }
    
    /**
     * Process audio frame for voice activity detection
     * @param {Float32Array|Buffer} audioData - Audio samples (16-bit PCM, 16kHz, mono)
     * @param {number} amplitude - RMS amplitude of the frame
     * @returns {boolean} True if voice is detected
     */
    processFrame(audioData, amplitude) {
        this.stats.framesProcessed++;
        
        let isVoice = false;
        
        if (this.fvad && this.fvad.process) {
            // Use WebRTC VAD if available
            try {
                // Convert Float32Array to Int16Array if needed
                let int16Data;
                if (audioData instanceof Float32Array) {
                    int16Data = new Int16Array(audioData.length);
                    for (let i = 0; i < audioData.length; i++) {
                        int16Data[i] = Math.max(-32768, Math.min(32767, audioData[i] * 32768));
                    }
                } else {
                    int16Data = audioData;
                }
                
                // Ensure frame size is correct
                if (int16Data.length === this.options.frameSize) {
                    isVoice = this.fvad.process(int16Data, this.options.sampleRate);
                } else {
                    // Fallback to amplitude-based detection for incorrect frame sizes
                    isVoice = this._amplitudeBasedVAD(amplitude);
                }
            } catch (error) {
                console.warn('WebRTC VAD error, falling back to amplitude-based:', error.message);
                isVoice = this._amplitudeBasedVAD(amplitude);
            }
        } else {
            // Fallback to amplitude-based VAD
            isVoice = this._amplitudeBasedVAD(amplitude);
        }
        
        // Update voice activity state with timeout
        const currentTime = Date.now();
        
        if (isVoice) {
            this.lastVoiceTime = currentTime;
            this.isVoiceActive = true;
            this.stats.voiceFrames++;
        } else {
            // Check silence timeout
            const silenceDuration = currentTime - this.lastVoiceTime;
            if (silenceDuration > this.options.silenceTimeout) {
                this.isVoiceActive = false;
            }
            this.stats.silenceFrames++;
        }
        
        return this.isVoiceActive;
    }
    
    /**
     * Amplitude-based voice activity detection (fallback)
     * @param {number} amplitude - RMS amplitude
     * @returns {boolean} True if voice is detected
     */
    _amplitudeBasedVAD(amplitude) {
        return amplitude > this.options.silenceThreshold;
    }
    
    /**
     * Get current voice activity status
     * @returns {boolean} True if voice is currently active
     */
    isActive() {
        return this.isVoiceActive;
    }
    
    /**
     * Reset VAD state
     */
    reset() {
        this.lastVoiceTime = Date.now();
        this.isVoiceActive = false;
        console.log('VAD processor reset');
    }
    
    /**
     * Update configuration
     * @param {Object} newOptions - New configuration options
     */
    updateConfig(newOptions) {
        Object.assign(this.options, newOptions);
        
        if (this.fvad && newOptions.mode !== undefined) {
            try {
                this.fvad.setMode(newOptions.mode);
                console.log(`VAD mode updated to ${newOptions.mode}`);
            } catch (error) {
                console.warn('Failed to update VAD mode:', error.message);
            }
        }
        
        console.log('VAD configuration updated:', newOptions);
    }
    
    /**
     * Get processing statistics
     * @returns {Object} Statistics object
     */
    getStats() {
        const runtime = (Date.now() - this.stats.startTime) / 1000;
        
        return {
            ...this.stats,
            runtime,
            framesPerSecond: this.stats.framesProcessed / Math.max(runtime, 0.001),
            voiceActivityRatio: this.stats.voiceFrames / Math.max(this.stats.framesProcessed, 1),
            isVoiceActive: this.isVoiceActive,
            hasWebRTCVAD: !!(this.fvad && this.fvad.process),
            config: this.options
        };
    }
    
    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            framesProcessed: 0,
            voiceFrames: 0,
            silenceFrames: 0,
            startTime: Date.now()
        };
        console.log('VAD statistics reset');
    }
    
    /**
     * Clean up resources
     */
    cleanup() {
        if (this.fvad && this.fvad.cleanup) {
            try {
                this.fvad.cleanup();
                console.log('VAD resources cleaned up');
            } catch (error) {
                console.warn('Error cleaning up VAD:', error.message);
            }
        }
        this.isInitialized = false;
    }
}

/**
 * Audio frame utilities for VAD processing
 */
class AudioFrameUtils {
    /**
     * Convert audio buffer to the format required by VAD
     * @param {Buffer|Float32Array} buffer - Input audio buffer
     * @param {number} sampleRate - Sample rate
     * @param {number} targetSampleRate - Target sample rate (usually 16000)
     * @returns {Int16Array} Converted audio data
     */
    static convertToVADFormat(buffer, sampleRate = 44100, targetSampleRate = 16000) {
        let float32Data;
        
        // Convert buffer to Float32Array
        if (buffer instanceof Buffer) {
            // Assume 16-bit PCM
            const int16Data = new Int16Array(buffer.buffer, buffer.byteOffset, buffer.length / 2);
            float32Data = new Float32Array(int16Data.length);
            for (let i = 0; i < int16Data.length; i++) {
                float32Data[i] = int16Data[i] / 32768.0;
            }
        } else if (buffer instanceof Float32Array) {
            float32Data = buffer;
        } else {
            throw new Error('Unsupported audio buffer format');
        }
        
        // Resample if needed
        if (sampleRate !== targetSampleRate) {
            float32Data = this.resample(float32Data, sampleRate, targetSampleRate);
        }
        
        // Convert to Int16Array for VAD
        const int16Data = new Int16Array(float32Data.length);
        for (let i = 0; i < float32Data.length; i++) {
            int16Data[i] = Math.max(-32768, Math.min(32767, float32Data[i] * 32768));
        }
        
        return int16Data;
    }
    
    /**
     * Simple linear resampling (for basic sample rate conversion)
     * @param {Float32Array} input - Input samples
     * @param {number} inputRate - Input sample rate
     * @param {number} outputRate - Output sample rate
     * @returns {Float32Array} Resampled data
     */
    static resample(input, inputRate, outputRate) {
        if (inputRate === outputRate) {
            return input;
        }
        
        const ratio = inputRate / outputRate;
        const outputLength = Math.floor(input.length / ratio);
        const output = new Float32Array(outputLength);
        
        for (let i = 0; i < outputLength; i++) {
            const srcIndex = i * ratio;
            const srcIndexFloor = Math.floor(srcIndex);
            const srcIndexCeil = Math.min(srcIndexFloor + 1, input.length - 1);
            const fraction = srcIndex - srcIndexFloor;
            
            // Linear interpolation
            output[i] = input[srcIndexFloor] * (1 - fraction) + input[srcIndexCeil] * fraction;
        }
        
        return output;
    }
    
    /**
     * Calculate RMS amplitude of audio frame
     * @param {Float32Array|Int16Array} audioData - Audio samples
     * @returns {number} RMS amplitude
     */
    static calculateRMS(audioData) {
        let sum = 0;
        for (let i = 0; i < audioData.length; i++) {
            const sample = audioData instanceof Int16Array ? audioData[i] / 32768.0 : audioData[i];
            sum += sample * sample;
        }
        return Math.sqrt(sum / audioData.length);
    }
}

// Test function
async function testVADProcessor() {
    console.log('Testing VAD Processor...');
    
    const vad = new VADProcessor({
        sampleRate: 16000,
        frameSize: 320,
        mode: 3,
        silenceThreshold: 0.01,
        silenceTimeout: 500
    });
    
    if (await vad.initialize()) {
        console.log('VAD initialized successfully');
        
        // Generate test audio frames
        const frameSize = 320;
        const testFrames = [
            // Silence
            new Float32Array(frameSize).fill(0.001),
            // Voice-like signal
            new Float32Array(frameSize).map(() => 0.1 * Math.sin(Math.random() * Math.PI * 2)),
            // More silence
            new Float32Array(frameSize).fill(0.001),
        ];
        
        console.log('Processing test frames...');
        testFrames.forEach((frame, index) => {
            const amplitude = AudioFrameUtils.calculateRMS(frame);
            const isVoice = vad.processFrame(frame, amplitude);
            console.log(`Frame ${index}: amplitude=${amplitude.toFixed(4)}, voice=${isVoice}`);
        });
        
        // Print statistics
        const stats = vad.getStats();
        console.log('VAD Statistics:', stats);
        
        vad.cleanup();
    } else {
        console.error('Failed to initialize VAD');
    }
}

module.exports = {
    VADProcessor,
    AudioFrameUtils,
    testVADProcessor
};

// Run test if called directly
if (require.main === module) {
    testVADProcessor().catch(console.error);
}
