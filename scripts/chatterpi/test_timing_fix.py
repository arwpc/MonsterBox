#!/usr/bin/env python3
"""
Test Script for ChatterPi Jaw Animation Timing Fix
Verifies that jaw movements are synchronized with speech timing
"""

import sys
import os
import time
import threading
import numpy as np
import logging
from typing import List, Tuple

# Add the chatterpi directory to the path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from real_time_config import get_real_time_animator_config, apply_real_time_config_to_animator
from enhanced_audio_jaw_animator import EnhancedAudioJawAnimator
from audio_processing import AudioProcessor

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class TimingTestResults:
    """Store timing test results"""
    def __init__(self):
        self.speech_start_time = None
        self.speech_end_time = None
        self.jaw_start_time = None
        self.jaw_stop_time = None
        self.max_amplitude = 0.0
        self.silence_detection_time = None
        self.total_lag_ms = 0.0
        
    def calculate_lag(self):
        """Calculate timing lag in milliseconds"""
        if all([self.speech_end_time, self.jaw_stop_time]):
            self.total_lag_ms = (self.jaw_stop_time - self.speech_end_time) * 1000
        return self.total_lag_ms

class JawTimingTester:
    """Test jaw animation timing synchronization"""
    
    def __init__(self):
        self.animator = None
        self.test_results = TimingTestResults()
        self.is_testing = False
        self.monitoring_thread = None
        
    def setup_real_time_animator(self):
        """Setup animator with real-time configuration"""
        try:
            # Create animator with real-time config
            rt_config = get_real_time_animator_config()
            self.animator = EnhancedAudioJawAnimator(rt_config)
            
            if not self.animator.initialize():
                logger.error("Failed to initialize enhanced animator")
                return False
            
            logger.info("✅ Real-time animator initialized")
            return True
            
        except Exception as e:
            logger.error(f"Failed to setup animator: {e}")
            return False
    
    def generate_test_audio_signal(self, duration: float = 2.0) -> np.ndarray:
        """Generate a test audio signal that simulates speech"""
        sample_rate = 16000
        samples = int(duration * sample_rate)
        
        # Create a speech-like signal with envelope
        t = np.linspace(0, duration, samples)
        
        # Base frequency modulation (simulates speech formants)
        base_freq = 200 + 100 * np.sin(2 * np.pi * 3 * t)  # Varying fundamental
        signal = np.sin(2 * np.pi * base_freq * t)
        
        # Add harmonics for more realistic speech
        signal += 0.5 * np.sin(2 * np.pi * 2 * base_freq * t)
        signal += 0.3 * np.sin(2 * np.pi * 3 * base_freq * t)
        
        # Apply speech envelope (attack, sustain, release)
        envelope = np.ones_like(t)
        attack_samples = int(0.1 * sample_rate)  # 100ms attack
        release_samples = int(0.2 * sample_rate)  # 200ms release
        
        # Attack phase
        envelope[:attack_samples] = np.linspace(0, 1, attack_samples)
        # Release phase
        envelope[-release_samples:] = np.linspace(1, 0, release_samples)
        
        # Apply envelope and normalize
        signal = signal * envelope * 0.3  # Scale to reasonable amplitude
        
        return signal.astype(np.float32)
    
    def monitor_jaw_movement(self):
        """Monitor jaw movement during test"""
        if not self.animator:
            return
        
        previous_position = None
        movement_threshold = 0.5  # degrees
        
        while self.is_testing:
            try:
                # Get current servo position
                servo_state = self.animator.servo_controller.get_position()
                current_position = servo_state.angle
                
                # Detect jaw movement start
                if previous_position is not None:
                    movement = abs(current_position - previous_position)
                    
                    if movement > movement_threshold:
                        if self.test_results.jaw_start_time is None:
                            self.test_results.jaw_start_time = time.time()
                            logger.info(f"🦴 Jaw movement started at {current_position:.1f}°")
                        
                        # Update jaw stop time (keeps updating while moving)
                        self.test_results.jaw_stop_time = time.time()
                
                previous_position = current_position
                time.sleep(0.01)  # 100Hz monitoring
                
            except Exception as e:
                logger.error(f"Error monitoring jaw movement: {e}")
                break
    
    def test_simulated_speech(self):
        """Test with simulated speech signal"""
        logger.info("🎤 Testing with simulated speech signal...")
        
        # Generate test audio
        test_audio = self.generate_test_audio_signal(duration=2.0)
        
        # Start monitoring
        self.is_testing = True
        self.monitoring_thread = threading.Thread(target=self.monitor_jaw_movement)
        self.monitoring_thread.start()
        
        # Record speech timing
        self.test_results.speech_start_time = time.time()
        logger.info("🗣️  Speech simulation started")
        
        # Process audio in chunks (simulate real-time processing)
        chunk_size = 320  # 20ms at 16kHz
        sample_rate = 16000
        
        for i in range(0, len(test_audio), chunk_size):
            chunk = test_audio[i:i+chunk_size]
            
            # Pad chunk if necessary
            if len(chunk) < chunk_size:
                chunk = np.pad(chunk, (0, chunk_size - len(chunk)))
            
            # Process audio chunk
            result = self.animator.audio_processor.process_audio_frame(chunk)
            
            # Update servo if needed
            if result['should_update_servo']:
                self.animator.servo_controller.set_position(result['servo_position'])
            
            # Track maximum amplitude
            self.test_results.max_amplitude = max(
                self.test_results.max_amplitude, 
                result['raw_amplitude']
            )
            
            # Simulate real-time processing delay
            time.sleep(0.02)  # 20ms per chunk
        
        # Record speech end time
        self.test_results.speech_end_time = time.time()
        logger.info("🗣️  Speech simulation ended")
        
        # Wait a bit more to see when jaw actually stops
        time.sleep(1.0)
        
        # Stop monitoring
        self.is_testing = False
        if self.monitoring_thread:
            self.monitoring_thread.join(timeout=2.0)
        
        # Calculate results
        lag_ms = self.test_results.calculate_lag()
        
        logger.info("📊 Test Results:")
        logger.info(f"   Speech duration: {(self.test_results.speech_end_time - self.test_results.speech_start_time)*1000:.1f}ms")
        logger.info(f"   Max amplitude: {self.test_results.max_amplitude:.3f}")
        logger.info(f"   Jaw movement lag: {lag_ms:.1f}ms")
        
        return lag_ms
    
    def test_silence_detection(self):
        """Test silence detection speed"""
        logger.info("🔇 Testing silence detection speed...")
        
        # Create audio processor with real-time config
        rt_config = get_real_time_animator_config()
        processor = AudioProcessor(rt_config.audio_config)
        
        # Test with voice followed by silence
        voice_amplitude = 0.1
        silence_amplitude = 0.001
        
        # Process voice frames
        for _ in range(10):
            voice_frame = np.full(320, voice_amplitude, dtype=np.float32)
            result = processor.process_audio_frame(voice_frame)
            assert result['voice_active'], "Voice should be detected"
        
        # Record when silence starts
        silence_start = time.time()
        
        # Process silence frames until voice activity stops
        silence_detected_time = None
        for i in range(100):  # Max 2 seconds of silence frames
            silence_frame = np.full(320, silence_amplitude, dtype=np.float32)
            result = processor.process_audio_frame(silence_frame)
            
            if not result['voice_active'] and silence_detected_time is None:
                silence_detected_time = time.time()
                break
            
            time.sleep(0.02)  # 20ms per frame
        
        if silence_detected_time:
            detection_time_ms = (silence_detected_time - silence_start) * 1000
            logger.info(f"✅ Silence detected in {detection_time_ms:.1f}ms")
            return detection_time_ms
        else:
            logger.error("❌ Silence detection failed")
            return None
    
    def run_comprehensive_test(self):
        """Run comprehensive timing test"""
        logger.info("🧪 Starting comprehensive jaw timing test...")
        
        if not self.setup_real_time_animator():
            return False
        
        try:
            # Test 1: Silence detection speed
            silence_time = self.test_silence_detection()
            
            # Test 2: Simulated speech timing
            speech_lag = self.test_simulated_speech()
            
            # Print comprehensive results
            print("\n" + "="*60)
            print("🎯 CHATTERPI JAW TIMING TEST RESULTS")
            print("="*60)
            
            print(f"\n📊 TIMING MEASUREMENTS:")
            print(f"   Silence Detection Time: {silence_time:.1f}ms" if silence_time else "   Silence Detection: FAILED")
            print(f"   Speech-to-Jaw Lag: {speech_lag:.1f}ms")
            
            print(f"\n✅ PERFORMANCE EVALUATION:")
            if silence_time and silence_time < 100:
                print("   ✓ Silence detection: EXCELLENT (< 100ms)")
            elif silence_time and silence_time < 200:
                print("   ⚠ Silence detection: GOOD (< 200ms)")
            else:
                print("   ❌ Silence detection: NEEDS IMPROVEMENT")
            
            if speech_lag < 50:
                print("   ✓ Speech synchronization: EXCELLENT (< 50ms lag)")
            elif speech_lag < 100:
                print("   ⚠ Speech synchronization: GOOD (< 100ms lag)")
            else:
                print("   ❌ Speech synchronization: NEEDS IMPROVEMENT")
            
            print(f"\n🎯 TARGET ACHIEVED: {'YES' if (silence_time and silence_time < 100 and speech_lag < 50) else 'NO'}")
            
            return True
            
        except Exception as e:
            logger.error(f"Test failed: {e}")
            return False
        
        finally:
            if self.animator:
                self.animator.stop()

def main():
    """Run jaw timing test"""
    print("🧪 ChatterPi Jaw Animation Timing Test")
    print("=" * 50)
    
    tester = JawTimingTester()
    
    try:
        success = tester.run_comprehensive_test()
        return 0 if success else 1
        
    except KeyboardInterrupt:
        print("\n⏹️  Test interrupted by user")
        return 1
    except Exception as e:
        logger.error(f"Test error: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(main())
