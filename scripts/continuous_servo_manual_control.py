#!/usr/bin/env python3

"""
Manual Control for Continuous Rotation Servos
Allows real-time control and position learning
"""

import time
import json
import board
import busio
from adafruit_pca9685 import PCA9685
import sys
import termios
import tty
import select

class ContinuousServoController:
    def __init__(self):
        self.pca = None
        self.i2c = None
        self.channel = 0  # Orlok Head Servo
        self.stop_pulse = 1460  # From calibration
        self.current_pulse = self.stop_pulse
        self.speed_increment = 50
        self.positions = {}
        
    def initialize(self):
        """Initialize PCA9685"""
        try:
            self.i2c = busio.I2C(board.SCL, board.SDA)
            self.pca = PCA9685(self.i2c, address=0x40)
            self.pca.frequency = 50
            print("✅ PCA9685 initialized")
            return True
        except Exception as e:
            print(f"❌ Failed to initialize: {e}")
            return False
    
    def cleanup(self):
        """Cleanup resources"""
        if self.pca:
            self.pca.channels[self.channel].duty_cycle = 0
            self.pca.deinit()
            print("✅ Cleaned up")
    
    def send_pulse(self, pulse_us):
        """Send PWM pulse"""
        if self.pca:
            duty_cycle = int((pulse_us / 20000.0) * 65535)
            self.pca.channels[self.channel].duty_cycle = duty_cycle
            self.current_pulse = pulse_us
    
    def stop(self):
        """Stop servo"""
        self.pca.channels[self.channel].duty_cycle = 0
        print("🛑 Servo stopped (PWM off)")
    
    def get_char(self):
        """Get single character input without Enter"""
        fd = sys.stdin.fileno()
        old_settings = termios.tcgetattr(fd)
        try:
            tty.setraw(sys.stdin.fileno())
            # Check if input is available
            if select.select([sys.stdin], [], [], 0.1) == ([sys.stdin], [], []):
                ch = sys.stdin.read(1)
            else:
                ch = None
        finally:
            termios.tcsetattr(fd, termios.TCSADRAIN, old_settings)
        return ch
    
    def manual_control(self):
        """Manual servo control interface"""
        print("\n🎮 Manual Continuous Servo Control")
        print("==================================")
        print("Controls:")
        print("  a/A - Rotate left (CCW) - slow/fast")
        print("  d/D - Rotate right (CW) - slow/fast") 
        print("  s   - STOP")
        print("  p   - Save current position")
        print("  l   - List saved positions")
        print("  g   - Go to saved position")
        print("  q   - Quit")
        print(f"\nStop pulse: {self.stop_pulse}µs")
        print("Press keys (no Enter needed)...")
        
        try:
            while True:
                ch = self.get_char()
                if ch is None:
                    continue
                    
                if ch == 'q':
                    break
                elif ch == 'a':  # Slow left
                    pulse = self.stop_pulse + 200  # Increased from 100
                    self.send_pulse(pulse)
                    print(f"↺ Slow left ({pulse}µs)")
                elif ch == 'A':  # Fast left
                    pulse = self.stop_pulse + 500  # Increased from 300
                    self.send_pulse(pulse)
                    print(f"↺↺ Fast left ({pulse}µs)")
                elif ch == 'd':  # Slow right
                    pulse = self.stop_pulse - 200  # Increased from 100
                    self.send_pulse(pulse)
                    print(f"↻ Slow right ({pulse}µs)")
                elif ch == 'D':  # Fast right
                    pulse = self.stop_pulse - 500  # Increased from 300
                    self.send_pulse(pulse)
                    print(f"↻↻ Fast right ({pulse}µs)")
                elif ch == 's':  # Stop
                    self.stop()
                elif ch == 'p':  # Save position
                    self.save_position()
                elif ch == 'l':  # List positions
                    self.list_positions()
                elif ch == 'g':  # Go to position
                    self.go_to_position()
                    
        except KeyboardInterrupt:
            pass
        finally:
            self.stop()
    
    def save_position(self):
        """Save current position"""
        print("\n💾 Save Position")
        print("Enter position name: ", end='', flush=True)
        
        # Restore normal input for name entry
        name = input().strip()
        if name:
            self.positions[name] = {
                'description': f'Position: {name}',
                'saved_time': time.time()
            }
            print(f"✅ Position '{name}' saved")
            
            # Save to file
            try:
                with open('data/continuous_servo_positions.json', 'w') as f:
                    json.dump(self.positions, f, indent=2)
                print("💾 Positions saved to file")
            except Exception as e:
                print(f"⚠️  Could not save to file: {e}")
        else:
            print("❌ No name entered")
    
    def list_positions(self):
        """List saved positions"""
        print("\n📍 Saved Positions:")
        if not self.positions:
            print("  No positions saved")
        else:
            for i, (name, data) in enumerate(self.positions.items(), 1):
                print(f"  {i}. {name} - {data['description']}")
    
    def go_to_position(self):
        """Go to a saved position"""
        if not self.positions:
            print("❌ No saved positions")
            return
            
        self.list_positions()
        print("Enter position name: ", end='', flush=True)
        name = input().strip()
        
        if name in self.positions:
            print(f"🎯 Going to position '{name}'")
            print("⚠️  Manual positioning required - use a/d to rotate to the saved position")
            print("This is a limitation of continuous rotation servos without feedback")
        else:
            print(f"❌ Position '{name}' not found")
    
    def load_positions(self):
        """Load saved positions"""
        try:
            with open('data/continuous_servo_positions.json', 'r') as f:
                self.positions = json.load(f)
                print(f"📂 Loaded {len(self.positions)} saved positions")
        except FileNotFoundError:
            print("📂 No saved positions file found")
        except Exception as e:
            print(f"⚠️  Error loading positions: {e}")


def main():
    controller = ContinuousServoController()
    
    if not controller.initialize():
        return
    
    controller.load_positions()
    
    try:
        controller.manual_control()
    finally:
        controller.cleanup()


if __name__ == "__main__":
    main()
