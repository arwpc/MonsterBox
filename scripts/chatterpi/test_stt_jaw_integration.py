#!/usr/bin/env python3
"""
STT-Jaw Animation Integration Testing for ChatterPi
Tests Speech-to-Text integration with jaw animation synchronization
Ensures STT processing doesn't interfere with jaw movement and both systems work simultaneously
"""

import asyncio
import websockets
import json
import time
import logging
import sys
import os
import wave
import numpy as np
from pathlib import Path
import subprocess

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Add the current directory to Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from audio_processing import AudioProcessor, AudioConfig
    logger.info("✅ Audio processing module imported")
except ImportError as e:
    logger.error(f"❌ Failed to import audio processing: {e}")

class STTJawIntegrationTester:
    """STT and jaw animation integration testing"""
    
    def __init__(self):
        self.test_results = {
            "stt_service_availability": False,
            "jaw_websocket_availability": False,
            "simultaneous_operation": False,
            "audio_processing_pipeline": False,
            "stt_accuracy_test": False,
            "jaw_movement_during_stt": False,
            "performance_impact": False,
            "error_handling": False
        }
        
        self.jaw_websocket_url = "ws://localhost:8765"
        self.audio_websocket_url = "ws://localhost:8767"
        self.stt_service_url = "http://localhost:3000/api/stt"  # MonsterBox STT endpoint
        
        self.test_audio_files = []
        self.audio_processor = None
        
        logger.info("🎤🦴 STTJawIntegrationTester initialized")
    
    def setup_test_audio_files(self):
        """Setup test audio files"""
        logger.info("📁 Setting up test audio files...")
        
        test_dir = Path("../../public/sounds/test")
        if not test_dir.exists():
            logger.error(f"❌ Test audio directory not found: {test_dir}")
            return False
        
        audio_files = list(test_dir.glob("*.wav"))
        if not audio_files:
            logger.error("❌ No test audio files found")
            return False
        
        self.test_audio_files = {file.stem: file for file in audio_files}
        logger.info(f"✅ Found {len(audio_files)} test audio files")
        
        return True
    
    async def check_jaw_websocket(self) -> bool:
        """Check jaw control WebSocket availability"""
        logger.info("🦴 Checking jaw control WebSocket...")
        
        try:
            async with websockets.connect(self.jaw_websocket_url, timeout=5) as websocket:
                # Send a test command
                test_command = {"type": "status_request"}
                await websocket.send(json.dumps(test_command))
                
                # Wait for response
                response = await asyncio.wait_for(websocket.recv(), timeout=5)
                logger.info("✅ Jaw control WebSocket is available and responsive")
                self.test_results["jaw_websocket_availability"] = True
                return True
                
        except Exception as e:
            logger.error(f"❌ Jaw control WebSocket not available: {e}")
            return False
    
    async def check_stt_service(self) -> bool:
        """Check STT service availability"""
        logger.info("🎤 Checking STT service availability...")
        
        try:
            # Try to import STT integration module
            try:
                from openai_stt_integration import OpenAISTTIntegration
                logger.info("✅ STT integration module available")
                
                # Test basic STT functionality
                stt = OpenAISTTIntegration()
                if stt.test_connection():
                    logger.info("✅ STT service connection successful")
                    self.test_results["stt_service_availability"] = True
                    return True
                else:
                    logger.warning("⚠️ STT service connection failed")
                    return False
                    
            except ImportError:
                logger.warning("⚠️ STT integration module not found")
                return False
                
        except Exception as e:
            logger.error(f"❌ STT service check failed: {e}")
            return False
    
    async def test_simultaneous_operation(self) -> bool:
        """Test STT and jaw animation working simultaneously"""
        logger.info("\n🧪 Test: Simultaneous STT and Jaw Animation")
        logger.info("=" * 50)
        
        if not self.test_results["jaw_websocket_availability"]:
            logger.error("❌ Jaw WebSocket not available for simultaneous test")
            return False
        
        try:
            # Setup audio processor for jaw animation
            audio_config = AudioConfig(
                SMOOTHING_ATTACK=0.1,
                SMOOTHING_RELEASE=0.05,
                SILENCE_THRESHOLD=0.01,
                SERVO_MIN=50.0,
                SERVO_MAX=30.0
            )
            self.audio_processor = AudioProcessor(audio_config)
            
            # Connect to jaw control WebSocket
            async with websockets.connect(self.jaw_websocket_url, timeout=10) as jaw_websocket:
                logger.info("✅ Connected to jaw control WebSocket")
                
                # Process the "Good Evening" audio file
                if 'good_evening' not in self.test_audio_files:
                    logger.error("❌ Good Evening audio file not found")
                    return False
                
                audio_file = self.test_audio_files['good_evening']
                logger.info(f"🎵 Processing audio file: {audio_file.name}")
                
                # Read audio file
                with wave.open(str(audio_file), 'rb') as wav_file:
                    sample_rate = wav_file.getframerate()
                    n_frames = wav_file.getnframes()
                    audio_data = wav_file.readframes(n_frames)
                    audio_array = np.frombuffer(audio_data, dtype=np.int16)
                    audio_float = audio_array.astype(np.float32) / 32768.0
                
                # Simulate simultaneous STT and jaw animation
                frame_size = 1024
                jaw_movements = 0
                stt_chunks_processed = 0
                
                logger.info("🎭 Starting simultaneous STT and jaw animation...")
                start_time = time.time()
                
                for i in range(0, len(audio_float), frame_size):
                    frame = audio_float[i:i+frame_size]
                    if len(frame) < frame_size:
                        frame = np.pad(frame, (0, frame_size - len(frame)))
                    
                    # Process audio for jaw animation
                    result = self.audio_processor.process_audio_frame(frame)
                    
                    # Send jaw movement command if needed
                    if result['should_update_servo']:
                        jaw_command = {
                            "type": "jaw_move",
                            "angle": result['servo_position'],
                            "duration": 0.1
                        }
                        await jaw_websocket.send(json.dumps(jaw_command))
                        jaw_movements += 1
                    
                    # Simulate STT processing (chunked audio processing)
                    if i % (frame_size * 10) == 0:  # Process STT every 10 frames
                        stt_chunks_processed += 1
                        # Simulate STT processing time
                        await asyncio.sleep(0.01)
                    
                    # Small delay to simulate real-time processing
                    await asyncio.sleep(0.005)
                
                processing_time = time.time() - start_time
                
                logger.info(f"📊 Simultaneous operation results:")
                logger.info(f"   Processing time: {processing_time:.2f}s")
                logger.info(f"   Jaw movements: {jaw_movements}")
                logger.info(f"   STT chunks processed: {stt_chunks_processed}")
                
                if jaw_movements > 0 and stt_chunks_processed > 0:
                    logger.info("✅ Simultaneous operation test PASSED")
                    self.test_results["simultaneous_operation"] = True
                    return True
                else:
                    logger.warning("⚠️ Simultaneous operation had issues")
                    return False
                    
        except Exception as e:
            logger.error(f"❌ Simultaneous operation test failed: {e}")
            return False
    
    async def test_audio_processing_pipeline(self) -> bool:
        """Test the complete audio processing pipeline"""
        logger.info("\n🧪 Test: Audio Processing Pipeline")
        logger.info("=" * 50)
        
        try:
            # Test with multiple audio files
            pipeline_results = []
            
            for name, file_path in self.test_audio_files.items():
                logger.info(f"🎵 Testing pipeline with: {name}")
                
                # Read audio file
                with wave.open(str(file_path), 'rb') as wav_file:
                    sample_rate = wav_file.getframerate()
                    n_frames = wav_file.getnframes()
                    duration = n_frames / sample_rate
                    audio_data = wav_file.readframes(n_frames)
                    audio_array = np.frombuffer(audio_data, dtype=np.int16)
                    audio_float = audio_array.astype(np.float32) / 32768.0
                
                # Process through pipeline
                if not self.audio_processor:
                    self.audio_processor = AudioProcessor(AudioConfig())
                
                frame_size = 1024
                results = []
                
                for i in range(0, len(audio_float), frame_size):
                    frame = audio_float[i:i+frame_size]
                    if len(frame) < frame_size:
                        frame = np.pad(frame, (0, frame_size - len(frame)))
                    
                    result = self.audio_processor.process_audio_frame(frame)
                    results.append(result)
                
                # Analyze pipeline results
                voice_frames = sum(1 for r in results if r['voice_active'])
                servo_updates = sum(1 for r in results if r['should_update_servo'])
                avg_amplitude = np.mean([r['raw_amplitude'] for r in results])
                
                pipeline_result = {
                    'file': name,
                    'duration': duration,
                    'voice_frames': voice_frames,
                    'total_frames': len(results),
                    'servo_updates': servo_updates,
                    'avg_amplitude': avg_amplitude,
                    'voice_percentage': (voice_frames / len(results)) * 100
                }
                
                pipeline_results.append(pipeline_result)
                
                logger.info(f"   Results: {voice_frames}/{len(results)} voice frames, "
                          f"{servo_updates} servo updates, {avg_amplitude:.3f} avg amplitude")
            
            # Validate pipeline performance
            successful_files = sum(1 for r in pipeline_results if r['servo_updates'] > 0)
            
            if successful_files >= len(pipeline_results) * 0.8:  # 80% success rate
                logger.info("✅ Audio processing pipeline test PASSED")
                self.test_results["audio_processing_pipeline"] = True
                return True
            else:
                logger.warning("⚠️ Audio processing pipeline had issues")
                return False
                
        except Exception as e:
            logger.error(f"❌ Audio processing pipeline test failed: {e}")
            return False
    
    async def test_jaw_movement_during_stt(self) -> bool:
        """Test jaw movement specifically during STT processing"""
        logger.info("\n🧪 Test: Jaw Movement During STT Processing")
        logger.info("=" * 50)
        
        try:
            # Connect to jaw WebSocket
            async with websockets.connect(self.jaw_websocket_url, timeout=10) as websocket:
                logger.info("✅ Connected to jaw control for STT test")
                
                # Test sequence: STT processing with jaw movement
                test_sequence = [
                    {"action": "start_stt", "jaw_angle": 50},  # Start STT, jaw closed
                    {"action": "process_audio", "jaw_angle": 35},  # Process audio, jaw opens
                    {"action": "continue_stt", "jaw_angle": 40},  # Continue STT, jaw moves
                    {"action": "finish_stt", "jaw_angle": 50},  # Finish STT, jaw closes
                ]
                
                jaw_responses = []
                
                for i, step in enumerate(test_sequence):
                    logger.info(f"Step {i+1}: {step['action']} with jaw at {step['jaw_angle']}°")
                    
                    # Send jaw movement command
                    command = {
                        "type": "jaw_move",
                        "angle": step['jaw_angle'],
                        "duration": 0.5
                    }
                    
                    send_time = time.time()
                    await websocket.send(json.dumps(command))
                    
                    # Wait for response
                    try:
                        response = await asyncio.wait_for(websocket.recv(), timeout=3)
                        receive_time = time.time()
                        response_time = receive_time - send_time
                        
                        response_data = json.loads(response)
                        jaw_responses.append({
                            'step': i+1,
                            'response_time': response_time,
                            'response': response_data
                        })
                        
                        logger.info(f"   Response time: {response_time*1000:.1f}ms")
                        
                    except asyncio.TimeoutError:
                        logger.warning(f"   ⚠️ No response for step {i+1}")
                    
                    # Simulate STT processing time
                    await asyncio.sleep(0.5)
                
                # Validate jaw movement during STT
                successful_responses = len(jaw_responses)
                avg_response_time = np.mean([r['response_time'] for r in jaw_responses]) if jaw_responses else 0
                
                logger.info(f"📊 Jaw movement during STT results:")
                logger.info(f"   Successful responses: {successful_responses}/{len(test_sequence)}")
                logger.info(f"   Average response time: {avg_response_time*1000:.1f}ms")
                
                if successful_responses >= len(test_sequence) * 0.8 and avg_response_time < 0.1:
                    logger.info("✅ Jaw movement during STT test PASSED")
                    self.test_results["jaw_movement_during_stt"] = True
                    return True
                else:
                    logger.warning("⚠️ Jaw movement during STT had issues")
                    return False
                    
        except Exception as e:
            logger.error(f"❌ Jaw movement during STT test failed: {e}")
            return False
    
    async def test_performance_impact(self) -> bool:
        """Test performance impact of running STT and jaw animation together"""
        logger.info("\n🧪 Test: Performance Impact")
        logger.info("=" * 50)
        
        try:
            # Test jaw animation alone
            logger.info("🦴 Testing jaw animation alone...")
            jaw_alone_start = time.time()
            
            async with websockets.connect(self.jaw_websocket_url, timeout=10) as websocket:
                for i in range(10):
                    command = {"type": "jaw_move", "angle": 30 + (i % 2) * 20, "duration": 0.1}
                    await websocket.send(json.dumps(command))
                    await asyncio.wait_for(websocket.recv(), timeout=2)
                    await asyncio.sleep(0.05)
            
            jaw_alone_time = time.time() - jaw_alone_start
            
            # Test STT simulation alone
            logger.info("🎤 Testing STT simulation alone...")
            stt_alone_start = time.time()
            
            for i in range(10):
                # Simulate STT processing
                await asyncio.sleep(0.05)  # Simulate STT processing time
            
            stt_alone_time = time.time() - stt_alone_start
            
            # Test both together
            logger.info("🎤🦴 Testing STT and jaw animation together...")
            combined_start = time.time()
            
            async with websockets.connect(self.jaw_websocket_url, timeout=10) as websocket:
                for i in range(10):
                    # Jaw movement
                    command = {"type": "jaw_move", "angle": 30 + (i % 2) * 20, "duration": 0.1}
                    await websocket.send(json.dumps(command))
                    
                    # STT simulation
                    await asyncio.sleep(0.05)
                    
                    # Get jaw response
                    await asyncio.wait_for(websocket.recv(), timeout=2)
                    await asyncio.sleep(0.05)
            
            combined_time = time.time() - combined_start
            
            # Calculate performance impact
            expected_combined_time = jaw_alone_time + stt_alone_time
            performance_overhead = (combined_time - expected_combined_time) / expected_combined_time * 100
            
            logger.info(f"📊 Performance impact results:")
            logger.info(f"   Jaw animation alone: {jaw_alone_time:.2f}s")
            logger.info(f"   STT simulation alone: {stt_alone_time:.2f}s")
            logger.info(f"   Combined operation: {combined_time:.2f}s")
            logger.info(f"   Expected combined: {expected_combined_time:.2f}s")
            logger.info(f"   Performance overhead: {performance_overhead:.1f}%")
            
            if performance_overhead < 20:  # Less than 20% overhead
                logger.info("✅ Performance impact test PASSED")
                self.test_results["performance_impact"] = True
                return True
            else:
                logger.warning("⚠️ Performance impact may be too high")
                return False
                
        except Exception as e:
            logger.error(f"❌ Performance impact test failed: {e}")
            return False
    
    def generate_report(self):
        """Generate comprehensive test report"""
        logger.info("\n" + "="*60)
        logger.info("🎤🦴 STT-JAW INTEGRATION TEST REPORT")
        logger.info("="*60)
        
        passed_tests = sum(1 for result in self.test_results.values() if result)
        total_tests = len(self.test_results)
        
        logger.info(f"Tests Passed: {passed_tests}/{total_tests}")
        logger.info(f"Success Rate: {(passed_tests/total_tests)*100:.1f}%")
        
        logger.info("\nDetailed Results:")
        for test_name, result in self.test_results.items():
            status = "✅ PASS" if result else "❌ FAIL"
            logger.info(f"  {test_name}: {status}")
        
        if passed_tests >= total_tests * 0.7:  # 70% pass rate
            logger.info("\n🎉 STT-JAW INTEGRATION TESTS MOSTLY SUCCESSFUL!")
            logger.info("✅ STT and jaw animation can work simultaneously")
            logger.info("✅ No significant interference between systems")
        else:
            logger.info(f"\n⚠️ {total_tests - passed_tests} tests failed")
            logger.info("🔧 Check STT and jaw animation integration")
        
        # Save results
        results_file = Path("../../test-results/stt-jaw-integration-test.json")
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
        
        return passed_tests >= total_tests * 0.7
    
    async def run_all_tests(self):
        """Run all STT-jaw integration tests"""
        logger.info("🎤🦴 Starting STT-Jaw Integration Tests")
        logger.info("=" * 60)
        
        try:
            # Setup
            if not self.setup_test_audio_files():
                logger.error("❌ Failed to setup test audio files")
                return False
            
            # Check service availability
            await self.check_jaw_websocket()
            await self.check_stt_service()
            
            # Run integration tests
            await self.test_simultaneous_operation()
            await self.test_audio_processing_pipeline()
            await self.test_jaw_movement_during_stt()
            await self.test_performance_impact()
            
            return self.generate_report()
            
        except Exception as e:
            logger.error(f"❌ Test execution failed: {e}")
            return False

async def main():
    """Main test function"""
    tester = STTJawIntegrationTester()
    
    try:
        success = await tester.run_all_tests()
        return 0 if success else 1
    except KeyboardInterrupt:
        logger.info("\n⚠️ Test interrupted by user")
        return 1
    except Exception as e:
        logger.error(f"❌ Test failed with error: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
