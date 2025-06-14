#!/usr/bin/env python3
"""
GPIO Jaw WebSocket Server for ChatterPi
Uses RPi.GPIO for servo control on RPI4b hardware
"""

import asyncio
import websockets
import json
import logging
import time
import threading
from typing import Dict, Any

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

try:
    import lgpio
    GPIO_AVAILABLE = True
    logger.info("✅ lgpio available")
except ImportError:
    GPIO_AVAILABLE = False
    logger.warning("⚠️ lgpio not available - running in simulation mode")

class GPIOJawControl:
    """GPIO-based jaw control using lgpio"""

    def __init__(self, pin=18):
        self.pin = pin
        self.current_angle = 0
        self.is_moving = False
        self.gpio_handle = None
        self.initialized = False
        
    def initialize(self):
        """Initialize GPIO and PWM"""
        if not GPIO_AVAILABLE:
            logger.warning("GPIO not available - simulation mode")
            self.initialized = True
            return True

        try:
            # Open GPIO chip
            self.gpio_handle = lgpio.gpiochip_open(0)

            # Try to free the pin first in case it's already claimed
            try:
                lgpio.gpio_free(self.gpio_handle, self.pin)
            except:
                pass  # Pin wasn't claimed, that's fine

            # Set pin as output
            lgpio.gpio_claim_output(self.gpio_handle, self.pin)

            # Set to neutral position
            self.set_angle(0)

            self.initialized = True
            logger.info(f"✅ lgpio jaw control initialized on pin {self.pin}")
            return True

        except Exception as e:
            logger.error(f"❌ Failed to initialize lgpio: {e}")
            return False
    
    def cleanup(self):
        """Clean up GPIO"""
        if GPIO_AVAILABLE and self.gpio_handle:
            try:
                lgpio.gpiochip_close(self.gpio_handle)
                self.gpio_handle = None
                self.initialized = False
                logger.info("✅ lgpio cleaned up")
            except Exception as e:
                logger.error(f"Error cleaning up lgpio: {e}")
    
    def angle_to_pulse_width(self, angle):
        """Convert angle (0-180) to pulse width in microseconds"""
        # Standard servo: 1000-2000 microseconds
        # 0° = 1000µs, 90° = 1500µs, 180° = 2000µs
        min_pulse = 1000  # microseconds
        max_pulse = 2000  # microseconds

        # Clamp angle
        angle = max(0, min(180, angle))

        # Calculate pulse width
        pulse_width = min_pulse + (angle / 180.0) * (max_pulse - min_pulse)
        return int(pulse_width)
    
    def set_angle(self, angle):
        """Set servo to specific angle with jitter reduction"""
        if not self.initialized:
            return False

        # Implement deadband to reduce jitter
        if hasattr(self, 'last_angle') and abs(angle - self.last_angle) < 0.5:
            return True  # Skip micro-movements

        self.current_angle = angle

        if GPIO_AVAILABLE and self.gpio_handle:
            try:
                pulse_width = self.angle_to_pulse_width(angle)
                # Set PWM (20ms period = 50Hz, pulse width in microseconds)
                lgpio.tx_pwm(self.gpio_handle, self.pin, 50, pulse_width / 20000.0 * 100)

                # Store last angle for deadband comparison
                self.last_angle = angle

                logger.info(f"🦴 Servo moved to {angle}° (pulse: {pulse_width}µs)")
                return True
            except Exception as e:
                logger.error(f"Error setting servo angle: {e}")
                return False
        else:
            self.last_angle = angle  # Track simulated movements too
            logger.info(f"🦴 Simulated servo move to {angle}°")
            return True

    def stop_servo(self):
        """Stop PWM signal to reduce jitter when idle"""
        if GPIO_AVAILABLE and self.gpio_handle:
            try:
                lgpio.tx_pwm(self.gpio_handle, self.pin, 0, 0)  # Stop PWM
                logger.info("🦴 Servo PWM stopped to reduce jitter")
                return True
            except Exception as e:
                logger.error(f"Error stopping servo PWM: {e}")
                return False
        else:
            logger.info("🦴 Simulated servo PWM stop")
            return True
    
    async def move_to_angle(self, target_angle, duration=0.5):
        """Move servo to target angle with smooth transition"""
        if self.is_moving:
            return False
            
        self.is_moving = True
        start_angle = self.current_angle
        
        try:
            # Smooth movement
            steps = max(10, int(duration * 20))  # 20 steps per second
            step_delay = duration / steps
            
            for i in range(steps + 1):
                progress = i / steps
                current_angle = start_angle + (target_angle - start_angle) * progress
                self.set_angle(current_angle)
                await asyncio.sleep(step_delay)
            
            # Ensure final position
            self.set_angle(target_angle)
            
        finally:
            self.is_moving = False
        
        return True

