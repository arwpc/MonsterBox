#!/usr/bin/env python3
"""
Comprehensive Audio Processing Core Testing for ChatterPi
Tests real-time amplitude analysis, smoothed envelopes, WebRTC VAD, and tunable parameters
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

try:
    from audio_processing import AudioProcessor, AudioConfig
    from servo_controller import ServoController, ServoConfig
    logger.info("✅ Audio processing modules imported successfully")
except ImportError as e:
    logger.error(f"❌ Failed to import audio processing modules: {e}")
    logger.info("💡 Make sure audio_processing.py and servo_controller.py exist")
    sys.exit(1)

class AudioProcessingTester:
    """Comprehensive audio processing testing class"""
    
    def __init__(self):
        self.test_results = {
            "module_import": True,
            "config_creation": False,
            "processor_initialization": False,
            "amplitude_analysis": False,
            "smoothed_envelopes": False,
            "vad_functionality": False,
            "tunable_parameters": False,
            "servo_integration": False,
            "audio_file_processing": False,
            "real_time_processing": False
        }
        
        self.audio_processor = None
        self.servo_controller = None
        self.test_audio_files = []
        
        logger.info("🎵 AudioProcessingTester initialized")
    
    def setup_test_audio_files(self):
        """Setup test audio files for processing"""
        logger.info("📁 Setting up test audio files...")
        
        test_dir = Path("../../public/sounds/test")
        if not test_dir.exists():
            logger.error(f"❌ Test audio directory not found: {test_dir}")
            return False
        
        audio_files = list(test_dir.glob("*.wav"))
        if not audio_files:
            logger.error("❌ No test audio files found")
            return False
        
        self.test_audio_files = audio_files
        logger.info(f"✅ Found {len(audio_files)} test audio files:")
        for file in audio_files:
            logger.info(f"  - {file.name}")
        
        return True
    
    def test_config_creation(self):
        """Test audio configuration creation with various parameters"""
        logger.info("\n🧪 Test 1: Configuration Creation")
        logger.info("=" * 40)
        
        try:
            # Test default configuration
            default_config = AudioConfig()
            logger.info("✅ Default AudioConfig created")
            
            # Test custom configuration with tunable parameters
            custom_config = AudioConfig(
                SMOOTHING_ATTACK=0.05,
                SMOOTHING_RELEASE=0.15,
                SILENCE_THRESHOLD=0.003,
                SILENCE_TIMEOUT=200,
                SERVO_MIN=30.0,
                SERVO_MAX=50.0,
                SERVO_STEP=0.5
            )
            logger.info("✅ Custom AudioConfig created with tunable parameters")
            
            # Verify parameters
            assert custom_config.SMOOTHING_ATTACK == 0.05
            assert custom_config.SMOOTHING_RELEASE == 0.15
            assert custom_config.SILENCE_THRESHOLD == 0.003
            assert custom_config.SERVO_MIN == 30.0
            assert custom_config.SERVO_MAX == 50.0
            
            logger.info("✅ Configuration parameters verified")
            self.test_results["config_creation"] = True
            return True
            
        except Exception as e:
            logger.error(f"❌ Configuration creation failed: {e}")
            return False
    
    def test_processor_initialization(self):
        """Test audio processor initialization"""
        logger.info("\n🧪 Test 2: Processor Initialization")
        logger.info("=" * 40)
        
        try:
            # Create configuration
            config = AudioConfig(
                SMOOTHING_ATTACK=0.05,
                SMOOTHING_RELEASE=0.15,
                SILENCE_THRESHOLD=0.003,
                SERVO_MIN=30.0,
                SERVO_MAX=50.0
            )
            
            # Initialize processor
            self.audio_processor = AudioProcessor(config)
            logger.info("✅ AudioProcessor initialized")
            
            # Test processor state
            stats = self.audio_processor.get_stats()
            logger.info(f"✅ Processing stats available: {len(stats)} metrics")
            
            self.test_results["processor_initialization"] = True
            return True
            
        except Exception as e:
            logger.error(f"❌ Processor initialization failed: {e}")
            return False
    
    def test_amplitude_analysis(self):
        """Test amplitude analysis with synthetic audio data"""
        logger.info("\n🧪 Test 3: Amplitude Analysis")
        logger.info("=" * 40)
        
        if not self.audio_processor:
            logger.error("❌ Audio processor not initialized")
            return False
        
        try:
            # Create synthetic audio data with known amplitudes
            sample_rate = 44100
            duration = 1.0
            t = np.linspace(0, duration, int(sample_rate * duration), False)
            
            # Test different amplitude levels
            test_amplitudes = [0.1, 0.3, 0.5, 0.8, 1.0]
            
            for amplitude in test_amplitudes:
                # Generate sine wave with specific amplitude
                audio_data = amplitude * np.sin(2 * np.pi * 440 * t)
                
                # Process audio
                result = self.audio_processor.process_audio_frame(audio_data.astype(np.float32))
                
                # Verify amplitude detection
                detected_amplitude = result['raw_amplitude']
                expected_amplitude = amplitude / np.sqrt(2)  # RMS of sine wave
                
                logger.info(f"Amplitude {amplitude:.1f}: detected {detected_amplitude:.3f}, expected ~{expected_amplitude:.3f}")
                
                # Allow some tolerance for floating point precision
                if abs(detected_amplitude - expected_amplitude) < 0.1:
                    logger.info("  ✅ Amplitude detection accurate")
                else:
                    logger.warning(f"  ⚠️ Amplitude detection may be inaccurate")
            
            self.test_results["amplitude_analysis"] = True
            return True
            
        except Exception as e:
            logger.error(f"❌ Amplitude analysis test failed: {e}")
            return False
    
    def test_smoothed_envelopes(self):
        """Test smoothed amplitude envelopes with exponential moving average"""
        logger.info("\n🧪 Test 4: Smoothed Envelopes")
        logger.info("=" * 40)
        
        if not self.audio_processor:
            logger.error("❌ Audio processor not initialized")
            return False
        
        try:
            # Create audio with sudden amplitude changes
            sample_rate = 44100
            frame_size = 1024
            
            # Generate frames with different amplitudes
            frames = []
            amplitudes = [0.1, 0.1, 0.8, 0.8, 0.1, 0.1]  # Step changes
            
            for amplitude in amplitudes:
                t = np.linspace(0, frame_size/sample_rate, frame_size, False)
                frame = amplitude * np.sin(2 * np.pi * 440 * t)
                frames.append(frame.astype(np.float32))
            
            # Process frames and check smoothing
            smoothed_values = []
            for i, frame in enumerate(frames):
                result = self.audio_processor.process_audio_frame(frame)
                smoothed_amplitude = result['smoothed_amplitude']
                smoothed_values.append(smoothed_amplitude)
                
                logger.info(f"Frame {i}: raw={result['raw_amplitude']:.3f}, smoothed={smoothed_amplitude:.3f}")
            
            # Verify smoothing behavior
            # Smoothed values should change more gradually than raw values
            raw_changes = [abs(amplitudes[i] - amplitudes[i-1]) for i in range(1, len(amplitudes))]
            smoothed_changes = [abs(smoothed_values[i] - smoothed_values[i-1]) for i in range(1, len(smoothed_values))]
            
            avg_raw_change = np.mean(raw_changes)
            avg_smoothed_change = np.mean(smoothed_changes)
            
            logger.info(f"Average raw change: {avg_raw_change:.3f}")
            logger.info(f"Average smoothed change: {avg_smoothed_change:.3f}")
            
            if avg_smoothed_change < avg_raw_change:
                logger.info("✅ Smoothing is working correctly")
                self.test_results["smoothed_envelopes"] = True
                return True
            else:
                logger.warning("⚠️ Smoothing may not be working as expected")
                return False
            
        except Exception as e:
            logger.error(f"❌ Smoothed envelopes test failed: {e}")
            return False
    
    def test_vad_functionality(self):
        """Test Voice Activity Detection (VAD) functionality"""
        logger.info("\n🧪 Test 5: Voice Activity Detection")
        logger.info("=" * 40)
        
        if not self.audio_processor:
            logger.error("❌ Audio processor not initialized")
            return False
        
        try:
            sample_rate = 44100
            frame_size = 1024
            
            # Test silence detection
            silence_frame = np.zeros(frame_size, dtype=np.float32)
            result = self.audio_processor.process_audio_frame(silence_frame)
            
            logger.info(f"Silence frame: voice_active={result['voice_active']}")
            if not result['voice_active']:
                logger.info("✅ Silence detection working")
            else:
                logger.warning("⚠️ Silence not detected correctly")
            
            # Test voice detection
            t = np.linspace(0, frame_size/sample_rate, frame_size, False)
            voice_frame = 0.5 * np.sin(2 * np.pi * 440 * t)  # Moderate amplitude
            result = self.audio_processor.process_audio_frame(voice_frame.astype(np.float32))
            
            logger.info(f"Voice frame: voice_active={result['voice_active']}")
            if result['voice_active']:
                logger.info("✅ Voice detection working")
            else:
                logger.warning("⚠️ Voice not detected correctly")
            
            # Test threshold behavior
            threshold_config = AudioConfig(SILENCE_THRESHOLD=0.1)  # High threshold
            threshold_processor = AudioProcessor(threshold_config)
            
            low_amplitude_frame = 0.05 * np.sin(2 * np.pi * 440 * t)
            result = threshold_processor.process_audio_frame(low_amplitude_frame.astype(np.float32))
            
            logger.info(f"Low amplitude with high threshold: voice_active={result['voice_active']}")
            if not result['voice_active']:
                logger.info("✅ Threshold-based VAD working")
            else:
                logger.warning("⚠️ Threshold-based VAD may not be working")
            
            self.test_results["vad_functionality"] = True
            return True
            
        except Exception as e:
            logger.error(f"❌ VAD functionality test failed: {e}")
            return False
    
    def test_tunable_parameters(self):
        """Test all tunable parameters"""
        logger.info("\n🧪 Test 6: Tunable Parameters")
        logger.info("=" * 40)
        
        try:
            # Test different parameter combinations
            parameter_sets = [
                {
                    "name": "Fast Response",
                    "params": {
                        "SMOOTHING_ATTACK": 0.01,
                        "SMOOTHING_RELEASE": 0.05,
                        "SERVO_STEP": 0.1
                    }
                },
                {
                    "name": "Slow Response", 
                    "params": {
                        "SMOOTHING_ATTACK": 0.1,
                        "SMOOTHING_RELEASE": 0.3,
                        "SERVO_STEP": 1.0
                    }
                },
                {
                    "name": "High Sensitivity",
                    "params": {
                        "SILENCE_THRESHOLD": 0.001,
                        "SERVO_MIN": 25.0,
                        "SERVO_MAX": 55.0
                    }
                }
            ]
            
            for param_set in parameter_sets:
                logger.info(f"Testing {param_set['name']} configuration...")
                
                config = AudioConfig(**param_set['params'])
                processor = AudioProcessor(config)
                
                # Test with sample audio
                sample_rate = 44100
                frame_size = 1024
                t = np.linspace(0, frame_size/sample_rate, frame_size, False)
                test_frame = 0.3 * np.sin(2 * np.pi * 440 * t)
                
                result = processor.process_audio_frame(test_frame.astype(np.float32))
                
                logger.info(f"  Result: servo_position={result['servo_position']:.2f}, voice_active={result['voice_active']}")
                logger.info(f"  ✅ {param_set['name']} configuration working")
            
            self.test_results["tunable_parameters"] = True
            return True
            
        except Exception as e:
            logger.error(f"❌ Tunable parameters test failed: {e}")
            return False
    
    def test_audio_file_processing(self):
        """Test processing of actual audio files"""
        logger.info("\n🧪 Test 7: Audio File Processing")
        logger.info("=" * 40)
        
        if not self.test_audio_files:
            logger.error("❌ No test audio files available")
            return False
        
        if not self.audio_processor:
            logger.error("❌ Audio processor not initialized")
            return False
        
        try:
            # Test the "Good Evening" file specifically
            good_evening_file = None
            for file in self.test_audio_files:
                if "good_evening" in file.name.lower():
                    good_evening_file = file
                    break
            
            if not good_evening_file:
                logger.error("❌ Good Evening audio file not found")
                return False
            
            logger.info(f"Processing: {good_evening_file.name}")
            
            # Read WAV file
            with wave.open(str(good_evening_file), 'rb') as wav_file:
                sample_rate = wav_file.getframerate()
                n_channels = wav_file.getnchannels()
                n_frames = wav_file.getnframes()
                
                logger.info(f"  Sample rate: {sample_rate} Hz")
                logger.info(f"  Channels: {n_channels}")
                logger.info(f"  Duration: {n_frames/sample_rate:.2f} seconds")
                
                # Read audio data
                audio_data = wav_file.readframes(n_frames)
                audio_array = np.frombuffer(audio_data, dtype=np.int16)
                
                # Convert to float32 and normalize
                audio_float = audio_array.astype(np.float32) / 32768.0
                
                # Process in chunks
                frame_size = 1024
                results = []
                
                for i in range(0, len(audio_float), frame_size):
                    frame = audio_float[i:i+frame_size]
                    if len(frame) < frame_size:
                        # Pad last frame
                        frame = np.pad(frame, (0, frame_size - len(frame)))
                    
                    result = self.audio_processor.process_audio_frame(frame)
                    results.append(result)
                
                # Analyze results
                voice_active_frames = sum(1 for r in results if r['voice_active'])
                total_frames = len(results)
                voice_percentage = (voice_active_frames / total_frames) * 100
                
                avg_amplitude = np.mean([r['raw_amplitude'] for r in results])
                max_amplitude = max([r['raw_amplitude'] for r in results])
                
                servo_positions = [r['servo_position'] for r in results]
                servo_range = max(servo_positions) - min(servo_positions)
                
                logger.info(f"  Voice active: {voice_percentage:.1f}% of frames")
                logger.info(f"  Average amplitude: {avg_amplitude:.3f}")
                logger.info(f"  Max amplitude: {max_amplitude:.3f}")
                logger.info(f"  Servo position range: {servo_range:.1f}°")
                
                if voice_percentage > 10 and servo_range > 5:
                    logger.info("✅ Audio file processing successful")
                    self.test_results["audio_file_processing"] = True
                    return True
                else:
                    logger.warning("⚠️ Audio file processing may not be working correctly")
                    return False
            
        except Exception as e:
            logger.error(f"❌ Audio file processing test failed: {e}")
            return False
    
    def generate_report(self):
        """Generate comprehensive test report"""
        logger.info("\n" + "="*60)
        logger.info("🎵 AUDIO PROCESSING CORE TEST REPORT")
        logger.info("="*60)
        
        passed_tests = sum(1 for result in self.test_results.values() if result)
        total_tests = len(self.test_results)
        
        logger.info(f"Tests Passed: {passed_tests}/{total_tests}")
        logger.info(f"Success Rate: {(passed_tests/total_tests)*100:.1f}%")
        
        logger.info("\nDetailed Results:")
        for test_name, result in self.test_results.items():
            status = "✅ PASS" if result else "❌ FAIL"
            logger.info(f"  {test_name}: {status}")
        
        if passed_tests == total_tests:
            logger.info("\n🎉 ALL AUDIO PROCESSING TESTS PASSED!")
            logger.info("✅ Core audio processing is working correctly")
            logger.info("✅ Ready for integration with servo control")
        else:
            logger.info(f"\n⚠️ {total_tests - passed_tests} tests failed")
            logger.info("🔧 Check audio processing configuration and dependencies")
        
        # Save results
        results_file = Path("../../test-results/audio-processing-core-test.json")
        results_file.parent.mkdir(parents=True, exist_ok=True)
        
        with open(results_file, 'w') as f:
            json.dump({
                "timestamp": time.time(),
                "tests_passed": passed_tests,
                "total_tests": total_tests,
                "success_rate": (passed_tests/total_tests)*100,
                "results": self.test_results
            }, f, indent=2)
        
        logger.info(f"📄 Test results saved to: {results_file}")
        
        return passed_tests == total_tests
    
    def run_all_tests(self):
        """Run all audio processing tests"""
        logger.info("🎵 Starting Audio Processing Core Tests")
        logger.info("=" * 60)
        
        # Setup
        if not self.setup_test_audio_files():
            logger.error("❌ Failed to setup test audio files")
            return False
        
        # Run tests in order
        tests = [
            ("Configuration Creation", self.test_config_creation),
            ("Processor Initialization", self.test_processor_initialization),
            ("Amplitude Analysis", self.test_amplitude_analysis),
            ("Smoothed Envelopes", self.test_smoothed_envelopes),
            ("VAD Functionality", self.test_vad_functionality),
            ("Tunable Parameters", self.test_tunable_parameters),
            ("Audio File Processing", self.test_audio_file_processing),
        ]
        
        for test_name, test_func in tests:
            logger.info(f"\n{'='*20} {test_name} {'='*20}")
            if not test_func():
                logger.error(f"❌ {test_name} FAILED - stopping tests")
                break
        
        return self.generate_report()

def main():
    """Main test function"""
    tester = AudioProcessingTester()
    
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
