#!/usr/bin/env python3
"""
Test script for the Enhanced ChatterPi Audio-Driven Jaw Animation System
Tests all components individually and as a complete system
"""

import sys
import time
import numpy as np
from pathlib import Path

# Add the script directory to Python path
script_dir = Path(__file__).parent
sys.path.insert(0, str(script_dir))

from audio_processing import AudioProcessor, AudioConfig
from servo_controller import ServoController, ServoConfig
from enhanced_audio_jaw_animator import EnhancedAudioJawAnimator, AnimatorConfig

def test_audio_processor():
    """Test the audio processing module"""
    print("🎵 Testing Audio Processor...")
    
    config = AudioConfig()
    config.SMOOTHING_ATTACK = 0.2
    config.SMOOTHING_RELEASE = 0.05
    config.SILENCE_THRESHOLD = 0.01
    
    processor = AudioProcessor(config)
    
    # Generate test audio frames
    sample_rate = config.SAMPLE_RATE
    frame_size = config.FRAME_SIZE
    
    # Test with silence
    silence_frame = np.zeros(frame_size, dtype=np.float32)
    result = processor.process_audio_frame(silence_frame)
    
    print(f"  Silence frame: amplitude={result['raw_amplitude']:.4f}, "
          f"voice_active={result['voice_active']}, servo={result['servo_position']:.1f}°")
    
    # Test with voice-like signal
    voice_frame = np.random.normal(0, 0.1, frame_size).astype(np.float32)
    result = processor.process_audio_frame(voice_frame)
    
    print(f"  Voice frame: amplitude={result['raw_amplitude']:.4f}, "
          f"voice_active={result['voice_active']}, servo={result['servo_position']:.1f}°")
    
    # Test statistics
    stats = processor.get_stats()
    print(f"  Stats: {stats['frames_processed']} frames, "
          f"voice ratio: {stats['voice_activity_ratio']:.2%}")
    
    print("  ✅ Audio processor test completed")
    return True

def test_servo_controller():
    """Test the servo controller (simulation mode)"""
    print("🦴 Testing Servo Controller...")
    
    config = ServoConfig()
    config.pin = 18
    config.step_threshold = 0.5
    
    controller = ServoController(config)
    
    # Note: This will fail if pigpio is not available, but we can test the logic
    try:
        if controller.initialize():
            print("  ✅ Servo controller initialized")
            
            # Test position setting
            test_angles = [50, 45, 40, 35, 30, 35, 40, 45, 50]
            
            for angle in test_angles:
                success = controller.set_position(angle)
                position = controller.get_position()
                print(f"    Angle {angle}°: {'✅' if success else '⚠️'} "
                      f"(current: {position.angle:.1f}°)")
                time.sleep(0.1)
            
            # Test jitter reduction
            print("  Testing jitter reduction...")
            jitter_angles = [40.0, 40.2, 39.8, 40.1, 39.9]  # Small movements
            
            for angle in jitter_angles:
                success = controller.set_position(angle)
                print(f"    Angle {angle:.1f}°: {'Moved' if success else 'Filtered (jitter reduction)'}")
            
            # Print statistics
            stats = controller.get_stats()
            print(f"  Stats: {stats['commands_received']} commands, "
                  f"{stats['commands_executed']} executed, "
                  f"filter rate: {stats['filter_rate']:.1%}")
            
            controller.cleanup()
            print("  ✅ Servo controller test completed")
            return True
            
        else:
            print("  ⚠️ Servo controller initialization failed (pigpio not available?)")
            print("  This is expected if not running on Raspberry Pi or pigpio not installed")
            return False
            
    except Exception as e:
        print(f"  ⚠️ Servo controller test failed: {e}")
        print("  This is expected if not running on Raspberry Pi")
        return False

