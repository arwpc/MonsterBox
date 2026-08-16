#!/usr/bin/env python3

"""
Jaw Servo Daemon — compatibility entry point.

The jaw daemon was the first persistent PCA9685 process, and it was the only
servo path that did not glitch the other channels. v9.2.0 generalised it: the
implementation now lives in servo_daemon.py, which serves the identical
stdin/stdout protocol AND a Unix socket so every other process on the box shares
the same single owner of the I2C bus.

This file stays because its NAME is load-bearing:
  * services/jawServoDaemon.js spawns python_wrappers/jaw_servo_daemon.py;
  * services/resource/singleInstance.js reaps orphans by matching
    "jaw_servo_daemon.py" in the process table.
Both keep working unchanged, and the process they manage is now the daemon for
every servo rather than just the jaw.

The stdin protocol is a strict superset of the original:
  {"cmd":"set_angle","channel":10,"angle":85[,"address":64]} -> {"status":"ok"}
  {"cmd":"ping"}                                             -> {"status":"pong"}
  {"cmd":"shutdown"}                                         -> {"status":"shutdown"}
See servo_daemon.py for the commands added on top (set_angles, release, ...).
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from servo_daemon import main  # noqa: E402

if __name__ == '__main__':
    sys.exit(main())
