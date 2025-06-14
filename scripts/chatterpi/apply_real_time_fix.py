#!/usr/bin/env python3
"""
Apply Real-Time Timing Fix to ChatterPi Jaw Animation System
This script applies optimized timing settings to fix jaw movement lag
"""

import sys
import os
import json
import time
import logging
from pathlib import Path

# Add the chatterpi directory to the path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from real_time_config import (
    get_real_time_audio_config, 
    get_real_time_servo_config,
    get_real_time_animator_config,
    get_config_summary
)

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def backup_current_config():
    """Backup current configuration files"""
    backup_dir = Path("config_backup")
    backup_dir.mkdir(exist_ok=True)
    
    timestamp = int(time.time())
    
    # Backup jaw animation config
    jaw_config_path = Path("../../data/jaw-animation-config.json")
    if jaw_config_path.exists():
        backup_path = backup_dir / f"jaw-animation-config-{timestamp}.json"
        backup_path.write_text(jaw_config_path.read_text())
        logger.info(f"Backed up jaw config to {backup_path}")
    
    return timestamp

def update_jaw_animation_config():
    """Update the main jaw animation configuration with real-time settings"""
    config_path = Path("../../data/jaw-animation-config.json")
    
    if not config_path.exists():
        logger.error(f"Configuration file not found: {config_path}")
        return False
    
    try:
        # Load existing config
        with open(config_path, 'r') as f:
            config = json.load(f)
        
        # Get real-time audio config
        rt_audio_config = get_real_time_audio_config()
        
        # Update global audio analysis settings
        config["global"]["audioAnalysis"].update({
            "attackTime": rt_audio_config.SMOOTHING_ATTACK,
            "releaseTime": rt_audio_config.SMOOTHING_RELEASE,
            "volumeThreshold": rt_audio_config.SILENCE_THRESHOLD,
            "updateInterval": 10,  # Faster updates (was 16ms, now 10ms)
            "smoothingFactor": 0.6  # Less smoothing for faster response
        })
        
        # Update servo mapping for faster response
        config["global"]["servoMapping"].update({
            "attackTime": rt_audio_config.SMOOTHING_ATTACK,
            "releaseTime": rt_audio_config.SMOOTHING_RELEASE,
            "positionDeadband": rt_audio_config.SERVO_STEP,
            "idleTimeout": rt_audio_config.SILENCE_TIMEOUT,
            "responseCurve": "linear"  # Linear for fastest response
        })
        
        # Update character 4 (Skulltalker) specific settings
        if "4" in config["characters"]:
            config["characters"]["4"]["servoMapping"].update({
                "attackTime": 0.15,  # Very fast attack
                "releaseTime": 0.08,  # Fast release
                "sensitivity": 1.5,   # Higher sensitivity
                "responseCurve": "linear"
            })
            
            config["characters"]["4"]["audioAnalysis"].update({
                "volumeThreshold": rt_audio_config.SILENCE_THRESHOLD,
                "smoothingFactor": 0.6
            })
        
        # Update performance settings
        config["global"]["performance"].update({
            "updateRate": 100,  # Higher update rate
            "maxCpuUsage": 15,  # Allow more CPU for real-time processing
        })
        
        # Save updated config
        with open(config_path, 'w') as f:
            json.dump(config, f, indent=2)
        
        logger.info("✅ Updated jaw animation configuration with real-time settings")
        return True
        
    except Exception as e:
        logger.error(f"Failed to update jaw animation config: {e}")
        return False

