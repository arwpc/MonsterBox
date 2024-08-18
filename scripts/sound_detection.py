import pyaudio
import numpy as np
import sys
import json

def detect_sound(sensitivity):
    p = pyaudio.PyAudio()
    stream = p.open(format=pyaudio.paInt16, channels=1, rate=44100, input=True, frames_per_buffer=1024)
    
    try:
        data = np.frombuffer(stream.read(1024), dtype=np.int16)
        sound_level = np.abs(data).mean()
        is_active = sound_level > sensitivity
    except Exception as e:
        print(f"Error detecting sound: {str(e)}", file=sys.stderr)
        is_active = False
    finally:
        stream.stop_stream()
        stream.close()
        p.terminate()
    
    return is_active

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python sound_detection.py <sensitivity>", file=sys.stderr)
        sys.exit(1)
    
    sensitivity = int(sys.argv[1])
    result = detect_sound(sensitivity)
    print(json.dumps({"isActive": result}))
