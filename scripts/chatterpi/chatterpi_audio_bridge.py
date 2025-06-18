#!/usr/bin/env python3
"""
ChatterPi Audio Bridge
Connects the ChatterPi chat interface to the animation system
Handles browser audio output and real-time animatronic control
Supports multiple animation outputs and extensible audio processing
"""

import asyncio
import websockets
import json
import logging
import base64
import time
import sys
import os
from typing import Dict, Any, Optional, Set
import argparse

# Add current directory to path for imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from chatterpi_animation_system import ChatterPiAnimationSystem, ChatterPiAnimationConfig
from generic_audio_stream_handler import AudioStreamConfig, AudioSourceType

logger = logging.getLogger(__name__)

# Import OpenAI Whisper STT integration
try:
    from openai_stt_integration import OpenAISTTIntegration
    OPENAI_STT_AVAILABLE = True
except ImportError as e:
    logger.warning(f"OpenAI Whisper STT integration not available: {e}")
    OPENAI_STT_AVAILABLE = False

class ChatterPiAudioBridge:
    """
    Audio bridge that connects browser audio to ChatterPi animation system
    Handles real-time audio streaming and animatronic control
    Supports multiple animation outputs with extensible architecture
    """

    def __init__(self, host: str = "localhost", port: int = 8767):
        self.host = host
        self.port = port

        # Initialize ChatterPi animation system
        config = ChatterPiAnimationConfig(
            enable_microphone=False,  # We'll get audio from browser
            enable_websocket=True,
            audio_config=AudioStreamConfig(
                animation_profile="enhanced_smoothing",
                volume_threshold=0.003,
                smoothing_attack=0.05,  # Faster attack for speech
                smoothing_release=0.02,  # Faster release for natural movement
                servo_step_threshold=0.5,  # More responsive
                jaw_closed_angle=50.0,
                jaw_open_angle=30.0
            )
        )

        self.animation_system = ChatterPiAnimationSystem(config)

        # Initialize OpenAI Whisper STT integration if available
        self.stt_integration = None
        if OPENAI_STT_AVAILABLE:
            try:
                self.stt_integration = OpenAISTTIntegration({
                    'language': 'en',
                    'confidenceThreshold': 0.7,
                    'chunkDuration': 2000
                })
                # Set up STT event handlers
                self.stt_integration.on('speech_recognized', self.handle_speech_recognized)
                self.stt_integration.on('error', self.handle_stt_error)
                logger.info("✅ STT integration initialized")
            except Exception as e:
                logger.warning(f"Failed to initialize STT: {e}")

        # WebSocket server state
        self.server = None
        self.clients: Set[websockets.WebSocketServerProtocol] = set()
        self.is_running = False
        
        # Audio processing state
        self.current_audio_session = None
        self.session_stats = {
            'sessions_started': 0,
            'audio_frames_processed': 0,
            'jaw_updates': 0,
            'start_time': None
        }
        
        logger.info(f"ChatterPi Audio Bridge initialized on {host}:{port}")

    async def start_server(self):
        """Start the WebSocket server"""
        try:
            # Start the animation system
            if not self.animation_system.start_system():
                logger.error("Failed to start ChatterPi animation system")
                return False

            # Initialize STT integration
            if self.stt_integration:
                await self.stt_integration.initialize()
            
            # Start WebSocket server
            self.server = await websockets.serve(
                self.handle_client,
                self.host,
                self.port,
                ping_interval=30,
                ping_timeout=10
            )
            
            self.is_running = True
            self.session_stats['start_time'] = time.time()
            
            logger.info(f"🚀 ChatterPi Audio Bridge running on ws://{self.host}:{self.port}")
            logger.info("🎭 Ready to receive audio for animatronic control")
            
            # Keep server running
            await self.server.wait_closed()
            
        except Exception as e:
            logger.error(f"❌ Server error: {e}")
            return False
        finally:
            await self.cleanup()
    
    async def handle_client(self, websocket, path):
        """Handle WebSocket client connections"""
        client_id = f"chatterpi_client_{len(self.clients)}_{id(websocket)}"
        self.clients.add(websocket)
        
        logger.info(f"✅ ChatterPi client connected: {client_id}")
        
        try:
            # Send welcome message
            await websocket.send(json.dumps({
                'type': 'welcome',
                'client_id': client_id,
                'system_status': self.animation_system.get_system_status(),
                'timestamp': time.time()
            }))
            
            async for message in websocket:
                try:
                    await self.handle_message(client_id, websocket, message)
                except Exception as e:
                    logger.error(f"Error handling message from {client_id}: {e}")
                    await self.send_error(websocket, f"Message processing error: {str(e)}")
        
        except websockets.exceptions.ConnectionClosed:
            logger.info(f"Client {client_id} disconnected")
        except Exception as e:
            logger.error(f"Error with client {client_id}: {e}")
        finally:
            self.clients.discard(websocket)
            logger.info(f"🔌 Client {client_id} removed")
    
    async def handle_message(self, client_id: str, websocket, message_data: str):
        """Handle incoming WebSocket messages"""
        try:
            message = json.loads(message_data)
            message_type = message.get('type', 'unknown')
            
            logger.debug(f"Received {message_type} from {client_id}")
            
            if message_type == 'start_audio_session':
                await self.handle_start_audio_session(websocket, message)
            
            elif message_type == 'stop_audio_session':
                await self.handle_stop_audio_session(websocket, message)
            
            elif message_type == 'audio_data':
                await self.handle_audio_data(websocket, message)
            
            elif message_type == 'tts_audio':
                await self.handle_tts_audio(websocket, message)
            
            elif message_type == 'manual_jaw_move':
                await self.handle_manual_jaw_move(websocket, message)
            
            elif message_type == 'update_config':
                await self.handle_update_config(websocket, message)
            
            elif message_type == 'get_status':
                await self.handle_get_status(websocket, message)

            elif message_type == 'enable_stt':
                await self.handle_enable_stt(websocket, message)

            elif message_type == 'disable_stt':
                await self.handle_disable_stt(websocket, message)

            else:
                await self.send_error(websocket, f"Unknown message type: {message_type}")
        
        except json.JSONDecodeError:
            await self.send_error(websocket, "Invalid JSON message")
        except Exception as e:
            logger.error(f"Error handling message: {e}")
            await self.send_error(websocket, f"Message handling error: {str(e)}")
    
    async def handle_start_audio_session(self, websocket, message):
        """Start a new audio session for jaw animation"""
        try:
            session_config = message.get('config', {})
            
            # Update animation profile if specified
            if 'animation_profile' in session_config:
                self.animation_system.update_animation_profile(session_config['animation_profile'])

            # Update primary animatronic angles if specified
            if 'jaw_closed_angle' in session_config and 'jaw_open_angle' in session_config:
                self.animation_system.update_primary_angles(
                    session_config['jaw_closed_angle'],
                    session_config['jaw_open_angle']
                )
            
            self.current_audio_session = {
                'client_id': message.get('client_id'),
                'start_time': time.time(),
                'config': session_config
            }
            
            self.session_stats['sessions_started'] += 1
            
            await websocket.send(json.dumps({
                'type': 'audio_session_started',
                'session_id': self.current_audio_session,
                'system_status': self.animation_system.get_system_status(),
                'timestamp': time.time()
            }))

            logger.info(f"🎤 Audio session started for animatronic control")
        
        except Exception as e:
            logger.error(f"Error starting audio session: {e}")
            await self.send_error(websocket, f"Failed to start audio session: {str(e)}")
    
    async def handle_stop_audio_session(self, websocket, message):
        """Stop the current audio session"""
        try:
            if self.current_audio_session:
                session_duration = time.time() - self.current_audio_session['start_time']
                logger.info(f"🛑 Audio session stopped (duration: {session_duration:.1f}s)")
                self.current_audio_session = None
            
            # Stop any active TTS streaming
            self.animation_system.stop_tts_streaming()
            
            await websocket.send(json.dumps({
                'type': 'audio_session_stopped',
                'timestamp': time.time()
            }))
        
        except Exception as e:
            logger.error(f"Error stopping audio session: {e}")
            await self.send_error(websocket, f"Failed to stop audio session: {str(e)}")
    
    async def handle_audio_data(self, websocket, message):
        """Handle real-time audio data from browser"""
        try:
            # Extract audio data (base64 encoded)
            audio_b64 = message.get('data')
            if not audio_b64:
                await self.send_error(websocket, "No audio data provided")
                return
            
            # Decode audio data
            audio_bytes = base64.b64decode(audio_b64)
            
            # Get metadata
            sample_rate = message.get('sample_rate', 16000)
            format_type = message.get('format', 'pcm')
            metadata = message.get('metadata', {})
            
            # Add audio data to the stream handler for jaw animation
            self.animation_system.stream_handler.add_audio_data(
                audio_bytes,
                AudioSourceType.WEBSOCKET_STREAM,
                sample_rate,
                metadata
            )

            # Process audio for STT if enabled
            if self.stt_integration:
                try:
                    await self.stt_integration.processAudioData(audio_bytes, {
                        'sample_rate': sample_rate,
                        'format': format_type,
                        'timestamp': time.time(),
                        **metadata
                    })
                except Exception as e:
                    logger.debug(f"STT processing error: {e}")

            self.session_stats['audio_frames_processed'] += 1
            
            # Send acknowledgment (optional, for debugging)
            if message.get('request_ack'):
                await websocket.send(json.dumps({
                    'type': 'audio_data_ack',
                    'frame_count': self.session_stats['audio_frames_processed'],
                    'timestamp': time.time()
                }))
        
        except Exception as e:
            logger.error(f"Error handling audio data: {e}")
            await self.send_error(websocket, f"Audio data processing error: {str(e)}")
    
    async def handle_tts_audio(self, websocket, message):
        """Handle TTS audio for jaw animation"""
        try:
            # Get TTS audio data
            audio_data = message.get('audio_data')
            source_type = message.get('source_type', 'buffer')  # 'buffer' or 'url'
            metadata = message.get('metadata', {})
            
            if not audio_data:
                await self.send_error(websocket, "No TTS audio data provided")
                return
            
            # If base64 encoded, decode it
            if source_type == 'buffer' and isinstance(audio_data, str):
                try:
                    audio_data = base64.b64decode(audio_data)
                except:
                    pass  # Assume it's already bytes or a URL
            
            # Stream TTS audio
            success = self.animation_system.stream_tts_audio(
                audio_data,
                source_type,
                metadata
            )

            if success:
                await websocket.send(json.dumps({
                    'type': 'tts_audio_started',
                    'metadata': metadata,
                    'timestamp': time.time()
                }))
                logger.info("🎤 TTS audio streaming started for animatronic control")
            else:
                await self.send_error(websocket, "Failed to start TTS audio streaming")
        
        except Exception as e:
            logger.error(f"Error handling TTS audio: {e}")
            await self.send_error(websocket, f"TTS audio processing error: {str(e)}")
    
    async def handle_manual_jaw_move(self, websocket, message):
        """Handle manual jaw movement commands"""
        try:
            angle = message.get('angle')
            duration = message.get('duration', 0.5)
            
            if angle is None:
                await self.send_error(websocket, "Angle parameter required")
                return
            
            success = self.animation_system.manual_primary_move(angle, duration)
            
            await websocket.send(json.dumps({
                'type': 'jaw_move_response',
                'success': success,
                'angle': angle,
                'duration': duration,
                'timestamp': time.time()
            }))
        
        except Exception as e:
            logger.error(f"Error handling manual jaw move: {e}")
            await self.send_error(websocket, f"Jaw movement error: {str(e)}")
    
    async def handle_update_config(self, websocket, message):
        """Handle configuration updates"""
        try:
            config = message.get('config', {})
            
            # Update animation profile
            if 'animation_profile' in config:
                self.animation_system.update_animation_profile(config['animation_profile'])

            # Update primary animatronic angles
            if 'jaw_closed_angle' in config and 'jaw_open_angle' in config:
                self.animation_system.update_primary_angles(
                    config['jaw_closed_angle'],
                    config['jaw_open_angle']
                )

            # Update audio processing parameters
            if 'volume_threshold' in config:
                self.animation_system.stream_handler.config.volume_threshold = config['volume_threshold']

            if 'smoothing_attack' in config:
                self.animation_system.stream_handler.config.smoothing_attack = config['smoothing_attack']

            if 'smoothing_release' in config:
                self.animation_system.stream_handler.config.smoothing_release = config['smoothing_release']
            
            await websocket.send(json.dumps({
                'type': 'config_updated',
                'config': config,
                'system_status': self.animation_system.get_system_status(),
                'timestamp': time.time()
            }))
            
            logger.info(f"🔧 Configuration updated: {config}")
        
        except Exception as e:
            logger.error(f"Error updating config: {e}")
            await self.send_error(websocket, f"Config update error: {str(e)}")
    
    async def handle_get_status(self, websocket, message):
        """Handle status requests"""
        try:
            status = {
                'system_status': self.animation_system.get_system_status(),
                'bridge_stats': self.session_stats,
                'current_session': self.current_audio_session,
                'connected_clients': len(self.clients),
                'timestamp': time.time()
            }
            
            await websocket.send(json.dumps({
                'type': 'status_response',
                'status': status,
                'timestamp': time.time()
            }))
        
        except Exception as e:
            logger.error(f"Error getting status: {e}")
            await self.send_error(websocket, f"Status error: {str(e)}")

    async def handle_enable_stt(self, websocket, message):
        """Enable STT processing"""
        try:
            if not self.stt_integration:
                await self.send_error(websocket, "STT integration not available")
                return

            config = message.get('config', {})

            # Update STT configuration if provided
            if 'language' in config:
                self.stt_integration.config['language'] = config['language']
            if 'confidenceThreshold' in config:
                self.stt_integration.config['confidenceThreshold'] = config['confidenceThreshold']

            await websocket.send(json.dumps({
                'type': 'stt_enabled',
                'config': self.stt_integration.config,
                'timestamp': time.time()
            }))

            logger.info("🎤 STT processing enabled")

        except Exception as e:
            logger.error(f"Error enabling STT: {e}")
            await self.send_error(websocket, f"STT enable error: {str(e)}")

    async def handle_disable_stt(self, websocket, message):
        """Disable STT processing"""
        try:
            if self.stt_integration:
                self.stt_integration.clearBuffer()

            await websocket.send(json.dumps({
                'type': 'stt_disabled',
                'timestamp': time.time()
            }))

            logger.info("🔇 STT processing disabled")

        except Exception as e:
            logger.error(f"Error disabling STT: {e}")
            await self.send_error(websocket, f"STT disable error: {str(e)}")

    def handle_speech_recognized(self, event_data):
        """Handle speech recognition results"""
        try:
            logger.info(f"🗣️ Speech recognized: '{event_data['text']}' (confidence: {event_data['confidence']:.2f})")

            # Broadcast speech recognition result to all connected clients
            message = json.dumps({
                'type': 'speech_recognized',
                'text': event_data['text'],
                'confidence': event_data['confidence'],
                'provider': event_data['provider'],
                'timestamp': event_data['timestamp']
            })

            # Send to all connected clients
            asyncio.create_task(self.broadcast_to_clients(message))

        except Exception as e:
            logger.error(f"Error handling speech recognition: {e}")

    def handle_stt_error(self, error):
        """Handle STT errors"""
        logger.error(f"STT error: {error}")

        # Broadcast error to clients
        message = json.dumps({
            'type': 'stt_error',
            'error': str(error),
            'timestamp': time.time()
        })

        asyncio.create_task(self.broadcast_to_clients(message))

    async def broadcast_to_clients(self, message):
        """Broadcast message to all connected clients"""
        if self.clients:
            await asyncio.gather(
                *[client.send(message) for client in self.clients],
                return_exceptions=True
            )

    async def send_error(self, websocket, error_message: str):
        """Send error message to client"""
        try:
            await websocket.send(json.dumps({
                'type': 'error',
                'error': error_message,
                'timestamp': time.time()
            }))
        except:
            pass  # Client might be disconnected
    
    async def cleanup(self):
        """Cleanup resources"""
        try:
            self.is_running = False
            
            # Stop STT integration
            if self.stt_integration:
                self.stt_integration.stop()

            # Stop animation system
            self.animation_system.stop_system()

            # Close all client connections
            if self.clients:
                await asyncio.gather(
                    *[client.close() for client in self.clients],
                    return_exceptions=True
                )
            
            logger.info("✅ ChatterPi Audio Bridge cleanup complete")
        
        except Exception as e:
            logger.error(f"Error during cleanup: {e}")

async def main():
    """Main function to run the audio bridge"""
    parser = argparse.ArgumentParser(description="ChatterPi Audio Bridge")
    parser.add_argument("--host", default="localhost", help="Server host")
    parser.add_argument("--port", type=int, default=8767, help="Server port")
    parser.add_argument("--debug", action="store_true", help="Enable debug logging")

    args = parser.parse_args()

    # Configure logging
    log_level = logging.DEBUG if args.debug else logging.INFO
    logging.basicConfig(
        level=log_level,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )

    # Create and start bridge
    bridge = ChatterPiAudioBridge(args.host, args.port)
    
    try:
        await bridge.start_server()
    except KeyboardInterrupt:
        logger.info("⚠️ Bridge interrupted by user")
    except Exception as e:
        logger.error(f"❌ Bridge error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
