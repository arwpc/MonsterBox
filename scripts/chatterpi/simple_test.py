#!/usr/bin/env python3
"""
Simple ChatterPi Test
"""

import sys
import time
import subprocess
import os

def log_message(msg):
    """Log message to both stdout and file"""
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    full_msg = f"[{timestamp}] {msg}"
    print(full_msg)
    with open("test_results.log", "a") as f:
        f.write(full_msg + "\n")

def test_gpio_availability():
    """Test if GPIO 18 is available"""
    try:
        log_message("Testing GPIO 18 availability...")
        
        # Try to import lgpio
        import lgpio
        log_message("✅ lgpio imported successfully")
        
        # Try to open GPIO chip
        h = lgpio.gpiochip_open(0)
        log_message("✅ GPIO chip opened")
        
        # Try to claim GPIO 18
        try:
            lgpio.gpio_free(h, 18)  # Free first if claimed
        except:
            pass
        
        lgpio.gpio_claim_output(h, 18)
        log_message("✅ GPIO 18 claimed successfully")
        
        # Test basic PWM
        lgpio.tx_pwm(h, 18, 50, 7.5)  # 1.5ms pulse width (neutral position)
        log_message("✅ PWM signal sent successfully")
        
        time.sleep(1)
        
        # Stop PWM
        lgpio.tx_pwm(h, 18, 0, 0)
        
        # Clean up
        lgpio.gpio_free(h, 18)
        lgpio.gpiochip_close(h)
        log_message("✅ GPIO cleaned up successfully")
        
        return True
        
    except Exception as e:
        log_message(f"❌ GPIO test failed: {e}")
        return False

def test_jaw_control_system():
    """Test the jaw control system"""
    try:
        log_message("Testing jaw control system...")
        
        from jaw_control_system import JawControlSystem
        log_message("✅ JawControlSystem imported")
        
        jaw = JawControlSystem(pin=18)
        log_message("✅ JawControlSystem created")
        
        if jaw.initialize():
            log_message("✅ JawControlSystem initialized")
            
            # Test movement
            log_message("Testing jaw movement...")
            jaw.move_to_angle(45, 1.0, "linear")
            time.sleep(1.5)
            
            jaw.move_to_angle(0, 1.0, "linear")
            time.sleep(1.5)
            
            log_message("✅ Jaw movement test completed")
            
            jaw.cleanup()
            log_message("✅ JawControlSystem cleaned up")
            return True
        else:
            log_message("❌ JawControlSystem initialization failed")
            return False
            
    except Exception as e:
        log_message(f"❌ Jaw control system test failed: {e}")
        return False

