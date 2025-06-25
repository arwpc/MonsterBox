#!/usr/bin/env python3

"""
Unified Jaw Animation Service for ChatterPi
Consolidates all audio processing and servo control to eliminate conflicts
"""

import asyncio
import json
import time
import threading
import logging
import numpy as np
from typing import Dict, Any, Optional
import websockets
from dataclasses import dataclass

# Hardware imports with fallbacks
try:
    import lgpio
    LGPIO_AVAILABLE = True
except ImportError:
    LGPIO_AVAILABLE = False
    print("Warning: lgpio not available, using simulation mode")

# Configure logging - MINIMAL VERBOSITY
logging.basicConfig(
    level=logging.WARNING,  # Only warnings and errors
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Suppress excessive logging
logging.getLogger('websockets').setLevel(logging.ERROR)
logging.getLogger('asyncio').setLevel(logging.ERROR)

@dataclass
class JawConfig:
    """Configuration for jaw animation"""
    # Servo settings (ChatterPi specific)
    servo_pin: int = 18
    jaw_closed_angle: float = 50.0  # Jaw closed position
    jaw_open_angle: float = 30.0    # Jaw fully open position
    
    # Audio processing
    volume_threshold: float = 0.01   # Minimum volume to trigger movement
    silence_timeout: float = 0.5     # Seconds of silence before closing jaw
    sensitivity: float = 2.0         # Audio sensitivity multiplier
    
    # Smoothing
    attack_time: float = 0.05        # Time to open jaw
    release_time: float = 0.15       # Time to close jaw
    smoothing_factor: float = 0.6    # Audio smoothing
    
    # Performance
    update_rate: float = 50.0        # Updates per second
    step_threshold: float = 1.0      # Minimum angle change to move servo

class ServoController:
    """Hardware servo controller with proper GPIO management"""
    
    def __init__(self, pin: int = 18):
        self.pin = pin
        self.gpio_handle = None
        self.current_angle = 50.0  # Start closed
        self.is_initialized = False
        
    def initialize(self) -> bool:
        """Initialize GPIO for servo control"""
        if not LGPIO_AVAILABLE:
            logger.warning("GPIO not available - using simulation mode")
            self.is_initialized = True
            return True
            
        try:
            self.gpio_handle = lgpio.gpiochip_open(0)
            lgpio.gpio_claim_output(self.gpio_handle, self.pin)
            self.is_initialized = True
            logger.info(f"✅ Servo controller initialized on GPIO {self.pin}")
            return True
        except Exception as e:
            logger.error(f"Failed to initialize servo: {e}")
            return False
    
    def set_angle(self, angle: float) -> bool:
        """Set servo to specific angle"""
        if not self.is_initialized:
            return False
            
        # Clamp angle to safe range
        angle = max(30.0, min(50.0, angle))
        
        if not LGPIO_AVAILABLE:
            self.current_angle = angle
            return True
            
        try:
            # Convert angle to pulse width (1000-2000µs range)
            pulse_width = 1000 + ((angle - 0) / 180) * 1000
            
            # Set servo position
            lgpio.tx_servo(self.gpio_handle, self.pin, int(pulse_width), 50, 0, 1)
            self.current_angle = angle
            return True
        except Exception as e:
            logger.error(f"Error setting servo angle: {e}")
            return False
    
    def cleanup(self):
        """Clean up GPIO resources"""
        if self.gpio_handle and LGPIO_AVAILABLE:
            try:
                lgpio.tx_servo(self.gpio_handle, self.pin, 0)  # Stop PWM
                lgpio.gpio_free(self.gpio_handle, self.pin)
                lgpio.gpiochip_close(self.gpio_handle)
            except:
                pass

class AudioProcessor:
    """Real-time audio processing for jaw animation"""
    
    def __init__(self, config: JawConfig):
        self.config = config
        self.smoothed_volume = 0.0
        self.last_voice_time = 0.0
        self.is_voice_active = False
        
    def process_audio_data(self, audio_data: bytes) -> Dict[str, Any]:
        """Process audio data and return jaw control information"""
        try:
            # Convert bytes to numpy array
            if isinstance(audio_data, str):
                # Handle base64 encoded data
                import base64
                audio_data = base64.b64decode(audio_data)
            
            # Convert to float array
            audio_array = np.frombuffer(audio_data, dtype=np.int16).astype(np.float32) / 32768.0
            
            # Calculate RMS amplitude
            rms_amplitude = np.sqrt(np.mean(audio_array ** 2))
            
            # Apply sensitivity
            adjusted_amplitude = rms_amplitude * self.config.sensitivity
            
            # Smooth the amplitude
            alpha = 0.3  # Smoothing factor
            self.smoothed_volume = (alpha * adjusted_amplitude + 
                                  (1 - alpha) * self.smoothed_volume)
            
            # Voice activity detection
            current_time = time.time()
            if self.smoothed_volume > self.config.volume_threshold:
                self.last_voice_time = current_time
                self.is_voice_active = True
            else:
                # Check silence timeout
                silence_duration = current_time - self.last_voice_time
                if silence_duration > self.config.silence_timeout:
                    self.is_voice_active = False
            
            # Calculate target jaw angle
            if self.is_voice_active:
                # Map volume to jaw opening (30° = fully open, 50° = closed)
                volume_normalized = min(1.0, self.smoothed_volume / 0.1)  # Normalize to 0-1
                jaw_opening = volume_normalized * (self.config.jaw_closed_angle - self.config.jaw_open_angle)
                target_angle = self.config.jaw_closed_angle - jaw_opening
            else:
                # Close jaw during silence
                target_angle = self.config.jaw_closed_angle
            
            return {
                'raw_amplitude': float(rms_amplitude),
                'smoothed_volume': float(self.smoothed_volume),
                'voice_active': self.is_voice_active,
                'target_angle': float(target_angle),
                'timestamp': current_time
            }
            
        except Exception as e:
            logger.error(f"Audio processing error: {e}")
            return {
                'raw_amplitude': 0.0,
                'smoothed_volume': 0.0,
                'voice_active': False,
                'target_angle': self.config.jaw_closed_angle,
                'timestamp': time.time()
            }

class UnifiedJawAnimationService:
    """Main service class for jaw animation"""
    
    def __init__(self, port: int = 8765, host: str = "0.0.0.0"):
        self.port = port
        self.host = host
        self.config = JawConfig()
        
        # Components
        self.servo_controller = ServoController(self.config.servo_pin)
        self.audio_processor = AudioProcessor(self.config)
        
        # State
        self.connected_clients = set()
        self.is_running = False
        self.animation_active = False
        self.last_angle = self.config.jaw_closed_angle
        
        # Statistics
        self.stats = {
            'start_time': 0,
            'audio_frames_processed': 0,
            'servo_updates': 0,
            'client_connections': 0
        }
    
    async def start(self):
        """Start the WebSocket server"""
        if not self.servo_controller.initialize():
            logger.error("Failed to initialize servo controller")
            return False
        
        self.is_running = True
        self.stats['start_time'] = time.time()
        
        # Start WebSocket server
        logger.info(f"🦴 Starting Unified Jaw Animation Service on {self.host}:{self.port}")
        
        try:
            async with websockets.serve(self.handle_client, self.host, self.port):
                logger.info(f"✅ Jaw Animation Service running on port {self.port}")
                await asyncio.Future()  # Run forever
        except Exception as e:
            logger.error(f"Server error: {e}")
            return False
    
    async def handle_client(self, websocket, path):
        """Handle WebSocket client connections"""
        client_id = f"client_{len(self.connected_clients)}_{id(websocket)}"
        self.connected_clients.add(websocket)
        self.stats['client_connections'] += 1
        
        try:
            async for message in websocket:
                try:
                    data = json.loads(message)
                    await self.process_message(websocket, data)
                except json.JSONDecodeError:
                    await self.send_error(websocket, "Invalid JSON")
                except Exception as e:
                    logger.error(f"Message processing error: {e}")
                    await self.send_error(websocket, str(e))
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            self.connected_clients.discard(websocket)
    
    async def process_message(self, websocket, data: Dict[str, Any]):
        """Process incoming WebSocket messages"""
        message_type = data.get('type', '')
        
        if message_type == 'jaw_move':
            # Direct servo control
            angle = float(data.get('angle', self.config.jaw_closed_angle))
            await self.move_jaw_to_angle(angle)
            await self.send_response(websocket, 'jaw_move_response', {
                'success': True,
                'angle': angle
            })
        
        elif message_type == 'audio_data':
            # Process audio for animation
            audio_data = data.get('data', b'')
            result = self.audio_processor.process_audio_data(audio_data)
            self.stats['audio_frames_processed'] += 1
            
            # Update servo if significant change
            target_angle = result['target_angle']
            if abs(target_angle - self.last_angle) >= self.config.step_threshold:
                await self.move_jaw_to_angle(target_angle)
            
            await self.send_response(websocket, 'audio_processed', result)
        
        elif message_type == 'start_animation':
            self.animation_active = True
            await self.send_response(websocket, 'animation_started', {'status': 'active'})
        
        elif message_type == 'stop_animation':
            self.animation_active = False
            await self.move_jaw_to_angle(self.config.jaw_closed_angle)
            await self.send_response(websocket, 'animation_stopped', {'status': 'inactive'})
        
        elif message_type == 'get_status':
            await self.send_response(websocket, 'status', {
                'animation_active': self.animation_active,
                'current_angle': self.last_angle,
                'stats': self.stats
            })
    
    async def move_jaw_to_angle(self, angle: float):
        """Move jaw to specified angle"""
        if self.servo_controller.set_angle(angle):
            self.last_angle = angle
            self.stats['servo_updates'] += 1
    
    async def send_response(self, websocket, message_type: str, data: Dict[str, Any]):
        """Send response to client"""
        try:
            response = {'type': message_type, **data}
            await websocket.send(json.dumps(response))
        except:
            pass  # Client disconnected
    
    async def send_error(self, websocket, error: str):
        """Send error message to client"""
        await self.send_response(websocket, 'error', {'message': error})
    
    def cleanup(self):
        """Clean up resources"""
        self.servo_controller.cleanup()

async def main():
    """Main function"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Unified Jaw Animation Service')
    parser.add_argument('--port', type=int, default=8765, help='WebSocket port')
    parser.add_argument('--host', default='0.0.0.0', help='WebSocket host')
    parser.add_argument('--servo-pin', type=int, default=18, help='GPIO pin for servo')
    
    args = parser.parse_args()
    
    service = UnifiedJawAnimationService(port=args.port, host=args.host)
    service.config.servo_pin = args.servo_pin
    
    try:
        await service.start()
    except KeyboardInterrupt:
        logger.info("Received interrupt signal")
    finally:
        service.cleanup()

if __name__ == "__main__":
    asyncio.run(main())
