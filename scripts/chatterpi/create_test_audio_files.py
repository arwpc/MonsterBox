#!/usr/bin/env python3
"""
Create Test Audio Files for ChatterPi Jaw Animation Testing
Generates various audio samples with different amplitude patterns for comprehensive testing
"""

import numpy as np
import wave
import os
import sys
from pathlib import Path

def create_sine_wave_audio(filename, frequency=440, duration=3.0, sample_rate=44100, amplitude=0.7):
    """Create a sine wave audio file"""
    t = np.linspace(0, duration, int(sample_rate * duration), False)
    wave_data = amplitude * np.sin(2 * np.pi * frequency * t)
    
    # Convert to 16-bit integers
    wave_data = (wave_data * 32767).astype(np.int16)
    
    with wave.open(filename, 'w') as wav_file:
        wav_file.setnchannels(1)  # Mono
        wav_file.setsampwidth(2)  # 2 bytes per sample
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(wave_data.tobytes())
    
    print(f"✅ Created sine wave audio: {filename}")

def create_speech_pattern_audio(filename, duration=4.0, sample_rate=44100):
    """Create audio that simulates speech patterns with varying amplitude"""
    t = np.linspace(0, duration, int(sample_rate * duration), False)
    
    # Create a complex waveform that simulates speech
    # Base frequency with harmonics
    base_freq = 150  # Typical male voice fundamental
    wave_data = np.zeros_like(t)
    
    # Add multiple harmonics to simulate speech
    for harmonic in range(1, 8):
        freq = base_freq * harmonic
        if freq < sample_rate / 2:  # Avoid aliasing
            amplitude = 0.3 / harmonic  # Decreasing amplitude for higher harmonics
            wave_data += amplitude * np.sin(2 * np.pi * freq * t)
    
    # Apply amplitude envelope to simulate speech patterns
    # Create varying amplitude that simulates "Good Evening"
    envelope = np.ones_like(t)
    
    # "Good" - strong consonant start
    good_start = 0.0
    good_end = 0.8
    good_mask = (t >= good_start) & (t < good_end)
    envelope[good_mask] = 0.8 * (1 + 0.3 * np.sin(2 * np.pi * 3 * t[good_mask]))
    
    # Brief pause
    pause1_start = 0.8
    pause1_end = 1.0
    pause1_mask = (t >= pause1_start) & (t < pause1_end)
    envelope[pause1_mask] = 0.1
    
    # "Eve" - vowel emphasis
    eve_start = 1.0
    eve_end = 2.2
    eve_mask = (t >= eve_start) & (t < eve_end)
    envelope[eve_mask] = 0.9 * (1 + 0.4 * np.sin(2 * np.pi * 2 * t[eve_mask]))
    
    # "ning" - consonant ending
    ning_start = 2.2
    ning_end = 3.5
    ning_mask = (t >= ning_start) & (t < ning_end)
    envelope[ning_mask] = 0.6 * (1 + 0.2 * np.sin(2 * np.pi * 4 * t[ning_mask]))
    
    # Final fade out
    fade_start = 3.5
    fade_mask = t >= fade_start
    fade_length = duration - fade_start
    envelope[fade_mask] = 0.6 * np.exp(-3 * (t[fade_mask] - fade_start) / fade_length)
    
    # Apply envelope
    wave_data *= envelope
    
    # Add some noise for realism
    noise = 0.02 * np.random.normal(0, 1, len(wave_data))
    wave_data += noise
    
    # Normalize and convert to 16-bit integers
    wave_data = wave_data / np.max(np.abs(wave_data)) * 0.8
    wave_data = (wave_data * 32767).astype(np.int16)
    
    with wave.open(filename, 'w') as wav_file:
        wav_file.setnchannels(1)  # Mono
        wav_file.setsampwidth(2)  # 2 bytes per sample
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(wave_data.tobytes())
    
    print(f"✅ Created speech pattern audio: {filename}")

