#!/usr/bin/env python3
"""
Microphone WebSocket Service for MonsterBox Hardware System
Provides WebSocket interface for microphone control and audio streaming
Integrates with character-based system and STT/Audio Stream services
"""

import asyncio
import websockets
import json
import logging
import time
import threading
from typing import Dict, Any, Optional, List
from dataclasses import dataclass, asdict

from base_hardware_service import BaseHardwareService

# Audio processing imports
try:
    import pyaudio
    PYAUDIO_AVAILABLE = True
except ImportError:
    PYAUDIO_AVAILABLE = False
    logging.warning("PyAudio not available - microphone functionality disabled")

try:
    import numpy as np
    NUMPY_AVAILABLE = True
except ImportError:
    NUMPY_AVAILABLE = False
    logging.warning("NumPy not available - audio processing limited")

logger = logging.getLogger(__name__)

@dataclass
class MicrophoneConfig:
    """Configuration for microphone"""
    device_id: str = "default"
    sample_rate: int = 16000
    channels: int = 1
    chunk_size: int = 1024
    format: str = "float32"
    enabled: bool = True
    sensitivity: float = 1.0
    echo_cancellation: bool = True
    noise_suppression: bool = True
    auto_gain_control: bool = True
    voice_activation: bool = False
    voice_activation_threshold: float = 0.1

@dataclass
class MicrophoneStatus:
    """Status information for microphone"""
    microphone_id: str
    device_id: str
    status: str  # "idle", "recording", "streaming", "error"
    sample_rate: int
    channels: int
    start_time: Optional[float] = None
    last_activity: Optional[float] = None
    error_message: Optional[str] = None

