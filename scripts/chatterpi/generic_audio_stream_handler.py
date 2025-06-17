#!/usr/bin/env python3
"""
Generic Audio Stream Handler for ChatterPi Animation System
Supports multiple audio input sources with unified processing pipeline
Drives various animatronic components based on real-time audio analysis
"""

import asyncio
import threading
import time
import logging
import json
import numpy as np
import io
from typing import Optional, Dict, Any, Callable, Union, List
from dataclasses import dataclass, asdict
from enum import Enum
import wave
import tempfile
import os

# Audio processing imports
try:
    import pyaudio
    PYAUDIO_AVAILABLE = True
except ImportError:
    PYAUDIO_AVAILABLE = False
    logging.warning("PyAudio not available - microphone input disabled")

try:
    from pydub import AudioSegment
    PYDUB_AVAILABLE = True
except ImportError:
    PYDUB_AVAILABLE = False
    logging.warning("Pydub not available - audio file processing limited")

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class AudioSourceType(Enum):
    """Audio source types supported by the handler"""
    MICROPHONE = "microphone"
    STREAMING_TTS = "streaming_tts"
    AUDIO_FILE = "audio_file"
    WEBSOCKET_STREAM = "websocket_stream"
    GENERIC_STREAM = "generic_stream"

@dataclass
class AudioStreamConfig:
    """Configuration for audio stream processing and animatronic control"""
    # Source configuration
    source_type: AudioSourceType = AudioSourceType.GENERIC_STREAM
    sample_rate: int = 16000
    channels: int = 1
    chunk_size: int = 1024

    # Processing configuration
    volume_threshold: float = 0.005
    smoothing_attack: float = 0.1
    smoothing_release: float = 0.01
    silence_timeout: float = 0.5

    # Animation profiles
    animation_profile: str = "standard"  # "standard", "enhanced_smoothing"

    # Primary animatronic servo configuration (jaw/mouth)
    servo_pin: int = 18
    jaw_closed_angle: float = 50.0  # Primary closed position
    jaw_open_angle: float = 30.0    # Primary open position
    servo_step_threshold: float = 1.0

@dataclass
class AudioFrame:
    """Container for audio frame data"""
    data: np.ndarray
    timestamp: float
    sample_rate: int
    channels: int
    source_type: AudioSourceType
    metadata: Dict[str, Any] = None

