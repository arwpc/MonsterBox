#!/usr/bin/env python3
"""
ChatterPi Jaw Movement Control System
Core jaw movement control with safety limits and smooth motion
"""

import lgpio
import time
import json
import threading
import math
from typing import Optional, Dict, Any
from dataclasses import dataclass

@dataclass
class JawPosition:
    """Represents a jaw position with metadata"""
    angle: float
    timestamp: float
    pulse_width: int
    
@dataclass
class MovementProfile:
    """Movement profile for smooth motion"""
    start_angle: float
    end_angle: float
    duration: float
    curve_type: str = "ease_in_out"

class JawControlSystem:
    """Core jaw movement control system with safety and smooth motion"""
    
    def __init__(self, pin: int = 18, config_file: str = "jaw_calibration.json"):
        self.pin = pin
        self.handle = None
        self.current_position = None
        self.target_position = None
        self.is_moving = False
        self.emergency_stop = False
        self.movement_thread = None
        self.lock = threading.Lock()
        
        # Load calibration data
        self.config = self._load_config(config_file)
        
        # Safety limits from calibration
        self.min_angle = self.config.get("jaw_closed_angle", 0)
        self.max_angle = self.config.get("jaw_open_angle", 45)
        self.safe_range = self.config.get("safe_range", [0, 45])
        
        # Movement parameters
        self.max_speed = 180.0  # degrees per second
        self.acceleration = 360.0  # degrees per second squared
        self.min_move_time = 0.1  # minimum movement duration
        self.position_tolerance = 1.0  # degrees
        
        print(f"🦴 Jaw Control System initialized")
        print(f"   Pin: {self.pin}")
        print(f"   Range: {self.min_angle}° to {self.max_angle}°")
        print(f"   Max Speed: {self.max_speed}°/s")
    
    def _load_config(self, config_file: str) -> Dict[str, Any]:
        """Load calibration configuration"""
        try:
            with open(config_file, 'r') as f:
                config = json.load(f)
            print(f"✅ Loaded config from {config_file}")
            return config
        except Exception as e:
            print(f"⚠️ Could not load config: {e}")
            # Default configuration
            return {
                "pin": 18,
                "servo_type": "MG90S",
                "min_pulse": 500,
                "max_pulse": 2400,
                "jaw_closed_angle": 0,
                "jaw_open_angle": 45,
                "safe_range": [0, 45]
            }
    
    def initialize(self) -> bool:
        """Initialize GPIO and move to safe position"""
        try:
            self.handle = lgpio.gpiochip_open(0)
            lgpio.gpio_claim_output(self.handle, self.pin)
            
            # Move to safe starting position (closed)
            self._move_to_angle_immediate(self.min_angle)
            self.current_position = JawPosition(
                angle=self.min_angle,
                timestamp=time.time(),
                pulse_width=self._angle_to_pulse(self.min_angle)
            )
            
            print(f"✅ Jaw control initialized at {self.min_angle}°")
            return True
            
        except Exception as e:
            print(f"❌ Initialization failed: {e}")
            return False
    
    def cleanup(self):
        """Clean up resources and move to safe position"""
        self.emergency_stop = True
        
        if self.movement_thread and self.movement_thread.is_alive():
            self.movement_thread.join(timeout=2.0)
        
        if self.handle is not None:
            try:
                # Move to safe position before cleanup
                self._move_to_angle_immediate(self.min_angle)
                lgpio.gpio_free(self.handle, self.pin)
                lgpio.gpiochip_close(self.handle)
                print("✅ Jaw control cleaned up")
            except Exception as e:
                print(f"⚠️ Cleanup warning: {e}")
    
    def _angle_to_pulse(self, angle: float) -> int:
        """Convert angle to pulse width"""
        min_pulse = self.config.get("min_pulse", 500)
        max_pulse = self.config.get("max_pulse", 2400)
        pulse_range = max_pulse - min_pulse
        return int((angle / 180.0) * pulse_range + min_pulse)
    
    def _validate_angle(self, angle: float) -> float:
        """Validate and clamp angle to safe range"""
        if angle < self.min_angle:
            print(f"⚠️ Angle {angle}° below minimum, clamping to {self.min_angle}°")
            return self.min_angle
        elif angle > self.max_angle:
            print(f"⚠️ Angle {angle}° above maximum, clamping to {self.max_angle}°")
            return self.max_angle
        return angle
    
    def _move_to_angle_immediate(self, angle: float) -> bool:
        """Move to angle immediately without smooth motion"""
        try:
            safe_angle = self._validate_angle(angle)
            pulse_width = self._angle_to_pulse(safe_angle)
            result = lgpio.tx_servo(self.handle, self.pin, pulse_width, 50, 0, 1)
            return result >= 0
        except Exception as e:
            print(f"❌ Immediate move failed: {e}")
            return False
    
    def _ease_in_out(self, t: float) -> float:
        """Ease-in-out curve for smooth motion"""
        if t < 0.5:
            return 2 * t * t
        else:
            return -1 + (4 - 2 * t) * t
    
    def _calculate_smooth_motion(self, profile: MovementProfile) -> list:
        """Calculate smooth motion waypoints"""
        steps = max(10, int(profile.duration * 20))  # 20 steps per second
        waypoints = []
        
        for i in range(steps + 1):
            t = i / steps
            
            if profile.curve_type == "ease_in_out":
                progress = self._ease_in_out(t)
            elif profile.curve_type == "linear":
                progress = t
            else:
                progress = t  # Default to linear
            
            angle = profile.start_angle + (profile.end_angle - profile.start_angle) * progress
            timestamp = time.time() + (profile.duration * t)
            
            waypoints.append((angle, timestamp))
        
        return waypoints
    
    def _smooth_movement_worker(self, profile: MovementProfile):
        """Worker thread for smooth movement execution"""
        waypoints = self._calculate_smooth_motion(profile)
        start_time = time.time()
        
        for angle, target_time in waypoints:
            if self.emergency_stop:
                break
            
            # Wait for the right time
            current_time = time.time()
            wait_time = target_time - start_time - (current_time - start_time)
            if wait_time > 0:
                time.sleep(wait_time)
            
            # Move to position
            with self.lock:
                if self._move_to_angle_immediate(angle):
                    self.current_position = JawPosition(
                        angle=angle,
                        timestamp=time.time(),
                        pulse_width=self._angle_to_pulse(angle)
                    )
        
        with self.lock:
            self.is_moving = False
            self.target_position = None
    
    def move_to_angle(self, angle: float, duration: Optional[float] = None, 
                     curve_type: str = "ease_in_out") -> bool:
        """Move to angle with smooth motion"""
        if self.handle is None:
            print("❌ System not initialized")
            return False
        
        if self.emergency_stop:
            print("❌ Emergency stop active")
            return False
        
        safe_angle = self._validate_angle(angle)
        
        with self.lock:
            if self.is_moving:
                print("⚠️ Movement in progress, stopping current movement")
                self.emergency_stop = True
                if self.movement_thread:
                    self.movement_thread.join(timeout=1.0)
                self.emergency_stop = False
            
            # Calculate duration if not provided
            if duration is None:
                if self.current_position:
                    distance = abs(safe_angle - self.current_position.angle)
                    duration = max(self.min_move_time, distance / self.max_speed)
                else:
                    duration = self.min_move_time
            
            # Create movement profile
            start_angle = self.current_position.angle if self.current_position else self.min_angle
            profile = MovementProfile(
                start_angle=start_angle,
                end_angle=safe_angle,
                duration=duration,
                curve_type=curve_type
            )
            
            self.is_moving = True
            self.target_position = safe_angle
            
            # Start movement thread
            self.movement_thread = threading.Thread(
                target=self._smooth_movement_worker,
                args=(profile,)
            )
            self.movement_thread.start()
        
        print(f"🎯 Moving jaw from {start_angle:.1f}° to {safe_angle:.1f}° over {duration:.2f}s")
        return True
    
    def get_position(self) -> Optional[JawPosition]:
        """Get current jaw position"""
        with self.lock:
            return self.current_position
    
    def is_at_position(self, angle: float) -> bool:
        """Check if jaw is at specified position"""
        if not self.current_position:
            return False
        return abs(self.current_position.angle - angle) <= self.position_tolerance
    
    def stop_movement(self):
        """Emergency stop all movement"""
        print("🛑 Emergency stop activated")
        self.emergency_stop = True
        
        if self.movement_thread and self.movement_thread.is_alive():
            self.movement_thread.join(timeout=2.0)
        
        self.emergency_stop = False
        with self.lock:
            self.is_moving = False
            self.target_position = None
    
    def get_status(self) -> Dict[str, Any]:
        """Get system status"""
        with self.lock:
            return {
                "initialized": self.handle is not None,
                "current_position": self.current_position.angle if self.current_position else None,
                "target_position": self.target_position,
                "is_moving": self.is_moving,
                "emergency_stop": self.emergency_stop,
                "safe_range": [self.min_angle, self.max_angle],
                "max_speed": self.max_speed
            }

