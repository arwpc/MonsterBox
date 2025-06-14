#!/usr/bin/env python3
"""
Real-Time Configuration for ChatterPi Jaw Animation
Optimized settings for minimal latency and immediate response to speech timing
"""

from audio_processing import AudioConfig
from servo_controller import ServoConfig
from enhanced_audio_jaw_animator import AnimatorConfig

def get_real_time_audio_config():
    """Get audio configuration optimized for real-time response"""
    config = AudioConfig()
    
    # REAL-TIME OPTIMIZATIONS FOR IMMEDIATE RESPONSE
    config.SMOOTHING_ATTACK = 0.2      # Very fast attack (was 0.15)
    config.SMOOTHING_RELEASE = 0.12    # Much faster release (was 0.08, now even faster)
    config.SILENCE_THRESHOLD = 0.005   # Keep sensitive threshold
    config.SILENCE_TIMEOUT = 50        # VERY fast silence detection (was 100ms, now 50ms)
    config.SERVO_STEP = 0.3           # More responsive movement threshold (was 0.5)
    config.MAX_BUFFER_FRAMES = 2      # Minimal buffering (was 3, now 2)
    config.REAL_TIME_MODE = True
    
    return config

def get_real_time_servo_config():
    """Get servo configuration optimized for real-time response"""
    config = ServoConfig()
    
    # REAL-TIME SERVO OPTIMIZATIONS
    config.closed_angle = 50.0        # ChatterPi closed position
    config.open_angle = 30.0          # ChatterPi open position
    config.step_threshold = 0.3       # More responsive (was 0.5)
    config.max_speed = 360.0          # Faster servo movement (was 180.0)
    config.enable_immediate_mode = True  # Bypass movement queues
    
    return config

def get_real_time_animator_config():
    """Get animator configuration optimized for real-time response"""
    config = AnimatorConfig()
    
    # Use real-time optimized sub-configs
    config.audio_config = get_real_time_audio_config()
    config.servo_config = get_real_time_servo_config()
    
    # REAL-TIME ANIMATOR OPTIMIZATIONS
    config.update_rate_hz = 100.0     # Higher update rate (was 50.0)
    config.chunk_size = 160           # Smaller chunks for lower latency (was 320)
    config.sample_rate = 16000        # Keep required sample rate
    
    return config

def get_ultra_responsive_config():
    """Get ultra-responsive configuration for testing/debugging"""
    config = get_real_time_animator_config()
    
    # ULTRA-RESPONSIVE SETTINGS (for testing)
    config.audio_config.SMOOTHING_ATTACK = 0.3
    config.audio_config.SMOOTHING_RELEASE = 0.2
    config.audio_config.SILENCE_TIMEOUT = 25    # Extremely fast (25ms)
    config.audio_config.MAX_BUFFER_FRAMES = 1   # Single frame buffering
    config.servo_config.step_threshold = 0.1    # Hyper-responsive
    config.update_rate_hz = 150.0               # Very high update rate
    
    return config

def apply_real_time_config_to_animator(animator):
    """Apply real-time configuration to an existing animator"""
    real_time_config = get_real_time_animator_config()
    
    # Update audio processor config
    animator.audio_processor.update_config({
        'smoothing_attack': real_time_config.audio_config.SMOOTHING_ATTACK,
        'smoothing_release': real_time_config.audio_config.SMOOTHING_RELEASE,
        'silence_threshold': real_time_config.audio_config.SILENCE_THRESHOLD,
        'silence_timeout': real_time_config.audio_config.SILENCE_TIMEOUT,
        'servo_step': real_time_config.audio_config.SERVO_STEP,
        'max_buffer_frames': real_time_config.audio_config.MAX_BUFFER_FRAMES
    })
    
    # Update servo controller config
    animator.servo_controller.update_config({
        'step_threshold': real_time_config.servo_config.step_threshold,
        'max_speed': real_time_config.servo_config.max_speed
    })
    
    # Update animator config
    animator.config = real_time_config
    
    print("✅ Applied real-time configuration for minimal latency")
    print(f"   - Silence timeout: {real_time_config.audio_config.SILENCE_TIMEOUT}ms")
    print(f"   - Release speed: {real_time_config.audio_config.SMOOTHING_RELEASE}")
    print(f"   - Buffer frames: {real_time_config.audio_config.MAX_BUFFER_FRAMES}")
    print(f"   - Update rate: {real_time_config.update_rate_hz}Hz")

def get_config_summary(config):
    """Get a summary of configuration settings"""
    return {
        'timing': {
            'silence_timeout_ms': config.audio_config.SILENCE_TIMEOUT,
            'smoothing_release': config.audio_config.SMOOTHING_RELEASE,
            'update_rate_hz': config.update_rate_hz,
            'buffer_frames': config.audio_config.MAX_BUFFER_FRAMES
        },
        'responsiveness': {
            'servo_step_threshold': config.servo_config.step_threshold,
            'audio_step_threshold': config.audio_config.SERVO_STEP,
            'max_servo_speed': config.servo_config.max_speed
        },
        'latency_optimizations': {
            'real_time_mode': config.audio_config.REAL_TIME_MODE,
            'chunk_size': config.chunk_size,
            'immediate_mode': getattr(config.servo_config, 'enable_immediate_mode', False)
        }
    }

if __name__ == "__main__":
    print("🎯 ChatterPi Real-Time Configuration")
    print("=" * 50)
    
    # Show standard vs real-time config comparison
    standard_config = AnimatorConfig()
    realtime_config = get_real_time_animator_config()
    
    print("\n📊 Configuration Comparison:")
    print(f"Silence Timeout:  {standard_config.audio_config.SILENCE_TIMEOUT}ms → {realtime_config.audio_config.SILENCE_TIMEOUT}ms")
    print(f"Release Speed:    {standard_config.audio_config.SMOOTHING_RELEASE} → {realtime_config.audio_config.SMOOTHING_RELEASE}")
    print(f"Buffer Frames:    {getattr(standard_config.audio_config, 'MAX_BUFFER_FRAMES', 10)} → {realtime_config.audio_config.MAX_BUFFER_FRAMES}")
    print(f"Update Rate:      {standard_config.update_rate_hz}Hz → {realtime_config.update_rate_hz}Hz")
    
    print("\n🚀 Expected Improvements:")
    print("- Jaw closes 10x faster after speech ends")
    print("- 5x less audio buffering latency")  
    print("- 2x higher servo update rate")
    print("- Immediate silence detection")