class GPIOJawWebSocketServer:
    """WebSocket server for GPIO jaw control"""
    
    def __init__(self, host="0.0.0.0", port=8765, servo_pin=18):
        self.host = host
        self.port = port
        self.servo_pin = servo_pin
        self.clients = {}
        self.client_counter = 0
        
        # Initialize jaw control
        self.jaw_control = GPIOJawControl(servo_pin)
        
    async def register_client(self, websocket, path):
        """Register new client"""
        client_id = f"jaw_client_{self.client_counter}_{int(time.time())}"
        self.client_counter += 1
        
        self.clients[client_id] = websocket
        
        logger.info(f"✅ Client connected: {client_id}")
        
        # Send welcome message
        welcome = {
            "type": "welcome",
            "client_id": client_id,
            "server_info": {
                "version": "1.0.0",
                "servo_pin": self.servo_pin,
                "gpio_available": GPIO_AVAILABLE,
                "capabilities": ["jaw_control", "position_feedback", "status_monitoring"]
            },
            "timestamp": time.time()
        }
        
        await websocket.send(json.dumps(welcome))
        return client_id
    
    async def handle_message(self, client_id, message_data):
        """Handle incoming message"""
        try:
            message = json.loads(message_data)
            message_type = message.get("type", "unknown")
            
            logger.info(f"Received {message_type} from {client_id}")
            
            websocket = self.clients[client_id]
            
            if message_type == "jaw_move":
                await self.handle_jaw_move(websocket, message)
            elif message_type == "jaw_stop":
                await self.handle_jaw_stop(websocket, message)
            elif message_type == "stop_servo":
                await self.handle_stop_servo(websocket, message)
            elif message_type == "safe_shutdown":
                await self.handle_safe_shutdown(websocket, message)
            elif message_type == "get_status":
                await self.handle_get_status(websocket, message)
            elif message_type == "configure_servo":
                await self.handle_configure_servo(websocket, message)
            elif message_type == "ping":
                await self.handle_ping(websocket, message)
            else:
                await self.send_error(websocket, f"Unknown message type: {message_type}")
                
        except json.JSONDecodeError:
            await self.send_error(websocket, "Invalid JSON format")
        except Exception as e:
            logger.error(f"Error handling message: {e}")
            await self.send_error(websocket, f"Internal server error: {str(e)}")
    
    async def handle_jaw_move(self, websocket, message):
        """Handle jaw movement command"""
        angle = message.get("angle", 0)
        duration = message.get("duration", 0.5)
        curve_type = message.get("curve_type", "linear")
        
        if not isinstance(angle, (int, float)) or not (0 <= angle <= 180):
            await self.send_error(websocket, "Angle must be a number between 0 and 180")
            return
        
        logger.info(f"🦴 Moving jaw to {angle}° (duration: {duration}s)")
        
        # Send movement started confirmation
        response = {
            "type": "jaw_move_started",
            "angle": angle,
            "duration": duration,
            "curve_type": curve_type,
            "timestamp": time.time()
        }
        await websocket.send(json.dumps(response))
        
        # Perform the movement
        success = await self.jaw_control.move_to_angle(angle, duration)
        
        if success:
            # Send completion confirmation
            completion = {
                "type": "jaw_move_completed",
                "angle": angle,
                "timestamp": time.time()
            }
            await websocket.send(json.dumps(completion))
        else:
            await self.send_error(websocket, "Failed to move jaw")
    
    async def handle_jaw_stop(self, websocket, message):
        """Handle jaw stop command"""
        # For now, just acknowledge
        response = {
            "type": "jaw_stopped",
            "timestamp": time.time()
        }
        await websocket.send(json.dumps(response))

    async def handle_stop_servo(self, websocket, message):
        """Handle stop servo command"""
        success = self.jaw_control.stop_servo()

        response = {
            "type": "servo_stopped" if success else "error",
            "timestamp": time.time()
        }

        if not success:
            response["error"] = "Failed to stop servo"

        await websocket.send(json.dumps(response))

    async def handle_safe_shutdown(self, websocket, message):
        """Handle safe shutdown command"""
        logger.info("🛑 Safe shutdown requested")

        # Call safe shutdown on jaw control if it has the method
        if hasattr(self.jaw_control, 'safe_shutdown'):
            self.jaw_control.safe_shutdown()
        else:
            # Fallback to stop servo
            self.jaw_control.stop_servo()

        response = {
            "type": "shutdown_complete",
            "timestamp": time.time()
        }

        await websocket.send(json.dumps(response))
    
    async def handle_get_status(self, websocket, message):
        """Handle status request"""
        status = {
            "type": "status_response",
            "jaw_status": {
                "current_position": self.jaw_control.current_angle,
                "is_moving": self.jaw_control.is_moving,
                "servo_pin": self.servo_pin,
                "gpio_available": GPIO_AVAILABLE
            },
            "timestamp": time.time()
        }
        await websocket.send(json.dumps(status))
    
    async def handle_configure_servo(self, websocket, message):
        """Handle servo configuration"""
        pin = message.get("pin", self.servo_pin)
        
        # For now, just acknowledge the configuration
        response = {
            "type": "servo_configured",
            "pin": pin,
            "timestamp": time.time()
        }
        await websocket.send(json.dumps(response))
    
    async def handle_ping(self, websocket, message):
        """Handle ping request"""
        response = {
            "type": "pong",
            "timestamp": time.time()
        }
        await websocket.send(json.dumps(response))
    
    async def send_error(self, websocket, error_message):
        """Send error message"""
        response = {
            "type": "error",
            "error": error_message,
            "timestamp": time.time()
        }
        await websocket.send(json.dumps(response))
    
    async def handle_client(self, websocket, path):
        """Handle client connection"""
        client_id = await self.register_client(websocket, path)
        
        try:
            async for message in websocket:
                await self.handle_message(client_id, message)
        except websockets.exceptions.ConnectionClosed:
            logger.info(f"Client {client_id} disconnected")
        except Exception as e:
            logger.error(f"Error with client {client_id}: {e}")
        finally:
            if client_id in self.clients:
                del self.clients[client_id]
    
    async def start_server(self):
        """Start the WebSocket server"""
        # Initialize jaw control
        if not self.jaw_control.initialize():
            logger.error("Failed to initialize jaw control")
            return
        
        logger.info(f"🚀 Starting GPIO Jaw WebSocket Server on {self.host}:{self.port}")
        
        try:
            server = await websockets.serve(
                self.handle_client,
                self.host,
                self.port,
                ping_interval=30,
                ping_timeout=10
            )
            
            logger.info(f"✅ GPIO Jaw WebSocket Server running on ws://{self.host}:{self.port}")
            logger.info(f"🦴 Servo control on GPIO pin {self.servo_pin}")
            logger.info(f"🔧 GPIO Available: {GPIO_AVAILABLE}")
            
            await server.wait_closed()
            
        finally:
            self.jaw_control.cleanup()

