#!/usr/bin/env python3
"""
Advanced Jaw Control System for ChatterPi
Uses lgpio for precise servo control with smooth movement curves
"""

import lgpio
import time
import threading
import logging
import math
from typing import Optional, Dict, Any, Callable
from dataclasses import dataclass
from enum import Enum

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class MovementCurve(Enum):
    """Movement curve types for natural jaw animation"""
    LINEAR = "linear"
    EASE_IN = "ease_in"
    EASE_OUT = "ease_out"
    EASE_IN_OUT = "ease_in_out"
    EXPONENTIAL = "exponential"
    LOGARITHMIC = "logarithmic"

@dataclass
class ServoPosition:
    """Represents a servo position with metadata"""
    angle: float
    pulse_width: int
    timestamp: float

@dataclass
class MovementCommand:
    """Represents a movement command"""
    target_angle: float
    duration: float
    curve: MovementCurve
    callback: Optional[Callable] = None

class JawControlSystem:
    """Advanced jaw control system with smooth movements"""
    
    def __init__(self, pin: int = 18, min_pulse: int = 500, max_pulse: int = 2500):
        self.pin = pin
        self.min_pulse = min_pulse
        self.max_pulse = max_pulse
        
        # Hardware state
        self.gpio_handle = None
        self.is_initialized = False
        self.current_position = ServoPosition(0.0, min_pulse, time.time())
        
        # Movement state
        self.is_moving = False
        self.movement_thread = None
        self.stop_movement_flag = threading.Event()
        self.emergency_stop = False
        
        # Safety limits
        self.min_angle = 0.0
        self.max_angle = 180.0
        self.max_speed = 180.0  # degrees per second
        
        # Movement queue
        self.movement_queue = []
        self.queue_lock = threading.Lock()
        
        logger.info(f"Jaw Control System initialized on pin {pin}")
    
    def initialize(self) -> bool:
        """Initialize the GPIO and servo"""
        try:
            # Open GPIO chip
            self.gpio_handle = lgpio.gpiochip_open(0)
            
            # Set pin as output
            lgpio.gpio_claim_output(self.gpio_handle, self.pin)
            
            # Set initial position
            self._set_pulse_width(self.min_pulse)
            
            self.is_initialized = True
            logger.info("✅ Jaw control system initialized successfully")
            return True
            
        except Exception as e:
            logger.error(f"❌ Failed to initialize jaw control: {e}")
            return False
    
    def cleanup(self):
        """Clean up GPIO resources"""
        if self.gpio_handle is not None:
            try:
                # Stop any ongoing movement
                self.stop_movement()
                
                # Return to neutral position
                self._set_pulse_width(self.min_pulse)
                time.sleep(0.5)
                
                # Release GPIO
                lgpio.gpiochip_close(self.gpio_handle)
                self.gpio_handle = None
                self.is_initialized = False
                
                logger.info("✅ Jaw control system cleaned up")
            except Exception as e:
                logger.error(f"Error during cleanup: {e}")
    
    def _set_pulse_width(self, pulse_width: int):
        """Set servo pulse width directly with jitter reduction"""
        if not self.is_initialized:
            return False

        try:
            # Clamp pulse width to safe range
            pulse_width = max(self.min_pulse, min(self.max_pulse, pulse_width))

            # Implement deadband to reduce jitter
            if hasattr(self, 'last_pulse_width') and abs(pulse_width - self.last_pulse_width) < 10:
                return True  # Skip micro-movements (10µs threshold)

            # Set PWM (20ms period = 50Hz, pulse width in microseconds)
            lgpio.tx_pwm(self.gpio_handle, self.pin, 50, pulse_width / 20000.0 * 100)

            # Store last pulse width for deadband comparison
            self.last_pulse_width = pulse_width

            # Update current position
            angle = self._pulse_to_angle(pulse_width)
            self.current_position = ServoPosition(angle, pulse_width, time.time())

            return True

        except Exception as e:
            logger.error(f"Error setting pulse width: {e}")
            return False

    def stop_servo(self):
        """Stop PWM signal to reduce jitter when idle"""
        if not self.is_initialized:
            return False

        try:
            # Stop PWM signal completely
            lgpio.tx_pwm(self.gpio_handle, self.pin, 0, 0)
            logger.info("Servo PWM stopped to reduce jitter")
            return True
        except Exception as e:
            logger.error(f"Error stopping servo PWM: {e}")
            return False
    
    def _angle_to_pulse(self, angle: float) -> int:
        """Convert angle to pulse width"""
        # Clamp angle to valid range
        angle = max(self.min_angle, min(self.max_angle, angle))
        
        # Map angle to pulse width
        pulse_range = self.max_pulse - self.min_pulse
        angle_range = self.max_angle - self.min_angle
        
        pulse_width = self.min_pulse + (angle / angle_range) * pulse_range
        return int(pulse_width)
    
    def _pulse_to_angle(self, pulse_width: int) -> float:
        """Convert pulse width to angle"""
        pulse_range = self.max_pulse - self.min_pulse
        angle_range = self.max_angle - self.min_angle
        
        angle = ((pulse_width - self.min_pulse) / pulse_range) * angle_range
        return max(self.min_angle, min(self.max_angle, angle))
    
    def _apply_movement_curve(self, t: float, curve: MovementCurve) -> float:
        """Apply movement curve to time parameter (0.0 to 1.0)"""
        t = max(0.0, min(1.0, t))  # Clamp to valid range
        
        if curve == MovementCurve.LINEAR:
            return t
        elif curve == MovementCurve.EASE_IN:
            return t * t
        elif curve == MovementCurve.EASE_OUT:
            return 1 - (1 - t) * (1 - t)
        elif curve == MovementCurve.EASE_IN_OUT:
            if t < 0.5:
                return 2 * t * t
            else:
                return 1 - 2 * (1 - t) * (1 - t)
        elif curve == MovementCurve.EXPONENTIAL:
            return t * t * t
        elif curve == MovementCurve.LOGARITHMIC:
            return math.sqrt(t)
        else:
            return t  # Default to linear
    
    def move_to_angle(self, target_angle: float, duration: float = 1.0, 
                     curve_type: str = "linear", callback: Optional[Callable] = None) -> bool:
        """Move servo to target angle with smooth curve"""
        if not self.is_initialized or self.emergency_stop:
            return False
        
        # Validate inputs
        target_angle = max(self.min_angle, min(self.max_angle, target_angle))
        duration = max(0.1, duration)  # Minimum duration
        
        # Convert curve type string to enum
        try:
            curve = MovementCurve(curve_type.lower())
        except ValueError:
            curve = MovementCurve.LINEAR
        
        # Create movement command
        command = MovementCommand(target_angle, duration, curve, callback)
        
        # Add to queue or execute immediately
        with self.queue_lock:
            if not self.is_moving:
                self._execute_movement(command)
            else:
                self.movement_queue.append(command)
        
        return True
    
    def _execute_movement(self, command: MovementCommand):
        """Execute a movement command in a separate thread"""
        if self.movement_thread and self.movement_thread.is_alive():
            return
        
        self.movement_thread = threading.Thread(
            target=self._movement_worker, 
            args=(command,)
        )
        self.movement_thread.daemon = True
        self.movement_thread.start()
    
    def _movement_worker(self, command: MovementCommand):
        """Worker thread for smooth movement execution"""
        self.is_moving = True
        self.stop_movement_flag.clear()
        
        start_angle = self.current_position.angle
        target_angle = command.target_angle
        duration = command.duration
        curve = command.curve
        
        start_time = time.time()
        
        try:
            while time.time() - start_time < duration:
                if self.stop_movement_flag.is_set() or self.emergency_stop:
                    break
                
                # Calculate progress (0.0 to 1.0)
                elapsed = time.time() - start_time
                progress = elapsed / duration
                
                # Apply movement curve
                curved_progress = self._apply_movement_curve(progress, curve)
                
                # Calculate current angle
                current_angle = start_angle + (target_angle - start_angle) * curved_progress
                
                # Set servo position
                pulse_width = self._angle_to_pulse(current_angle)
                self._set_pulse_width(pulse_width)
                
                # Small delay for smooth movement
                time.sleep(0.02)  # 50Hz update rate
            
            # Ensure we reach the exact target
            if not self.stop_movement_flag.is_set() and not self.emergency_stop:
                pulse_width = self._angle_to_pulse(target_angle)
                self._set_pulse_width(pulse_width)
            
            # Execute callback if provided
            if command.callback:
                command.callback()
                
        except Exception as e:
            logger.error(f"Error during movement: {e}")
        finally:
            self.is_moving = False
            self._process_movement_queue()
    
    def _process_movement_queue(self):
        """Process next movement in queue"""
        with self.queue_lock:
            if self.movement_queue and not self.emergency_stop:
                next_command = self.movement_queue.pop(0)
                self._execute_movement(next_command)
    
    def stop_movement(self):
        """Stop current movement"""
        self.stop_movement_flag.set()
        if self.movement_thread and self.movement_thread.is_alive():
            self.movement_thread.join(timeout=1.0)
        
        # Clear movement queue
        with self.queue_lock:
            self.movement_queue.clear()
    
    def emergency_stop_enable(self):
        """Enable emergency stop"""
        self.emergency_stop = True
        self.stop_movement()
        logger.warning("🚨 Emergency stop activated")
    
    def emergency_stop_disable(self):
        """Disable emergency stop"""
        self.emergency_stop = False
        logger.info("✅ Emergency stop deactivated")
    
    def get_position(self) -> ServoPosition:
        """Get current servo position"""
        return self.current_position
    
    def get_status(self) -> Dict[str, Any]:
        """Get system status"""
        return {
            "initialized": self.is_initialized,
            "is_moving": self.is_moving,
            "emergency_stop": self.emergency_stop,
            "current_position": self.current_position.angle,
            "queue_length": len(self.movement_queue),
            "pin": self.pin,
            "limits": {
                "min_angle": self.min_angle,
                "max_angle": self.max_angle,
                "min_pulse": self.min_pulse,
                "max_pulse": self.max_pulse
            }
        }

def main():
    """Test the jaw control system"""
    jaw_control = JawControlSystem(pin=18)
    
    if not jaw_control.initialize():
        logger.error("Failed to initialize jaw control")
        return
    
    try:
        # Test sequence
        test_angles = [0, 45, 90, 45, 0]
        
        for angle in test_angles:
            logger.info(f"Moving to {angle}°")
            jaw_control.move_to_angle(angle, 1.0, "ease_in_out")
            
            # Wait for movement to complete
            while jaw_control.is_moving:
                time.sleep(0.1)
            
            time.sleep(0.5)
        
        logger.info("✅ Test sequence completed")
        
    except KeyboardInterrupt:
        logger.info("Test interrupted by user")
    finally:
        jaw_control.cleanup()

if __name__ == "__main__":
    main()
