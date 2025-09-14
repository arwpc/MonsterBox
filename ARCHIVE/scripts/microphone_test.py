#!/usr/bin/env python3
"""
Microphone Test Script for MonsterBox Hardware System
Tests microphone functionality and audio capture capabilities
"""

import sys
import json
import time
import logging

# Audio processing imports
try:
    import pyaudio
    PYAUDIO_AVAILABLE = True
except ImportError:
    PYAUDIO_AVAILABLE = False

try:
    import numpy as np
    NUMPY_AVAILABLE = True
except ImportError:
    NUMPY_AVAILABLE = False

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def test_microphone(device_id="default", sample_rate=16000, channels=1, duration=5):
    """
    Test microphone functionality
    
    Args:
        device_id (str): Audio device identifier
        sample_rate (int): Sample rate in Hz
        channels (int): Number of audio channels
        duration (int): Test duration in seconds
    
    Returns:
        dict: Test results
    """
    result = {
        "success": False,
        "device_id": device_id,
        "sample_rate": sample_rate,
        "channels": channels,
        "duration": duration,
        "timestamp": time.time(),
        "error": None,
        "audio_data": None,
        "audio_level": 0.0,
        "device_info": None
    }
    
    try:
        if not PYAUDIO_AVAILABLE:
            result["error"] = "PyAudio not available - cannot test microphone"
            logger.warning("PyAudio not available")
            return result
        
        # Initialize PyAudio
        audio = pyaudio.PyAudio()
        
        try:
            # Determine device index
            device_index = None
            if device_id != "default":
                try:
                    device_index = int(device_id)
                except ValueError:
                    # Try to find device by name
                    device_count = audio.get_device_count()
                    for i in range(device_count):
                        device_info = audio.get_device_info_by_index(i)
                        if device_id.lower() in device_info['name'].lower():
                            device_index = i
                            break
            
            # Get device info
            if device_index is not None:
                device_info = audio.get_device_info_by_index(device_index)
            else:
                device_info = audio.get_default_input_device_info()
                device_index = device_info['index']
            
            result["device_info"] = {
                "name": device_info['name'],
                "index": device_info['index'],
                "max_input_channels": device_info['maxInputChannels'],
                "default_sample_rate": int(device_info['defaultSampleRate'])
            }
            
            logger.info(f"Testing microphone: {device_info['name']} (index: {device_index})")
            
            # Validate parameters
            if channels > device_info['maxInputChannels']:
                result["error"] = f"Requested {channels} channels but device only supports {device_info['maxInputChannels']}"
                return result
            
            # Create audio stream
            chunk_size = 1024
            stream = audio.open(
                format=pyaudio.paFloat32,
                channels=channels,
                rate=sample_rate,
                input=True,
                input_device_index=device_index,
                frames_per_buffer=chunk_size
            )
            
            logger.info(f"Recording for {duration} seconds...")
            
            # Record audio data
            frames = []
            audio_levels = []
            
            for i in range(0, int(sample_rate / chunk_size * duration)):
                try:
                    data = stream.read(chunk_size, exception_on_overflow=False)
                    frames.append(data)
                    
                    # Calculate audio level if numpy is available
                    if NUMPY_AVAILABLE:
                        audio_array = np.frombuffer(data, dtype=np.float32)
                        rms = np.sqrt(np.mean(audio_array**2))
                        audio_levels.append(rms)
                    
                except Exception as e:
                        logger.warning(f"Error reading audio data: {e}")
                        continue
            
            # Stop and close stream
            stream.stop_stream()
            stream.close()
            
            # Calculate average audio level
            if audio_levels:
                result["audio_level"] = float(np.mean(audio_levels)) if NUMPY_AVAILABLE else 0.0
            
            # Test results
            result["success"] = True
            result["frames_recorded"] = len(frames)
            result["total_samples"] = len(frames) * chunk_size
            result["actual_duration"] = len(frames) * chunk_size / sample_rate
            
            logger.info(f"✅ Microphone test successful!")
            logger.info(f"   Recorded {len(frames)} frames ({result['actual_duration']:.2f}s)")
            logger.info(f"   Average audio level: {result['audio_level']:.4f}")
            
        finally:
            audio.terminate()
            
    except Exception as e:
        result["error"] = str(e)
        logger.error(f"❌ Microphone test failed: {e}")
    
    return result

def discover_microphones():
    """
    Discover available microphone devices
    
    Returns:
        dict: Discovery results
    """
    result = {
        "success": False,
        "microphones": [],
        "error": None
    }
    
    try:
        if not PYAUDIO_AVAILABLE:
            result["error"] = "PyAudio not available"
            return result
        
        audio = pyaudio.PyAudio()
        
        try:
            device_count = audio.get_device_count()
            microphones = []
            
            for i in range(device_count):
                device_info = audio.get_device_info_by_index(i)
                if device_info['maxInputChannels'] > 0:  # Has input capability
                    microphones.append({
                        'index': i,
                        'name': device_info['name'],
                        'max_input_channels': device_info['maxInputChannels'],
                        'default_sample_rate': int(device_info['defaultSampleRate']),
                        'host_api': device_info['hostApi']
                    })
            
            result["microphones"] = microphones
            result["success"] = True
            
            logger.info(f"🎤 Discovered {len(microphones)} microphone devices")
            
        finally:
            audio.terminate()
            
    except Exception as e:
        result["error"] = str(e)
        logger.error(f"❌ Microphone discovery failed: {e}")
    
    return result

def main():
    """Main function for command line usage"""
    if len(sys.argv) < 2:
        print("Usage: python3 microphone_test.py <command> [args...]")
        print("Commands:")
        print("  test <device_id> <sample_rate> <channels> <duration>")
        print("  discover")
        sys.exit(1)
    
    command = sys.argv[1]
    
    if command == "test":
        if len(sys.argv) < 6:
            print("Usage: python3 microphone_test.py test <device_id> <sample_rate> <channels> <duration>")
            sys.exit(1)
        
        device_id = sys.argv[2]
        sample_rate = int(sys.argv[3])
        channels = int(sys.argv[4])
        duration = int(sys.argv[5])
        
        result = test_microphone(device_id, sample_rate, channels, duration)
        print(json.dumps(result, indent=2))
        
    elif command == "discover":
        result = discover_microphones()
        print(json.dumps(result, indent=2))
        
    else:
        print(f"Unknown command: {command}")
        sys.exit(1)

if __name__ == "__main__":
    main()
