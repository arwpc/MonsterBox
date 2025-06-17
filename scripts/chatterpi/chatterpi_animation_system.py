#!/usr/bin/env python3
"""
ChatterPi Animation System
Combines generic audio stream handler with animatronic control for real-time animation
Supports multiple animation outputs including jaw movement, eye control, head movement, etc.
"""

import asyncio
import threading
import time
import logging
import json
import sys
import os
from typing import Optional, Dict, Any, Union
from dataclasses import dataclass

# Add current directory to path for imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from generic_audio_stream_handler import (
    GenericAudioStreamHandler,
    AudioStreamConfig,
    AudioSourceType
)
from audio_source_adapters import (
    MicrophoneAdapter,
    AudioFileAdapter,
    StreamingTTSAdapter,
    WebSocketStreamAdapter
)

# Import animatronic control systems
try:
    from jaw_control_system import JawControlSystem
    JAW_CONTROL_AVAILABLE = True
except ImportError:
    JAW_CONTROL_AVAILABLE = False
    logging.warning("Jaw control system not available - using simulation mode")

logger = logging.getLogger(__name__)

@dataclass
class ChatterPiAnimationConfig:
    """Configuration for ChatterPi animation system"""
    # Audio configuration
    audio_config: AudioStreamConfig = None

    # Primary animatronic servo configuration (jaw)
    primary_servo_pin: int = 18
    primary_closed_angle: float = 50.0
    primary_open_angle: float = 30.0

    # Future expansion: additional servo configurations
    # secondary_servo_pin: int = 19  # For eyes, head, etc.
    # tertiary_servo_pin: int = 20   # For additional components

    # System configuration
    enable_microphone: bool = False
    enable_websocket: bool = True
    websocket_port: int = 8765
    animation_mode: str = "jaw_primary"  # "jaw_primary", "multi_servo", "full_animatronic"

    def __post_init__(self):
        if self.audio_config is None:
            self.audio_config = AudioStreamConfig(
                servo_pin=self.primary_servo_pin,
                jaw_closed_angle=self.primary_closed_angle,
                jaw_open_angle=self.primary_open_angle
            )

