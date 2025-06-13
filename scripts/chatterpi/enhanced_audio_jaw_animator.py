#!/usr/bin/env python3
"""
Enhanced Audio-Driven Jaw Animation for ChatterPi
Implements smoothed audio envelopes, voice activity detection, and hardware-timed PWM
"""

import pyaudio
import numpy as np
import threading
import time
import logging
import json
from typing import Optional, Dict, Any, Callable
from dataclasses import dataclass, asdict

from audio_processing import AudioProcessor, AudioConfig
from servo_controller import ServoController, ServoConfig

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class AnimatorConfig:
    """Configuration for the enhanced jaw animator"""
    # Audio input settings
    sample_rate: int = 16000         # Required for VAD
    chunk_size: int = 320            # 20ms frames at 16kHz
    input_device: Optional[int] = None
    
    # Processing settings
    audio_config: AudioConfig = None
    servo_config: ServoConfig = None
    
    # Performance settings
    update_rate_hz: float = 50.0     # Animation update rate
    stats_interval: float = 5.0      # Statistics reporting interval
    
    def __post_init__(self):
        if self.audio_config is None:
            self.audio_config = AudioConfig()
        if self.servo_config is None:
            self.servo_config = ServoConfig()

class EnhancedAudioJawAnimator:
    """Enhanced real-time audio-driven jaw animation system"""
    
    def __init__(self, config: Optional[AnimatorConfig] = None):
        self.config = config or AnimatorConfig()
        
        # Initialize components
        self.audio_processor = AudioProcessor(self.config.audio_config)
        self.servo_controller = ServoController(self.config.servo_config)
        
        # Audio system
        self.audio = None
        self.stream = None
        
        # Threading
        self.is_running = False
        self.animation_thread = None
        self.stats_thread = None
        
        # Audio buffer for processing
        self.audio_buffer = []
        self.buffer_lock = threading.Lock()
        
        # Statistics
        self.stats = {
            'start_time': None,
            'frames_processed': 0,
            'audio_callbacks': 0,
            'servo_updates': 0,
            'buffer_overruns': 0,
            'processing_errors': 0
        }
        
        logger.info("Enhanced audio jaw animator initialized")
    
    def initialize(self) -> bool:
        """Initialize audio system and servo controller"""
        try:
            # Initialize servo controller
            if not self.servo_controller.initialize():
                logger.error("Failed to initialize servo controller")
                return False
            
            # Initialize audio system
            self.audio = pyaudio.PyAudio()
            
            # Find suitable input device
            if self.config.input_device is None:
                self.config.input_device = self._find_best_input_device()
            
            # Create audio stream
            self.stream = self.audio.open(
                format=pyaudio.paFloat32,
                channels=1,
                rate=self.config.sample_rate,
                input=True,
                input_device_index=self.config.input_device,
                frames_per_buffer=self.config.chunk_size,
                stream_callback=self._audio_callback
            )
            
            logger.info(f"✅ Audio system initialized (device: {self.config.input_device})")
            return True
            
        except Exception as e:
            logger.error(f"❌ Failed to initialize audio system: {e}")
            return False
    
    def _find_best_input_device(self) -> Optional[int]:
        """Find the best available input device"""
        try:
            device_count = self.audio.get_device_count()
            
            for i in range(device_count):
                device_info = self.audio.get_device_info_by_index(i)
                
                # Look for input devices that support our sample rate
                if (device_info['maxInputChannels'] > 0 and 
                    device_info['defaultSampleRate'] >= self.config.sample_rate):
                    
                    logger.info(f"Selected audio input device: {device_info['name']}")
                    return i
            
            logger.warning("No suitable input device found, using default")
            return None
            
        except Exception as e:
            logger.error(f"Error finding input device: {e}")
            return None
    
    def _audio_callback(self, in_data, frame_count, time_info, status):
        """Audio stream callback for real-time processing"""
        try:
            self.stats['audio_callbacks'] += 1
            
            # Convert audio data to numpy array
            audio_data = np.frombuffer(in_data, dtype=np.float32)
            
            # Add to buffer for processing
            with self.buffer_lock:
                self.audio_buffer.append(audio_data)
                
                # Prevent buffer from growing too large
                if len(self.audio_buffer) > 10:  # Keep max 10 frames
                    self.audio_buffer.pop(0)
                    self.stats['buffer_overruns'] += 1
            
            return (None, pyaudio.paContinue)
            
        except Exception as e:
            logger.error(f"Audio callback error: {e}")
            self.stats['processing_errors'] += 1
            return (None, pyaudio.paAbort)
    
    def start_animation(self) -> bool:
        """Start real-time jaw animation"""
        if self.is_running:
            logger.warning("Animation already running")
            return True
        
        if not self.initialize():
            return False
        
        try:
            # Start audio stream
            self.stream.start_stream()
            
            # Start processing threads
            self.is_running = True
            self.stats['start_time'] = time.time()
            
            self.animation_thread = threading.Thread(target=self._animation_worker)
            self.animation_thread.daemon = True
            self.animation_thread.start()
            
            self.stats_thread = threading.Thread(target=self._stats_worker)
            self.stats_thread.daemon = True
            self.stats_thread.start()
            
            logger.info("🎤 Enhanced audio-driven jaw animation started")
            return True
            
        except Exception as e:
            logger.error(f"Failed to start animation: {e}")
            self.stop_animation()
            return False
    
    def stop_animation(self):
        """Stop jaw animation and cleanup"""
        if not self.is_running:
            return
        
        logger.info("🛑 Stopping enhanced jaw animation...")
        self.is_running = False
        
        # Stop threads
        if self.animation_thread and self.animation_thread.is_alive():
            self.animation_thread.join(timeout=2.0)
        
        if self.stats_thread and self.stats_thread.is_alive():
            self.stats_thread.join(timeout=1.0)
        
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
        
        # Cleanup servo
        self.servo_controller.cleanup()
        
        logger.info("✅ Enhanced jaw animation stopped")
    
    def _animation_worker(self):
        """Worker thread for processing audio and controlling servo"""
        logger.info("Animation worker started")
        
        update_interval = 1.0 / self.config.update_rate_hz
        last_update = time.time()
        
        while self.is_running:
            try:
                current_time = time.time()
                
                # Check if it's time for an update
                if current_time - last_update < update_interval:
                    time.sleep(0.001)  # Small sleep to prevent busy waiting
                    continue
                
                last_update = current_time
                
                # Get audio data from buffer
                audio_data = None
                with self.buffer_lock:
                    if self.audio_buffer:
                        audio_data = self.audio_buffer.pop(0)
                
                if audio_data is not None:
                    # Process audio frame
                    result = self.audio_processor.process_audio_frame(audio_data)
                    self.stats['frames_processed'] += 1
                    
                    # Update servo if needed
                    if result['should_update_servo']:
                        success = self.servo_controller.set_position(result['servo_position'])
                        if success:
                            self.stats['servo_updates'] += 1
                
            except Exception as e:
                logger.error(f"Animation worker error: {e}")
                self.stats['processing_errors'] += 1
                time.sleep(0.1)  # Brief pause on error
        
        logger.info("Animation worker stopped")
    
    def _stats_worker(self):
        """Worker thread for periodic statistics reporting"""
        while self.is_running:
            time.sleep(self.config.stats_interval)
            
            if self.is_running:  # Check again after sleep
                self._log_statistics()
    
    def _log_statistics(self):
        """Log current statistics"""
        try:
            runtime = time.time() - self.stats['start_time']
            
            # Get component statistics
            audio_stats = self.audio_processor.get_stats()
            servo_stats = self.servo_controller.get_stats()
            
            logger.info(f"📊 Animation Stats (runtime: {runtime:.1f}s):")
            logger.info(f"   Audio: {self.stats['audio_callbacks']} callbacks, "
                       f"{self.stats['frames_processed']} frames processed")
            logger.info(f"   Servo: {self.stats['servo_updates']} updates, "
                       f"current: {servo_stats['current_position']:.1f}°")
            logger.info(f"   Voice activity: {audio_stats['voice_activity_ratio']:.2%}, "
                       f"processing rate: {audio_stats['frames_per_second']:.1f} fps")
            
            if self.stats['buffer_overruns'] > 0:
                logger.warning(f"   Buffer overruns: {self.stats['buffer_overruns']}")
            
            if self.stats['processing_errors'] > 0:
                logger.warning(f"   Processing errors: {self.stats['processing_errors']}")
                
        except Exception as e:
            logger.error(f"Error logging statistics: {e}")
    
    def get_status(self) -> Dict[str, Any]:
        """Get comprehensive system status"""
        status = {
            'is_running': self.is_running,
            'runtime': time.time() - self.stats['start_time'] if self.stats['start_time'] else 0,
            'stats': self.stats.copy(),
            'audio_processor': self.audio_processor.get_stats(),
            'servo_controller': self.servo_controller.get_stats(),
            'config': {
                'sample_rate': self.config.sample_rate,
                'chunk_size': self.config.chunk_size,
                'update_rate_hz': self.config.update_rate_hz,
                'audio_config': self.config.audio_config.to_dict(),
                'servo_config': self.config.servo_config.to_dict()
            }
        }
        
        return status
    
    def update_config(self, new_config: Dict[str, Any]):
        """Update configuration parameters"""
        # Update audio processing config
        if 'audio' in new_config:
            self.audio_processor.update_config(new_config['audio'])
        
        # Update servo config
        if 'servo' in new_config:
            self.servo_controller.update_config(new_config['servo'])
        
        # Update animator config
        for key, value in new_config.items():
            if hasattr(self.config, key):
                setattr(self.config, key, value)
                logger.info(f"Updated animator config: {key} = {value}")
    
    def save_config(self, filename: str):
        """Save current configuration to file"""
        try:
            config_data = {
                'audio_config': self.config.audio_config.to_dict(),
                'servo_config': self.config.servo_config.to_dict(),
                'animator_config': {
                    'sample_rate': self.config.sample_rate,
                    'chunk_size': self.config.chunk_size,
                    'update_rate_hz': self.config.update_rate_hz,
                    'stats_interval': self.config.stats_interval
                }
            }
            
            with open(filename, 'w') as f:
                json.dump(config_data, f, indent=2)
            
            logger.info(f"Configuration saved to {filename}")
            
        except Exception as e:
            logger.error(f"Error saving configuration: {e}")
    
    def load_config(self, filename: str):
        """Load configuration from file"""
        try:
            with open(filename, 'r') as f:
                config_data = json.load(f)
            
            # Update configurations
            if 'audio_config' in config_data:
                self.audio_processor.update_config(config_data['audio_config'])
            
            if 'servo_config' in config_data:
                self.servo_controller.update_config(config_data['servo_config'])
            
            if 'animator_config' in config_data:
                for key, value in config_data['animator_config'].items():
                    if hasattr(self.config, key):
                        setattr(self.config, key, value)
            
            logger.info(f"Configuration loaded from {filename}")
            
        except Exception as e:
            logger.error(f"Error loading configuration: {e}")

