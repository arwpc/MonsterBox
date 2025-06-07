// scripts/jaw-animation/audio/audioAnalyzer.js

const EventEmitter = require('events');
const logger = require('../../logger');

/**
 * Real-time audio analyzer for jaw animation
 * Processes audio streams and extracts volume data for servo control
 */
class AudioAnalyzer extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            sampleRate: options.sampleRate || 44100,
            bufferSize: options.bufferSize || 1024,
            smoothingFactor: options.smoothingFactor || 0.8,
            volumeThreshold: options.volumeThreshold || 0.01,
            updateInterval: options.updateInterval || 20, // 50Hz update rate
            ...options
        };
        
        this.isAnalyzing = false;
        this.currentVolume = 0;
        this.smoothedVolume = 0;
        this.peakVolume = 0;
        this.audioBuffer = [];
        this.analysisInterval = null;
        
        logger.info('AudioAnalyzer initialized with options:', this.options);
    }
    
    /**
     * Start audio analysis
     * @param {MediaStream|AudioBuffer} audioSource - Audio source to analyze
     */
    start(audioSource) {
        if (this.isAnalyzing) {
            logger.warn('AudioAnalyzer already running');
            return;
        }
        
        try {
            this.isAnalyzing = true;
            this.setupAudioProcessing(audioSource);
            this.startAnalysisLoop();
            
            logger.info('AudioAnalyzer started');
            this.emit('started');
        } catch (error) {
            logger.error('Failed to start AudioAnalyzer:', error);
            this.emit('error', error);
        }
    }
    
    /**
     * Stop audio analysis
     */
    stop() {
        if (!this.isAnalyzing) {
            return;
        }
        
        this.isAnalyzing = false;
        
        if (this.analysisInterval) {
            clearInterval(this.analysisInterval);
            this.analysisInterval = null;
        }
        
        this.cleanup();
        
        logger.info('AudioAnalyzer stopped');
        this.emit('stopped');
    }
    
    /**
     * Setup audio processing pipeline
     * @param {MediaStream|AudioBuffer} audioSource - Audio source
     */
    setupAudioProcessing(audioSource) {
        // This will be implemented to work with MonsterBox's existing audio system
        // For now, we'll set up a basic framework
        
        if (typeof window !== 'undefined' && window.AudioContext) {
            // Browser environment - use Web Audio API
            this.setupWebAudioProcessing(audioSource);
        } else {
            // Node.js environment - integrate with existing audio system
            this.setupNodeAudioProcessing(audioSource);
        }
    }
    
    /**
     * Setup Web Audio API processing (for browser/test environment)
     * @param {MediaStream} audioSource - Audio stream
     */
    setupWebAudioProcessing(audioSource) {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            
            this.analyser.fftSize = this.options.bufferSize * 2;
            this.analyser.smoothingTimeConstant = this.options.smoothingFactor;
            
            if (audioSource instanceof MediaStream) {
                this.source = this.audioContext.createMediaStreamSource(audioSource);
                this.source.connect(this.analyser);
            }
            
            this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
            
            logger.debug('Web Audio API processing setup complete');
        } catch (error) {
            logger.error('Failed to setup Web Audio processing:', error);
            throw error;
        }
    }
    
    /**
     * Setup Node.js audio processing (for server environment)
     * @param {Object} audioSource - Audio source configuration
     */
    setupNodeAudioProcessing(audioSource) {
        // This will integrate with MonsterBox's existing audio system
        // We'll tap into the audio stream without blocking it
        
        logger.debug('Node.js audio processing setup - integrating with MonsterBox audio system');
        
        // For now, we'll simulate audio data for development
        // This will be replaced with actual integration
        this.simulateAudioData();
    }
    
    /**
     * Simulate audio data for development/testing
     */
    simulateAudioData() {
        // Generate simulated audio volume data for testing
        this.simulationInterval = setInterval(() => {
            if (!this.isAnalyzing) return;
            
            // Simulate varying volume levels
            const baseVolume = 0.3;
            const variation = Math.sin(Date.now() / 1000) * 0.2;
            const noise = (Math.random() - 0.5) * 0.1;
            
            this.currentVolume = Math.max(0, Math.min(1, baseVolume + variation + noise));
            this.processVolumeData();
        }, this.options.updateInterval);
    }
    
    /**
     * Start the analysis loop
     */
    startAnalysisLoop() {
        this.analysisInterval = setInterval(() => {
            if (!this.isAnalyzing) return;
            
            try {
                this.analyzeAudio();
            } catch (error) {
                logger.error('Error in analysis loop:', error);
                this.emit('error', error);
            }
        }, this.options.updateInterval);
    }
    
    /**
     * Analyze current audio data
     */
    analyzeAudio() {
        if (this.analyser && this.dataArray) {
            // Web Audio API analysis
            this.analyser.getByteFrequencyData(this.dataArray);
            this.currentVolume = this.calculateVolumeFromFrequencyData(this.dataArray);
        }
        // For Node.js, volume is set by simulateAudioData or actual integration
        
        this.processVolumeData();
    }
    
    /**
     * Calculate volume from frequency data
     * @param {Uint8Array} frequencyData - Frequency domain data
     * @returns {number} Volume level (0-1)
     */
    calculateVolumeFromFrequencyData(frequencyData) {
        let sum = 0;
        for (let i = 0; i < frequencyData.length; i++) {
            sum += frequencyData[i];
        }
        return (sum / frequencyData.length) / 255;
    }
    
    /**
     * Process volume data and emit events
     */
    processVolumeData() {
        // Apply smoothing
        this.smoothedVolume = (this.smoothedVolume * this.options.smoothingFactor) + 
                             (this.currentVolume * (1 - this.options.smoothingFactor));
        
        // Track peak volume
        this.peakVolume = Math.max(this.peakVolume * 0.99, this.currentVolume);
        
        // Only emit if volume is above threshold
        if (this.smoothedVolume > this.options.volumeThreshold) {
            this.emit('volumeUpdate', {
                raw: this.currentVolume,
                smoothed: this.smoothedVolume,
                peak: this.peakVolume,
                timestamp: Date.now()
            });
        }
    }
    
    /**
     * Get current volume levels
     * @returns {Object} Volume data
     */
    getVolumeData() {
        return {
            raw: this.currentVolume,
            smoothed: this.smoothedVolume,
            peak: this.peakVolume,
            isAnalyzing: this.isAnalyzing
        };
    }
    
    /**
     * Update analyzer options
     * @param {Object} newOptions - New options to apply
     */
    updateOptions(newOptions) {
        this.options = { ...this.options, ...newOptions };
        logger.debug('AudioAnalyzer options updated:', newOptions);
        this.emit('optionsUpdated', this.options);
    }
    
    /**
     * Cleanup resources
     */
    cleanup() {
        if (this.simulationInterval) {
            clearInterval(this.simulationInterval);
            this.simulationInterval = null;
        }
        
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
        
        if (this.source) {
            this.source.disconnect();
            this.source = null;
        }
        
        this.analyser = null;
        this.dataArray = null;
    }
}

module.exports = AudioAnalyzer;
