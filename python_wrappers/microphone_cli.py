#!/usr/bin/env python3
"""
PipeWire-compatible Microphone CLI
Uses PipeWire/PulseAudio defaults instead of direct ALSA hw: devices
"""
import sys, json, time, re, os

def ok(**data):
    print(json.dumps({"status":"success", **data}))
    sys.exit(0)

def fail(msg, **extra):
    print(json.dumps({"status":"error","message":msg, **extra}))
    sys.exit(1)

import warnings
try:
    import pyaudio
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", DeprecationWarning)
        import audioop
except Exception:
    pyaudio = None
    audioop = None


def _setup_pipewire_source(device_id):
    """
    Setup PipeWire/PulseAudio source for capture.
    For non-default devices, set PULSE_SOURCE environment variable.
    Returns True if setup successful, False otherwise.
    """
    if not device_id or device_id in ('default', 'sysdefault', 'pulse'):
        # Use system default - no special setup needed
        # Clear any existing PULSE_SOURCE to ensure default behavior
        if 'PULSE_SOURCE' in os.environ:
            del os.environ['PULSE_SOURCE']
        return True

    # For PipeWire/Pulse source names, set environment variable
    try:
        os.environ['PULSE_SOURCE'] = device_id
        return True
    except Exception as e:
        print(f"Warning: Could not set PULSE_SOURCE to {device_id}: {e}", file=sys.stderr)
        return False

def _get_default_input_device(pa):
    """
    Get the default input device index from PyAudio.
    Returns device index or None if not found.
    """
    try:
        default_info = pa.get_default_input_device_info()
        return default_info['index']
    except Exception:
        # Fallback: find first device with input channels
        try:
            device_count = pa.get_device_count()
            for i in range(device_count):
                info = pa.get_device_info_by_index(i)
                max_inputs = info.get('maxInputChannels', 0)
                if max_inputs > 0:
                    return i
        except Exception:
            pass
        return None


if __name__ == '__main__':
    try:
        if len(sys.argv) < 2:
            fail("usage: microphone_cli.py get_level [deviceId] [sampleRate] [channels] [durationSec]")
        cmd = sys.argv[1]
        if cmd != 'get_level':
            fail("unknown command: %s" % cmd)
        device_id = sys.argv[2] if len(sys.argv) > 2 else 'default'
        sample_rate = int(sys.argv[3]) if len(sys.argv) > 3 else 16000
        channels = int(sys.argv[4]) if len(sys.argv) > 4 else 1
        duration = float(sys.argv[5]) if len(sys.argv) > 5 else 0.2  # Shorter default for responsiveness

        if pyaudio is None or audioop is None:
            fail("PyAudio/audioop not available")

        # Setup PipeWire/PulseAudio source
        if not _setup_pipewire_source(device_id):
            fail(f"Failed to setup PipeWire source: {device_id}")

        pa = pyaudio.PyAudio()
        try:
            # Use default input device (PipeWire/Pulse will handle routing)
            idx = _get_default_input_device(pa)
            if idx is None:
                fail('No input device found')

            # Validate input channel support
            try:
                dinfo = pa.get_device_info_by_index(idx)
                max_in = int(dinfo.get('maxInputChannels') or 0)
            except Exception:
                max_in = 0
            if max_in < 1:
                fail('Selected device has no input channels')
            if channels > max_in:
                channels = max_in

            # Optimized buffer size for shorter capture windows
            frames_per_buffer = 128  # Smaller buffer for lower latency responsiveness
            fmt = pyaudio.paInt16  # enables audioop.rms

            try:
                stream = pa.open(format=fmt, channels=channels, rate=sample_rate, input=True,
                                 input_device_index=idx, frames_per_buffer=frames_per_buffer)
            except Exception as e:
                fail('Failed to open input: %s' % (str(e) or 'open error'))

            # Calculate loops for requested duration
            loops = max(1, int(round((sample_rate * float(duration)) / float(frames_per_buffer))))
            levels_sum = 0.0
            frames = 0
            peak = 0.0

            # Capture and calculate RMS level
            for _ in range(loops):
                try:
                    data = stream.read(frames_per_buffer, exception_on_overflow=False)
                    frames += 1
                    rms = float(audioop.rms(data, 2))  # 2 bytes/sample for paInt16
                    norm = (rms / 32768.0)  # Normalize to 0-1 range
                    levels_sum += norm
                    if norm > peak:
                        peak = norm
                except Exception:
                    # Skip problematic frames but continue
                    pass

            stream.stop_stream()
            stream.close()

            avg = (levels_sum / frames) if frames > 0 else 0.0
            # Report peak as 'level' for snappy VU response, also include avg for debugging/optional UI use
            ok(deviceId=device_id, sampleRate=sample_rate, channels=channels, duration=duration,
               frames=frames, level=peak, avg=avg, message="PipeWire peak %.4f avg %.4f" % (peak, avg))
        finally:
            try:
                pa.terminate()
            except Exception:
                pass
    except KeyboardInterrupt:
        fail("interrupted")
    except Exception as e:
        fail(str(e))
