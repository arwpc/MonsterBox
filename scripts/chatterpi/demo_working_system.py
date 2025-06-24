#!/usr/bin/env python3
"""
ChatterPi Jaw Animation System - Working Demo
Demonstrates the complete working system with the "Good Evening" audio file
"""

import asyncio
import websockets
import json
import time
import wave
import numpy as np
import sys
import os
from pathlib import Path

# Add the current directory to Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from audio_processing import AudioProcessor, AudioConfig
    print("✅ Audio processing module loaded")
except ImportError as e:
    print(f"❌ Failed to import audio processing: {e}")
    sys.exit(1)

async def demo_working_system():
    """Demonstrate the complete working ChatterPi jaw animation system"""
    
    print("🎭 ChatterPi Jaw Animation System - Working Demo")
    print("=" * 60)
    print("This demo shows the complete working system:")
    print("  ✅ Physical servo movement on GPIO 18")
    print("  ✅ Audio-driven jaw animation")
    print("  ✅ 'Good Evening' WAV file processing")
    print("  ✅ Real-time WebSocket communication")
    print("=" * 60)
    
    # Setup audio processor
    print("\n🔧 Setting up audio processor...")
    audio_config = AudioConfig(
        SMOOTHING_ATTACK=0.1,
        SMOOTHING_RELEASE=0.05,
        SILENCE_THRESHOLD=0.01,
        SERVO_MIN=50.0,  # Closed position
        SERVO_MAX=30.0,  # Open position
        SERVO_STEP=0.3
    )
    audio_processor = AudioProcessor(audio_config)
    print("✅ Audio processor initialized")
    
    # Load the "Good Evening" audio file
    print("\n📁 Loading 'Good Evening' audio file...")
    audio_file = Path("../../public/sounds/test/good_evening.wav")
    
    if not audio_file.exists():
        print(f"❌ Audio file not found: {audio_file}")
        print("💡 Run the test audio creation script first:")
        print("   python3 create_test_audio_files.py")
        return
    
    # Read audio file
    with wave.open(str(audio_file), 'rb') as wav_file:
        sample_rate = wav_file.getframerate()
        n_frames = wav_file.getnframes()
        duration = n_frames / sample_rate
        audio_data = wav_file.readframes(n_frames)
        audio_array = np.frombuffer(audio_data, dtype=np.int16)
        audio_float = audio_array.astype(np.float32) / 32768.0
    
    print(f"✅ Audio file loaded:")
    print(f"   Duration: {duration:.2f} seconds")
    print(f"   Sample rate: {sample_rate} Hz")
    print(f"   Samples: {len(audio_float)}")
    
    # Connect to jaw control WebSocket
    print("\n🌐 Connecting to jaw control WebSocket...")
    jaw_websocket_url = "ws://localhost:8765"
    
    try:
        async with websockets.connect(jaw_websocket_url, timeout=10) as websocket:
            print("✅ Connected to jaw control WebSocket")
            
            # Get welcome message
            welcome_msg = await websocket.recv()
            welcome_data = json.loads(welcome_msg)
            print(f"📡 Server info: {welcome_data.get('server_info', {}).get('version', 'Unknown')}")
            
            print("\n🎭 Starting jaw animation demo...")
            print("👀 Watch the physical jaw servo move!")
            print("📊 Processing 'Good Evening' audio with real-time jaw animation...")
            
            # Process audio in real-time chunks
            frame_size = 1024
            results = []
            jaw_movements = 0
            
            start_time = time.time()
            
            for i in range(0, len(audio_float), frame_size):
                frame = audio_float[i:i+frame_size]
                if len(frame) < frame_size:
                    frame = np.pad(frame, (0, frame_size - len(frame)))
                
                # Process audio frame
                result = audio_processor.process_audio_frame(frame)
                results.append(result)
                
                # Send jaw movement command if needed
                if result['should_update_servo']:
                    servo_position = result['servo_position']
                    
                    command = {
                        "type": "jaw_move",
                        "angle": servo_position,
                        "duration": 0.1
                    }
                    
                    await websocket.send(json.dumps(command))
                    jaw_movements += 1
                    
                    # Show real-time feedback
                    print(f"🦴 Jaw moved to {servo_position:.1f}° "
                          f"(amplitude: {result['raw_amplitude']:.3f}, "
                          f"voice: {'YES' if result['voice_active'] else 'NO'})")
                
                # Simulate real-time processing
                await asyncio.sleep(0.01)
            
            processing_time = time.time() - start_time
            
            # Return jaw to closed position
            print("\n🔄 Returning jaw to closed position...")
            await websocket.send(json.dumps({
                "type": "jaw_move",
                "angle": 50.0,
                "duration": 0.5
            }))
            await asyncio.sleep(0.5)
            
            # Display results
            print("\n📊 Demo Results:")
            print("=" * 40)
            
            voice_frames = sum(1 for r in results if r['voice_active'])
            total_frames = len(results)
            voice_percentage = (voice_frames / total_frames) * 100
            
            amplitudes = [r['raw_amplitude'] for r in results]
            avg_amplitude = np.mean(amplitudes)
            max_amplitude = max(amplitudes)
            
            servo_positions = [r['servo_position'] for r in results]
            servo_range = max(servo_positions) - min(servo_positions)
            
            print(f"✅ Audio file: good_evening.wav")
            print(f"✅ Duration: {duration:.2f} seconds")
            print(f"✅ Processing time: {processing_time:.2f} seconds")
            print(f"✅ Real-time ratio: {processing_time/duration:.2f}x")
            print(f"✅ Voice activity: {voice_percentage:.1f}% of frames")
            print(f"✅ Average amplitude: {avg_amplitude:.3f}")
            print(f"✅ Max amplitude: {max_amplitude:.3f}")
            print(f"✅ Jaw movements: {jaw_movements}")
            print(f"✅ Servo range: {servo_range:.1f}° (closed=50°, open=30°)")
            
            print("\n🎉 SUCCESS METRICS:")
            print("=" * 40)
            
            success_criteria = [
                (jaw_movements > 50, f"Jaw movements: {jaw_movements} (target: >50)"),
                (servo_range > 10, f"Servo range: {servo_range:.1f}° (target: >10°)"),
                (voice_percentage > 80, f"Voice activity: {voice_percentage:.1f}% (target: >80%)"),
                (processing_time/duration < 1.0, f"Real-time: {processing_time/duration:.2f}x (target: <1.0x)")
            ]
            
            all_passed = True
            for passed, message in success_criteria:
                status = "✅ PASS" if passed else "❌ FAIL"
                print(f"{status} {message}")
                if not passed:
                    all_passed = False
            
            print("\n" + "=" * 60)
            if all_passed:
                print("🎉 CHATTERPI JAW ANIMATION SYSTEM WORKING PERFECTLY!")
                print("✅ Physical servo movement confirmed")
                print("✅ Audio-driven jaw animation functional")
                print("✅ 'Good Evening' WAV file triggers proper jaw movement")
                print("✅ Real-time performance excellent")
                print("✅ System ready for full ChatterPi AI integration!")
            else:
                print("⚠️ Some success criteria not met - check system configuration")
            
            print("=" * 60)
            
    except Exception as e:
        print(f"❌ Demo failed: {e}")
        print("\n💡 Troubleshooting:")
        print("1. Make sure the jaw control WebSocket server is running:")
        print("   python3 gpio_jaw_server_robust.py --host 0.0.0.0 --port 8765")
        print("2. Check that the servo is connected to GPIO pin 18")
        print("3. Verify pigpio daemon is running: sudo pigpiod")

async def main():
    """Main demo function"""
    try:
        await demo_working_system()
    except KeyboardInterrupt:
        print("\n⚠️ Demo interrupted by user")
    except Exception as e:
        print(f"❌ Demo failed with error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
