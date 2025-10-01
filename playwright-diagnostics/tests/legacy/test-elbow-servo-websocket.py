#!/usr/bin/env python3
"""
DS3240MG Elbow Servo WebSocket Test Script
Tests the full range of pulse widths to find the working range for the elbow joint
"""

import asyncio
import websockets
import json
import time
import sys

class ServoWebSocketTester:
    def __init__(self, host='localhost', port=8404):
        self.host = host
        self.port = port
        self.websocket = None
        self.request_id = 0
        
    async def connect(self):
        """Connect to the servo WebSocket service"""
        try:
            uri = f"ws://{self.host}:{self.port}"
            print(f"🔌 Connecting to servo service at {uri}...")
            self.websocket = await websockets.connect(uri)
            print("✅ Connected to servo WebSocket service")
            return True
        except Exception as e:
            print(f"❌ Failed to connect: {e}")
            return False
    
    async def disconnect(self):
        """Disconnect from WebSocket service"""
        if self.websocket:
            await self.websocket.close()
            print("🔌 Disconnected from servo service")
    
    async def send_request(self, message_type, data=None):
        """Send a request to the servo service"""
        if not self.websocket:
            print("❌ Not connected to WebSocket service")
            return None
            
        self.request_id += 1
        message = {
            "type": message_type,
            "request_id": self.request_id
        }
        
        if data:
            message.update(data)
        
        try:
            await self.websocket.send(json.dumps(message))
            
            # Wait for response
            response = await asyncio.wait_for(self.websocket.recv(), timeout=30.0)
            return json.loads(response)
            
        except asyncio.TimeoutError:
            print(f"⏰ Request timeout for {message_type}")
            return None
        except Exception as e:
            print(f"❌ Error sending request: {e}")
            return None
    
    async def test_pulse_width(self, servo_id, channel, pulse_width_us):
        """Test a specific pulse width using servo_move command"""
        print(f"📡 Testing {pulse_width_us}µs on channel {channel}...")

        # Convert pulse width to approximate angle for servo_move
        # Standard servo: 500µs = 0°, 2500µs = 180°
        angle = ((pulse_width_us - 500) / (2500 - 500)) * 180
        angle = max(0, min(180, angle))  # Clamp to 0-180 range

        response = await self.send_request("servo_move", {
            "servo_id": str(servo_id),
            "angle": angle,
            "duration": 2.0
        })

        if response and response.get("status") == "success":
            print(f"✅ Angle {angle:.1f}° (≈{pulse_width_us}µs) sent successfully")
            return True
        else:
            error_msg = response.get("message", "Unknown error") if response else "No response"
            print(f"❌ Failed to send angle {angle:.1f}° (≈{pulse_width_us}µs): {error_msg}")
            return False
    
    async def test_servo_range(self, servo_id, channel):
        """Test the full range of pulse widths for DS3240MG"""
        print(f"\n🎯 Testing DS3240MG Servo Range")
        print(f"   Servo ID: {servo_id}")
        print(f"   Channel: {channel}")
        print("   This will test various pulse widths to find the working range")
        print("   Watch your elbow joint and note which pulses cause movement\n")
        
        # Extended test sequence for DS3240MG
        test_sequence = [
            # Start with safe center position
            (1500, "Center/Neutral - Should be safe starting position"),
            
            # Test standard range
            (1000, "Standard minimum - Should move elbow down"),
            (1500, "Back to center"),
            (2000, "Standard maximum - Should move elbow up"),
            (1500, "Back to center"),
            
            # Test extended range (DS3240MG often supports wider range)
            (800, "Extended minimum - Lower than standard"),
            (1500, "Back to center"),
            (2200, "Extended maximum - Higher than standard"),
            (1500, "Back to center"),
            
            # Test very wide range (some DS3240MG support this)
            (600, "Very wide minimum - Extreme low"),
            (1500, "Back to center"),
            (2400, "Very wide maximum - Extreme high"),
            (1500, "Back to center"),
            
            # Test fine increments around center
            (1400, "Slightly below center"),
            (1450, "Just below center"),
            (1500, "Center"),
            (1550, "Just above center"),
            (1600, "Slightly above center"),
            (1500, "Final center position")
        ]
        
        working_pulses = []
        
        for pulse_us, description in test_sequence:
            print(f"\n📍 {description}")
            print(f"   Pulse: {pulse_us}µs")
            
            success = await self.test_pulse_width(servo_id, channel, pulse_us)
            
            if success:
                # Wait for servo to move
                await asyncio.sleep(3)
                
                # Ask user for feedback
                response = input("   Did you see movement? (y/n/q to quit): ").lower().strip()
                
                if response == 'q':
                    print("🛑 Test stopped by user")
                    break
                elif response == 'y':
                    working_pulses.append((pulse_us, description))
                    print(f"   ✅ {pulse_us}µs caused movement - RECORDED")
                else:
                    print(f"   ❌ {pulse_us}µs - no movement detected")
            
            # Small delay between tests
            await asyncio.sleep(1)
        
        return working_pulses
    
    async def emergency_stop(self, servo_id, channel):
        """Emergency stop - send 0 pulse width to stop PWM"""
        print("🚨 EMERGENCY STOP - Stopping PWM signal...")
        await self.test_pulse_width(servo_id, channel, 0)

    async def test_direct_pca9685(self, channel, pulse_width_us):
        """Test direct PCA9685 control as backup"""
        print(f"🔧 Testing direct PCA9685 control: {pulse_width_us}µs on channel {channel}")

        response = await self.send_request("test_pca9685_channel", {
            "channel": channel,
            "pulse_width_us": pulse_width_us,
            "duration": 2.0
        })

        if response and response.get("status") == "success":
            print(f"✅ Direct PCA9685 test successful")
            return True
        else:
            error_msg = response.get("message", "Unknown error") if response else "No response"
            print(f"❌ Direct PCA9685 test failed: {error_msg}")
            return False
    
    async def run_test(self):
        """Main test routine"""
        print("🤖 DS3240MG Elbow Servo WebSocket Tester")
        print("=" * 50)
        
        # Configuration - Updated for your elbow servo
        servo_id = 31  # Your elbow servo ID (from the logs)
        channel = 8    # Channel 8 as specified
        
        print(f"🎯 Target: Servo ID {servo_id} on Channel {channel}")
        print("⚠️  WARNING: Your elbow is currently straining - we'll start with safe positions")
        print("🔧 This test will help find the correct pulse width range for your DS3240MG")
        
        input("\nPress Enter to start the test (Ctrl+C to abort)...")
        
        # Connect to WebSocket service
        if not await self.connect():
            return
        
        try:
            # Run the range test
            working_pulses = await self.test_servo_range(servo_id, channel)
            
            # Report results
            print("\n" + "=" * 50)
            print("📊 TEST RESULTS")
            print("=" * 50)
            
            if working_pulses:
                print("✅ Working pulse widths found:")
                for pulse_us, description in working_pulses:
                    print(f"   • {pulse_us}µs - {description}")
                
                # Calculate recommended range
                pulse_values = [p[0] for p in working_pulses]
                min_working = min(pulse_values)
                max_working = max(pulse_values)
                
                print(f"\n🎯 RECOMMENDED SETTINGS:")
                print(f"   Min Pulse: {min_working}µs")
                print(f"   Max Pulse: {max_working}µs")
                print(f"   Center: 1500µs")
                
            else:
                print("❌ No working pulse widths found")
                print("🔧 Possible issues:")
                print("   • Servo may be damaged")
                print("   • Wrong channel number")
                print("   • Power supply issues")
                print("   • Wiring problems")
            
        except KeyboardInterrupt:
            print("\n🛑 Test interrupted by user")
            await self.emergency_stop(servo_id, channel)
        
        except Exception as e:
            print(f"\n❌ Test failed: {e}")
            await self.emergency_stop(servo_id, channel)
        
        finally:
            # Always disconnect
            await self.disconnect()

async def main():
    """Main entry point"""
    tester = ServoWebSocketTester()
    await tester.run_test()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n🛑 Test aborted by user")
        sys.exit(0)
