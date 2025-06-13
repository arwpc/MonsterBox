#!/usr/bin/env python3
"""
Enhanced ChatterPi Startup Script
Starts the enhanced audio-driven jaw animation system with all improvements
"""

import sys
import os
import time
import signal
import subprocess
import logging
import json
from pathlib import Path

# Add the script directory to Python path
script_dir = Path(__file__).parent
sys.path.insert(0, str(script_dir))

from enhanced_audio_jaw_animator import EnhancedAudioJawAnimator, AnimatorConfig
from audio_processing import AudioConfig
from servo_controller import ServoConfig

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class EnhancedChatterPiSystem:
    """Enhanced ChatterPi system manager"""
    
    def __init__(self):
        self.animator = None
        self.is_running = False
        self.config_file = script_dir / '../data/chatterpi-config.json'
        
        # Setup signal handlers
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)
        
        logger.info("Enhanced ChatterPi system initialized")
    
    def load_configuration(self) -> AnimatorConfig:
        """Load configuration from file or create default"""
        try:
            if self.config_file.exists():
                with open(self.config_file, 'r') as f:
                    config_data = json.load(f)
                
                logger.info(f"Configuration loaded from {self.config_file}")
                
                # Create configuration objects
                audio_config = AudioConfig()
                servo_config = ServoConfig()
                animator_config = AnimatorConfig()
                
                # Apply audio settings
                if 'audio' in config_data:
                    audio_settings = config_data['audio']
                    audio_config.SMOOTHING_ATTACK = audio_settings.get('smoothing_attack', 0.1)
                    audio_config.SMOOTHING_RELEASE = audio_settings.get('smoothing_release', 0.01)
                    audio_config.SILENCE_THRESHOLD = audio_settings.get('silence_threshold', 0.005)
                    audio_config.SILENCE_TIMEOUT = audio_settings.get('silence_timeout', 500)
                
                # Apply servo settings
                if 'servo' in config_data:
                    servo_settings = config_data['servo']
                    servo_config.step_threshold = servo_settings.get('step_threshold', 1.0)
                
                # Apply calibration settings
                if 'calibration' in config_data:
                    cal_settings = config_data['calibration']
                    servo_config.pin = cal_settings.get('servo_pin', 18)
                    servo_config.max_angle = cal_settings.get('closed_angle', 50.0)  # Closed position
                    servo_config.min_angle = cal_settings.get('open_angle', 30.0)    # Open position
                
                # Apply animator settings
                animator_config.update_rate_hz = config_data.get('update_rate_hz', 50.0)
                animator_config.audio_config = audio_config
                animator_config.servo_config = servo_config
                
                return animator_config
                
            else:
                logger.info("No configuration file found, using defaults")
                return AnimatorConfig()
                
        except Exception as e:
            logger.error(f"Error loading configuration: {e}")
            logger.info("Using default configuration")
            return AnimatorConfig()
    
    def save_configuration(self, config: AnimatorConfig):
        """Save current configuration to file"""
        try:
            # Ensure data directory exists
            self.config_file.parent.mkdir(parents=True, exist_ok=True)
            
            config_data = {
                'version': '2.0.0',
                'saved_at': time.strftime('%Y-%m-%d %H:%M:%S'),
                'calibration': {
                    'servo_pin': config.servo_config.pin,
                    'closed_angle': config.servo_config.max_angle,
                    'open_angle': config.servo_config.min_angle
                },
                'audio': {
                    'smoothing_attack': config.audio_config.SMOOTHING_ATTACK,
                    'smoothing_release': config.audio_config.SMOOTHING_RELEASE,
                    'silence_threshold': config.audio_config.SILENCE_THRESHOLD,
                    'silence_timeout': config.audio_config.SILENCE_TIMEOUT
                },
                'servo': {
                    'step_threshold': config.servo_config.step_threshold
                },
                'update_rate_hz': config.update_rate_hz
            }
            
            with open(self.config_file, 'w') as f:
                json.dump(config_data, f, indent=2)
            
            logger.info(f"Configuration saved to {self.config_file}")
            
        except Exception as e:
            logger.error(f"Error saving configuration: {e}")
    
    def start_system(self):
        """Start the enhanced ChatterPi system"""
        try:
            logger.info("🎭 Starting Enhanced ChatterPi System")
            logger.info("=" * 60)
            
            # Load configuration
            config = self.load_configuration()
            
            # Log configuration
            logger.info("Configuration:")
            logger.info(f"  Servo: GPIO {config.servo_config.pin}, "
                       f"closed={config.servo_config.max_angle}°, "
                       f"open={config.servo_config.min_angle}°")
            logger.info(f"  Audio: attack={config.audio_config.SMOOTHING_ATTACK}, "
                       f"release={config.audio_config.SMOOTHING_RELEASE}")
            logger.info(f"  VAD: threshold={config.audio_config.SILENCE_THRESHOLD}, "
                       f"timeout={config.audio_config.SILENCE_TIMEOUT}ms")
            logger.info(f"  Servo: step_threshold={config.servo_config.step_threshold}°")
            logger.info(f"  Update rate: {config.update_rate_hz} Hz")
            
            # Create and start animator
            self.animator = EnhancedAudioJawAnimator(config)
            
            if self.animator.start_animation():
                self.is_running = True
                logger.info("✅ Enhanced ChatterPi system started successfully")
                logger.info("🎤 Speak into the microphone to see jaw movement!")
                logger.info("Press Ctrl+C to stop the system")
                
                # Save current configuration
                self.save_configuration(config)
                
                # Main loop
                self._main_loop()
                
            else:
                logger.error("❌ Failed to start enhanced ChatterPi system")
                return False
                
        except Exception as e:
            logger.error(f"❌ Error starting system: {e}")
            return False
        
        return True
    
    def _main_loop(self):
        """Main system loop"""
        last_stats_time = time.time()
        stats_interval = 30.0  # Log stats every 30 seconds
        
        try:
            while self.is_running:
                time.sleep(1)
                
                # Periodic status logging
                current_time = time.time()
                if current_time - last_stats_time >= stats_interval:
                    self._log_system_status()
                    last_stats_time = current_time
                
        except KeyboardInterrupt:
            logger.info("⚠️ System interrupted by user")
        except Exception as e:
            logger.error(f"❌ Error in main loop: {e}")
        finally:
            self.stop_system()
    
    def _log_system_status(self):
        """Log current system status"""
        if self.animator:
            try:
                status = self.animator.get_status()
                
                logger.info("📊 System Status:")
                logger.info(f"   Runtime: {status['runtime']:.1f}s")
                logger.info(f"   Audio frames: {status['stats']['frames_processed']}")
                logger.info(f"   Servo updates: {status['stats']['servo_updates']}")
                logger.info(f"   Current position: {status['servo_controller']['current_position']:.1f}°")
                logger.info(f"   Voice activity: {status['audio_processor']['voice_activity_ratio']:.1%}")
                
                if status['stats']['buffer_overruns'] > 0:
                    logger.warning(f"   Buffer overruns: {status['stats']['buffer_overruns']}")
                
                if status['stats']['processing_errors'] > 0:
                    logger.warning(f"   Processing errors: {status['stats']['processing_errors']}")
                    
            except Exception as e:
                logger.error(f"Error logging status: {e}")
    
    def stop_system(self):
        """Stop the enhanced ChatterPi system"""
        logger.info("🛑 Stopping Enhanced ChatterPi system...")
        self.is_running = False
        
        if self.animator:
            self.animator.stop_animation()
            self.animator = None
        
        logger.info("✅ Enhanced ChatterPi system stopped")
    
    def _signal_handler(self, signum, frame):
        """Handle system signals"""
        logger.info(f"Received signal {signum}, shutting down...")
        self.stop_system()
        sys.exit(0)

