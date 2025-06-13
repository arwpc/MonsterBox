#!/usr/bin/env python3
"""
Enhanced Servo Controller for ChatterPi using pigpio
Provides hardware-timed PWM with jitter reduction
"""

import pigpio
import time
import threading
import logging
from typing import Optional, Dict, Any, Callable
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)

@dataclass
class ServoConfig:
    """Configuration for servo control"""
    pin: int = 18                    # GPIO pin
    min_pulse_width: int = 500       # Minimum pulse width (microseconds)
    max_pulse_width: int = 2400      # Maximum pulse width (microseconds)
    frequency: int = 50              # PWM frequency (Hz)
    min_angle: float = 30.0          # Minimum angle (open position)
    max_angle: float = 50.0          # Maximum angle (closed position)
    step_threshold: float = 1.0      # Minimum movement threshold (degrees)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert config to dictionary"""
        return {
            'pin': self.pin,
            'min_pulse_width': self.min_pulse_width,
            'max_pulse_width': self.max_pulse_width,
            'frequency': self.frequency,
            'min_angle': self.min_angle,
            'max_angle': self.max_angle,
            'step_threshold': self.step_threshold
        }

@dataclass
class ServoState:
    """Current servo state"""
    angle: float
    pulse_width: int
    timestamp: float
    is_moving: bool = False

class ServoController:
    """Hardware-timed PWM servo controller using pigpio"""
    
    def __init__(self, config: Optional[ServoConfig] = None):
        self.config = config or ServoConfig()
        
        # Hardware interface
        self.pi = None
        self.is_initialized = False
        
        # State tracking
        self.current_state = ServoState(
            angle=self.config.max_angle,  # Start closed
            pulse_width=self._angle_to_pulse_width(self.config.max_angle),
            timestamp=time.time()
        )
        self.last_written_pulse = None
        
        # Thread safety
        self.lock = threading.Lock()
        
        # Statistics
        self.stats = {
            'commands_received': 0,
            'commands_executed': 0,
            'commands_filtered': 0,  # Filtered due to step threshold
            'total_movement': 0.0,   # Total degrees moved
            'start_time': time.time()
        }
        
        logger.info(f"Servo controller initialized for GPIO {self.config.pin}")
    
    def initialize(self) -> bool:
        """Initialize pigpio connection and servo"""
        try:
            # Connect to pigpio daemon
            self.pi = pigpio.pi()
            
            if not self.pi.connected:
                logger.error("Failed to connect to pigpio daemon")
                return False
            
            # Set GPIO mode and initial position
            initial_pulse = self._angle_to_pulse_width(self.config.max_angle)
            self.pi.set_servo_pulsewidth(self.config.pin, initial_pulse)
            
            self.last_written_pulse = initial_pulse
            self.is_initialized = True
            
            logger.info(f"✅ Servo controller initialized on GPIO {self.config.pin}")
            logger.info(f"   Initial position: {self.config.max_angle}° ({initial_pulse}µs)")
            
            return True
            
        except Exception as e:
            logger.error(f"❌ Failed to initialize servo controller: {e}")
            return False
    
    def set_position(self, angle: float) -> bool:
        """
        Set servo position with jitter reduction
        
        Args:
            angle: Target angle in degrees
            
        Returns:
            True if servo was moved, False if filtered out
        """
        if not self.is_initialized:
            logger.warning("Servo controller not initialized")
            return False
        
        with self.lock:
            self.stats['commands_received'] += 1
            
            # Clamp angle to valid range
            angle = max(self.config.min_angle, min(self.config.max_angle, angle))
            
            # Check step threshold to reduce jitter
            angle_diff = abs(angle - self.current_state.angle)
            if angle_diff < self.config.step_threshold:
                self.stats['commands_filtered'] += 1
                return False
            
            # Convert to pulse width
            pulse_width = self._angle_to_pulse_width(angle)
            
            # Additional jitter reduction: check pulse width difference
            if self.last_written_pulse is not None:
                pulse_diff = abs(pulse_width - self.last_written_pulse)
                if pulse_diff < 10:  # Less than 10µs difference
                    self.stats['commands_filtered'] += 1
                    return False
            
            try:
                # Write to servo using hardware-timed PWM
                self.pi.set_servo_pulsewidth(self.config.pin, pulse_width)
                
                # Update state
                movement = abs(angle - self.current_state.angle)
                self.current_state = ServoState(
                    angle=angle,
                    pulse_width=pulse_width,
                    timestamp=time.time(),
                    is_moving=True
                )
                
                self.last_written_pulse = pulse_width
                self.stats['commands_executed'] += 1
                self.stats['total_movement'] += movement
                
                logger.debug(f"Servo moved to {angle:.1f}° ({pulse_width}µs)")
                
                return True
                
            except Exception as e:
                logger.error(f"Error setting servo position: {e}")
                return False
    
    def stop_servo(self):
        """Stop servo PWM signal to reduce jitter when idle"""
        if not self.is_initialized:
            return
        
        try:
            self.pi.set_servo_pulsewidth(self.config.pin, 0)
            self.current_state.is_moving = False
            logger.debug("Servo PWM stopped")
        except Exception as e:
            logger.error(f"Error stopping servo: {e}")
    
    def _angle_to_pulse_width(self, angle: float) -> int:
        """Convert angle to pulse width"""
        # Clamp angle
        angle = max(self.config.min_angle, min(self.config.max_angle, angle))
        
        # Linear mapping
        angle_range = self.config.max_angle - self.config.min_angle
        pulse_range = self.config.max_pulse_width - self.config.min_pulse_width
        
        normalized_angle = (angle - self.config.min_angle) / angle_range
        pulse_width = self.config.min_pulse_width + (normalized_angle * pulse_range)
        
        return int(pulse_width)
    
    def _pulse_width_to_angle(self, pulse_width: int) -> float:
        """Convert pulse width to angle"""
        pulse_range = self.config.max_pulse_width - self.config.min_pulse_width
        angle_range = self.config.max_angle - self.config.min_angle
        
        normalized_pulse = (pulse_width - self.config.min_pulse_width) / pulse_range
        angle = self.config.min_angle + (normalized_pulse * angle_range)
        
        return max(self.config.min_angle, min(self.config.max_angle, angle))
    
    def get_position(self) -> ServoState:
        """Get current servo position"""
        with self.lock:
            return ServoState(
                angle=self.current_state.angle,
                pulse_width=self.current_state.pulse_width,
                timestamp=self.current_state.timestamp,
                is_moving=self.current_state.is_moving
            )
    
    def get_stats(self) -> Dict[str, Any]:
        """Get controller statistics"""
        with self.lock:
            runtime = time.time() - self.stats['start_time']
            
            stats = self.stats.copy()
            stats.update({
                'runtime_seconds': runtime,
                'commands_per_second': self.stats['commands_received'] / max(runtime, 0.001),
                'execution_rate': self.stats['commands_executed'] / max(self.stats['commands_received'], 1),
                'filter_rate': self.stats['commands_filtered'] / max(self.stats['commands_received'], 1),
                'average_movement': self.stats['total_movement'] / max(self.stats['commands_executed'], 1),
                'current_position': self.current_state.angle,
                'is_initialized': self.is_initialized,
                'config': self.config.to_dict()
            })
            
            return stats
    
    def reset_stats(self):
        """Reset statistics"""
        with self.lock:
            self.stats = {
                'commands_received': 0,
                'commands_executed': 0,
                'commands_filtered': 0,
                'total_movement': 0.0,
                'start_time': time.time()
            }
            logger.info("Servo controller statistics reset")
    
    def update_config(self, new_config: Dict[str, Any]):
        """Update configuration parameters"""
        with self.lock:
            for key, value in new_config.items():
                if hasattr(self.config, key):
                    setattr(self.config, key, value)
                    logger.info(f"Updated servo config: {key} = {value}")
    
    def cleanup(self):
        """Clean up resources"""
        if self.is_initialized and self.pi:
            try:
                # Return to closed position
                closed_pulse = self._angle_to_pulse_width(self.config.max_angle)
                self.pi.set_servo_pulsewidth(self.config.pin, closed_pulse)
                time.sleep(0.5)
                
                # Stop PWM
                self.pi.set_servo_pulsewidth(self.config.pin, 0)
                
                # Disconnect from pigpio
                self.pi.stop()
                
                self.is_initialized = False
                logger.info("✅ Servo controller cleaned up")
                
            except Exception as e:
                logger.error(f"Error during cleanup: {e}")