def main():
    """Test the enhanced audio jaw animator"""
    print("🎤 Testing Enhanced Audio-Driven Jaw Animation")
    print("=" * 60)
    
    # Create animator with custom config
    config = AnimatorConfig()
    config.audio_config.SMOOTHING_ATTACK = 0.2
    config.audio_config.SMOOTHING_RELEASE = 0.05
    config.audio_config.SILENCE_THRESHOLD = 0.01
    config.servo_config.step_threshold = 0.5
    
    animator = EnhancedAudioJawAnimator(config)
    
    try:
        print("🎯 Starting enhanced audio-driven animation...")
        print("Speak into the microphone to see jaw movement!")
        print("Press Ctrl+C to stop")
        
        if animator.start_animation():
            # Run until interrupted
            while True:
                time.sleep(1)
                
                # Print brief status every few seconds
                status = animator.get_status()
                print(f"Runtime: {status['runtime']:.1f}s, "
                      f"Frames: {status['stats']['frames_processed']}, "
                      f"Servo: {status['servo_controller']['current_position']:.1f}°", 
                      end="\r")
        else:
            print("❌ Failed to start animation")
    
    except KeyboardInterrupt:
        print("\n⚠️ Animation stopped by user")
    finally:
        animator.stop_animation()
        print("✅ Test completed")

if __name__ == "__main__":
    main()
