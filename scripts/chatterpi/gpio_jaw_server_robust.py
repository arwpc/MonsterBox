#!/usr/bin/env python3
"""
Robust GPIO Jaw Server for ChatterPi
Handles GPIO conflicts and provides fallback options
"""

import asyncio
import websockets
import json
import logging
import argparse
import signal
import sys
import time
import os

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class RobustJawController:
    """Robust jaw controller with multiple GPIO backend options"""
    
    def __init__(self, pin=18):
        self.pin = pin
        self.gpio_backend = None
        self.gpio_handle = None
        self.current_angle = 50.0  # Start at closed position
        self.is_initialized = False
        
    def initialize(self):
        """Initialize GPIO with fallback options"""
        
        # Try lgpio first
        if self._try_lgpio():
            logger.info("✅ Using lgpio backend")
            return True
            
        # Try pigpio as fallback
        if self._try_pigpio():
            logger.info("✅ Using pigpio backend")
            return True
            
        # Try RPi.GPIO as last resort
        if self._try_rpi_gpio():
            logger.info("✅ Using RPi.GPIO backend")
            return True
            
        # If all fail, use simulation mode
        logger.warning("⚠️ All GPIO backends failed, using simulation mode")
        self.gpio_backend = "simulation"
        self.is_initialized = True
        return True
    
    def _try_lgpio(self):
        """Try to initialize with lgpio"""
        try:
            import lgpio
            
            # Try different approaches to claim the GPIO
            for attempt in range(3):
                try:
                    self.gpio_handle = lgpio.gpiochip_open(0)
                    
                    # Try to free the GPIO first in case it's stuck
                    try:
                        lgpio.gpio_free(self.gpio_handle, self.pin)
                    except:
                        pass
                    
                    # Small delay between attempts
                    time.sleep(0.1 * (attempt + 1))
                    
                    # Claim the GPIO
                    lgpio.gpio_claim_output(self.gpio_handle, self.pin)
                    
                    self.gpio_backend = "lgpio"
                    self.is_initialized = True
                    logger.info(f"✅ lgpio jaw control initialized on pin {self.pin} (attempt {attempt + 1})")
                    return True
                    
                except Exception as e:
                    logger.warning(f"lgpio attempt {attempt + 1} failed: {e}")
                    if self.gpio_handle:
                        try:
                            lgpio.gpiochip_close(self.gpio_handle)
                        except:
                            pass
                        self.gpio_handle = None
                    
                    if attempt < 2:  # Don't sleep on last attempt
                        time.sleep(1)
            
            return False
            
        except ImportError:
            logger.info("lgpio not available")
            return False
        except Exception as e:
            logger.error(f"lgpio initialization failed: {e}")
            return False
    
    def _try_pigpio(self):
        """Try to initialize with pigpio"""
        try:
            import pigpio
            
            self.gpio_handle = pigpio.pi()
            if not self.gpio_handle.connected:
                logger.warning("pigpio daemon not running")
                return False
            
            # Set GPIO as output
            self.gpio_handle.set_mode(self.pin, pigpio.OUTPUT)
            
            self.gpio_backend = "pigpio"
            self.is_initialized = True
            logger.info(f"✅ pigpio jaw control initialized on pin {self.pin}")
            return True
            
        except ImportError:
            logger.info("pigpio not available")
            return False
        except Exception as e:
            logger.error(f"pigpio initialization failed: {e}")
            return False
    
    def _try_rpi_gpio(self):
        """Try to initialize with RPi.GPIO"""
        try:
            import RPi.GPIO as GPIO
            
            GPIO.setmode(GPIO.BCM)
            GPIO.setwarnings(False)
            GPIO.setup(self.pin, GPIO.OUT)
            
            self.gpio_backend = "rpi_gpio"
            self.is_initialized = True
            logger.info(f"✅ RPi.GPIO jaw control initialized on pin {self.pin}")
            return True
            
        except ImportError:
            logger.info("RPi.GPIO not available")
            return False
        except Exception as e:
            logger.error(f"RPi.GPIO initialization failed: {e}")
            return False
    
    def move_to_angle(self, angle, duration=1.0):
        """Move servo to specified angle"""
        if not self.is_initialized:
            logger.warning("Jaw controller not initialized")
            return False
        
        # Clamp angle to safe range
        angle = max(30.0, min(50.0, angle))
        
        if self.gpio_backend == "simulation":
            logger.info(f"🎭 SIMULATION: Moving jaw to {angle}° (duration: {duration}s)")
            self.current_angle = angle
            return True
        
        try:
            # Calculate steps for smooth movement
            steps = max(1, int(duration * 20))  # 20 steps per second
            start_angle = self.current_angle
            angle_step = (angle - start_angle) / steps
            step_delay = duration / steps
            
            for i in range(steps + 1):
                current = start_angle + (angle_step * i)
                pulse_width = self._angle_to_pulse_width(current)
                
                if self.gpio_backend == "lgpio":
                    import lgpio
                    lgpio.tx_servo(self.gpio_handle, self.pin, int(pulse_width))
                elif self.gpio_backend == "pigpio":
                    self.gpio_handle.set_servo_pulsewidth(self.pin, int(pulse_width))
                elif self.gpio_backend == "rpi_gpio":
                    # RPi.GPIO doesn't have direct servo support, so we'll simulate
                    logger.info(f"🦴 RPi.GPIO: Servo moved to {current:.1f}° (pulse: {pulse_width:.0f}µs)")
                
                logger.info(f"🦴 Servo moved to {current:.1f}° (pulse: {pulse_width:.0f}µs)")
                
                if i < steps:  # Don't sleep after last step
                    time.sleep(step_delay)
            
            self.current_angle = angle
            return True
            
        except Exception as e:
            logger.error(f"Error moving servo: {e}")
            return False
    
    def _angle_to_pulse_width(self, angle):
        """Convert angle to pulse width in microseconds"""
        # Map angle (30-50°) to pulse width (1000-1500µs)
        # 30° = 1500µs (open), 50° = 1000µs (closed)
        return 1500 - ((angle - 30) * 25)
    
    def cleanup(self):
        """Cleanup GPIO resources"""
        try:
            if self.gpio_backend == "lgpio" and self.gpio_handle:
                import lgpio
                lgpio.gpio_free(self.gpio_handle, self.pin)
                lgpio.gpiochip_close(self.gpio_handle)
            elif self.gpio_backend == "pigpio" and self.gpio_handle:
                self.gpio_handle.set_servo_pulsewidth(self.pin, 0)
                self.gpio_handle.stop()
            elif self.gpio_backend == "rpi_gpio":
                import RPi.GPIO as GPIO
                GPIO.cleanup()
            
            logger.info("✅ GPIO cleanup completed")
            
        except Exception as e:
            logger.error(f"Error during cleanup: {e}")

