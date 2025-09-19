#!/usr/bin/env python3
import sys, json
try:
    import cv2
except Exception:
    cv2 = None

def ok(**data):
    print(json.dumps({"status":"success", **data}))
    sys.exit(0)

def fail(msg, **extra):
    print(json.dumps({"status":"error","message":msg, **extra}))
    sys.exit(1)

if __name__ == '__main__':
    try:
        if len(sys.argv) < 2:
            fail("usage: head_tracking_cli.py get_position [cameraId]")
        cmd = sys.argv[1]
        if cmd != 'get_position':
            fail(f"unknown command: {cmd}")
        cam = int(sys.argv[2]) if len(sys.argv) > 2 else 0
        if cv2 is None:
            fail("opencv not available")
        cap = cv2.VideoCapture(cam, cv2.CAP_V4L2)
        if not cap.isOpened():
            fail(f"cannot open camera {cam}")
        ret, frame = cap.read()
        cap.release()
        if not ret or frame is None:
            fail("failed to read frame", cameraId=cam)
        # Try face detection with Haar cascade if available
        try:
            cascade_path = getattr(cv2.data, 'haarcascades', None)
            if cascade_path:
                face_cascade = cv2.CascadeClassifier(cascade_path + 'haarcascade_frontalface_default.xml')
                gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                faces = face_cascade.detectMultiScale(gray, 1.1, 4)
                if len(faces) > 0:
                    (x, y, w, h) = faces[0]
                    cx, cy = float(x + w/2), float(y + h/2)
                    ok(cameraId=cam, position={"x": cx, "y": cy, "confidence": 1.0}, message="Face detected")
        except Exception:
            pass
        # Fallback: report frame center with low confidence (still real frame)
        h, w = frame.shape[:2]
        ok(cameraId=cam, position={"x": float(w/2), "y": float(h/2), "confidence": 0.1}, message="Frame center (no face detected)")
    except Exception as e:
        fail(str(e))

