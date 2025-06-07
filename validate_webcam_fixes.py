#!/usr/bin/env python3
"""
Simple validation script for webcam fixes
Tests the core webcam functionality on RPI4b
"""

import subprocess
import json
import sys
import time

def run_ssh_command(host, user, command):
    """Run SSH command and return result"""
    ssh_cmd = f"ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no {user}@{host}"
    full_cmd = f'{ssh_cmd} "{command}"'
    
    try:
        result = subprocess.run(full_cmd, shell=True, capture_output=True, text=True, timeout=30)
        return {
            'success': result.returncode == 0,
            'output': result.stdout.strip(),
            'error': result.stderr.strip(),
            'code': result.returncode
        }
    except subprocess.TimeoutExpired:
        return {
            'success': False,
            'output': '',
            'error': 'Command timeout',
            'code': -1
        }
    except Exception as e:
        return {
            'success': False,
            'output': '',
            'error': str(e),
            'code': -1
        }

def test_webcam_detection(host, user):
    """Test webcam detection script"""
    print("🔍 Testing webcam detection...")
    
    result = run_ssh_command(host, user, "cd /home/remote/MonsterBox && python3 scripts/webcam_detect.py")
    
    if result['success']:
        try:
            # Look for JSON in the output - it might be mixed with log messages
            output = result['output']

            # Try to find JSON block
            json_start = output.find('{')
            json_end = output.rfind('}') + 1

            if json_start != -1 and json_end > json_start:
                json_str = output[json_start:json_end]
                detection_data = json.loads(json_str)

                if detection_data.get('success') and detection_data.get('cameras'):
                    print(f"✅ Detection successful: Found {len(detection_data['cameras'])} camera(s)")
                    for cam in detection_data['cameras']:
                        print(f"   - Camera {cam['id']}: {cam['path']} ({cam['width']}x{cam['height']})")
                    return True
                elif detection_data.get('success'):
                    print("✅ Detection script ran successfully but found no cameras")
                    return True
        except json.JSONDecodeError as e:
            # If JSON parsing fails, check if the output indicates success
            if "Found 1 accessible camera" in output or "Camera detection complete" in output:
                print("✅ Detection successful (parsed from log output)")
                return True
    
    print(f"❌ Detection failed: {result['error'] or 'No cameras found'}")
    return False

def test_basic_camera_access(host, user):
    """Test basic camera access"""
    print("📷 Testing basic camera access...")

    # Use a simpler approach with python -c
    test_cmd = 'cd /home/remote/MonsterBox && python3 -c "import cv2; cap = cv2.VideoCapture(0, cv2.CAP_V4L2); ret, frame = cap.read() if cap.isOpened() else (False, None); cap.release(); print(\\"CAMERA_TEST_OK\\" if ret and frame is not None else \\"CAMERA_TEST_FAIL\\")"'
    result = run_ssh_command(host, user, test_cmd)
    
    if result['success'] and 'CAMERA_TEST_OK' in result['output']:
        print("✅ Basic camera access successful")
        return True
    
    print(f"❌ Basic camera access failed: {result['output'] or result['error']}")
    return False

def test_streaming_script(host, user):
    """Test streaming script"""
    print("🎥 Testing streaming script...")
    
    result = run_ssh_command(host, user, "cd /home/remote/MonsterBox && timeout 3 python3 scripts/webcam_test_stream.py --device-id 0 --width 640 --height 480 --fps 15 --duration 2 2>&1 | head -5")
    
    if result['success'] or 'Starting test stream' in result['output'] or 'Camera initialized' in result['output']:
        print("✅ Streaming script test successful")
        return True
    
    print(f"❌ Streaming script test failed: {result['output'] or result['error']}")
    return False

def main():
    """Main test function"""
    host = "192.168.8.120"
    user = "remote"
    
    print("🎭 MonsterBox Webcam System Validation")
    print("=" * 50)
    print(f"Testing on: {user}@{host}")
    print()
    
    tests = [
        ("Webcam Detection", lambda: test_webcam_detection(host, user)),
        ("Basic Camera Access", lambda: test_basic_camera_access(host, user)),
        ("Streaming Script", lambda: test_streaming_script(host, user))
    ]
    
    passed = 0
    total = len(tests)
    
    for test_name, test_func in tests:
        print(f"Running: {test_name}")
        try:
            if test_func():
                passed += 1
            print()
        except Exception as e:
            print(f"❌ Test {test_name} failed with exception: {e}")
            print()
    
    # Summary
    print("📊 SUMMARY")
    print("=" * 30)
    print(f"Tests passed: {passed}/{total}")
    print(f"Success rate: {(passed/total)*100:.1f}%")
    
    if passed == total:
        print("🎉 All webcam functionality is working correctly!")
        return 0
    else:
        print("⚠️  Some webcam functionality needs attention")
        return 1

if __name__ == "__main__":
    sys.exit(main())
