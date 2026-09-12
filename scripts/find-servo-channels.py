#!/usr/bin/env python3
"""Sweep PCA9685 channels ONE AT A TIME so a human can see which one moves what.

Why this exists
---------------
Nothing in software can tell a re-pinned harness from an unchanged one. A
PCA9685 channel emits PWM whether or not a servo is on the pin, so register
readback, i2cdetect and "the command succeeded" all read identically either way.
That ambiguity cost four days once already (see
docs/hardware/PCA9685-CHANNEL-MAP-MINA.md). Only the operator's eyes settle it.

So: this drives one channel at a time, says loudly which one it is, and waits.
You watch the rig and write down what moved. Then parts.json gets corrected from
an observation instead of an inference.

Usage
-----
  python3 scripts/find-servo-channels.py                 # all 16 channels
  python3 scripts/find-servo-channels.py --channels 4,8,11
  python3 scripts/find-servo-channels.py --mapped        # only channels parts.json claims
  python3 scripts/find-servo-channels.py --excursion 60 --cycles 6

Each channel is restored to the pulse it was holding before its sweep, so a
part that IS working is left where it started rather than parked somewhere new.
"""

import argparse
import json
import os
import socket
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), 'python_wrappers'))

SOCKET_PATH = os.environ.get('MB_SERVO_SOCKET', '/tmp/monsterbox-servo.sock')
ADDRESS = 0x40


def daemon(payload, timeout=3.0):
    """One request to the shared servo daemon. Returns None if it is not up."""
    try:
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        sock.connect(SOCKET_PATH)
        sock.sendall((json.dumps(payload) + '\n').encode())
        buf = b''
        while not buf.endswith(b'\n'):
            chunk = sock.recv(4096)
            if not chunk:
                break
            buf += chunk
        sock.close()
        return json.loads(buf.decode().strip()) if buf.strip() else None
    except Exception:
        return None


def read_off(channel):
    """What is this channel holding right now, straight from the chip?"""
    try:
        import pca9685_control
        bus = pca9685_control.pca9685_get_bus(ADDRESS)
        _on, off = pca9685_control.read_channel(bus, ADDRESS, channel)
        return off
    except Exception:
        return None


def _direct_write(channel, off):
    """Write the channel ourselves. Used whenever the daemon is not up.

    The daemon only runs while jaw animation is active, so on most nodes most of
    the time it simply is not there — and this tool must still work. The direct
    path adopts an already-configured chip instead of resetting it, so it does
    not blank the other fifteen channels on the way in.
    """
    import pca9685_control
    bus = pca9685_control.pca9685_get_bus(ADDRESS)
    pca9685_control.pca9685_set_pwm(bus, ADDRESS, channel, 0, int(off))


def set_off(channel, off):
    if daemon({'cmd': 'set_raw', 'channel': channel,
               'off': int(off), 'address': ADDRESS}) is None:
        _direct_write(channel, int(off))


def set_angle(channel, angle):
    if daemon({'cmd': 'set_angle', 'channel': channel,
               'angle': float(angle), 'address': ADDRESS}) is None:
        import pca9685_control
        _direct_write(channel, pca9685_control.angle_to_off(float(angle)))


def mapped_channels(character_id):
    """{channel: part name} from this character's parts.json."""
    path = os.path.join(os.path.dirname(HERE), 'data',
                        f'character-{character_id}', 'parts.json')
    out = {}
    try:
        with open(path) as handle:
            for part in json.load(handle):
                cfg = part.get('config') or {}
                if cfg.get('controllerType') == 'pca9685' and cfg.get('channel') is not None:
                    out[int(cfg['channel'])] = f"{part.get('name')} ({part.get('type')})"
    except Exception as exc:
        print(f"  (could not read parts.json: {exc})")
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--channels', help='comma-separated list, default all 16')
    parser.add_argument('--mapped', action='store_true',
                        help='only the channels parts.json claims')
    parser.add_argument('--excursion', type=float, default=60.0,
                        help='degrees of travel, default 60 (bigger = easier to see and hear)')
    parser.add_argument('--cycles', type=int, default=4, help='back-and-forth sweeps per channel')
    parser.add_argument('--centre', type=float, default=90.0, help='midpoint angle, default 90')
    parser.add_argument('--gap', type=float, default=2.0, help='seconds of stillness between channels')
    parser.add_argument('--character', default=os.environ.get('MB_CHARACTER_ID', ''),
                        help='character id, for naming channels in the output')
    args = parser.parse_args()

    via_daemon = daemon({'cmd': 'ping'}) is not None
    if not via_daemon:
        # Not an error. The daemon is only up while jaw animation is running.
        try:
            # A pure READ probe — confirm the bus answers without disturbing
            # a single channel. Nothing should move until the sweep says so.
            import pca9685_control  # noqa: F401
            if read_off(0) is None:
                raise RuntimeError('no answer from the PCA9685 at 0x%02x' % ADDRESS)
        except Exception as exc:
            print(f"Cannot reach the PCA9685: {exc}")
            print("Check I2C is enabled and the chip answers: i2cdetect -y 1")
            return 1

    names = mapped_channels(args.character) if args.character else {}
    if args.mapped:
        if not names:
            print("--mapped needs --character <id> (or MB_CHARACTER_ID) and a readable parts.json")
            return 1
        channels = sorted(names)
    elif args.channels:
        channels = [int(c) for c in args.channels.split(',') if c.strip() != '']
    else:
        channels = list(range(16))

    low = max(0.0, args.centre - args.excursion / 2.0)
    high = min(180.0, args.centre + args.excursion / 2.0)

    print()
    print("=" * 68)
    print("  PCA9685 CHANNEL FINDER — watch the rig, not this screen")
    print("=" * 68)
    print(f"  {len(channels)} channel(s), {args.cycles} sweeps each, {low:.0f}deg <-> {high:.0f}deg")
    print(f"  Driving via: {'the servo daemon' if via_daemon else 'direct I2C (daemon not running - fine)'}")
    print(f"  About {len(channels) * (args.cycles * 0.6 + args.gap):.0f} seconds total.")
    print("  Write down WHICH PART MOVES on WHICH CHANNEL NUMBER. Ctrl-C to stop.")
    print("=" * 68)
    print()
    time.sleep(2)

    seen = []
    try:
        for channel in channels:
            claim = names.get(channel, '— nothing mapped here —')
            print(f">>> CHANNEL {channel:<2}   parts.json says: {claim}")
            print("    sweeping now ...", end='', flush=True)
            restore = read_off(channel)
            for _ in range(args.cycles):
                set_angle(channel, high)
                time.sleep(0.3)
                set_angle(channel, low)
                time.sleep(0.3)
            # Put the channel back exactly as it was found.
            if restore is not None:
                set_off(channel, restore)
            print(" done.")
            seen.append(channel)
            time.sleep(args.gap)
    except KeyboardInterrupt:
        print("\n\nStopped by operator.")

    print()
    print("=" * 68)
    print(f"  Swept: {', '.join(str(c) for c in seen) or 'nothing'}")
    print("  Tell Claude which channel moved which part and parts.json gets")
    print("  corrected. A channel that moved NOTHING is either an empty pin or")
    print("  a part with no power — that distinction needs a meter, not software.")
    print("=" * 68)
    return 0


if __name__ == '__main__':
    sys.exit(main())