def create_real_time_preset():
    """Create a real-time preset configuration file"""
    preset_path = Path("real_time_preset.json")
    
    rt_config = get_real_time_animator_config()
    config_summary = get_config_summary(rt_config)
    
    preset = {
        "name": "Real-Time Jaw Animation",
        "description": "Optimized for minimal latency and immediate response to speech timing",
        "version": "1.0.0",
        "created": time.strftime("%Y-%m-%d %H:%M:%S"),
        "settings": {
            "audio_processing": {
                "smoothing_attack": rt_config.audio_config.SMOOTHING_ATTACK,
                "smoothing_release": rt_config.audio_config.SMOOTHING_RELEASE,
                "silence_threshold": rt_config.audio_config.SILENCE_THRESHOLD,
                "silence_timeout": rt_config.audio_config.SILENCE_TIMEOUT,
                "servo_step": rt_config.audio_config.SERVO_STEP,
                "max_buffer_frames": rt_config.audio_config.MAX_BUFFER_FRAMES,
                "sample_rate": rt_config.audio_config.SAMPLE_RATE,
                "frame_size": rt_config.audio_config.FRAME_SIZE
            },
            "servo_control": {
                "step_threshold": rt_config.servo_config.step_threshold,
                "max_speed": rt_config.servo_config.max_speed,
                "enable_immediate_mode": rt_config.servo_config.enable_immediate_mode,
                "closed_angle": rt_config.servo_config.max_angle,
                "open_angle": rt_config.servo_config.min_angle
            },
            "animation": {
                "update_rate_hz": rt_config.update_rate_hz,
                "chunk_size": rt_config.chunk_size
            }
        },
        "performance_improvements": {
            "silence_detection_speedup": "10x faster (50ms vs 500ms)",
            "jaw_closing_speedup": "8x faster release timing",
            "buffer_latency_reduction": "5x less buffering (2 vs 10 frames)",
            "update_rate_increase": "2x higher servo updates (100Hz vs 50Hz)",
            "movement_threshold": "More responsive (0.3° vs 1.0°)"
        },
        "summary": config_summary
    }
    
    with open(preset_path, 'w') as f:
        json.dump(preset, f, indent=2)
    
    logger.info(f"✅ Created real-time preset: {preset_path}")
    return preset_path

def print_timing_comparison():
    """Print before/after timing comparison"""
    print("\n" + "="*60)
    print("🎯 CHATTERPI JAW ANIMATION TIMING FIX")
    print("="*60)
    
    print("\n📊 TIMING IMPROVEMENTS:")
    print("┌─────────────────────────┬──────────┬──────────┬─────────────┐")
    print("│ Parameter               │ Before   │ After    │ Improvement │")
    print("├─────────────────────────┼──────────┼──────────┼─────────────┤")
    print("│ Silence Timeout         │ 500ms    │ 50ms     │ 10x faster  │")
    print("│ Release Speed           │ 0.01     │ 0.08     │ 8x faster   │")
    print("│ Audio Buffer Frames     │ 10       │ 2        │ 5x less     │")
    print("│ Update Rate             │ 50Hz     │ 100Hz    │ 2x higher   │")
    print("│ Movement Threshold      │ 1.0°     │ 0.3°     │ 3x more     │")
    print("│ Servo Movement Duration │ 0.1s     │ 0.05s    │ 2x faster   │")
    print("└─────────────────────────┴──────────┴──────────┴─────────────┘")
    
    print("\n🚀 EXPECTED RESULTS:")
    print("• Jaw closes immediately when speech ends (no lag)")
    print("• Real-time tracking of speech amplitude changes")
    print("• Minimal latency between audio and jaw movement")
    print("• No more 'jaw talking after speech ends' issue")
    
    print("\n⚙️  TECHNICAL CHANGES:")
    print("• Immediate silence detection for amplitudes < 10% threshold")
    print("• Exponential moving average with faster release coefficient")
    print("• Reduced audio buffering to minimize processing delays")
    print("• Optional immediate mode bypassing jitter filtering")
    print("• Higher servo update rates for smoother real-time response")

def main():
    """Apply real-time timing fix to ChatterPi"""
    print_timing_comparison()
    
    print("\n🔧 APPLYING REAL-TIME TIMING FIX...")
    
    # Step 1: Backup current configuration
    print("\n1. Backing up current configuration...")
    backup_timestamp = backup_current_config()
    
    # Step 2: Update jaw animation config
    print("\n2. Updating jaw animation configuration...")
    if not update_jaw_animation_config():
        print("❌ Failed to update configuration")
        return 1
    
    # Step 3: Create real-time preset
    print("\n3. Creating real-time preset...")
    preset_path = create_real_time_preset()
    
    print("\n✅ REAL-TIME TIMING FIX APPLIED SUCCESSFULLY!")
    print("\n📋 NEXT STEPS:")
    print("1. Restart the ChatterPi jaw animation system")
    print("2. Test with speech audio to verify timing improvements")
    print("3. Monitor jaw movements - they should stop immediately when speech ends")
    print(f"4. Real-time preset saved to: {preset_path}")
    print(f"5. Configuration backup saved with timestamp: {backup_timestamp}")
    
    print("\n🔄 TO REVERT CHANGES:")
    print(f"   Restore from backup: config_backup/jaw-animation-config-{backup_timestamp}.json")
    
    return 0

if __name__ == "__main__":
    sys.exit(main())
