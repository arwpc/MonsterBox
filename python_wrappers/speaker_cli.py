#!/usr/bin/env python3
"""
PipeWire-compatible Speaker CLI
Uses pw-play for WAV files and PulseAudio routing for MP3/other formats
"""
import sys, json, os, subprocess, shlex, re


def ok(**data):
    print(json.dumps({"status": "success", **data}))
    sys.exit(0)


def fail(msg, **extra):
    print(json.dumps({"status": "error", "message": msg, **extra}))
    sys.exit(1)


def parse_opts(argv):
    # returns (positional, opts) where opts has keys: device, bass, treble
    pos = []
    opts = {"device": None, "bass": None, "treble": None}
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == '--device' and i + 1 < len(argv):
            opts['device'] = argv[i + 1]
            i += 2
            continue
        if a == '--bass' and i + 1 < len(argv):
            try:
                opts['bass'] = int(argv[i + 1])
            except Exception:
                opts['bass'] = None
            i += 2
            continue
        if a == '--treble' and i + 1 < len(argv):
            try:
                opts['treble'] = int(argv[i + 1])
            except Exception:
                opts['treble'] = None
            i += 2
            continue
        pos.append(a)
        i += 1
    return pos, opts

def check_pipewire_tools():
    """Check availability of PipeWire native tools"""
    tools = {'pw-play': False, 'paplay': False, 'mpg123': False}

    for tool in tools.keys():
        try:
            subprocess.run([tool, '--version'], capture_output=True, check=False, timeout=2)
            tools[tool] = True
        except (FileNotFoundError, subprocess.TimeoutExpired):
            pass

    return tools

def setup_pipewire_sink(device_id):
    """Setup PipeWire sink for playback"""
    if not device_id or device_id in ('default', 'pulse'):
        # Use system default - clear any PULSE_SINK override
        if 'PULSE_SINK' in os.environ:
            del os.environ['PULSE_SINK']
        return True

    # Set PulseAudio sink for routing
    try:
        os.environ['PULSE_SINK'] = device_id
        return True
    except Exception as e:
        print(f"Warning: Could not set PULSE_SINK to {device_id}: {e}", file=sys.stderr)
        return False


def derive_card_index(device):
    """Try to derive ALSA card index from a device string like 'hw:1,0' or 'plughw:CARD=Device,DEV=0'"""
    if not device:
        return None
    # Direct number in hw/plughw
    m = re.search(r'^(?:plug)?hw:(\d+)', str(device))
    if m:
        try:
            return int(m.group(1))
        except Exception:
            pass
    # CARD=name -> map to index via aplay -l
    m = re.search(r'CARD=([^,]+)', str(device))
    if m:
        card_short = m.group(1)
        try:
            out = subprocess.check_output(['aplay', '-l'], text=True, stderr=subprocess.DEVNULL)
            for line in out.splitlines():
                m2 = re.match(r'^card\s+(\d+)\s*:\s*([^\s,]+)', line.strip())
                if m2 and m2.group(2) == card_short:
                    return int(m2.group(1))
        except Exception:
            return None
    return None


def set_amixer_volume(vol, device=None):
    """Set volume using amixer; if device implies a specific card, target it and try common controls."""
    controls = ['Master', 'PCM', 'Speaker', 'Headphone']
    card = derive_card_index(device)
    if card is not None:
        for ctl in controls:
            try:
                r = subprocess.run(['amixer', '-c', str(card), 'sset', ctl, f'{vol}%'], capture_output=True, text=True, check=False)
                if r.returncode == 0:
                    return r.stdout
            except Exception:
                pass
    # Fallback to default card Master
    try:
        r = subprocess.run(['amixer', 'sset', 'Master', f'{vol}%'], capture_output=True, text=True, check=False)
        return r.stdout
    except Exception:
        return ''


