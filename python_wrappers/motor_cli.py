#!/usr/bin/env python3

"""
Motor CLI Wrapper for MonsterBox 5.5
Thin wrapper that calls scripts/motor_control.py, deriving dir/pwm pins from a base pin
"""

import sys
import os
import json
import subprocess

# Add the scripts directory to Python path for direct import if needed (repo root)
SCRIPTS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'scripts'))
sys.path.insert(0, SCRIPTS_DIR)


def main():
    if len(sys.argv) < 6:
        print(json.dumps({
            "status": "error",
            "message": "Usage: motor_cli.py <direction> <speed> <duration_ms> <dir_pin> <pwm_pin>"
        }))
        sys.exit(1)

    direction = sys.argv[1]
    speed = sys.argv[2]
    duration = sys.argv[3]
    dir_pin = sys.argv[4]
    pwm_pin = sys.argv[5]

    try:
        # Validate pins are integers
        int(dir_pin)
        int(pwm_pin)
    except Exception:
        print(json.dumps({"status": "error", "message": "dir_pin and pwm_pin must be integers"}))
        sys.exit(1)

    script_path = os.path.join(SCRIPTS_DIR, 'motor_control.py')
    cmd = ['python3', script_path, direction, speed, duration, dir_pin, pwm_pin]

    try:
        proc = subprocess.run(cmd, cwd=SCRIPTS_DIR, capture_output=True, text=True)
        # Propagate stdout (JSON) and exit code
        if proc.stdout:
            print(proc.stdout.strip())
        if proc.returncode != 0 and proc.stderr:
            print(proc.stderr.strip(), file=sys.stderr)
        sys.exit(proc.returncode)
    except Exception as e:
        print(json.dumps({"status": "error", "message": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()