def main():
    """Test the jaw control system"""
    import argparse

    parser = argparse.ArgumentParser(description="Jaw Control System Test")
    parser.add_argument("--pin", type=int, default=18, help="GPIO pin")
    parser.add_argument("--test", choices=["basic", "smooth", "sequence"],
                       default="basic", help="Test type")
    parser.add_argument("--angle", type=float, help="Move to specific angle")
    parser.add_argument("--duration", type=float, help="Movement duration")

    args = parser.parse_args()

    # Create jaw control system
    jaw = JawControlSystem(pin=args.pin)

    if not jaw.initialize():
        print("❌ Failed to initialize jaw control system")
        return False

    try:
        if args.angle is not None:
            # Move to specific angle
            print(f"Moving to {args.angle}°...")
            jaw.move_to_angle(args.angle, args.duration)

            # Wait for movement to complete
            while jaw.is_moving:
                time.sleep(0.1)

            position = jaw.get_position()
            print(f"✅ Final position: {position.angle:.1f}°")

        elif args.test == "basic":
            # Basic movement test
            print("🔧 Running basic movement test...")

            test_angles = [0, 22.5, 45, 22.5, 0]
            for angle in test_angles:
                print(f"Moving to {angle}°...")
                jaw.move_to_angle(angle, 1.0)

                while jaw.is_moving:
                    time.sleep(0.1)

                position = jaw.get_position()
                print(f"✅ Reached {position.angle:.1f}°")
                time.sleep(0.5)

        elif args.test == "smooth":
            # Smooth motion test
            print("🌊 Running smooth motion test...")

            jaw.move_to_angle(45, 3.0, "ease_in_out")
            while jaw.is_moving:
                position = jaw.get_position()
                print(f"Position: {position.angle:.1f}°")
                time.sleep(0.2)

            time.sleep(1)

            jaw.move_to_angle(0, 2.0, "linear")
            while jaw.is_moving:
                position = jaw.get_position()
                print(f"Position: {position.angle:.1f}°")
                time.sleep(0.2)

        elif args.test == "sequence":
            # Talking sequence test
            print("🎭 Running talking sequence test...")

            talking_pattern = [
                (0, 0.3), (30, 0.2), (0, 0.3), (20, 0.2),
                (0, 0.3), (35, 0.2), (0, 0.3), (15, 0.2), (0, 0.5)
            ]

            for angle, duration in talking_pattern:
                jaw.move_to_angle(angle, duration)
                while jaw.is_moving:
                    time.sleep(0.05)

        print("✅ Test completed successfully!")
        return True

    except KeyboardInterrupt:
        print("\n🛑 Test interrupted")
        jaw.stop_movement()
        return False

    finally:
        jaw.cleanup()

if __name__ == "__main__":
    main()