def main():
    """Test the servo controller"""
    import matplotlib.pyplot as plt
    
    # Create servo controller
    config = ServoConfig(pin=18)
    controller = ServoController(config)
    
    if not controller.initialize():
        logger.error("Failed to initialize servo controller")
        return
    
    try:
        # Test sequence
        test_angles = [50, 45, 40, 35, 30, 35, 40, 45, 50]  # Closed to open and back
        positions = []
        timestamps = []
        
        print("Testing servo controller...")
        print("Moving through test sequence...")
        
        for angle in test_angles:
            print(f"Moving to {angle}°")
            
            success = controller.set_position(angle)
            position = controller.get_position()
            
            positions.append(position.angle)
            timestamps.append(position.timestamp - timestamps[0] if timestamps else 0)
            
            print(f"  Position: {position.angle:.1f}°, Success: {success}")
            time.sleep(1.0)
        
        # Test jitter reduction
        print("\nTesting jitter reduction...")
        jitter_test_angles = [40.0, 40.2, 39.8, 40.1, 39.9, 40.0]  # Small movements
        
        for angle in jitter_test_angles:
            success = controller.set_position(angle)
            print(f"Angle {angle:.1f}°: {'Moved' if success else 'Filtered'}")
        
        # Print statistics
        stats = controller.get_stats()
        print(f"\nController Statistics:")
        for key, value in stats.items():
            if isinstance(value, float):
                print(f"  {key}: {value:.3f}")
            elif not isinstance(value, dict):
                print(f"  {key}: {value}")
        
        # Plot results if matplotlib available
        try:
            plt.figure(figsize=(10, 6))
            plt.plot(timestamps, positions, 'b-o', linewidth=2, markersize=6)
            plt.xlabel('Time (s)')
            plt.ylabel('Servo Position (°)')
            plt.title('Servo Controller Test Results')
            plt.grid(True, alpha=0.3)
            plt.show()
        except ImportError:
            print("Matplotlib not available for plotting")
        
    except KeyboardInterrupt:
        print("\nTest interrupted by user")
    finally:
        controller.cleanup()
        print("Test completed")

if __name__ == "__main__":
    main()