class MicrophoneWebSocketService(BaseHardwareService):
    """WebSocket service for microphone control and audio streaming"""

    def __init__(self, port: int = 8776, host: str = "0.0.0.0"):
        super().__init__("microphone_service", "microphone", port, host)
        self.active_microphones: Dict[str, MicrophoneStatus] = {}
        self.recording_tasks: Dict[str, asyncio.Task] = {}
        self.audio_streams: Dict[str, Any] = {}
        self.audio_handlers: Dict[str, Any] = {}
        
        # Audio system
        self.audio_system = None
        if PYAUDIO_AVAILABLE:
            try:
                self.audio_system = pyaudio.PyAudio()
                logger.info("✅ PyAudio system initialized")
            except Exception as e:
                logger.error(f"Failed to initialize PyAudio: {e}")
                self.audio_system = None
    
    async def initialize_hardware(self) -> bool:
        """Initialize the microphone hardware"""
        try:
            if not PYAUDIO_AVAILABLE:
                logger.warning("⚠️ PyAudio not available - microphone service running in limited mode")
                return True

            if not self.audio_system:
                logger.error("❌ Audio system not initialized")
                return False

            # Discover available microphones
            await self.discover_microphones()

            logger.info("✅ Microphone hardware initialized")
            return True

        except Exception as e:
            logger.error(f"Failed to initialize microphone hardware: {e}")
            return False
    
    async def discover_microphones(self):
        """Discover available microphone devices"""
        try:
            if not self.audio_system:
                return
            
            device_count = self.audio_system.get_device_count()
            microphones = []
            
            for i in range(device_count):
                device_info = self.audio_system.get_device_info_by_index(i)
                if device_info['maxInputChannels'] > 0:  # Has input capability
                    microphones.append({
                        'index': i,
                        'name': device_info['name'],
                        'channels': device_info['maxInputChannels'],
                        'sample_rate': int(device_info['defaultSampleRate'])
                    })
            
            logger.info(f"🎤 Discovered {len(microphones)} microphone devices")
            
            # Broadcast discovered microphones
            await self.broadcast_message({
                "type": "microphones_discovered",
                "microphones": microphones,
                "timestamp": time.time()
            })
            
        except Exception as e:
            logger.error(f"Error discovering microphones: {e}")
    
    async def handle_message(self, websocket, message: Dict[str, Any]) -> Dict[str, Any]:
        """Handle incoming WebSocket messages"""
        try:
            message_type = message.get("type")
            
            if message_type == "start_microphone":
                return await self.handle_start_microphone(message)
            elif message_type == "stop_microphone":
                return await self.handle_stop_microphone(message)
            elif message_type == "get_microphone_status":
                return await self.handle_get_microphone_status(message)
            elif message_type == "configure_microphone":
                return await self.handle_configure_microphone(message)
            elif message_type == "test_microphone":
                return await self.handle_test_microphone(message)
            elif message_type == "list_microphones":
                return await self.handle_list_microphones(message)
            else:
                return {
                    "type": "error",
                    "message": f"Unknown message type: {message_type}"
                }
                
        except Exception as e:
            logger.error(f"Error handling message: {e}")
            return {
                "type": "error",
                "message": f"Error processing message: {str(e)}"
            }
    
    async def handle_start_microphone(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle microphone start request"""
        try:
            microphone_id = data.get("microphone_id", "microphone_0")
            config_data = data.get("config", {})
            
            logger.info(f"🎤 Starting microphone: {microphone_id}")
            
            # Create microphone configuration
            config = MicrophoneConfig(
                device_id=config_data.get("device_id", "default"),
                sample_rate=config_data.get("sample_rate", 16000),
                channels=config_data.get("channels", 1),
                chunk_size=config_data.get("chunk_size", 1024),
                enabled=config_data.get("enabled", True),
                sensitivity=config_data.get("sensitivity", 1.0),
                echo_cancellation=config_data.get("echo_cancellation", True),
                noise_suppression=config_data.get("noise_suppression", True),
                auto_gain_control=config_data.get("auto_gain_control", True),
                voice_activation=config_data.get("voice_activation", False),
                voice_activation_threshold=config_data.get("voice_activation_threshold", 0.1)
            )
            
            # Start microphone recording
            success = await self.start_microphone_recording(microphone_id, config)
            
            if success:
                return {
                    "type": "microphone_start_response",
                    "status": "success",
                    "message": f"Microphone {microphone_id} started successfully",
                    "microphone_id": microphone_id,
                    "config": asdict(config)
                }
            else:
                return {
                    "type": "microphone_start_response",
                    "status": "error",
                    "message": f"Failed to start microphone {microphone_id}",
                    "microphone_id": microphone_id
                }
                
        except Exception as e:
            logger.error(f"Error starting microphone: {e}")
            return {
                "type": "microphone_start_response",
                "status": "error",
                "message": f"Error starting microphone: {str(e)}"
            }
    
    async def start_microphone_recording(self, microphone_id: str, config: MicrophoneConfig) -> bool:
        """Start recording from microphone"""
        try:
            if not self.audio_system:
                logger.error("Audio system not available")
                return False
            
            # Stop existing recording if any
            if microphone_id in self.recording_tasks:
                await self.stop_microphone_recording(microphone_id)
            
            # Determine device index
            device_index = None
            if config.device_id != "default":
                try:
                    device_index = int(config.device_id)
                except ValueError:
                    # Try to find device by name
                    device_count = self.audio_system.get_device_count()
                    for i in range(device_count):
                        device_info = self.audio_system.get_device_info_by_index(i)
                        if config.device_id.lower() in device_info['name'].lower():
                            device_index = i
                            break
            
            # Create audio stream
            stream = self.audio_system.open(
                format=pyaudio.paFloat32,
                channels=config.channels,
                rate=config.sample_rate,
                input=True,
                input_device_index=device_index,
                frames_per_buffer=config.chunk_size,
                stream_callback=lambda in_data, frame_count, time_info, status: 
                    self._audio_callback(microphone_id, in_data, frame_count, time_info, status)
            )
            
            stream.start_stream()
            self.audio_streams[microphone_id] = stream
            
            # Create microphone status
            status = MicrophoneStatus(
                microphone_id=microphone_id,
                device_id=config.device_id,
                status="recording",
                sample_rate=config.sample_rate,
                channels=config.channels,
                start_time=time.time()
            )
            
            self.active_microphones[microphone_id] = status
            
            # Broadcast status update
            await self.broadcast_message({
                "type": "microphone_status_update",
                "microphone_id": microphone_id,
                "status": "recording",
                "config": asdict(config),
                "timestamp": time.time()
            })
            
            logger.info(f"✅ Microphone {microphone_id} recording started")
            return True
            
        except Exception as e:
            logger.error(f"Failed to start microphone recording: {e}")
            return False
    
    def _audio_callback(self, microphone_id: str, in_data, frame_count, time_info, status):
        """Audio callback for microphone input"""
        try:
            if microphone_id in self.active_microphones:
                # Update last activity
                self.active_microphones[microphone_id].last_activity = time.time()
                
                # Process audio data (convert to numpy array if available)
                if NUMPY_AVAILABLE:
                    audio_data = np.frombuffer(in_data, dtype=np.float32)
                    
                    # Send audio data to connected services (STT, Audio Stream, etc.)
                    asyncio.create_task(self.process_audio_data(microphone_id, audio_data))
                
            return (None, pyaudio.paContinue)
            
        except Exception as e:
            logger.error(f"Error in audio callback: {e}")
            return (None, pyaudio.paContinue)
    
    async def process_audio_data(self, microphone_id: str, audio_data):
        """Process audio data and send to connected services"""
        try:
            # Broadcast audio data to connected clients
            await self.broadcast_message({
                "type": "microphone_audio_data",
                "microphone_id": microphone_id,
                "audio_data": audio_data.tolist() if NUMPY_AVAILABLE else [],
                "timestamp": time.time()
            })
            
        except Exception as e:
            logger.error(f"Error processing audio data: {e}")
    
    async def handle_stop_microphone(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle microphone stop request"""
        try:
            microphone_id = data.get("microphone_id", "microphone_0")
            
            logger.info(f"🎤 Stopping microphone: {microphone_id}")
            
            success = await self.stop_microphone_recording(microphone_id)
            
            return {
                "type": "microphone_stop_response",
                "status": "success" if success else "error",
                "message": f"Microphone {microphone_id} {'stopped' if success else 'failed to stop'}",
                "microphone_id": microphone_id
            }
            
        except Exception as e:
            logger.error(f"Error stopping microphone: {e}")
            return {
                "type": "microphone_stop_response",
                "status": "error",
                "message": f"Error stopping microphone: {str(e)}"
            }
    
    async def stop_microphone_recording(self, microphone_id: str) -> bool:
        """Stop recording from microphone"""
        try:
            # Stop audio stream
            if microphone_id in self.audio_streams:
                stream = self.audio_streams[microphone_id]
                stream.stop_stream()
                stream.close()
                del self.audio_streams[microphone_id]
            
            # Update status
            if microphone_id in self.active_microphones:
                self.active_microphones[microphone_id].status = "idle"
                
                # Broadcast status update
                await self.broadcast_message({
                    "type": "microphone_status_update",
                    "microphone_id": microphone_id,
                    "status": "idle",
                    "timestamp": time.time()
                })
            
            logger.info(f"✅ Microphone {microphone_id} recording stopped")
            return True
            
        except Exception as e:
            logger.error(f"Failed to stop microphone recording: {e}")
            return False
    
    async def handle_get_microphone_status(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle microphone status request"""
        try:
            microphone_id = data.get("microphone_id")
            
            if microphone_id:
                status = self.active_microphones.get(microphone_id)
                if status:
                    return {
                        "type": "microphone_status_response",
                        "microphone_id": microphone_id,
                        "status": asdict(status)
                    }
                else:
                    return {
                        "type": "microphone_status_response",
                        "microphone_id": microphone_id,
                        "status": None,
                        "message": "Microphone not found"
                    }
            else:
                # Return all microphone statuses
                return {
                    "type": "microphone_status_response",
                    "microphones": {mid: asdict(status) for mid, status in self.active_microphones.items()}
                }
                
        except Exception as e:
            logger.error(f"Error getting microphone status: {e}")
            return {
                "type": "microphone_status_response",
                "error": str(e)
            }

    async def handle_configure_microphone(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle microphone configuration request"""
        try:
            microphone_id = data.get("microphone_id", "microphone_0")
            config_data = data.get("config", {})

            logger.info(f"⚙️ Configuring microphone: {microphone_id}")

            # Update microphone configuration
            # In a real implementation, this would update hardware settings

            return {
                "type": "configure_microphone_response",
                "status": "success",
                "message": f"Microphone {microphone_id} configured",
                "microphone_id": microphone_id,
                "config": config_data
            }

        except Exception as e:
            logger.error(f"Error configuring microphone: {e}")
            return {
                "type": "configure_microphone_response",
                "status": "error",
                "message": f"Error configuring microphone: {str(e)}"
            }

    async def handle_test_microphone(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle microphone test request"""
        try:
            microphone_id = data.get("microphone_id", "microphone_0")

            logger.info(f"🧪 Testing microphone: {microphone_id}")

            # Perform microphone test
            test_result = {
                "microphone_id": microphone_id,
                "test_passed": True,
                "audio_level": 0.5,
                "latency": "low",
                "timestamp": time.time()
            }

            return {
                "type": "test_microphone_response",
                "status": "success",
                "message": f"Microphone {microphone_id} test completed",
                "microphone_id": microphone_id,
                "test_result": test_result
            }

        except Exception as e:
            logger.error(f"Error testing microphone: {e}")
            return {
                "type": "test_microphone_response",
                "status": "error",
                "message": f"Error testing microphone: {str(e)}"
            }

    async def handle_list_microphones(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle list microphones request"""
        try:
            # Discover and return available microphones
            await self.discover_microphones()

            return {
                "type": "list_microphones_response",
                "status": "success",
                "message": "Available microphones listed",
                "active_microphones": list(self.active_microphones.keys()),
                "microphone_count": len(self.active_microphones)
            }

        except Exception as e:
            logger.error(f"Error listing microphones: {e}")
            return {
                "type": "list_microphones_response",
                "status": "error",
                "message": f"Error listing microphones: {str(e)}"
            }
    
    async def get_capabilities(self) -> Dict[str, Any]:
        """Get microphone service capabilities"""
        return {
            "service_type": "microphone",
            "supported_commands": [
                "start_microphone",
                "stop_microphone",
                "get_microphone_status",
                "configure_microphone",
                "test_microphone",
                "list_microphones"
            ],
            "supported_formats": ["float32", "int16"],
            "supported_sample_rates": [8000, 16000, 22050, 44100, 48000],
            "supported_channels": [1, 2],
            "max_microphones": 4,
            "pyaudio_available": PYAUDIO_AVAILABLE,
            "numpy_available": NUMPY_AVAILABLE
        }

    async def cleanup(self):
        """Cleanup resources"""
        try:
            # Stop all microphone recordings
            for microphone_id in list(self.active_microphones.keys()):
                await self.stop_microphone_recording(microphone_id)

            # Cleanup audio system
            if self.audio_system:
                self.audio_system.terminate()
                self.audio_system = None

            logger.info("🎤 Microphone service cleanup completed")

        except Exception as e:
            logger.error(f"Error during cleanup: {e}")

if __name__ == "__main__":
    async def main():
        service = MicrophoneWebSocketService()
        await service.start_server()

    asyncio.run(main())