def main():
    """Main entry point"""
    print("🎭 Enhanced ChatterPi Audio-Driven Jaw Animation System")
    print("=" * 60)
    print("Features:")
    print("  ✅ Smoothed audio envelopes with separate attack/release")
    print("  ✅ Voice activity detection with silence timeout")
    print("  ✅ Hardware-timed PWM using pigpio")
    print("  ✅ Jitter reduction with servo step threshold")
    print("  ✅ Configurable parameters via web interface")
    print("  ✅ Real-time statistics and monitoring")
    print("=" * 60)
    
    # Check if running as root (required for pigpio)
    if os.geteuid() != 0:
        print("⚠️  Warning: Not running as root. GPIO access may be limited.")
        print("   For full functionality, run with: sudo python3 start_enhanced_chatterpi.py")
        print()
    
    # Check if pigpio daemon is running
    try:
        result = subprocess.run(['pgrep', 'pigpiod'], capture_output=True)
        if result.returncode != 0:
            print("⚠️  Warning: pigpio daemon not running.")
            print("   Start with: sudo pigpiod")
            print("   Or the system will attempt to start it automatically.")
            print()
    except Exception:
        pass
    
    # Start the system
    system = EnhancedChatterPiSystem()
    
    try:
        success = system.start_system()
        if not success:
            sys.exit(1)
    except Exception as e:
        logger.error(f"Fatal error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
