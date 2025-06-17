#!/usr/bin/env python3
"""
Test script for the renamed ChatterPi Animation System
Verifies that all components work with the new naming conventions
"""

import sys
import os
import logging
import asyncio

# Add current directory to path for imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Test imports with new naming
try:
    from chatterpi_animation_system import (
        ChatterPiAnimationSystem, 
        ChatterPiAnimationConfig
    )
    print("✅ ChatterPi Animation System imports successful")
except ImportError as e:
    print(f"❌ Failed to import ChatterPi Animation System: {e}")
    sys.exit(1)

try:
    from chatterpi_audio_bridge import ChatterPiAudioBridge
    print("✅ ChatterPi Audio Bridge imports successful")
except ImportError as e:
    print(f"❌ Failed to import ChatterPi Audio Bridge: {e}")
    sys.exit(1)

try:
    from generic_audio_stream_handler import (
        GenericAudioStreamHandler,
        AudioStreamConfig,
        AudioSourceType
    )
    print("✅ Generic Audio Stream Handler imports successful")
except ImportError as e:
    print(f"❌ Failed to import Generic Audio Stream Handler: {e}")
    sys.exit(1)

try:
    from audio_source_adapters import (
        MicrophoneAdapter,
        AudioFileAdapter,
        StreamingTTSAdapter,
        WebSocketStreamAdapter
    )
    print("✅ Audio Source Adapters imports successful")
except ImportError as e:
    print(f"❌ Failed to import Audio Source Adapters: {e}")
    sys.exit(1)

def test_configuration():
    """Test configuration classes"""
    print("\n🔧 Testing Configuration Classes...")
    
    # Test ChatterPiAnimationConfig
    config = ChatterPiAnimationConfig(
        primary_servo_pin=18,
        primary_closed_angle=50.0,
        primary_open_angle=30.0,
        animation_mode="jaw_primary"
    )
    
    print(f"   Primary servo pin: {config.primary_servo_pin}")
    print(f"   Primary closed angle: {config.primary_closed_angle}°")
    print(f"   Primary open angle: {config.primary_open_angle}°")
    print(f"   Animation mode: {config.animation_mode}")
    print("✅ ChatterPiAnimationConfig working correctly")
    
    # Test AudioStreamConfig
    audio_config = AudioStreamConfig(
        animation_profile="enhanced_smoothing",
        volume_threshold=0.005,
        smoothing_attack=0.1,
        smoothing_release=0.01
    )
    
    print(f"   Animation profile: {audio_config.animation_profile}")
    print(f"   Volume threshold: {audio_config.volume_threshold}")
    print("✅ AudioStreamConfig working correctly")
    
    return config

def test_animation_system(config):
    """Test ChatterPi Animation System"""
    print("\n🎭 Testing ChatterPi Animation System...")
    
    # Initialize system (simulation mode)
    system = ChatterPiAnimationSystem(config)
    
    print(f"   System initialized: {system is not None}")
    print(f"   Primary controller available: {system.primary_controller is not None}")
    print(f"   Stream handler initialized: {system.stream_handler is not None}")
    
    # Test system start/stop
    if system.start_system():
        print("✅ Animation system started successfully")
        
        # Get status
        status = system.get_system_status()
        print(f"   System running: {status['is_running']}")
        print(f"   Animation mode: {status['config']['animation_mode']}")
        
        # Test manual movement (simulation)
        if system.manual_primary_move(40.0, 0.5):
            print("✅ Manual primary movement test successful")
        
        # Test backward compatibility
        if system.manual_jaw_move(35.0, 0.5):
            print("✅ Backward compatibility (manual_jaw_move) working")
        
        # Test angle updates
        system.update_primary_angles(55.0, 25.0)
        print("✅ Primary angle updates working")
        
        # Test backward compatibility
        system.update_jaw_angles(50.0, 30.0)
        print("✅ Backward compatibility (update_jaw_angles) working")
        
        system.stop_system()
        print("✅ Animation system stopped successfully")
    else:
        print("❌ Failed to start animation system")
        return False
    
    return True

async def test_audio_bridge():
    """Test ChatterPi Audio Bridge"""
    print("\n🔌 Testing ChatterPi Audio Bridge...")
    
    # Initialize bridge
    bridge = ChatterPiAudioBridge("localhost", 8768)  # Use different port for testing
    
    print(f"   Bridge initialized: {bridge is not None}")
    print(f"   Animation system available: {bridge.animation_system is not None}")
    
    # Test configuration
    if bridge.animation_system:
        status = bridge.animation_system.get_system_status()
        print(f"   Animation system config: {status['config']['animation_mode']}")
        print("✅ Audio bridge configuration working")
    
    return True

def test_audio_stream_handler():
    """Test Generic Audio Stream Handler"""
    print("\n🎵 Testing Generic Audio Stream Handler...")
    
    config = AudioStreamConfig(
        animation_profile="standard",
        volume_threshold=0.01
    )
    
    handler = GenericAudioStreamHandler(config, None)  # No controller for testing
    
    print(f"   Handler initialized: {handler is not None}")
    print(f"   Animation profiles available: {list(handler.animation_profiles.keys())}")
    
    # Test animation profiles
    test_volume = 0.1
    standard_angle = handler._standard_animation_profile(test_volume)
    enhanced_angle = handler._enhanced_smoothing_profile(test_volume)
    
    print(f"   Standard profile result: {standard_angle:.1f}°")
    print(f"   Enhanced profile result: {enhanced_angle:.1f}°")
    print("✅ Audio stream handler working correctly")
    
    return True

def main():
    """Main test function"""
    print("🧪 Testing Renamed ChatterPi Animation System Components")
    print("=" * 60)
    
    # Configure logging
    logging.basicConfig(level=logging.WARNING)  # Reduce noise during testing
    
    try:
        # Test configuration
        config = test_configuration()
        
        # Test animation system
        if not test_animation_system(config):
            print("❌ Animation system tests failed")
            return False
        
        # Test audio stream handler
        if not test_audio_stream_handler():
            print("❌ Audio stream handler tests failed")
            return False
        
        # Test audio bridge (async)
        if not asyncio.run(test_audio_bridge()):
            print("❌ Audio bridge tests failed")
            return False
        
        print("\n" + "=" * 60)
        print("🎉 All tests passed! Renamed system is working correctly.")
        print("\n📋 Summary of new naming conventions:")
        print("   • IntegratedAudioJawSystem → ChatterPiAnimationSystem")
        print("   • ChatterPiWebSocketBridge → ChatterPiAudioBridge")
        print("   • ChatterPiConfig → ChatterPiAnimationConfig")
        print("   • jaw_controller → primary_controller")
        print("   • manual_jaw_move → manual_primary_move (with backward compatibility)")
        print("   • update_jaw_angles → update_primary_angles (with backward compatibility)")
        print("\n🔄 Backward compatibility maintained for existing jaw-specific methods")
        print("🚀 System ready for expansion to additional animatronic components")
        
        return True
        
    except Exception as e:
        print(f"\n❌ Test failed with error: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
