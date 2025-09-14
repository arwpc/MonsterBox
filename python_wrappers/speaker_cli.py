#!/usr/bin/env python3
import sys, json, os, signal, subprocess

def ok(**data):
    print(json.dumps({"status":"success", **data}))
    sys.exit(0)

def fail(msg, **extra):
    print(json.dumps({"status":"error","message":msg, **extra}))
    sys.exit(1)

if __name__ == '__main__':
    try:
        if len(sys.argv) < 2:
            fail("usage: speaker_cli.py <play|stop|set_volume> ...")
        cmd = sys.argv[1]
        if cmd == 'play':
            if len(sys.argv) < 3:
                fail("usage: speaker_cli.py play <file> [volume%]")
            file_path = sys.argv[2]
            volume = int(sys.argv[3]) if len(sys.argv) > 3 else None
            if not os.path.exists(file_path):
                fail("file not found", file=file_path)
            # Optionally set volume
            if volume is not None:
                try:
                    subprocess.run(['amixer','sset','Master',f'{volume}%'], check=False)
                except Exception:
                    pass
            # Launch mpg123 in background
            try:
                proc = subprocess.Popen(['mpg123','--quiet',file_path], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            except FileNotFoundError:
                fail("mpg123 not found")
            ok(action='play', pid=proc.pid, file=file_path, volume=volume)
        elif cmd == 'stop':
            # Best-effort: stop all mpg123 instances
            try:
                subprocess.run(['pkill','-f','mpg123'], check=False)
            except Exception:
                pass
            ok(action='stop')
        elif cmd == 'set_volume':
            if len(sys.argv) < 3:
                fail("usage: speaker_cli.py set_volume <0-100>")
            vol = int(sys.argv[2])
            if vol < 0 or vol > 100:
                fail("invalid volume", volume=vol)
            try:
                r = subprocess.run(['amixer','sset','Master',f'{vol}%'], capture_output=True, text=True, check=False)
                ok(action='set_volume', volume=vol, output=r.stdout)
            except FileNotFoundError:
                fail("amixer not found")
        else:
            fail(f"unknown command: {cmd}")
    except Exception as e:
        fail(str(e))

