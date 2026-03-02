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


# --- WAV capture helpers (PipeWire via PyAudio) ---
def _write_wav_header(out, num_bytes, sample_rate, channels):
    import struct
    byte_rate = sample_rate * channels * 2
    block_align = channels * 2
    # RIFF header
    out.write(b'RIFF')
    out.write(struct.pack('<I', 36 + num_bytes))
    out.write(b'WAVE')
    # fmt chunk
    out.write(b'fmt ')
    out.write(struct.pack('<IHHIIHH', 16, 1, channels, sample_rate, byte_rate, block_align, 16))
    # data chunk
    out.write(b'data')
    out.write(struct.pack('<I', num_bytes))


def _record_wav(device_id, sample_rate, channels, duration):
    """
    Record using PyAudio from the default (PipeWire/Pulse routed) input device and write a WAV stream to stdout.
    Uses small buffers (~20-40ms) for responsiveness.
    Returns exit code (0 success).
    """
    if pyaudio is None:
        return 1
    pa = pyaudio.PyAudio()
    stream = None
    try:
        idx = _get_default_input_device(pa)
        if idx is None:
            return 1
        # Validate channels
        try:
            dinfo = pa.get_device_info_by_index(idx)
            max_in = int(dinfo.get('maxInputChannels') or 0)
        except Exception:
            max_in = 0
        if max_in < 1:
            return 1
        if channels > max_in:
            channels = max_in
        # Quick open/close test to validate device is accessible
        try:
            fmt = pyaudio.paInt16
            test_stream = pa.open(format=fmt, channels=channels, rate=sample_rate, input=True,
                                  input_device_index=idx, frames_per_buffer=128)
            test_stream.close()
        except Exception:
            return 1
        # Choose small buffer (approx 20ms @ 16kHz mono => 320 frames)
        frames_per_buffer = max(128, int(sample_rate * 0.02))
        fmt = pyaudio.paInt16
        stream = pa.open(format=fmt, channels=channels, rate=sample_rate, input=True,
                         input_device_index=idx, frames_per_buffer=frames_per_buffer)
        # Capture frames
        total_bytes = 0
        chunks = []
        loops = max(1, int(round((sample_rate * float(duration)) / float(frames_per_buffer))))
        for _ in range(loops):
            try:
                data = stream.read(frames_per_buffer, exception_on_overflow=False)
                if data:
                    chunks.append(data)
                    total_bytes += len(data)
            except Exception:
                # tolerate occasional read errors
                pass
        try:
            stream.stop_stream()
        except Exception:
            pass
        try:
            stream.close()
        except Exception:
            pass
        stream = None
        # Write WAV to stdout.buffer
        buf = sys.stdout.buffer
        _write_wav_header(buf, total_bytes, sample_rate, channels)
        for c in chunks:
            buf.write(c)
        try:
            buf.flush()
        except Exception:
            pass
        return 0 if total_bytes > 0 else 1
    finally:
        try:
            if stream is not None:
                stream.stop_stream(); stream.close()
        except Exception:
            pass
        try:
            pa.terminate()
        except Exception:
            pass


if __name__ == '__main__':
    try:
        if len(sys.argv) < 2:
            fail("usage: microphone_cli.py <get_level|record_wav> ...")
        cmd = sys.argv[1]

        if cmd == 'get_level':
            device_id = sys.argv[2] if len(sys.argv) > 2 else 'default'
            sample_rate = int(sys.argv[3]) if len(sys.argv) > 3 else 16000
            channels = int(sys.argv[4]) if len(sys.argv) > 4 else 1
            duration = float(sys.argv[5]) if len(sys.argv) > 5 else 0.2

            if pyaudio is None or audioop is None:
                fail("PyAudio/audioop not available")

            if not _setup_pipewire_source(device_id):
                fail(f"Failed to setup PipeWire source: {device_id}")

            pa = pyaudio.PyAudio()
            try:
                idx = _get_default_input_device(pa)
                if idx is None:
                    fail('No input device found')
                try:
                    dinfo = pa.get_device_info_by_index(idx)
                    max_in = int(dinfo.get('maxInputChannels') or 0)
                except Exception:
                    max_in = 0
                if max_in < 1:
                    fail('Selected device has no input channels')
                if channels > max_in:
                    channels = max_in
                frames_per_buffer = 128
                fmt = pyaudio.paInt16
                try:
                    stream = pa.open(format=fmt, channels=channels, rate=sample_rate, input=True,
                                     input_device_index=idx, frames_per_buffer=frames_per_buffer)
                except Exception as e:
                    fail('Failed to open input: %s' % (str(e) or 'open error'))
                loops = max(1, int(round((sample_rate * float(duration)) / float(frames_per_buffer))))
                levels_sum = 0.0
                frames = 0
                peak = 0.0
                for _ in range(loops):
                    try:
                        data = stream.read(frames_per_buffer, exception_on_overflow=False)
                        frames += 1
                        rms = float(audioop.rms(data, 2))
                        norm = (rms / 32768.0)
                        levels_sum += norm
                        if norm > peak:
                            peak = norm
                    except Exception:
                        pass
                stream.stop_stream(); stream.close()
                avg = (levels_sum / frames) if frames > 0 else 0.0
                ok(deviceId=device_id, sampleRate=sample_rate, channels=channels, duration=duration,
                   frames=frames, level=peak, avg=avg, message="PipeWire peak %.4f avg %.4f" % (peak, avg))
            finally:
                try:
                    pa.terminate()
                except Exception:
                    pass

        elif cmd == 'record_wav':
            device_id = sys.argv[2] if len(sys.argv) > 2 else 'default'
            sample_rate = int(sys.argv[3]) if len(sys.argv) > 3 else 16000
            channels = int(sys.argv[4]) if len(sys.argv) > 4 else 1
            duration = float(sys.argv[5]) if len(sys.argv) > 5 else 1.0
            # Setup PipeWire routing via env and record bytes to stdout
            _setup_pipewire_source(device_id)
            code = _record_wav(device_id, sample_rate, channels, duration)
            sys.exit(code)

        else:
            fail("unknown command: %s" % cmd)

    except KeyboardInterrupt:
        # For record_wav, ensure no partial JSON to stdout
        try:
            sys.stderr.write("interrupted\n")
        except Exception:
            pass
        sys.exit(1)
    except Exception as e:
        # For record_wav, avoid stdout noise
        try:
            sys.stderr.write(str(e) + "\n")
        except Exception:
            pass
        try:
            # get_level path expects JSON error
            if cmd == 'get_level':
                fail(str(e))
        except Exception:
            pass
        sys.exit(1)