def main():
    """Main function"""
    import argparse
    
    parser = argparse.ArgumentParser(description="GPIO Jaw Control WebSocket Server")
    parser.add_argument("--host", default="0.0.0.0", help="Server host")
    parser.add_argument("--port", type=int, default=8765, help="Server port")
    parser.add_argument("--servo-pin", type=int, default=18, help="GPIO pin for servo")
    
    args = parser.parse_args()
    
    server = GPIOJawWebSocketServer(
        host=args.host,
        port=args.port,
        servo_pin=args.servo_pin
    )

    # Setup signal handlers for graceful shutdown
    import signal

    def signal_handler(signum, frame):
        logger.info(f"🛑 Received signal {signum}, initiating safe shutdown")
        if hasattr(server.jaw_control, 'safe_shutdown'):
            server.jaw_control.safe_shutdown()
        else:
            server.jaw_control.stop_servo()

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    try:
        asyncio.run(server.start_server())
    except KeyboardInterrupt:
        logger.info("Server interrupted by user")
    except Exception as e:
        logger.error(f"Server error: {e}")
    finally:
        # Ensure safe shutdown
        logger.info("🛑 Ensuring safe shutdown")
        if hasattr(server.jaw_control, 'safe_shutdown'):
            server.jaw_control.safe_shutdown()
        else:
            server.jaw_control.stop_servo()

if __name__ == "__main__":
    main()
