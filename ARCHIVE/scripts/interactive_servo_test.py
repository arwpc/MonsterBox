#!/usr/bin/env python3
"""
Interactive Servo Movement Test
Tests both GoBilda and DS3240MG servos with user confirmation
"""

import time
import sys
import json
import requests
import urllib3

# Disable SSL warnings for localhost testing
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def test_servo_via_api(servo_id, pulse_width, servo_name):
    """Test servo via the MonsterBox API"""
    try:
        url = "https://localhost:8080/parts/servo/test-pulse"
        data = {
            "servo_id": str(servo_id),
            "pulse_width": pulse_width
        }
        
        print(f"📡 Sending {pulse_width}µs pulse to {servo_name} (ID: {servo_id})...")
        
        response = requests.post(
            url, 
            json=data, 
            verify=False, 
            timeout=10,
            headers={'Content-Type': 'application/json'}
        )
        
        if response.status_code == 200:
            result = response.json()
            if result.get('success'):
                print(f"✅ API call successful: {result.get('message', 'No message')}")
                return True
            else:
                print(f"❌ API call failed: {result.get('message', 'Unknown error')}")
                return False
        else:
            print(f"❌ HTTP Error {response.status_code}: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ Request failed: {e}")
        return False

def test_servo_interactive(servo_id, servo_name, servo_type):
    """Interactive test for a single servo"""
    print(f"\n🎯 Testing {servo_name} ({servo_type})")
    print("=" * 60)
    
    # Test sequence with different pulse widths
    test_sequence = [
        (1500, "Center Position"),
        (1000, "Quarter Position"), 
        (2000, "Three-Quarter Position"),
        (1500, "Back to Center"),
        (500, "Minimum Position"),
        (2500, "Maximum Position"),
        (1500, "Final Center")
    ]
    
    movements_detected = 0
    total_tests = len(test_sequence)
    
    for pulse_width, description in test_sequence:
        print(f"\n📍 Test: {description} ({pulse_width}µs)")
        
        # Send the pulse
        api_success = test_servo_via_api(servo_id, pulse_width, servo_name)
        
        if not api_success:
            print("❌ API call failed - skipping this test")
            continue
        
        # Wait for movement
        print("⏳ Waiting 3 seconds for servo movement...")
        time.sleep(3)
        
        # Ask user for confirmation
        while True:
            response = input(f"👀 Did you see {servo_name} move? (y/n/s=skip): ").lower().strip()
            if response in ['y', 'yes']:
                print("✅ Movement confirmed!")
                movements_detected += 1
                break
            elif response in ['n', 'no']:
                print("❌ No movement detected")
                break
            elif response in ['s', 'skip']:
                print("⏭️ Skipping this test")
                break
            else:
                print("Please enter 'y' for yes, 'n' for no, or 's' to skip")
    
    # Summary for this servo
    print(f"\n📊 {servo_name} Test Summary:")
    print(f"   Movements detected: {movements_detected}/{total_tests}")
    
    if movements_detected == 0:
        print(f"   🔴 Status: NOT WORKING - No movement detected")
    elif movements_detected < total_tests // 2:
        print(f"   🟡 Status: PARTIAL - Some movement detected")
    else:
        print(f"   🟢 Status: WORKING - Good movement detected")
    
    return movements_detected > 0

def main():
    print("🔧 MonsterBox Interactive Servo Movement Test")
    print("=" * 60)
    print("This test will move both servos and ask you to confirm movement.")
    print("Make sure you can see both servos clearly!")
    print()
    
    # Test servos
    servos_to_test = [
        (29, "GoBilda Head Servo", "GoBilda Stingray 2"),
        (30, "Orloks Elbow", "Hooyij DS3240MG")
    ]
    
    working_servos = []
    broken_servos = []
    
    for servo_id, servo_name, servo_type in servos_to_test:
        is_working = test_servo_interactive(servo_id, servo_name, servo_type)
        
        if is_working:
            working_servos.append(servo_name)
        else:
            broken_servos.append(servo_name)
    
    # Final summary
    print(f"\n🎯 FINAL TEST RESULTS")
    print("=" * 60)
    
    if working_servos:
        print(f"✅ WORKING SERVOS ({len(working_servos)}):")
        for servo in working_servos:
            print(f"   🟢 {servo}")
    
    if broken_servos:
        print(f"\n❌ NON-WORKING SERVOS ({len(broken_servos)}):")
        for servo in broken_servos:
            print(f"   🔴 {servo}")
    
    print(f"\n📈 Overall Status: {len(working_servos)}/{len(servos_to_test)} servos working")
    
    if len(working_servos) == 0:
        print("\n🚨 CRITICAL: No servos are working!")
        print("   This suggests a system-wide issue with the servo service.")
    elif len(working_servos) < len(servos_to_test):
        print("\n⚠️  PARTIAL: Some servos working, others not.")
        print("   This suggests hardware-specific issues.")
    else:
        print("\n🎉 SUCCESS: All servos are working!")
    
    print("\n✅ Interactive test completed!")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n⏹️ Test interrupted by user")
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ Test failed with error: {e}")
        sys.exit(1)
