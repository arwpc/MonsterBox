#!/usr/bin/env python3
import sys, json, time, subprocess
import cv2

def fail(msg, code=1, **extra):
    print(json.dumps({"status":"error","message":msg, **extra}))
    sys.exit(code)

def ok(**data):
    print(json.dumps({"status":"success", **data}))
    sys.exit(0)

def run_cmd(args):
    try:
        out = subprocess.check_output(args, stderr=subprocess.STDOUT, text=True)
        return 0, out
    except subprocess.CalledProcessError as e:
        return e.returncode, e.output

def parse_args(argv):
    if len(argv) < 2:
        fail("usage: webcam_cli.py <capture|list_ctrls|set_ctrls> ...")
    cmd = argv[1]
    if cmd == 'capture':
        if len(argv) < 5:
            fail("usage: webcam_cli.py capture <deviceId> <width> <height>")
        return (cmd, int(argv[2]), int(argv[3]), int(argv[4]))
    if cmd == 'list_ctrls':
        if len(argv) < 3:
            fail("usage: webcam_cli.py list_ctrls <deviceId>")
        return (cmd, int(argv[2]))
    if cmd == 'set_ctrls':
        if len(argv) < 4:
            fail("usage: webcam_cli.py set_ctrls <deviceId> <name=value[,name=value,...]>")
        return (cmd, int(argv[2]), argv[3])
    fail(f"unknown command: {cmd}")

if __name__ == '__main__':
    try:
        args = parse_args(sys.argv)
        cmd = args[0]
        if cmd == 'capture':
            _, dev, w, h = args
            cap = cv2.VideoCapture(dev, cv2.CAP_V4L2)
            if not cap.isOpened():
                fail(f"cannot open camera {dev}", deviceId=dev)
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, w)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, h)
            cap.set(cv2.CAP_PROP_FPS, 30)
            ret, frame = cap.read()
            cap.release()
            if not ret or frame is None:
                fail("failed to capture frame", deviceId=dev)
            ts = int(time.time()*1000)
            path = f"/tmp/monsterbox_capture_{dev}_{w}x{h}_{ts}.jpg"
            ok_, buf = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
            if not ok_:
                fail("jpeg encode failed")
            with open(path, 'wb') as f:
                f.write(buf.tobytes())
            ok(deviceId=dev, width=w, height=h, filename=path, message=f"Captured {w}x{h} from camera {dev}")
        elif cmd == 'list_ctrls':
            _, dev = args
            code, out = run_cmd(['v4l2-ctl', '-d', f'/dev/video{dev}', '--list-ctrls'])
            if code != 0:
                fail('v4l2-ctl list failed', rawOutput=out, deviceId=dev)
            # Parse v4l2-ctl output into {name: {type, value, min, max, step, default}, ...}
            import re
            controls = {}
            for line in out.splitlines():
                line = line.strip()
                if not line or ':' not in line:
                    continue
                left, right = line.split(':', 1)
                tokens = left.split()
                if len(tokens) < 2:
                    continue
                name = tokens[0]
                # Extract type from (int), (bool), (menu) token
                ctrl_type = 'int'
                for t in tokens:
                    if t.startswith('(') and t.endswith(')'):
                        ctrl_type = t[1:-1]
                        break
                # Parse key=value pairs from right side
                attrs = {}
                for m in re.finditer(r'(\w+)=(-?\d+)', right):
                    attrs[m.group(1)] = int(m.group(2))
                entry = {'type': ctrl_type}
                for key in ('value', 'min', 'max', 'step', 'default'):
                    if key in attrs:
                        entry[key] = attrs[key]
                if 'flags' in right and 'inactive' in right:
                    entry['inactive'] = True
                controls[name] = entry
            ok(deviceId=dev, rawOutput=out, controls=controls, message='Listed controls')
        elif cmd == 'set_ctrls':
            _, dev, kv = args
            if not kv:
                fail('no controls provided')
            code, out = run_cmd(['v4l2-ctl', '-d', f'/dev/video{dev}', f'--set-ctrl={kv}'])
            if code != 0:
                fail('v4l2-ctl set failed', rawOutput=out, deviceId=dev)
            ok(deviceId=dev, rawOutput=out, applied=kv, message='Controls set')
        else:
            fail('unhandled command')
    except Exception as e:
        fail(str(e))