def create_amplitude_test_audio(filename, duration=5.0, sample_rate=44100):
    """Create audio with specific amplitude patterns for testing jaw movement"""
    t = np.linspace(0, duration, int(sample_rate * duration), False)
    
    # Create a test tone with varying amplitude levels
    base_freq = 300  # Good frequency for jaw animation testing
    wave_data = np.sin(2 * np.pi * base_freq * t)
    
    # Create amplitude pattern: quiet -> medium -> loud -> quiet
    amplitude_pattern = np.ones_like(t)
    
    # Segment 1: Very quiet (jaw should be mostly closed)
    seg1_mask = t < 1.0
    amplitude_pattern[seg1_mask] = 0.1
    
    # Segment 2: Medium volume (jaw should open partially)
    seg2_mask = (t >= 1.0) & (t < 2.0)
    amplitude_pattern[seg2_mask] = 0.4
    
    # Segment 3: Loud (jaw should open wide)
    seg3_mask = (t >= 2.0) & (t < 3.0)
    amplitude_pattern[seg3_mask] = 0.8
    
    # Segment 4: Very loud (jaw should open widest)
    seg4_mask = (t >= 3.0) & (t < 4.0)
    amplitude_pattern[seg4_mask] = 1.0
    
    # Segment 5: Back to quiet (jaw should close)
    seg5_mask = t >= 4.0
    amplitude_pattern[seg5_mask] = 0.1
    
    # Apply amplitude pattern
    wave_data *= amplitude_pattern
    
    # Convert to 16-bit integers
    wave_data = (wave_data * 32767 * 0.8).astype(np.int16)
    
    with wave.open(filename, 'w') as wav_file:
        wav_file.setnchannels(1)  # Mono
        wav_file.setsampwidth(2)  # 2 bytes per sample
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(wave_data.tobytes())
    
    print(f"✅ Created amplitude test audio: {filename}")

def create_silence_test_audio(filename, duration=3.0, sample_rate=44100):
    """Create mostly silent audio with brief sound bursts"""
    t = np.linspace(0, duration, int(sample_rate * duration), False)
    
    # Start with silence
    wave_data = np.zeros_like(t)
    
    # Add brief sound bursts to test jaw opening/closing
    burst_freq = 500
    
    # Burst 1: 0.5s mark
    burst1_start = int(0.5 * sample_rate)
    burst1_end = int(0.7 * sample_rate)
    wave_data[burst1_start:burst1_end] = 0.6 * np.sin(2 * np.pi * burst_freq * t[burst1_start:burst1_end])
    
    # Burst 2: 1.5s mark
    burst2_start = int(1.5 * sample_rate)
    burst2_end = int(1.8 * sample_rate)
    wave_data[burst2_start:burst2_end] = 0.8 * np.sin(2 * np.pi * burst_freq * t[burst2_start:burst2_end])
    
    # Burst 3: 2.5s mark
    burst3_start = int(2.5 * sample_rate)
    burst3_end = int(2.7 * sample_rate)
    wave_data[burst3_start:burst3_end] = 0.4 * np.sin(2 * np.pi * burst_freq * t[burst3_start:burst3_end])
    
    # Convert to 16-bit integers
    wave_data = (wave_data * 32767).astype(np.int16)
    
    with wave.open(filename, 'w') as wav_file:
        wav_file.setnchannels(1)  # Mono
        wav_file.setsampwidth(2)  # 2 bytes per sample
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(wave_data.tobytes())
    
    print(f"✅ Created silence test audio: {filename}")

def main():
    """Create all test audio files"""
    print("🎵 Creating Test Audio Files for ChatterPi Jaw Animation")
    print("=" * 60)
    
    # Create output directory
    output_dir = Path("../../public/sounds/test")
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Create various test audio files
    test_files = [
        ("good_evening.wav", create_speech_pattern_audio, "Speech pattern simulating 'Good Evening'"),
        ("amplitude_test.wav", create_amplitude_test_audio, "Amplitude levels test for jaw movement"),
        ("silence_bursts.wav", create_silence_test_audio, "Silence with sound bursts"),
        ("sine_440hz.wav", lambda f: create_sine_wave_audio(f, 440, 3.0), "440Hz sine wave"),
        ("sine_300hz.wav", lambda f: create_sine_wave_audio(f, 300, 3.0), "300Hz sine wave"),
    ]
    
    for filename, create_func, description in test_files:
        filepath = output_dir / filename
        print(f"\n📁 Creating: {filename}")
        print(f"   Description: {description}")
        
        try:
            create_func(str(filepath))
            
            # Verify file was created
            if filepath.exists():
                size = filepath.stat().st_size
                print(f"   ✅ File created successfully ({size} bytes)")
            else:
                print(f"   ❌ File creation failed")
                
        except Exception as e:
            print(f"   ❌ Error creating {filename}: {e}")
    
    print(f"\n🎉 Test audio files created in: {output_dir}")
    print("\nFiles created:")
    for filepath in output_dir.glob("*.wav"):
        size = filepath.stat().st_size
        print(f"  - {filepath.name} ({size} bytes)")

if __name__ == "__main__":
    main()