def test_integrated_system():
    """Test the complete integrated system"""
    print("🎭 Testing Integrated System...")
    
    # Create configuration
    config = AnimatorConfig()
    config.audio_config.SMOOTHING_ATTACK = 0.15
    config.audio_config.SMOOTHING_RELEASE = 0.03
    config.audio_config.SILENCE_THRESHOLD = 0.008
    config.servo_config.step_threshold = 0.8
    config.update_rate_hz = 30.0  # Lower rate for testing
    
    animator = EnhancedAudioJawAnimator(config)
    
    try:
        print("  Attempting to initialize system...")
        
        # This will likely fail without proper audio hardware and pigpio
        if animator.initialize():
            print("  ✅ System initialized successfully")
            
            if animator.start_animation():
                print("  ✅ Animation started")
                print("  Running for 5 seconds...")
                
                start_time = time.time()
                while time.time() - start_time < 5.0:
                    time.sleep(0.5)
                    status = animator.get_status()
                    print(f"    Runtime: {status['runtime']:.1f}s, "
                          f"Frames: {status['stats']['frames_processed']}", end="\r")
                
                print("\n  Stopping animation...")
                animator.stop_animation()
                
                # Print final statistics
                final_status = animator.get_status()
                print(f"  Final stats: {final_status['stats']['frames_processed']} frames processed")
                print("  ✅ Integrated system test completed")
                return True
            else:
                print("  ⚠️ Failed to start animation")
                return False
        else:
            print("  ⚠️ System initialization failed")
            print("  This is expected without proper hardware setup")
            return False
            
    except Exception as e:
        print(f"  ⚠️ Integrated system test failed: {e}")
        return False
    finally:
        try:
            animator.stop_animation()
        except:
            pass

def test_configuration_system():
    """Test configuration loading and saving"""
    print("⚙️ Testing Configuration System...")
    
    # Test default configuration
    config = AnimatorConfig()
    print(f"  Default audio config: attack={config.audio_config.SMOOTHING_ATTACK}, "
          f"release={config.audio_config.SMOOTHING_RELEASE}")
    print(f"  Default servo config: pin={config.servo_config.pin}, "
          f"step_threshold={config.servo_config.step_threshold}")
    
    # Test configuration updates
    processor = AudioProcessor(config.audio_config)
    
    new_config = {
        'smoothing_attack': 0.25,
        'smoothing_release': 0.08,
        'silence_threshold': 0.012
    }
    
    processor.update_config(new_config)
    
    updated_stats = processor.get_stats()
    print(f"  Updated config: {updated_stats['config']}")
    
    print("  ✅ Configuration system test completed")
    return True

def main():
    """Run all tests"""
    print("🧪 Enhanced ChatterPi System Test Suite")
    print("=" * 50)
    
    tests = [
        ("Audio Processor", test_audio_processor),
        ("Servo Controller", test_servo_controller),
        ("Configuration System", test_configuration_system),
        ("Integrated System", test_integrated_system),
    ]
    
    results = {}
    
    for test_name, test_func in tests:
        print(f"\n{test_name}:")
        print("-" * 30)
        
        try:
            results[test_name] = test_func()
        except Exception as e:
            print(f"  ❌ Test failed with exception: {e}")
            results[test_name] = False
    
    # Summary
    print("\n" + "=" * 50)
    print("Test Results Summary:")
    print("=" * 50)
    
    passed = 0
    total = len(tests)
    
    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"  {test_name}: {status}")
        if result:
            passed += 1
    
    print(f"\nOverall: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 All tests passed! The enhanced system is ready.")
    elif passed > 0:
        print("⚠️ Some tests passed. Check hardware setup for full functionality.")
    else:
        print("❌ All tests failed. Check dependencies and hardware setup.")
    
    print("\nNotes:")
    print("- Servo controller tests require pigpio and GPIO hardware")
    print("- Audio tests require microphone access")
    print("- Some failures are expected when running on non-Raspberry Pi systems")
    
    return passed == total

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