# Global jaw controller
jaw_controller = None
connected_clients = set()

async def handle_client(websocket, path):
    """Handle WebSocket client connections"""
    client_id = f"jaw_client_{len(connected_clients)}_{id(websocket)}"
    connected_clients.add(websocket)
    logger.info(f"✅ Client connected: {client_id}")
    
    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                command = data.get('type', '')
                
                if command == 'jaw_move':
                    angle = float(data.get('angle', 50))
                    duration = float(data.get('duration', 1.0))
                    
                    logger.info(f"Received jaw_move from {client_id}")
                    logger.info(f"🦴 Moving jaw to {angle}° (duration: {duration}s)")
                    
                    success = jaw_controller.move_to_angle(angle, duration)
                    
                    response = {
                        'type': 'jaw_move_response',
                        'success': success,
                        'angle': angle,
                        'duration': duration
                    }
                    await websocket.send(json.dumps(response))
                
                elif command == 'get_status':
                    status = {
                        'type': 'status_response',
                        'gpio_backend': jaw_controller.gpio_backend,
                        'current_angle': jaw_controller.current_angle,
                        'is_initialized': jaw_controller.is_initialized,
                        'pin': jaw_controller.pin
                    }
                    await websocket.send(json.dumps(status))
                
                elif command == 'start_animation':
                    # For AI-triggered animations, just acknowledge
                    logger.info(f"Received start_animation from {client_id}")
                    response = {
                        'type': 'animation_started',
                        'success': True
                    }
                    await websocket.send(json.dumps(response))
                
            except json.JSONDecodeError:
                logger.error(f"Invalid JSON from {client_id}: {message}")
            except Exception as e:
                logger.error(f"Error processing message from {client_id}: {e}")
                
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        connected_clients.discard(websocket)
        logger.info(f"❌ Client disconnected: {client_id}")

def signal_handler(signum, frame):
    """Handle shutdown signals"""
    logger.info("🛑 Received shutdown signal")
    if jaw_controller:
        jaw_controller.cleanup()
    sys.exit(0)

def main():
    """Main function"""
    global jaw_controller
    
    parser = argparse.ArgumentParser(description='Robust GPIO Jaw WebSocket Server')
    parser.add_argument('--host', default='0.0.0.0', help='Host to bind to')
    parser.add_argument('--port', type=int, default=8765, help='Port to bind to')
    parser.add_argument('--servo-pin', type=int, default=18, help='GPIO pin for servo')
    
    args = parser.parse_args()
    
    # Setup signal handlers
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # Initialize jaw controller
    jaw_controller = RobustJawController(pin=args.servo_pin)
    
    if not jaw_controller.initialize():
        logger.error("Failed to initialize jaw control")
        return 1
    
    logger.info(f"🚀 Starting Robust GPIO Jaw WebSocket Server on {args.host}:{args.port}")
    logger.info(f"🦴 Servo control on GPIO pin {args.servo_pin}")
    logger.info(f"🔧 GPIO Backend: {jaw_controller.gpio_backend}")
    
    try:
        start_server = websockets.serve(handle_client, args.host, args.port)
        asyncio.get_event_loop().run_until_complete(start_server)
        logger.info(f"✅ Robust GPIO Jaw WebSocket Server running on ws://{args.host}:{args.port}")
        asyncio.get_event_loop().run_forever()
    except Exception as e:
        logger.error(f"Server error: {e}")
        return 1
    finally:
        logger.info("🛑 Ensuring safe shutdown")
        if jaw_controller:
            jaw_controller.cleanup()

if __name__ == "__main__":
    sys.exit(main())