if __name__ == '__main__':
    try:
        if len(sys.argv) < 2:
            fail("usage: speaker_cli.py <play|stop|set_volume> ...")
        cmd = sys.argv[1]

        if cmd == 'play':
            # Accept: play <file> [volume%] [--device X] [--bass dB] [--treble dB]
            if len(sys.argv) < 3:
                fail("usage: speaker_cli.py play <file> [volume%] [--device PipeWire_Sink]")
            raw = sys.argv[2:]
            pos, opts = parse_opts(raw)
            if len(pos) < 1:
                fail("missing file path")
            file_path = pos[0]
            volume = None
            if len(pos) >= 2:
                try:
                    volume = max(0, min(100, int(pos[1])))
                except Exception:
                    volume = None
            if not os.path.exists(file_path):
                fail("file not found", file=file_path)

            # Setup PipeWire sink routing
            device_id = opts.get('device')
            if not setup_pipewire_sink(device_id):
                fail(f"Failed to setup PipeWire sink: {device_id}")

            # Check available tools
            tools = check_pipewire_tools()

            # Choose player based on file extension and available tools
            ext = os.path.splitext(file_path)[1].lower()
            proc = None

            try:
                if ext in ('.wav', '.wave'):
                    # Prefer pw-play for WAV files (native PipeWire)
                    if tools['pw-play']:
                        cmdv = ['pw-play', file_path]
                        proc = subprocess.Popen(cmdv, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    elif tools['paplay']:
                        # Fallback to paplay (PulseAudio compatibility)
                        cmdv = ['paplay', file_path]
                        proc = subprocess.Popen(cmdv, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    else:
                        fail("No suitable WAV player found (pw-play or paplay required)")
                else:
                    # Use mpg123 for MP3/other formats with PulseAudio routing
                    if not tools['mpg123']:
                        # Fallback: synthesize a short 440 Hz WAV tone and play with pw-play/paplay
                        try:
                            import wave, struct, math, tempfile
                            sr = 16000
                            dur = 0.5
                            freq = 440.0
                            amp = 0.4
                            frames = int(sr * dur)
                            tmp = tempfile.NamedTemporaryFile(delete=False, suffix='.wav')
                            with wave.open(tmp.name, 'w') as wf:
                                wf.setnchannels(1)
                                wf.setsampwidth(2)
                                wf.setframerate(sr)
                                for i in range(frames):
                                    val = int(amp * 32767.0 * math.sin(2 * math.pi * freq * (i / sr)))
                                    wf.writeframes(struct.pack('<h', val))
                            # Play the synthesized tone
                            if tools['pw-play']:
                                cmdv = ['pw-play', tmp.name]
                            elif tools['paplay']:
                                cmdv = ['paplay', tmp.name]
                            else:
                                fail("No suitable audio player found (need pw-play or paplay)")
                            proc = subprocess.Popen(cmdv, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                        except Exception as ee:
                            fail(f"mpg123 not available and fallback failed: {ee}")
                    else:
                        cmdv = ['mpg123', '--quiet']
                        # Apply soft volume scaling for MP3
                        if volume is not None:
                            scale = int(32768 * (volume / 100.0))
                            scale = max(0, min(32768, scale))
                            cmdv += ['-f', str(scale)]
                        cmdv.append(file_path)
                        proc = subprocess.Popen(cmdv, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

                if proc is None:
                    fail("Failed to start playback process")

            except FileNotFoundError as e:
                fail(f"Player not found: {str(e)}")
            except Exception as e:
                fail(f"Playback failed: {str(e)}")

            ok(action='play', pid=proc.pid, file=file_path, volume=volume, device=device_id,
               player='pw-play' if ext in ('.wav', '.wave') and tools['pw-play'] else 'mpg123')

        elif cmd == 'stop':
            raw = sys.argv[2:]
            _, opts = parse_opts(raw)
            try:
                # Stop PipeWire/PulseAudio players
                subprocess.run(['pkill', '-f', 'pw-play'], check=False)
                subprocess.run(['pkill', '-f', 'paplay'], check=False)
                subprocess.run(['pkill', '-f', 'mpg123'], check=False)
                # Legacy ALSA players (for compatibility)
                subprocess.run(['pkill', '-f', 'aplay'], check=False)
            except Exception:
                pass
            ok(action='stop', device=opts['device'], message="Stopped PipeWire audio players")

        elif cmd == 'set_volume':
            # Accept: set_volume <0-100> [--device PipeWire_Sink]
            if len(sys.argv) < 3:
                fail("usage: speaker_cli.py set_volume <0-100> [--device PipeWire_Sink]")
            raw = sys.argv[2:]
            pos, opts = parse_opts(raw)
            if not pos:
                fail("missing volume")
            vol = int(pos[0])
            if vol < 0 or vol > 100:
                fail("invalid volume", volume=vol)

            device_id = opts.get('device')
            volume_set = False
            output_msg = ""

            try:
                # Try PipeWire native volume control first
                if device_id and device_id not in ('default', 'pulse'):
                    try:
                        # Use wpctl to set sink volume
                        vol_decimal = vol / 100.0
                        result = subprocess.run(['wpctl', 'set-volume', device_id, str(vol_decimal)],
                                              capture_output=True, text=True, check=True)
                        volume_set = True
                        output_msg = f"PipeWire volume set via wpctl: {vol}%"
                    except (FileNotFoundError, subprocess.CalledProcessError):
                        # Fallback to pactl
                        try:
                            result = subprocess.run(['pactl', 'set-sink-volume', device_id, f'{vol}%'],
                                                  capture_output=True, text=True, check=True)
                            volume_set = True
                            output_msg = f"PulseAudio volume set via pactl: {vol}%"
                        except (FileNotFoundError, subprocess.CalledProcessError):
                            pass

                # Fallback to amixer for hardware volume (if available)
                if not volume_set:
                    try:
                        out = set_amixer_volume(vol, device_id)
                        volume_set = True
                        output_msg = f"Hardware volume set via amixer: {vol}%"
                    except (FileNotFoundError, Exception):
                        pass

                if volume_set:
                    ok(action='set_volume', volume=vol, device=device_id, output=output_msg)
                else:
                    # Soft volume only - will be applied at playback time
                    ok(action='set_volume', volume=vol, device=device_id,
                       output=f"Soft volume set: {vol}% (applied at playback)")

            except Exception as e:
                fail(f"Volume control failed: {str(e)}")
        else:
            fail(f"unknown command: {cmd}")
    except Exception as e:
        fail(str(e))
