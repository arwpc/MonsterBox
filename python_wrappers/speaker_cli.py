#!/usr/bin/env python3
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
                fail("usage: speaker_cli.py play <file> [volume%] [--device ALSA_ID]")
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

            # Optional volume via amixer (device-aware)
            if volume is not None:
                try:
                    set_amixer_volume(volume, opts.get('device'))
                except Exception:
                    pass

            # Choose player based on file extension
            ext = os.path.splitext(file_path)[1].lower()
            try:
                if ext in ('.wav', '.wave'):
                    cmdv = ['aplay', '-q']
                    if opts['device']:
                        cmdv += ['-D', opts['device']]
                    cmdv.append(file_path)
                    proc = subprocess.Popen(cmdv, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                else:
                    # mpg123 supports sample scaling with -f (soft volume). Map 0-100% to 0..32768
                    cmdv = ['mpg123', '--quiet']
                    if volume is not None:
                        scale = int(32768 * (volume / 100.0))
                        scale = max(0, min(32768, scale))
                        cmdv += ['-f', str(scale)]
                    if opts['device']:
                        cmdv += ['-a', opts['device']]
                    cmdv.append(file_path)
                    proc = subprocess.Popen(cmdv, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            except FileNotFoundError as e:
                fail(str(e))

            ok(action='play', pid=proc.pid, file=file_path, volume=volume, device=opts['device'])

        elif cmd == 'stop':
            raw = sys.argv[2:]
            _, opts = parse_opts(raw)
            try:
                if opts['device']:
                    dev = opts['device']
                    subprocess.run(['pkill', '-f', f'mpg123.*-a {shlex.quote(dev)}'], check=False)
                    subprocess.run(['pkill', '-f', f'aplay .* -D {shlex.quote(dev)}'], check=False)
                subprocess.run(['pkill', '-f', 'mpg123'], check=False)
                subprocess.run(['pkill', '-f', 'aplay'], check=False)
            except Exception:
                pass
            ok(action='stop', device=opts['device'])

        elif cmd == 'set_volume':
            # Accept: set_volume <0-100> [--device ALSA_ID]
            if len(sys.argv) < 3:
                fail("usage: speaker_cli.py set_volume <0-100> [--device ALSA_ID]")
            raw = sys.argv[2:]
            pos, opts = parse_opts(raw)
            if not pos:
                fail("missing volume")
            vol = int(pos[0])
            if vol < 0 or vol > 100:
                fail("invalid volume", volume=vol)
            try:
                out = set_amixer_volume(vol, opts.get('device'))
                ok(action='set_volume', volume=vol, device=opts.get('device'), output=out)
            except FileNotFoundError:
                fail("amixer not found")
        else:
            fail(f"unknown command: {cmd}")
    except Exception as e:
        fail(str(e))