def test_websocket_server():
    """Test WebSocket server startup"""
    try:
        log_message("Testing WebSocket server startup...")
        
        # Kill any existing server
        subprocess.run(["pkill", "-f", "jaw_websocket_server"], capture_output=True)
        time.sleep(1)
        
        # Start server in background
        process = subprocess.Popen([
            "python3", "jaw_websocket_server.py",
            "--host", "0.0.0.0",
            "--port", "8765",
            "--servo-pin", "18"
        ], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        
        # Wait for startup
        time.sleep(3)
        
        if process.poll() is None:
            log_message("✅ WebSocket server started successfully")
            
            # Test connection
            try:
                import asyncio
                import websockets
                import json
                
                async def test_connection():
                    uri = "ws://localhost:8765"
                    async with websockets.connect(uri, timeout=5) as websocket:
                        # Wait for welcome message
                        welcome = await asyncio.wait_for(websocket.recv(), timeout=5)
                        data = json.loads(welcome)
                        if data.get("type") == "welcome":
                            log_message("✅ WebSocket connection successful")
                            
                            # Test jaw movement
                            command = {
                                "type": "jaw_move",
                                "angle": 30,
                                "duration": 0.5
                            }
                            await websocket.send(json.dumps(command))
                            response = await asyncio.wait_for(websocket.recv(), timeout=3)
                            resp_data = json.loads(response)
                            
                            if resp_data.get("type") == "jaw_move_started":
                                log_message("✅ Jaw movement command successful")
                                return True
                            else:
                                log_message(f"❌ Jaw movement failed: {resp_data}")
                                return False
                        else:
                            log_message(f"❌ Unexpected welcome: {data}")
                            return False
                
                result = asyncio.run(test_connection())
                
                # Kill server
                process.terminate()
                process.wait(timeout=5)
                
                return result
                
            except Exception as e:
                log_message(f"❌ WebSocket connection test failed: {e}")
                process.terminate()
                return False
        else:
            log_message("❌ WebSocket server failed to start")
            return False
            
    except Exception as e:
        log_message(f"❌ WebSocket server test failed: {e}")
        return False

def run_browser_simulation():
    """Run 10 browser interactions"""
    try:
        log_message("Starting browser simulation (10 interactions)...")
        
        # Start server
        subprocess.run(["pkill", "-f", "jaw_websocket_server"], capture_output=True)
        time.sleep(1)
        
        process = subprocess.Popen([
            "python3", "jaw_websocket_server.py",
            "--host", "0.0.0.0",
            "--port", "8765",
            "--servo-pin", "18"
        ], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        
        time.sleep(3)
        
        if process.poll() is not None:
            log_message("❌ Failed to start server for browser simulation")
            return False
        
        import asyncio
        import websockets
        import json
        
        async def simulate_browser_interactions():
            success_count = 0
            
            for i in range(10):
                try:
                    log_message(f"Browser interaction {i+1}/10...")
                    
                    uri = "ws://localhost:8765"
                    async with websockets.connect(uri, timeout=5) as websocket:
                        # Skip welcome
                        await websocket.recv()
                        
                        # Subscribe to events
                        subscribe_cmd = {
                            "type": "subscribe",
                            "events": ["jaw_movement", "jaw_stopped"]
                        }
                        await websocket.send(json.dumps(subscribe_cmd))
                        await websocket.recv()  # subscription response
                        
                        # Send jaw movement
                        angle = 20 + (i * 10) % 60  # Vary angles
                        jaw_cmd = {
                            "type": "jaw_move",
                            "angle": angle,
                            "duration": 0.3
                        }
                        
                        await websocket.send(json.dumps(jaw_cmd))
                        response = await asyncio.wait_for(websocket.recv(), timeout=3)
                        resp_data = json.loads(response)
                        
                        if resp_data.get("type") == "jaw_move_started":
                            log_message(f"✅ Interaction {i+1} successful (angle: {angle}°)")
                            success_count += 1
                        else:
                            log_message(f"❌ Interaction {i+1} failed: {resp_data}")
                        
                        await asyncio.sleep(0.4)  # Wait for movement
                        
                except Exception as e:
                    log_message(f"❌ Interaction {i+1} error: {e}")
            
            return success_count
        
        success_count = asyncio.run(simulate_browser_interactions())
        
        # Clean up
        process.terminate()
        process.wait(timeout=5)
        
        log_message(f"Browser simulation completed: {success_count}/10 successful")
        return success_count == 10
        
    except Exception as e:
        log_message(f"❌ Browser simulation failed: {e}")
        return False

def main():
    """Main test function"""
    log_message("🎯 Starting ChatterPi System Tests")
    log_message("="*50)
    
    # Clear previous log
    if os.path.exists("test_results.log"):
        os.remove("test_results.log")
    
    results = {}
    
    # Test 1: GPIO Availability
    results["gpio"] = test_gpio_availability()
    
    # Test 2: Jaw Control System
    results["jaw_control"] = test_jaw_control_system()
    
    # Test 3: WebSocket Server
    results["websocket"] = test_websocket_server()
    
    # Test 4: Browser Simulation
    results["browser_sim"] = run_browser_simulation()
    
    # Summary
    log_message("="*50)
    log_message("🎯 TEST SUMMARY")
    log_message("="*50)
    
    total = len(results)
    passed = sum(results.values())
    
    for test, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        log_message(f"{test.upper()}: {status}")
    
    log_message(f"TOTAL: {passed}/{total} tests passed")
    
    if passed == total:
        log_message("🎉 ALL TESTS PASSED! ChatterPi system is working!")
    else:
        log_message("⚠️ Some tests failed. Check logs for details.")
    
    return passed == total

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
