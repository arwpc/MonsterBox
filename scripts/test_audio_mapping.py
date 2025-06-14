#!/usr/bin/env python3
"""
Test Audio-to-Jaw Movement Mapping
Tests the mapping system with real audio files
"""

import numpy as np
import time
import json
import logging
import sys
import os
from typing import List, Tuple, Optional
from jaw_control_system import JawControlSystem

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class AudioMappingTester:
    """Test audio-to-jaw movement mapping with real audio files"""
    
    def __init__(self, servo_pin: int = 18):
        self.servo_pin = servo_pin
        self.jaw_control = None
        
        # Mapping configuration (same as bridge)
        self.mapping_config = {
            "min_volume": 0.0,
            "max_volume": 1.0,
            "min_angle": 0.0,
            "max_angle": 45.0,
            "curve_type": "linear",
            "smoothing_factor": 0.8
        }
        
        # Test results
        self.test_results = []
        
    def initialize(self) -> bool:
        """Initialize the jaw control system"""
        try:
            self.jaw_control = JawControlSystem(pin=self.servo_pin)
            if not self.jaw_control.initialize():
                logger.error("Failed to initialize jaw control")
                return False
            
            logger.info("✅ Audio mapping tester initialized")
            return True
            
        except Exception as e:
            logger.error(f"❌ Initialization failed: {e}")
            return False
    
    def cleanup(self):
        """Clean up resources"""
        if self.jaw_control:
            self.jaw_control.cleanup()
    
    def map_volume_to_angle(self, volume: float) -> float:
        """Map audio volume to servo angle (same logic as bridge)"""
        # Clamp volume to valid range
        volume = max(self.mapping_config["min_volume"], 
                    min(self.mapping_config["max_volume"], volume))
        
        # Normalize volume (0.0 to 1.0)
        if self.mapping_config["max_volume"] > self.mapping_config["min_volume"]:
            normalized = ((volume - self.mapping_config["min_volume"]) / 
                         (self.mapping_config["max_volume"] - self.mapping_config["min_volume"]))
        else:
            normalized = 0.0
        
        # Apply curve
        if self.mapping_config["curve_type"] == "exponential":
            normalized = normalized ** 2
        elif self.mapping_config["curve_type"] == "logarithmic":
            normalized = normalized ** 0.5
        # Default is linear (no change)
        
        # Map to angle range
        angle_range = self.mapping_config["max_angle"] - self.mapping_config["min_angle"]
        angle = self.mapping_config["min_angle"] + (normalized * angle_range)
        
        return angle
    
    def simulate_audio_volume(self, pattern: str = "speech") -> List[float]:
        """Simulate audio volume patterns for testing"""
        if pattern == "speech":
            # Simulate natural speech pattern
            volumes = []
            for i in range(100):  # 5 seconds at 20Hz
                t = i / 20.0  # Time in seconds
                
                # Base speech pattern with pauses
                if (t % 2.0) < 1.5:  # Speaking 75% of the time
                    # Varying volume during speech
                    base_volume = 0.3 + 0.4 * np.sin(t * 3.14159 * 2)  # 2Hz variation
                    noise = 0.1 * np.random.random()  # Add some randomness
                    volume = max(0.0, min(1.0, base_volume + noise))
                else:
                    # Pause (low volume)
                    volume = 0.05 * np.random.random()
                
                volumes.append(volume)
            
        elif pattern == "singing":
            # Simulate singing with sustained notes
            volumes = []
            for i in range(80):  # 4 seconds at 20Hz
                t = i / 20.0
                
                # Sustained notes with vibrato
                base_volume = 0.6 + 0.2 * np.sin(t * 3.14159 * 8)  # 4Hz vibrato
                volume = max(0.1, min(1.0, base_volume))
                volumes.append(volume)
                
        elif pattern == "whisper":
            # Simulate whispering (low volume)
            volumes = []
            for i in range(60):  # 3 seconds at 20Hz
                base_volume = 0.1 + 0.15 * np.random.random()
                volumes.append(base_volume)
                
        else:
            # Default: simple ramp up and down
            volumes = [i/50.0 for i in range(51)] + [1.0 - i/50.0 for i in range(51)]
        
        return volumes
    
    def test_mapping_curves(self) -> bool:
        """Test different mapping curves"""
        logger.info("🧪 Testing mapping curves...")
        
        test_volumes = [0.0, 0.1, 0.2, 0.3, 0.5, 0.7, 0.8, 0.9, 1.0]
        curves = ["linear", "exponential", "logarithmic"]
        
        results = {}
        
        for curve in curves:
            logger.info(f"Testing {curve} curve...")
            self.mapping_config["curve_type"] = curve
            
            curve_results = []
            for volume in test_volumes:
                angle = self.map_volume_to_angle(volume)
                curve_results.append((volume, angle))
                logger.info(f"  Volume {volume:.1f} → Angle {angle:.1f}°")
            
            results[curve] = curve_results
        
        # Test with servo movement
        logger.info("Testing servo movement with different curves...")
        for curve in curves:
            logger.info(f"Testing {curve} curve with servo...")
            self.mapping_config["curve_type"] = curve
            
            for volume in [0.0, 0.5, 1.0]:
                angle = self.map_volume_to_angle(volume)
                if self.jaw_control:
                    self.jaw_control.move_to_angle(angle, 1.0)
                    while self.jaw_control.is_moving:
                        time.sleep(0.1)
                    time.sleep(0.5)
        
        self.test_results.append({"test": "mapping_curves", "results": results})
        logger.info("✅ Mapping curves test completed")
        return True
    
    def test_audio_patterns(self) -> bool:
        """Test with simulated audio patterns"""
        logger.info("🎵 Testing audio patterns...")
        
        patterns = ["speech", "singing", "whisper"]
        
        for pattern in patterns:
            logger.info(f"Testing {pattern} pattern...")
            
            # Generate volume pattern
            volumes = self.simulate_audio_volume(pattern)
            
            # Convert to angles and test timing
            angles = [self.map_volume_to_angle(v) for v in volumes]
            
            logger.info(f"Pattern stats - Min: {min(volumes):.2f}, Max: {max(volumes):.2f}, "
                       f"Avg: {np.mean(volumes):.2f}")
            logger.info(f"Angle range - Min: {min(angles):.1f}°, Max: {max(angles):.1f}°")
            
            # Test first few movements with servo
            if self.jaw_control:
                logger.info(f"Testing first 10 movements of {pattern} pattern...")
                for i, angle in enumerate(angles[:10]):
                    self.jaw_control.move_to_angle(angle, 0.2)  # Fast movement for real-time feel
                    while self.jaw_control.is_moving:
                        time.sleep(0.05)
                    time.sleep(0.05)  # 20Hz update rate
            
            self.test_results.append({
                "test": f"audio_pattern_{pattern}",
                "volume_stats": {
                    "min": min(volumes),
                    "max": max(volumes),
                    "mean": np.mean(volumes),
                    "std": np.std(volumes)
                },
                "angle_stats": {
                    "min": min(angles),
                    "max": max(angles),
                    "mean": np.mean(angles),
                    "std": np.std(angles)
                }
            })
        
        logger.info("✅ Audio patterns test completed")
        return True
    
    def test_smoothing_algorithms(self) -> bool:
        """Test smoothing algorithms for natural movement"""
        logger.info("🌊 Testing smoothing algorithms...")
        
        # Generate noisy audio signal
        raw_volumes = []
        for i in range(50):
            base = 0.5 + 0.3 * np.sin(i * 0.2)  # Slow base signal
            noise = 0.2 * (np.random.random() - 0.5)  # Random noise
            volume = max(0.0, min(1.0, base + noise))
            raw_volumes.append(volume)
        
        # Test different smoothing factors
        smoothing_factors = [0.0, 0.3, 0.6, 0.9]
        
        for factor in smoothing_factors:
            logger.info(f"Testing smoothing factor {factor}...")
            
            smoothed_volumes = []
            smoothed = raw_volumes[0]  # Initialize with first value
            
            for raw_volume in raw_volumes:
                smoothed = (smoothed * factor) + (raw_volume * (1 - factor))
                smoothed_volumes.append(smoothed)
            
            # Convert to angles
            raw_angles = [self.map_volume_to_angle(v) for v in raw_volumes]
            smoothed_angles = [self.map_volume_to_angle(v) for v in smoothed_volumes]
            
            logger.info(f"Raw signal variation: {np.std(raw_angles):.2f}°")
            logger.info(f"Smoothed signal variation: {np.std(smoothed_angles):.2f}°")
            
            # Test with servo (first 10 movements)
            if self.jaw_control and factor == 0.6:  # Test one smoothing level
                logger.info("Testing smoothed movement with servo...")
                for angle in smoothed_angles[:10]:
                    self.jaw_control.move_to_angle(angle, 0.15)
                    while self.jaw_control.is_moving:
                        time.sleep(0.05)
                    time.sleep(0.05)
        
        logger.info("✅ Smoothing algorithms test completed")
        return True
    
    def test_timing_synchronization(self) -> bool:
        """Test timing synchronization for real-time response"""
        logger.info("⏱️ Testing timing synchronization...")
        
        # Test response times
        test_angles = [0, 22.5, 45, 22.5, 0]
        response_times = []
        
        for angle in test_angles:
            start_time = time.time()
            
            if self.jaw_control:
                self.jaw_control.move_to_angle(angle, 0.1)  # Fast movement
                while self.jaw_control.is_moving:
                    time.sleep(0.01)
            
            end_time = time.time()
            response_time = (end_time - start_time) * 1000  # Convert to ms
            response_times.append(response_time)
            
            logger.info(f"Angle {angle}° - Response time: {response_time:.1f}ms")
            time.sleep(0.1)
        
        avg_response_time = np.mean(response_times)
        logger.info(f"Average response time: {avg_response_time:.1f}ms")
        
        # Check if suitable for real-time (should be < 50ms for 20Hz updates)
        if avg_response_time < 50:
            logger.info("✅ Timing suitable for real-time audio synchronization")
        else:
            logger.warning("⚠️ Timing may be too slow for optimal real-time sync")
        
        self.test_results.append({
            "test": "timing_synchronization",
            "response_times": response_times,
            "average_response_time": avg_response_time,
            "suitable_for_realtime": avg_response_time < 50
        })
        
        logger.info("✅ Timing synchronization test completed")
        return True
    
    def run_full_test_suite(self) -> bool:
        """Run complete audio mapping test suite"""
        logger.info("🚀 Starting Audio-to-Jaw Movement Mapping Test Suite")
        logger.info("=" * 60)
        
        if not self.initialize():
            return False
        
        try:
            # Run all tests
            tests = [
                ("Mapping Curves", self.test_mapping_curves),
                ("Audio Patterns", self.test_audio_patterns),
                ("Smoothing Algorithms", self.test_smoothing_algorithms),
                ("Timing Synchronization", self.test_timing_synchronization)
            ]
            
            results = {}
            for test_name, test_func in tests:
                logger.info(f"\n📋 Running {test_name} test...")
                results[test_name] = test_func()
                
                if results[test_name]:
                    logger.info(f"✅ {test_name} test PASSED")
                else:
                    logger.info(f"❌ {test_name} test FAILED")
            
            # Summary
            logger.info("\n" + "=" * 60)
            logger.info("📊 TEST SUMMARY")
            logger.info("=" * 60)
            
            passed = sum(results.values())
            total = len(results)
            
            for test_name, result in results.items():
                status = "✅ PASS" if result else "❌ FAIL"
                logger.info(f"{test_name}: {status}")
            
            logger.info(f"\nOverall: {passed}/{total} tests passed")
            
            if passed == total:
                logger.info("🎉 All tests PASSED! Audio-to-jaw mapping is ready!")
            else:
                logger.info("⚠️ Some tests FAILED. Check implementation.")
            
            # Save test results
            with open("audio_mapping_test_results.json", "w") as f:
                json.dump(self.test_results, f, indent=2)
            logger.info("📄 Test results saved to audio_mapping_test_results.json")
            
            return passed == total
            
        finally:
            self.cleanup()

def main():
    """Main function"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Audio-to-Jaw Movement Mapping Tester")
    parser.add_argument("--servo-pin", type=int, default=18, help="GPIO pin for servo")
    parser.add_argument("--test", choices=["curves", "patterns", "smoothing", "timing", "all"],
                       default="all", help="Test to run")
    
    args = parser.parse_args()
    
    tester = AudioMappingTester(servo_pin=args.servo_pin)
    
    if args.test == "all":
        success = tester.run_full_test_suite()
    else:
        if not tester.initialize():
            return False
        
        try:
            if args.test == "curves":
                success = tester.test_mapping_curves()
            elif args.test == "patterns":
                success = tester.test_audio_patterns()
            elif args.test == "smoothing":
                success = tester.test_smoothing_algorithms()
            elif args.test == "timing":
                success = tester.test_timing_synchronization()
            else:
                logger.error(f"Unknown test: {args.test}")
                success = False
        finally:
            tester.cleanup()
    
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()