class ChatterPiAnimationSystem:
    """
    Integrated system that combines audio processing with animatronic animation
    Supports multiple audio sources and real-time animation control for various components
    Currently focused on jaw animation with extensibility for eyes, head movement, etc.
    """

    def __init__(self, config: ChatterPiAnimationConfig = None):
        self.config = config or ChatterPiAnimationConfig()

        # Initialize primary animatronic controller (jaw)
        self.primary_controller = None
        if JAW_CONTROL_AVAILABLE:
            try:
                self.primary_controller = JawControlSystem(
                    pin=self.config.primary_servo_pin,
                    min_pulse=500,
                    max_pulse=2400
                )
                if self.primary_controller.initialize():
                    logger.info(f"✅ Primary animatronic controller initialized on GPIO {self.config.primary_servo_pin}")
                else:
                    logger.error("❌ Failed to initialize primary animatronic controller")
                    self.primary_controller = None
            except Exception as e:
                logger.error(f"❌ Error initializing primary animatronic controller: {e}")
                self.primary_controller = None
        else:
            logger.info("🎭 Running in simulation mode (no GPIO)")

        # Initialize audio stream handler
        self.stream_handler = GenericAudioStreamHandler(
            self.config.audio_config,
            self.primary_controller
        )
        
        # Initialize adapters
        self.adapters = {}
        self._initialize_adapters()
        
        # System state
        self.is_running = False
        self.active_sources = set()
        
        logger.info("🎭 ChatterPi Animation System initialized")
    
    def _initialize_adapters(self):
        """Initialize audio source adapters"""
        try:
            # Microphone adapter
            if self.config.enable_microphone:
                try:
                    self.adapters['microphone'] = MicrophoneAdapter(self.stream_handler)
                    logger.info("🎤 Microphone adapter initialized")
                except Exception as e:
                    logger.warning(f"Microphone adapter not available: {e}")
            
            # Audio file adapter
            self.adapters['audio_file'] = AudioFileAdapter(self.stream_handler)
            logger.info("🎵 Audio file adapter initialized")
            
            # Streaming TTS adapter
            self.adapters['streaming_tts'] = StreamingTTSAdapter(self.stream_handler)
            logger.info("🌐 Streaming TTS adapter initialized")
            
            # WebSocket adapter
            if self.config.enable_websocket:
                try:
                    self.adapters['websocket'] = WebSocketStreamAdapter(self.stream_handler)
                    logger.info("🔌 WebSocket adapter initialized")
                except Exception as e:
                    logger.warning(f"WebSocket adapter not available: {e}")
        
        except Exception as e:
            logger.error(f"Error initializing adapters: {e}")
    
    def start_system(self) -> bool:
        """Start the ChatterPi animation system"""
        try:
            if self.is_running:
                logger.warning("Animation system already running")
                return True

            # Start audio processing
            if not self.stream_handler.start_processing():
                logger.error("Failed to start audio processing")
                return False

            self.is_running = True
            logger.info("🚀 ChatterPi Animation System started")
            return True

        except Exception as e:
            logger.error(f"Failed to start animation system: {e}")
            return False

    def stop_system(self):
        """Stop the ChatterPi animation system"""
        try:
            self.is_running = False

            # Stop all active sources
            self.stop_all_sources()

            # Stop audio processing
            self.stream_handler.stop_processing()

            # Cleanup primary controller
            if self.primary_controller:
                self.primary_controller.cleanup()

            logger.info("✅ ChatterPi Animation System stopped")

        except Exception as e:
            logger.error(f"Error stopping animation system: {e}")
    
    def start_microphone(self) -> bool:
        """Start microphone input"""
        if 'microphone' not in self.adapters:
            logger.error("Microphone adapter not available")
            return False
        
        try:
            if self.adapters['microphone'].start_recording():
                self.active_sources.add('microphone')
                logger.info("🎤 Microphone input started")
                return True
            return False
        except Exception as e:
            logger.error(f"Failed to start microphone: {e}")
            return False
    
    def stop_microphone(self):
        """Stop microphone input"""
        if 'microphone' in self.adapters and 'microphone' in self.active_sources:
            self.adapters['microphone'].stop_recording()
            self.active_sources.discard('microphone')
            logger.info("🎤 Microphone input stopped")
    
    def play_audio_file(self, file_path: str, real_time: bool = True) -> bool:
        """Play audio file with jaw animation"""
        if 'audio_file' not in self.adapters:
            logger.error("Audio file adapter not available")
            return False
        
        try:
            if self.adapters['audio_file'].play_file(file_path, real_time):
                self.active_sources.add('audio_file')
                logger.info(f"🎵 Playing audio file: {file_path}")
                return True
            return False
        except Exception as e:
            logger.error(f"Failed to play audio file: {e}")
            return False
    
    def stop_audio_file(self):
        """Stop audio file playback"""
        if 'audio_file' in self.adapters and 'audio_file' in self.active_sources:
            self.adapters['audio_file'].stop_playback()
            self.active_sources.discard('audio_file')
            logger.info("🎵 Audio file playback stopped")
    
    def stream_tts_audio(self, audio_data: Union[str, bytes], 
                        source_type: str = 'buffer', 
                        metadata: Dict = None) -> bool:
        """
        Stream TTS audio with jaw animation
        
        Args:
            audio_data: URL string or audio bytes
            source_type: 'url' or 'buffer'
            metadata: Additional metadata
        """
        if 'streaming_tts' not in self.adapters:
            logger.error("Streaming TTS adapter not available")
            return False
        
        try:
            adapter = self.adapters['streaming_tts']
            
            if source_type == 'url':
                success = adapter.stream_from_url(audio_data, metadata)
            elif source_type == 'buffer':
                success = adapter.stream_from_buffer(audio_data, 'mp3', metadata)
            else:
                logger.error(f"Unknown TTS source type: {source_type}")
                return False
            
            if success:
                self.active_sources.add('streaming_tts')
                logger.info(f"🌐 Streaming TTS audio ({source_type})")
                return True
            return False
            
        except Exception as e:
            logger.error(f"Failed to stream TTS audio: {e}")
            return False
    
    def stop_tts_streaming(self):
        """Stop TTS streaming"""
        if 'streaming_tts' in self.adapters and 'streaming_tts' in self.active_sources:
            self.adapters['streaming_tts'].stop_streaming()
            self.active_sources.discard('streaming_tts')
            logger.info("🌐 TTS streaming stopped")
    
    async def connect_websocket(self, websocket_url: str) -> bool:
        """Connect to WebSocket audio stream"""
        if 'websocket' not in self.adapters:
            logger.error("WebSocket adapter not available")
            return False
        
        try:
            if await self.adapters['websocket'].connect(websocket_url):
                self.active_sources.add('websocket')
                logger.info(f"🔌 Connected to WebSocket: {websocket_url}")
                return True
            return False
        except Exception as e:
            logger.error(f"Failed to connect WebSocket: {e}")
            return False
    
    async def disconnect_websocket(self):
        """Disconnect from WebSocket"""
        if 'websocket' in self.adapters and 'websocket' in self.active_sources:
            await self.adapters['websocket'].disconnect()
            self.active_sources.discard('websocket')
            logger.info("🔌 WebSocket disconnected")
    
    def stop_all_sources(self):
        """Stop all active audio sources"""
        if 'microphone' in self.active_sources:
            self.stop_microphone()
        
        if 'audio_file' in self.active_sources:
            self.stop_audio_file()
        
        if 'streaming_tts' in self.active_sources:
            self.stop_tts_streaming()
        
        # Note: WebSocket disconnect is async, handle separately if needed
        
        logger.info("🛑 All audio sources stopped")
    
    def update_animation_profile(self, profile: str):
        """Update animation profile"""
        self.stream_handler.config.animation_profile = profile
        logger.info(f"🎭 Animation profile updated to: {profile}")
    
    def update_primary_angles(self, closed_angle: float, open_angle: float):
        """Update primary animatronic servo angles (jaw)"""
        self.stream_handler.config.jaw_closed_angle = closed_angle
        self.stream_handler.config.jaw_open_angle = open_angle
        logger.info(f"🎭 Primary animatronic angles updated: closed={closed_angle}°, open={open_angle}°")

    # Backward compatibility alias
    def update_jaw_angles(self, closed_angle: float, open_angle: float):
        """Update jaw servo angles (backward compatibility)"""
        self.update_primary_angles(closed_angle, open_angle)
    
    def get_system_status(self) -> Dict[str, Any]:
        """Get comprehensive system status"""
        return {
            'is_running': self.is_running,
            'active_sources': list(self.active_sources),
            'primary_controller_available': self.primary_controller is not None,
            'current_primary_angle': getattr(self.primary_controller, 'current_angle', None),
            'audio_stats': self.stream_handler.get_stats(),
            'config': {
                'primary_servo_pin': self.config.primary_servo_pin,
                'primary_closed_angle': self.config.audio_config.jaw_closed_angle,
                'primary_open_angle': self.config.audio_config.jaw_open_angle,
                'animation_profile': self.config.audio_config.animation_profile,
                'animation_mode': self.config.animation_mode
            }
        }

    def manual_primary_move(self, angle: float, duration: float = 0.5) -> bool:
        """Manually move primary animatronic component to specific angle"""
        if not self.primary_controller:
            logger.warning("Primary animatronic controller not available")
            return False

        try:
            self.primary_controller.move_to_angle(angle, duration)
            logger.info(f"🎭 Manual primary animatronic move to {angle}° (duration: {duration}s)")
            return True
        except Exception as e:
            logger.error(f"Failed to move primary animatronic manually: {e}")
            return False

    # Backward compatibility alias
    def manual_jaw_move(self, angle: float, duration: float = 0.5) -> bool:
        """Manually move jaw to specific angle (backward compatibility)"""
        return self.manual_primary_move(angle, duration)

