#!/usr/bin/env python3
"""
Enhanced Audio Processing Module for ChatterPi
Implements smoothed amplitude envelopes and voice activity detection
"""

import numpy as np
import time
import logging
from typing import Optional, Dict, Any, Callable
from dataclasses import dataclass
from enum import Enum

# Configure minimal logging for production
logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger(__name__)
logger.setLevel(logging.WARNING)  # Only show warnings and errors

@dataclass
class AudioConfig:
    """Configuration for audio processing"""
    # Smoothing parameters - OPTIMIZED FOR REAL-TIME RESPONSE
    SMOOTHING_ATTACK: float = 0.15     # Fast attack coefficient (increased for quicker response)
    SMOOTHING_RELEASE: float = 0.08    # Much faster release coefficient (was 0.01, now 8x faster)

    # Voice activity detection - OPTIMIZED FOR IMMEDIATE SILENCE DETECTION
    SILENCE_THRESHOLD: float = 0.005   # Amplitude threshold for silence
    SILENCE_TIMEOUT: int = 100         # Milliseconds before closing jaw (was 500ms, now 5x faster)

    # Servo mapping
    SERVO_MIN: float = 50.0           # Closed position (degrees)
    SERVO_MAX: float = 30.0           # Open position (degrees)
    SERVO_STEP: float = 0.5           # Reduced movement threshold for more responsive updates

    # Audio processing - OPTIMIZED FOR LOW LATENCY
    SAMPLE_RATE: int = 16000          # Required for VAD
    FRAME_SIZE: int = 320             # 20ms at 16kHz (required for VAD)

    # Real-time performance settings
    REAL_TIME_MODE: bool = True       # Enable real-time optimizations
    MAX_BUFFER_FRAMES: int = 3        # Reduced from 10 to minimize latency
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert config to dictionary"""
        return {
            'smoothing_attack': self.SMOOTHING_ATTACK,
            'smoothing_release': self.SMOOTHING_RELEASE,
            'silence_threshold': self.SILENCE_THRESHOLD,
            'silence_timeout': self.SILENCE_TIMEOUT,
            'servo_min': self.SERVO_MIN,
            'servo_max': self.SERVO_MAX,
            'servo_step': self.SERVO_STEP,
            'sample_rate': self.SAMPLE_RATE,
            'frame_size': self.FRAME_SIZE,
            'real_time_mode': self.REAL_TIME_MODE,
            'max_buffer_frames': self.MAX_BUFFER_FRAMES
        }

class SmoothedEnvelope:
    """Exponential moving average envelope follower with separate attack/release"""
    
    def __init__(self, attack_coeff: float = 0.1, release_coeff: float = 0.01):
        self.attack_coeff = attack_coeff
        self.release_coeff = release_coeff
        self.envelope = 0.0
        self.last_update = time.time()
    
    def process(self, amplitude: float) -> float:
        """Process amplitude and return smoothed envelope"""
        current_time = time.time()
        dt = current_time - self.last_update
        self.last_update = current_time
        
        # Choose coefficient based on whether signal is rising or falling
        if amplitude > self.envelope:
            # Attack: fast response to increasing amplitude
            coeff = self.attack_coeff
        else:
            # Release: slow response to decreasing amplitude
            coeff = self.release_coeff
        
        # Apply exponential moving average
        # Adjust coefficient based on time delta for consistent behavior
        adjusted_coeff = 1.0 - np.exp(-coeff * dt * 1000)  # Scale by 1000 for ms
        adjusted_coeff = np.clip(adjusted_coeff, 0.0, 1.0)
        
        self.envelope = self.envelope * (1.0 - adjusted_coeff) + amplitude * adjusted_coeff
        
        return self.envelope
    
    def reset(self):
        """Reset envelope to zero"""
        self.envelope = 0.0
        self.last_update = time.time()

class VoiceActivityDetector:
    """Voice activity detection using amplitude-based method with real-time optimizations"""

    def __init__(self, threshold: float = 0.005, timeout_ms: int = 100):
        self.threshold = threshold
        self.timeout_ms = timeout_ms
        self.last_voice_time = time.time()
        self.is_voice_active = False
        self.immediate_silence_detection = True  # Enable immediate silence response

    def process(self, amplitude: float) -> bool:
        """Process amplitude and return voice activity status with immediate silence detection"""
        current_time = time.time()

        if amplitude > self.threshold:
            # Voice detected
            self.last_voice_time = current_time
            self.is_voice_active = True
        else:
            # REAL-TIME OPTIMIZATION: Immediate silence detection for very low amplitudes
            if self.immediate_silence_detection and amplitude < (self.threshold * 0.1):
                # If amplitude drops to less than 10% of threshold, immediately mark as silent
                self.is_voice_active = False
            else:
                # Check if silence timeout exceeded (much shorter timeout now)
                silence_duration = (current_time - self.last_voice_time) * 1000  # Convert to ms
                if silence_duration > self.timeout_ms:
                    self.is_voice_active = False

        return self.is_voice_active
    
    def reset(self):
        """Reset VAD state"""
        self.last_voice_time = time.time()
        self.is_voice_active = False

class AudioProcessor:
    """Main audio processing class with smoothed envelopes and VAD"""
    
    def __init__(self, config: Optional[AudioConfig] = None):
        self.config = config or AudioConfig()
        
        # Initialize processing components
        self.envelope = SmoothedEnvelope(
            attack_coeff=self.config.SMOOTHING_ATTACK,
            release_coeff=self.config.SMOOTHING_RELEASE
        )
        
        self.vad = VoiceActivityDetector(
            threshold=self.config.SILENCE_THRESHOLD,
            timeout_ms=self.config.SILENCE_TIMEOUT
        )
        
        # State tracking
        self.last_servo_position = self.config.SERVO_MIN
        self.processing_stats = {
            'frames_processed': 0,
            'voice_frames': 0,
            'silence_frames': 0,
            'servo_updates': 0,
            'last_reset': time.time()
        }
        
        logger.info("Audio processor initialized with enhanced smoothing and VAD")
    
    def process_audio_frame(self, audio_data: np.ndarray) -> Dict[str, Any]:
        """
        Process a single audio frame and return servo control data
        
        Args:
            audio_data: Audio samples as numpy array
            
        Returns:
            Dictionary with processing results
        """
        # Calculate RMS amplitude
        rms_amplitude = np.sqrt(np.mean(audio_data ** 2))
        
        # Apply smoothed envelope
        smoothed_amplitude = self.envelope.process(rms_amplitude)
        
        # Voice activity detection
        voice_active = self.vad.process(smoothed_amplitude)
        
        # Map to servo position
        servo_position = self._amplitude_to_servo_position(smoothed_amplitude, voice_active)
        
        # Check if servo should be updated (reduce jitter)
        should_update_servo = abs(servo_position - self.last_servo_position) >= self.config.SERVO_STEP
        
        if should_update_servo:
            self.last_servo_position = servo_position
            self.processing_stats['servo_updates'] += 1
        
        # Update statistics
        self.processing_stats['frames_processed'] += 1
        if voice_active:
            self.processing_stats['voice_frames'] += 1
        else:
            self.processing_stats['silence_frames'] += 1
        
        return {
            'raw_amplitude': float(rms_amplitude),
            'smoothed_amplitude': float(smoothed_amplitude),
            'voice_active': voice_active,
            'servo_position': float(servo_position),
            'should_update_servo': should_update_servo,
            'timestamp': time.time()
        }
    
    def _amplitude_to_servo_position(self, amplitude: float, voice_active: bool) -> float:
        """Convert amplitude to servo position with voice activity consideration"""
        if not voice_active:
            # Force jaw closed during silence
            return self.config.SERVO_MIN
        
        # Apply threshold
        if amplitude < self.config.SILENCE_THRESHOLD:
            return self.config.SERVO_MIN
        
        # Normalize amplitude above threshold
        max_amplitude = 0.5  # Reasonable maximum for speech
        normalized = min(1.0, amplitude / max_amplitude)
        
        # Apply curve for more natural movement (square root for gentler response)
        curved_amplitude = np.sqrt(normalized)
        
        # Map to servo range (note: SERVO_MIN > SERVO_MAX for ChatterPi)
        servo_range = self.config.SERVO_MIN - self.config.SERVO_MAX
        servo_position = self.config.SERVO_MIN - (curved_amplitude * servo_range)
        
        # Clamp to valid range
        return max(self.config.SERVO_MAX, min(self.config.SERVO_MIN, servo_position))
    
    def update_config(self, new_config: Dict[str, Any]):
        """Update configuration parameters"""
        for key, value in new_config.items():
            if hasattr(self.config, key.upper()):
                setattr(self.config, key.upper(), value)
                logger.info(f"Updated config: {key} = {value}")
        
        # Update component parameters
        self.envelope.attack_coeff = self.config.SMOOTHING_ATTACK
        self.envelope.release_coeff = self.config.SMOOTHING_RELEASE
        self.vad.threshold = self.config.SILENCE_THRESHOLD
        self.vad.timeout_ms = self.config.SILENCE_TIMEOUT
    
    def get_stats(self) -> Dict[str, Any]:
        """Get processing statistics"""
        current_time = time.time()
        runtime = current_time - self.processing_stats['last_reset']
        
        stats = self.processing_stats.copy()
        stats.update({
            'runtime_seconds': runtime,
            'frames_per_second': self.processing_stats['frames_processed'] / max(runtime, 0.001),
            'voice_activity_ratio': self.processing_stats['voice_frames'] / max(self.processing_stats['frames_processed'], 1),
            'servo_update_ratio': self.processing_stats['servo_updates'] / max(self.processing_stats['frames_processed'], 1),
            'current_servo_position': self.last_servo_position,
            'config': self.config.to_dict()
        })
        
        return stats
    
    def reset_stats(self):
        """Reset processing statistics"""
        self.processing_stats = {
            'frames_processed': 0,
            'voice_frames': 0,
            'silence_frames': 0,
            'servo_updates': 0,
            'last_reset': time.time()
        }
        logger.info("Processing statistics reset")
    
    def reset(self):
        """Reset all processing state"""
        self.envelope.reset()
        self.vad.reset()
        self.last_servo_position = self.config.SERVO_MIN
        self.reset_stats()
        logger.info("Audio processor reset")

def main():
    """Test the audio processor"""
    import matplotlib.pyplot as plt
    
    # Create test audio processor
    config = AudioConfig()
    processor = AudioProcessor(config)
    
    # Generate test signal (simulated speech with pauses)
    sample_rate = config.SAMPLE_RATE
    duration = 5.0  # seconds
    t = np.linspace(0, duration, int(sample_rate * duration))
    
    # Create speech-like signal with pauses
    speech_signal = np.zeros_like(t)
    for i in range(len(t)):
        if 0.5 < t[i] < 1.5 or 2.5 < t[i] < 4.0:  # Speech periods
            speech_signal[i] = 0.1 * np.sin(2 * np.pi * 200 * t[i]) * (1 + 0.5 * np.sin(2 * np.pi * 10 * t[i]))
    
    # Add noise
    speech_signal += 0.01 * np.random.randn(len(t))
    
    # Process in frames
    frame_size = config.FRAME_SIZE
    results = []
    
    for i in range(0, len(speech_signal) - frame_size, frame_size):
        frame = speech_signal[i:i + frame_size]
        result = processor.process_audio_frame(frame)
        results.append(result)
    
    # Plot results
    times = [r['timestamp'] - results[0]['timestamp'] for r in results]
    raw_amps = [r['raw_amplitude'] for r in results]
    smoothed_amps = [r['smoothed_amplitude'] for r in results]
    servo_positions = [r['servo_position'] for r in results]
    voice_active = [r['voice_active'] for r in results]
    
    plt.figure(figsize=(12, 8))
    
    plt.subplot(3, 1, 1)
    plt.plot(times, raw_amps, label='Raw Amplitude', alpha=0.7)
    plt.plot(times, smoothed_amps, label='Smoothed Amplitude', linewidth=2)
    plt.ylabel('Amplitude')
    plt.legend()
    plt.title('Audio Processing Results')
    
    plt.subplot(3, 1, 2)
    plt.plot(times, voice_active, label='Voice Active', linewidth=2)
    plt.ylabel('Voice Activity')
    plt.ylim(-0.1, 1.1)
    plt.legend()
    
    plt.subplot(3, 1, 3)
    plt.plot(times, servo_positions, label='Servo Position', linewidth=2)
    plt.ylabel('Servo Angle (°)')
    plt.xlabel('Time (s)')
    plt.legend()
    
    plt.tight_layout()
    plt.show()
    
    # Print statistics
    stats = processor.get_stats()
    print("\nProcessing Statistics:")
    for key, value in stats.items():
        if isinstance(value, float):
            print(f"  {key}: {value:.3f}")
        else:
            print(f"  {key}: {value}")

if __name__ == "__main__":
    main()
