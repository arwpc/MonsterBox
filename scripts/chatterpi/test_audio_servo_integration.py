#!/usr/bin/env python3
"""
Comprehensive Audio-to-Servo Integration Testing for ChatterPi
Tests the complete pipeline: Audio File -> Audio Processing -> Servo Movement
Specifically tests the "Good Evening" WAV file with physical jaw movement
"""

import sys
import os
import time
import json
import wave
import numpy as np
import logging
from pathlib import Path

# Add the current directory to Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Import modules
try:
    from audio_processing import AudioProcessor, AudioConfig
    from servo_controller import ServoController, ServoConfig
    logger.info("✅ Audio processing and servo control modules imported")
except ImportError as e:
    logger.error(f"❌ Failed to import modules: {e}")
    sys.exit(1)

# Try to import GPIO libraries
GPIO_AVAILABLE = False
try:
    import pigpio
    GPIO_AVAILABLE = True
    logger.info("✅ pigpio library available")
except ImportError:
    logger.warning("⚠️ pigpio library not available - running in simulation mode")

class AudioServoIntegrationTester:
    """Complete audio-to-servo integration testing"""
    
    def __init__(self):
        self.test_results = {
            "setup": False,
            "audio_file_loading": False,
            "audio_processing_pipeline": False,
            "servo_control_integration": False,
            "good_evening_test": False,
            "amplitude_test": False,
            "silence_test": False,
            "real_time_performance": False
        }
        
        self.audio_processor = None
        self.servo_controller = None
        self.test_audio_files = []
        
        logger.info("🎵🦴 AudioServoIntegrationTester initialized")
    
    def setup_components(self):
        """Setup audio processor and servo controller"""
        logger.info("🔧 Setting up audio processor and servo controller...")
        
        try:
            # Create optimized audio configuration for jaw animation
            audio_config = AudioConfig(
                SMOOTHING_ATTACK=0.1,      # Moderate attack for natural movement
                SMOOTHING_RELEASE=0.05,    # Faster release for responsiveness
                SILENCE_THRESHOLD=0.01,    # Lower threshold for better sensitivity
                SILENCE_TIMEOUT=150,       # Slightly longer timeout
                SERVO_MIN=50.0,           # Closed position
                SERVO_MAX=30.0,           # Open position
                SERVO_STEP=0.3            # More sensitive movement
            )
            
            self.audio_processor = AudioProcessor(audio_config)
            logger.info("✅ Audio processor initialized")
            
            # Setup servo controller
            if GPIO_AVAILABLE:
                servo_config = ServoConfig(
                    pin=18,
                    min_angle=30.0,
                    max_angle=50.0,
                    step_threshold=0.3,
                    enable_immediate_mode=True  # For real-time response
                )
                self.servo_controller = ServoController(servo_config)
                
                if self.servo_controller.initialize():
                    logger.info("✅ Servo controller initialized")
                else:
                    logger.error("❌ Servo controller initialization failed")
                    return False
            else:
                logger.info("📋 Servo controller running in simulation mode")
                self.servo_controller = None
            
            self.test_results["setup"] = True
            return True
            
        except Exception as e:
            logger.error(f"❌ Component setup failed: {e}")
            return False
    
    def load_test_audio_files(self):
        """Load test audio files"""
        logger.info("📁 Loading test audio files...")
        
        test_dir = Path("../../public/sounds/test")
        if not test_dir.exists():
            logger.error(f"❌ Test audio directory not found: {test_dir}")
            return False
        
        audio_files = list(test_dir.glob("*.wav"))
        if not audio_files:
            logger.error("❌ No test audio files found")
            return False
        
        self.test_audio_files = {file.stem: file for file in audio_files}
        logger.info(f"✅ Loaded {len(audio_files)} test audio files:")
        for name in self.test_audio_files.keys():
            logger.info(f"  - {name}")
        
        self.test_results["audio_file_loading"] = True
        return True
    
    def process_audio_file_with_servo(self, audio_file_path, description=""):
        """Process an audio file and control servo based on amplitude"""
        logger.info(f"🎵 Processing audio file: {audio_file_path.name}")
        if description:
            logger.info(f"   Description: {description}")
        
        try:
            # Read WAV file
            with wave.open(str(audio_file_path), 'rb') as wav_file:
                sample_rate = wav_file.getframerate()
                n_channels = wav_file.getnchannels()
                n_frames = wav_file.getnframes()
                duration = n_frames / sample_rate
                
                logger.info(f"   Sample rate: {sample_rate} Hz")
                logger.info(f"   Duration: {duration:.2f} seconds")
                
                # Read audio data
                audio_data = wav_file.readframes(n_frames)
                audio_array = np.frombuffer(audio_data, dtype=np.int16)
                
                # Convert to float32 and normalize
                audio_float = audio_array.astype(np.float32) / 32768.0
            
            # Process audio in real-time chunks
            frame_size = 1024  # ~23ms at 44.1kHz
            results = []
            servo_positions = []
            
            logger.info("   🎭 Starting real-time audio processing with servo control...")
            
            start_time = time.time()
            
            for i in range(0, len(audio_float), frame_size):
                frame = audio_float[i:i+frame_size]
                if len(frame) < frame_size:
                    # Pad last frame
                    frame = np.pad(frame, (0, frame_size - len(frame)))
                
                # Process audio frame
                result = self.audio_processor.process_audio_frame(frame)
                results.append(result)
                
                # Control servo if needed
                if result['should_update_servo']:
                    servo_position = result['servo_position']
                    servo_positions.append(servo_position)
                    
                    if self.servo_controller:
                        # Move physical servo
                        self.servo_controller.set_position(servo_position)
                        logger.debug(f"   🦴 Servo moved to {servo_position:.1f}°")
                    else:
                        # Simulation mode
                        logger.debug(f"   🦴 [SIM] Servo would move to {servo_position:.1f}°")
                
                # Simulate real-time processing delay
                time.sleep(0.01)  # 10ms processing time
            
            processing_time = time.time() - start_time
            
            # Analyze results
            voice_active_frames = sum(1 for r in results if r['voice_active'])
            total_frames = len(results)
            voice_percentage = (voice_active_frames / total_frames) * 100
            
            amplitudes = [r['raw_amplitude'] for r in results]
            avg_amplitude = np.mean(amplitudes)
            max_amplitude = max(amplitudes)
            
            all_servo_positions = [r['servo_position'] for r in results]
            servo_range = max(all_servo_positions) - min(all_servo_positions)
            servo_updates = sum(1 for r in results if r['should_update_servo'])
            
            logger.info(f"   📊 Processing Results:")
            logger.info(f"      Voice active: {voice_percentage:.1f}% of frames")
            logger.info(f"      Average amplitude: {avg_amplitude:.3f}")
            logger.info(f"      Max amplitude: {max_amplitude:.3f}")
            logger.info(f"      Servo position range: {servo_range:.1f}°")
            logger.info(f"      Servo updates: {servo_updates}/{total_frames}")
            logger.info(f"      Processing time: {processing_time:.2f}s (real-time: {duration:.2f}s)")
            
            # Return servo to closed position
            if self.servo_controller:
                self.servo_controller.set_position(50.0)  # Closed
                time.sleep(0.5)
            
            return {
                'voice_percentage': voice_percentage,
                'avg_amplitude': avg_amplitude,
                'max_amplitude': max_amplitude,
                'servo_range': servo_range,
                'servo_updates': servo_updates,
                'processing_time': processing_time,
                'real_time_ratio': processing_time / duration
            }
            
        except Exception as e:
            logger.error(f"❌ Audio file processing failed: {e}")
            return None
    
    def test_good_evening_file(self):
        """Test the specific 'Good Evening' audio file"""
        logger.info("\n🧪 Test: Good Evening Audio File")
        logger.info("=" * 50)
        
        if 'good_evening' not in self.test_audio_files:
            logger.error("❌ Good Evening audio file not found")
            return False
        
        try:
            result = self.process_audio_file_with_servo(
                self.test_audio_files['good_evening'],
                "Speech pattern simulating 'Good Evening'"
            )
            
            if result is None:
                return False
            
            # Validate results
            success_criteria = [
                (result['voice_percentage'] > 20, f"Voice activity: {result['voice_percentage']:.1f}% (should be > 20%)"),
                (result['servo_range'] > 3, f"Servo range: {result['servo_range']:.1f}° (should be > 3°)"),
                (result['servo_updates'] > 10, f"Servo updates: {result['servo_updates']} (should be > 10)"),
                (result['real_time_ratio'] < 2.0, f"Real-time performance: {result['real_time_ratio']:.2f}x (should be < 2.0x)")
            ]
            
            all_passed = True
            for passed, message in success_criteria:
                if passed:
                    logger.info(f"   ✅ {message}")
                else:
                    logger.warning(f"   ⚠️ {message}")
                    all_passed = False
            
            if all_passed:
                logger.info("✅ Good Evening test PASSED")
                self.test_results["good_evening_test"] = True
                return True
            else:
                logger.warning("⚠️ Good Evening test had some issues")
                return False
                
        except Exception as e:
            logger.error(f"❌ Good Evening test failed: {e}")
            return False
    
    def test_amplitude_test_file(self):
        """Test the amplitude test file with varying levels"""
        logger.info("\n🧪 Test: Amplitude Test File")
        logger.info("=" * 50)
        
        if 'amplitude_test' not in self.test_audio_files:
            logger.error("❌ Amplitude test file not found")
            return False
        
        try:
            result = self.process_audio_file_with_servo(
                self.test_audio_files['amplitude_test'],
                "Varying amplitude levels for jaw movement testing"
            )
            
            if result is None:
                return False
            
            # This file should have significant servo movement
            if result['servo_range'] > 10:
                logger.info("✅ Amplitude test PASSED - good servo range")
                self.test_results["amplitude_test"] = True
                return True
            else:
                logger.warning(f"⚠️ Amplitude test - limited servo range: {result['servo_range']:.1f}°")
                return False
                
        except Exception as e:
            logger.error(f"❌ Amplitude test failed: {e}")
            return False
    
    def test_silence_bursts_file(self):
        """Test the silence with bursts file"""
        logger.info("\n🧪 Test: Silence with Bursts File")
        logger.info("=" * 50)
        
        if 'silence_bursts' not in self.test_audio_files:
            logger.error("❌ Silence bursts file not found")
            return False
        
        try:
            result = self.process_audio_file_with_servo(
                self.test_audio_files['silence_bursts'],
                "Mostly silent with brief sound bursts"
            )
            
            if result is None:
                return False
            
            # This file should have low voice activity but some servo movement
            success_criteria = [
                (result['voice_percentage'] < 50, f"Voice activity: {result['voice_percentage']:.1f}% (should be < 50%)"),
                (result['servo_range'] > 5, f"Servo range: {result['servo_range']:.1f}° (should be > 5°)")
            ]
            
            all_passed = True
            for passed, message in success_criteria:
                if passed:
                    logger.info(f"   ✅ {message}")
                else:
                    logger.warning(f"   ⚠️ {message}")
                    all_passed = False
            
            if all_passed:
                logger.info("✅ Silence bursts test PASSED")
                self.test_results["silence_test"] = True
                return True
            else:
                logger.warning("⚠️ Silence bursts test had issues")
                return False
                
        except Exception as e:
            logger.error(f"❌ Silence bursts test failed: {e}")
            return False
    
    def test_real_time_performance(self):
        """Test real-time performance with continuous processing"""
        logger.info("\n🧪 Test: Real-Time Performance")
        logger.info("=" * 50)
        
        try:
            # Test with a longer audio file or multiple files
            total_processing_time = 0
            total_audio_duration = 0
            
            for name, file_path in self.test_audio_files.items():
                logger.info(f"   Testing performance with: {name}")
                
                start_time = time.time()
                result = self.process_audio_file_with_servo(file_path, f"Performance test: {name}")
                end_time = time.time()
                
                if result:
                    # Get audio duration
                    with wave.open(str(file_path), 'rb') as wav_file:
                        duration = wav_file.getnframes() / wav_file.getframerate()
                    
                    processing_time = end_time - start_time
                    total_processing_time += processing_time
                    total_audio_duration += duration
                    
                    logger.info(f"      Performance: {processing_time/duration:.2f}x real-time")
            
            overall_performance = total_processing_time / total_audio_duration
            logger.info(f"   📊 Overall Performance: {overall_performance:.2f}x real-time")
            
            if overall_performance < 1.5:  # Should process faster than 1.5x real-time
                logger.info("✅ Real-time performance test PASSED")
                self.test_results["real_time_performance"] = True
                return True
            else:
                logger.warning("⚠️ Real-time performance may be too slow")
                return False
                
        except Exception as e:
            logger.error(f"❌ Real-time performance test failed: {e}")
            return False
    
    def cleanup(self):
        """Clean up resources"""
        if self.servo_controller:
            try:
                # Return servo to closed position
                self.servo_controller.set_position(50.0)
                time.sleep(0.5)
                self.servo_controller.cleanup()
                logger.info("🧹 Servo controller cleanup completed")
            except Exception as e:
                logger.error(f"⚠️ Servo cleanup error: {e}")
    
    def generate_report(self):
        """Generate comprehensive test report"""
        logger.info("\n" + "="*60)
        logger.info("🎵🦴 AUDIO-SERVO INTEGRATION TEST REPORT")
        logger.info("="*60)
        
        passed_tests = sum(1 for result in self.test_results.values() if result)
        total_tests = len(self.test_results)
        
        logger.info(f"Hardware Available: {'✅ YES' if GPIO_AVAILABLE else '❌ NO (Simulation)'}")
        logger.info(f"Tests Passed: {passed_tests}/{total_tests}")
        logger.info(f"Success Rate: {(passed_tests/total_tests)*100:.1f}%")
        
        logger.info("\nDetailed Results:")
        for test_name, result in self.test_results.items():
            status = "✅ PASS" if result else "❌ FAIL"
            logger.info(f"  {test_name}: {status}")
        
        if passed_tests == total_tests:
            logger.info("\n🎉 ALL AUDIO-SERVO INTEGRATION TESTS PASSED!")
            logger.info("✅ Audio processing pipeline is working correctly")
            logger.info("✅ Servo control integration is functional")
            logger.info("✅ 'Good Evening' WAV file triggers proper jaw movement")
            logger.info("✅ Ready for full ChatterPi AI integration!")
        else:
            logger.info(f"\n⚠️ {total_tests - passed_tests} tests failed")
            logger.info("🔧 Check audio processing and servo control integration")
        
        # Save results
        results_file = Path("../../test-results/audio-servo-integration-test.json")
        results_file.parent.mkdir(parents=True, exist_ok=True)
        
        with open(results_file, 'w') as f:
            json.dump({
                "timestamp": time.time(),
                "hardware_available": GPIO_AVAILABLE,
                "tests_passed": passed_tests,
                "total_tests": total_tests,
                "success_rate": (passed_tests/total_tests)*100,
                "results": self.test_results
            }, f, indent=2)
        
        logger.info(f"📄 Test results saved to: {results_file}")
        
        return passed_tests == total_tests
    
    def run_all_tests(self):
        """Run all audio-servo integration tests"""
        logger.info("🎵🦴 Starting Audio-Servo Integration Tests")
        logger.info("=" * 60)
        
        try:
            # Setup
            if not self.setup_components():
                logger.error("❌ Component setup failed")
                return False
            
            if not self.load_test_audio_files():
                logger.error("❌ Audio file loading failed")
                return False
            
            # Run tests
            tests = [
                ("Good Evening File", self.test_good_evening_file),
                ("Amplitude Test File", self.test_amplitude_test_file),
                ("Silence Bursts File", self.test_silence_bursts_file),
                ("Real-Time Performance", self.test_real_time_performance),
            ]
            
            for test_name, test_func in tests:
                logger.info(f"\n{'='*20} {test_name} {'='*20}")
                test_func()  # Continue even if tests fail to get full picture
            
            return self.generate_report()
            
        except Exception as e:
            logger.error(f"❌ Test execution failed: {e}")
            return False
        finally:
            self.cleanup()

def main():
    """Main test function"""
    tester = AudioServoIntegrationTester()
    
    try:
        success = tester.run_all_tests()
        return 0 if success else 1
    except KeyboardInterrupt:
        logger.info("\n⚠️ Test interrupted by user")
        return 1
    except Exception as e:
        logger.error(f"❌ Test failed with error: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(main())
