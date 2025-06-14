#!/usr/bin/env python3
"""
Audio-Driven Jaw Animation for ChatterPi
Real-time jaw animation based on audio amplitude analysis
"""

import pyaudio
import numpy as np
import threading
import time
import logging
from typing import Optional, Callable
from jaw_control_system import JawControlSystem

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class AudioJawAnimator:
    """Real-time audio-driven jaw animation system"""
    
    def __init__(self, jaw_control: JawControlSystem, 
                 sample_rate: int = 44100, 
                 chunk_size: int = 1024,
                 volume_threshold: float = 0.01,
                 sensitivity: float = 1.0):
        
        self.jaw_control = jaw_control
        self.sample_rate = sample_rate
        self.chunk_size = chunk_size
        self.volume_threshold = volume_threshold
        self.sensitivity = sensitivity
        
        # Audio processing
        self.audio = None
        self.stream = None
        self.is_running = False
        self.animation_thread = None
        
        # Animation state
        self.current_volume = 0.0
        self.smoothed_volume = 0.0
        self.smoothing_factor = 0.3  # Reduced for faster response
        self.last_jaw_angle = 50.0  # Start closed
        
        # ChatterPi jaw configuration (final: 50°=closed, 30°=open)
        self.jaw_closed_angle = 50.0
        self.jaw_open_angle = 30.0
        self.jaw_range = self.jaw_closed_angle - self.jaw_open_angle

        # Performance tracking
        self.update_count = 0
        self.last_stats_time = time.time()

        logger.info("Audio jaw animator initialized")
    
    def initialize_audio(self) -> bool:
        """Initialize PyAudio for microphone input"""
        try:
            self.audio = pyaudio.PyAudio()
            
            # Find default input device
            default_device = self.audio.get_default_input_device_info()
            logger.info(f"Using audio device: {default_device['name']}")
            
            # Open audio stream
            self.stream = self.audio.open(
                format=pyaudio.paFloat32,
                channels=1,
                rate=self.sample_rate,
                input=True,
                frames_per_buffer=self.chunk_size,
                stream_callback=self._audio_callback
            )
            
            logger.info("✅ Audio system initialized")
            return True
            
        except Exception as e:
            logger.error(f"❌ Failed to initialize audio: {e}")
            return False
    
    def _audio_callback(self, in_data, frame_count, time_info, status):
        """Audio stream callback for real-time processing"""
        try:
            # Convert audio data to numpy array
            audio_data = np.frombuffer(in_data, dtype=np.float32)
            
            # Calculate RMS volume
            rms_volume = np.sqrt(np.mean(audio_data**2))
            
            # Apply sensitivity
            self.current_volume = rms_volume * self.sensitivity
            
            # Smooth the volume for natural jaw movement
            self.smoothed_volume = (self.smoothing_factor * self.smoothed_volume + 
                                  (1 - self.smoothing_factor) * self.current_volume)
            
            return (None, pyaudio.paContinue)
            
        except Exception as e:
            logger.error(f"Audio callback error: {e}")
            return (None, pyaudio.paAbort)
    
    def start_animation(self) -> bool:
        """Start real-time jaw animation"""
        if self.is_running:
            logger.warning("Animation already running")
            return True
        
        if not self.jaw_control.is_initialized:
            logger.error("Jaw control not initialized")
            return False
        
        if not self.initialize_audio():
            return False
        
        try:
            # Start audio stream
            self.stream.start_stream()
            
            # Start animation thread
            self.is_running = True
            self.animation_thread = threading.Thread(target=self._animation_worker)
            self.animation_thread.daemon = True
            self.animation_thread.start()
            
            logger.info("🎤 Audio-driven jaw animation started")
            return True
            
        except Exception as e:
            logger.error(f"Failed to start animation: {e}")
            self.stop_animation()
            return False
    
    def stop_animation(self):
        """Stop jaw animation and cleanup"""
        if not self.is_running:
            return
        
        logger.info("🛑 Stopping jaw animation...")
        self.is_running = False
        
        # Stop animation thread
        if self.animation_thread and self.animation_thread.is_alive():
            self.animation_thread.join(timeout=2.0)
        
        # Stop audio stream
        if self.stream:
            try:
                self.stream.stop_stream()
                self.stream.close()
            except Exception as e:
                logger.warning(f"Error stopping audio stream: {e}")
        
        # Cleanup audio
        if self.audio:
            try:
                self.audio.terminate()
            except Exception as e:
                logger.warning(f"Error terminating audio: {e}")
        
        # Return jaw to closed position
        try:
            self.jaw_control.move_to_angle(self.jaw_closed_angle, 0.5, "ease_out")
        except Exception as e:
            logger.warning(f"Error returning jaw to closed: {e}")
        
        logger.info("✅ Jaw animation stopped")
    
    def _animation_worker(self):
        """Worker thread for jaw animation updates"""
        logger.info("Animation worker started")
        
        while self.is_running:
            try:
                # Calculate jaw angle based on volume
                jaw_angle = self._volume_to_jaw_angle(self.smoothed_volume)
                
                # Only move if there's significant change (reduce jitter)
                angle_diff = abs(jaw_angle - self.last_jaw_angle)
                if angle_diff > 1.0:  # Reduced threshold for more responsive movement
                    self.jaw_control.move_to_angle(jaw_angle, 0.05, "linear")  # Faster movement
                    self.last_jaw_angle = jaw_angle
                
                # Performance tracking
                self.update_count += 1
                current_time = time.time()
                if current_time - self.last_stats_time >= 5.0:  # Every 5 seconds
                    updates_per_sec = self.update_count / 5.0
                    logger.debug(f"Animation stats: {updates_per_sec:.1f} updates/sec, "
                               f"volume: {self.smoothed_volume:.3f}, angle: {jaw_angle:.1f}°")
                    self.update_count = 0
                    self.last_stats_time = current_time
                
                # Update rate: ~100Hz for more responsive animation
                time.sleep(0.01)
                
            except Exception as e:
                logger.error(f"Animation worker error: {e}")
                break
        
        logger.info("Animation worker stopped")
    
    def _volume_to_jaw_angle(self, volume: float) -> float:
        """Convert audio volume to jaw angle"""
        # Apply threshold
        if volume < self.volume_threshold:
            return self.jaw_closed_angle
        
        # Normalize volume above threshold
        normalized_volume = min(1.0, (volume - self.volume_threshold) / (1.0 - self.volume_threshold))
        
        # Apply exponential curve for more natural movement
        curved_volume = normalized_volume ** 0.5
        
        # Map to jaw angle range (closed=50°, open=30°)
        jaw_angle = self.jaw_closed_angle - (curved_volume * self.jaw_range)

        # Clamp to valid range
        return max(self.jaw_open_angle, min(self.jaw_closed_angle, jaw_angle))
    
    def set_sensitivity(self, sensitivity: float):
        """Adjust animation sensitivity"""
        self.sensitivity = max(0.1, min(5.0, sensitivity))
        logger.info(f"Sensitivity set to {self.sensitivity}")
    
    def set_volume_threshold(self, threshold: float):
        """Adjust volume threshold"""
        self.volume_threshold = max(0.001, min(0.1, threshold))
        logger.info(f"Volume threshold set to {self.volume_threshold}")
    
    def get_status(self) -> dict:
        """Get animation status"""
        return {
            "is_running": self.is_running,
            "current_volume": self.current_volume,
            "smoothed_volume": self.smoothed_volume,
            "last_jaw_angle": self.last_jaw_angle,
            "sensitivity": self.sensitivity,
            "volume_threshold": self.volume_threshold
        }

def main():
    """Test the audio jaw animator"""
    print("🎤 Testing Audio-Driven Jaw Animation")
    print("=" * 50)
    
    # Initialize jaw control
    jaw_control = JawControlSystem(pin=18, min_pulse=500, max_pulse=2400)
    if not jaw_control.initialize():
        print("❌ Failed to initialize jaw control")
        return
    
    # Initialize audio animator
    animator = AudioJawAnimator(jaw_control)
    
    try:
        print("🎯 Starting audio-driven animation...")
        print("Speak into the microphone to see jaw movement!")
        print("Press Ctrl+C to stop")
        
        if animator.start_animation():
            # Run for a while or until interrupted
            while True:
                time.sleep(1)
                status = animator.get_status()
                print(f"Volume: {status['smoothed_volume']:.3f}, "
                      f"Jaw: {status['last_jaw_angle']:.1f}°", end="\r")
        else:
            print("❌ Failed to start animation")
    
    except KeyboardInterrupt:
        print("\n⚠️ Animation stopped by user")
    finally:
        animator.stop_animation()
        jaw_control.cleanup()
        print("✅ Cleanup completed")

if __name__ == "__main__":
    main()
