#!/usr/bin/env python3
import sys, json, time

def ok(**data):
    print(json.dumps({"status":"success", **data}))
    sys.exit(0)

def fail(msg, **extra):
    print(json.dumps({"status":"error","message":msg, **extra}))
    sys.exit(1)

try:
    import pyaudio
    import numpy as np
except Exception as e:
    pyaudio = None
    np = None

if __name__ == '__main__':
    try:
        if len(sys.argv) < 2:
            fail("usage: microphone_cli.py get_level [deviceId] [sampleRate] [channels] [durationSec]")
        cmd = sys.argv[1]
        if cmd != 'get_level':
            fail(f"unknown command: {cmd}")
        device_id = sys.argv[2] if len(sys.argv) > 2 else 'default'
        sample_rate = int(sys.argv[3]) if len(sys.argv) > 3 else 16000
        channels = int(sys.argv[4]) if len(sys.argv) > 4 else 1
        duration = float(sys.argv[5]) if len(sys.argv) > 5 else 1.0
        if pyaudio is None:
            fail("PyAudio not available")
        pa = pyaudio.PyAudio()
        try:
            idx = None
            if device_id != 'default':
                try:
                    idx = int(device_id)
                except ValueError:
                    # find by substring
                    for i in range(pa.get_device_count()):
                        info = pa.get_device_info_by_index(i)
                        if device_id.lower() in info.get('name','').lower():
                            idx = i
                            break
            if idx is None:
                info = pa.get_default_input_device_info()
                idx = info['index']
            stream = pa.open(format=pyaudio.paFloat32, channels=channels, rate=sample_rate, input=True, input_device_index=idx, frames_per_buffer=1024)
            levels = []
            frames = 0
            start = time.time()
            for _ in range(int(sample_rate/1024*duration)):
                data = stream.read(1024, exception_on_overflow=False)
                frames += 1
                if np is not None:
                    arr = np.frombuffer(data, dtype=np.float32)
                    if arr.size:
                        rms = float((arr**2).mean()**0.5)
                        levels.append(rms)
            stream.stop_stream(); stream.close()
            avg = float(sum(levels)/len(levels)) if levels else 0.0
            ok(deviceId=device_id, sampleRate=sample_rate, channels=channels, duration=duration, frames=frames, level=avg, message=f"Avg level {avg:.4f}")
        finally:
            pa.terminate()
    except Exception as e:
        fail(str(e))

