#!/usr/bin/env python3
"""CLI wrapper for BTS7960 motor control"""
import sys, os, json, subprocess
SCRIPTS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'scripts'))

def main():
    if len(sys.argv) < 7:
        print(json.dumps({"status":"error","message":"Usage: bts7960_motor_cli.py <direction> <speed> <duration_ms> <left_en> <right_en> <pwm_pin>"}))
        return 1
    direction, speed, duration, left_en, right_en, pwm_pin = sys.argv[1:7]
    script_path = os.path.join(SCRIPTS_DIR, 'bts7960_motor_control.py')
    # Map positional legacy args to new argparse flags
    # direction: forward|reverse|stop (stop will just zero outputs)
    if direction == 'stop':
        # Represent stop as speed 0 and short duration
        speed = '0'
    cmd = [
        'python3', script_path,
        '--direction', direction if direction in ('forward','reverse') else 'forward',
        '--speed', speed,
        '--durationMs', duration,
        '--leftEnablePin', left_en,
        '--rightEnablePin', right_en,
        '--pwmPin', pwm_pin
    ]
    try:
        proc = subprocess.run(cmd, cwd=SCRIPTS_DIR, capture_output=True, text=True)
        if proc.stdout:
            print(proc.stdout.strip())
        if proc.returncode != 0 and proc.stderr:
            print(proc.stderr.strip(), file=sys.stderr)
        return proc.returncode
    except Exception as e:
        print(json.dumps({"status":"error","message":str(e)}))
        return 1

if __name__ == '__main__':
    sys.exit(main())