# Example usage and testing
async def main():
    """Example usage of the ChatterPi animation system"""
    # Create configuration
    config = ChatterPiAnimationConfig(
        enable_microphone=True,
        enable_websocket=True,
        audio_config=AudioStreamConfig(
            animation_profile="enhanced_smoothing",
            volume_threshold=0.005,
            smoothing_attack=0.1,
            smoothing_release=0.01
        )
    )

    # Initialize system
    system = ChatterPiAnimationSystem(config)
    
    try:
        # Start the system
        if not system.start_system():
            logger.error("Failed to start system")
            return
        
        logger.info("🎭 System started successfully")
        
        # Example: Start microphone input
        if system.start_microphone():
            logger.info("🎤 Speak into the microphone to see jaw movement!")
            
            # Run for 30 seconds
            for i in range(30):
                await asyncio.sleep(1)
                status = system.get_system_status()
                print(f"Status: {status['audio_stats']['smoothed_volume']:.3f} volume, "
                      f"{status['audio_stats']['last_jaw_angle']:.1f}° jaw", end="\r")
        
        # Example: Play an audio file
        # system.play_audio_file("/path/to/audio/file.wav")
        
        # Example: Stream TTS audio
        # system.stream_tts_audio(tts_audio_bytes, 'buffer')
        
    except KeyboardInterrupt:
        logger.info("\n⚠️ System interrupted by user")
    finally:
        system.stop_system()
        logger.info("✅ System shutdown complete")

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())