class GenericAudioStreamHandler:
    """
    Generic audio stream handler that processes audio from multiple sources
    and drives animatronic components based on real-time amplitude analysis
    Supports jaw animation with extensibility for other animatronic outputs
    """

    def __init__(self, config: AudioStreamConfig, animatronic_controller=None):
        self.config = config
        self.animatronic_controller = animatronic_controller
        
        # Processing state
        self.is_running = False
        self.current_volume = 0.0
        self.smoothed_volume = 0.0
        self.last_jaw_angle = config.jaw_closed_angle
        self.last_audio_time = 0.0
        
        # Audio processing
        self.audio_buffer = []
        self.buffer_lock = threading.Lock()
        self.processing_thread = None
        
        # Statistics
        self.stats = {
            'frames_processed': 0,
            'jaw_updates': 0,
            'start_time': None,
            'last_update': 0
        }
        
        # Animation profiles
        self.animation_profiles = {
            'standard': self._standard_animation_profile,
            'enhanced_smoothing': self._enhanced_smoothing_profile
        }
        
        logger.info(f"GenericAudioStreamHandler initialized with profile: {config.animation_profile}")
    
    def _standard_animation_profile(self, volume: float) -> float:
        """Standard amplitude-to-animatronic-angle mapping"""
        if volume < self.config.volume_threshold:
            return self.config.jaw_closed_angle

        # Normalize volume above threshold
        normalized = min(1.0, volume / 0.5)  # Assume max speech volume of 0.5

        # Linear mapping to animatronic angle range
        angle_range = self.config.jaw_closed_angle - self.config.jaw_open_angle
        target_angle = self.config.jaw_closed_angle - (normalized * angle_range)

        return max(self.config.jaw_open_angle, min(self.config.jaw_closed_angle, target_angle))

    def _enhanced_smoothing_profile(self, volume: float) -> float:
        """Enhanced smoothing with exponential curve for natural movement"""
        if volume < self.config.volume_threshold:
            return self.config.jaw_closed_angle

        # Normalize and apply exponential curve for more natural movement
        normalized = min(1.0, (volume - self.config.volume_threshold) / (0.5 - self.config.volume_threshold))
        curved_volume = normalized ** 0.7  # Exponential curve

        # Map to animatronic angle range
        angle_range = self.config.jaw_closed_angle - self.config.jaw_open_angle
        target_angle = self.config.jaw_closed_angle - (curved_volume * angle_range)

        return max(self.config.jaw_open_angle, min(self.config.jaw_closed_angle, target_angle))
    
    def process_audio_frame(self, audio_frame: AudioFrame) -> Dict[str, Any]:
        """
        Process a single audio frame and return analysis results
        """
        try:
            # Calculate RMS amplitude
            rms_amplitude = np.sqrt(np.mean(audio_frame.data ** 2))
            
            # Apply smoothing based on attack/release
            current_time = time.time()
            time_delta = current_time - self.last_audio_time
            self.last_audio_time = current_time
            
            if rms_amplitude > self.smoothed_volume:
                # Attack phase - faster response
                smoothing_factor = 1.0 - np.exp(-time_delta / self.config.smoothing_attack)
            else:
                # Release phase - slower decay
                smoothing_factor = 1.0 - np.exp(-time_delta / self.config.smoothing_release)
            
            self.smoothed_volume = (self.smoothed_volume * (1 - smoothing_factor) + 
                                  rms_amplitude * smoothing_factor)
            
            # Apply animation profile
            profile_func = self.animation_profiles.get(
                self.config.animation_profile,
                self._standard_animation_profile
            )
            target_angle = profile_func(self.smoothed_volume)

            # Check if animatronic controller should be updated (reduce jitter)
            should_update = abs(target_angle - self.last_jaw_angle) >= self.config.servo_step_threshold

            if should_update:
                self.last_jaw_angle = target_angle
                self.stats['jaw_updates'] += 1
            
            self.stats['frames_processed'] += 1
            self.stats['last_update'] = current_time
            
            return {
                'raw_amplitude': float(rms_amplitude),
                'smoothed_amplitude': float(self.smoothed_volume),
                'target_angle': float(target_angle),
                'should_update_servo': should_update,
                'timestamp': current_time,
                'source_type': audio_frame.source_type.value
            }
            
        except Exception as e:
            logger.error(f"Error processing audio frame: {e}")
            return {
                'error': str(e),
                'timestamp': time.time()
            }
    
    def add_audio_data(self, audio_data: Union[bytes, np.ndarray], 
                      source_type: AudioSourceType = AudioSourceType.GENERIC_STREAM,
                      sample_rate: int = None, metadata: Dict = None):
        """
        Add audio data to the processing queue
        """
        try:
            # Convert bytes to numpy array if needed
            if isinstance(audio_data, bytes):
                audio_array = np.frombuffer(audio_data, dtype=np.float32)
            elif isinstance(audio_data, np.ndarray):
                audio_array = audio_data.astype(np.float32)
            else:
                raise ValueError(f"Unsupported audio data type: {type(audio_data)}")
            
            # Create audio frame
            frame = AudioFrame(
                data=audio_array,
                timestamp=time.time(),
                sample_rate=sample_rate or self.config.sample_rate,
                channels=self.config.channels,
                source_type=source_type,
                metadata=metadata or {}
            )
            
            # Add to buffer
            with self.buffer_lock:
                self.audio_buffer.append(frame)
                
                # Limit buffer size to prevent memory issues
                if len(self.audio_buffer) > 100:
                    self.audio_buffer.pop(0)
            
        except Exception as e:
            logger.error(f"Error adding audio data: {e}")
    
    def start_processing(self) -> bool:
        """Start the audio processing thread"""
        if self.is_running:
            logger.warning("Audio processing already running")
            return True
        
        try:
            self.is_running = True
            self.stats['start_time'] = time.time()
            
            self.processing_thread = threading.Thread(target=self._processing_worker)
            self.processing_thread.daemon = True
            self.processing_thread.start()
            
            logger.info("🎤 Generic audio stream processing started")
            return True
            
        except Exception as e:
            logger.error(f"Failed to start audio processing: {e}")
            self.is_running = False
            return False
    
    def stop_processing(self):
        """Stop the audio processing"""
        if not self.is_running:
            return
        
        self.is_running = False
        
        if self.processing_thread and self.processing_thread.is_alive():
            self.processing_thread.join(timeout=2.0)
        
        # Return animatronic to closed position
        if self.animatronic_controller:
            try:
                self.animatronic_controller.move_to_angle(self.config.jaw_closed_angle, 0.5)
            except Exception as e:
                logger.warning(f"Error returning animatronic to closed: {e}")
        
        logger.info("✅ Audio stream processing stopped")
    
    def _processing_worker(self):
        """Worker thread for processing audio frames"""
        logger.info("Audio processing worker started")
        
        while self.is_running:
            try:
                # Get audio frame from buffer
                audio_frame = None
                with self.buffer_lock:
                    if self.audio_buffer:
                        audio_frame = self.audio_buffer.pop(0)
                
                if audio_frame:
                    # Process the frame
                    result = self.process_audio_frame(audio_frame)
                    
                    # Update animatronic controller if needed
                    if result.get('should_update_servo') and self.animatronic_controller:
                        try:
                            self.animatronic_controller.move_to_angle(
                                result['target_angle'],
                                0.05  # Fast movement for real-time response
                            )
                        except Exception as e:
                            logger.warning(f"Error moving animatronic controller: {e}")
                else:
                    # No audio data, check for silence timeout
                    current_time = time.time()
                    if (current_time - self.last_audio_time) > self.config.silence_timeout:
                        # Return to closed position during silence
                        if abs(self.last_jaw_angle - self.config.jaw_closed_angle) > self.config.servo_step_threshold:
                            if self.animatronic_controller:
                                try:
                                    self.animatronic_controller.move_to_angle(self.config.jaw_closed_angle, 0.2)
                                    self.last_jaw_angle = self.config.jaw_closed_angle
                                except Exception as e:
                                    logger.warning(f"Error returning animatronic to closed: {e}")
                    
                    # Small sleep to prevent busy waiting
                    time.sleep(0.01)
                    
            except Exception as e:
                logger.error(f"Error in processing worker: {e}")
                time.sleep(0.1)
        
        logger.info("Audio processing worker stopped")
    
    def get_stats(self) -> Dict[str, Any]:
        """Get processing statistics"""
        current_time = time.time()
        runtime = current_time - (self.stats['start_time'] or current_time)
        
        return {
            **self.stats,
            'runtime_seconds': runtime,
            'frames_per_second': self.stats['frames_processed'] / max(runtime, 1),
            'jaw_updates_per_second': self.stats['jaw_updates'] / max(runtime, 1),
            'current_volume': self.current_volume,
            'smoothed_volume': self.smoothed_volume,
            'last_jaw_angle': self.last_jaw_angle,
            'is_running': self.is_running
        }
