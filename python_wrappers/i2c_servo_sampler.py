#!/usr/bin/env python3
"""
Read-only PCA9685 register sampler — ground truth for what the servos were
actually commanded to do, independent of anything Node logs about itself.

Why this exists: application-level logs record intent. This reads the PWM
registers the chip is actually driving, so a claim like "the jaw used its whole
range" can be checked against hardware rather than against our own console.

Correctness notes:
  * Each sample is ONE i2c block read of all four LEDn registers
    (ON_L, ON_H, OFF_L, OFF_H). Reading the low and high bytes as two separate
    transactions lets the chip update between them and fabricates values that
    were never commanded (e.g. a 12-bit count that mixes the old low byte with
    the new high byte). Only atomic multi-byte reads are trustworthy here.
  * Every sample is bounds-checked before it is believed. A standard servo at
    50Hz is driven between 500us and 2400us, i.e. off-counts 102..491. Anything
    outside that window, or with a non-zero ON count, is a torn/garbage read and
    is counted separately rather than folded into the statistics.

This script only ever reads. It never writes a PCA9685 register, so it is safe
to run against live hardware while a show or conversation is in progress.

Usage:
  python3 i2c_servo_sampler.py --channels 3 --duration 30 --rate 200
  python3 i2c_servo_sampler.py --channels 0,3 --duration 60 --out /tmp/s.json
  python3 i2c_servo_sampler.py --channels 0 --mode1 --keep-invalid --duration 10

--mode1 also samples the MODE1 register (0x00). That is how a re-init glitch is
caught in the act: pca9685_init drives MODE1 to 0x10 (SLEEP), which stops the
oscillator and kills the PWM output on ALL sixteen channels for the duration of
the prescale write. Nothing in the LED registers records that, so counting
SLEEP entries is the only register-level evidence of the cross-channel glitch.

--keep-invalid records the values that fail the plausibility gate instead of only
counting them, so torn writes (a low byte from one command paired with a high
byte from another) can be read back rather than inferred.
"""

import argparse
import json
import sys
import time

PCA9685_LED0_ON_L = 0x06
PCA9685_MODE1 = 0x00
MODE1_SLEEP = 0x10
DEFAULT_ADDRESS = 0x40

# Standard-servo pulse window used by python_wrappers/pca9685_control.py and
# jaw_servo_daemon.py: 0deg = 500us, 180deg = 2400us, 50Hz / 4096 steps.
PULSE_MIN_US = 500.0
PULSE_MAX_US = 2400.0
PERIOD_US = 20000.0
STEPS = 4096.0

OFF_MIN = int((PULSE_MIN_US / PERIOD_US) * STEPS)  # 102
OFF_MAX = int((PULSE_MAX_US / PERIOD_US) * STEPS) + 1  # 492, inclusive slack


def off_to_angle(off_count):
    """Invert the wrapper's angle->pulse->count mapping."""
    pulse_us = (off_count / STEPS) * PERIOD_US
    return ((pulse_us - PULSE_MIN_US) / (PULSE_MAX_US - PULSE_MIN_US)) * 180.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--channels', default='3', help='comma-separated PCA9685 channels')
    ap.add_argument('--address', type=lambda v: int(v, 0), default=DEFAULT_ADDRESS)
    ap.add_argument('--bus', type=int, default=1)
    ap.add_argument('--duration', type=float, default=30.0, help='seconds')
    ap.add_argument('--rate', type=float, default=200.0, help='samples per second per channel')
    ap.add_argument('--out', default=None, help='write full JSON sample log here')
    ap.add_argument('--quiet', action='store_true')
    ap.add_argument('--mode1', action='store_true',
                    help='also sample MODE1 and report SLEEP (re-init glitch) events')
    ap.add_argument('--keep-invalid', action='store_true',
                    help='record the values rejected by the plausibility gate, not just the count')
    args = ap.parse_args()

    try:
        import smbus2 as smbus_mod
        bus = smbus_mod.SMBus(args.bus)
        read_block = lambda reg, n: bus.read_i2c_block_data(args.address, reg, n)
    except ImportError:
        import smbus as smbus_mod
        bus = smbus_mod.SMBus(args.bus)
        read_block = lambda reg, n: bus.read_i2c_block_data(args.address, reg, n)

    channels = [int(c) for c in args.channels.split(',') if c.strip() != '']
    for ch in channels:
        if not 0 <= ch <= 15:
            print(json.dumps({'error': f'channel out of range: {ch}'}))
            return 1

    period = 1.0 / max(1.0, args.rate)
    t_start = time.time()
    deadline = t_start + args.duration

    samples = {ch: [] for ch in channels}
    rejected = {ch: 0 for ch in channels}
    invalid = {ch: [] for ch in channels}

    # MODE1 tracking: a SLEEP entry means the oscillator stopped and every
    # channel lost its PWM output, however briefly.
    read_byte = None
    if args.mode1:
        read_byte = lambda reg: bus.read_byte_data(args.address, reg)
    mode1_samples = []
    mode1_sleep_events = 0
    mode1_prev = None

    while time.time() < deadline:
        loop_t = time.time()
        if read_byte is not None:
            try:
                m1 = read_byte(PCA9685_MODE1)
                if mode1_prev is None or m1 != mode1_prev:
                    mode1_samples.append((round((loop_t - t_start) * 1000.0, 1), m1))
                    if mode1_prev is not None and (m1 & MODE1_SLEEP) and not (mode1_prev & MODE1_SLEEP):
                        mode1_sleep_events += 1
                    mode1_prev = m1
            except OSError:
                pass
        for ch in channels:
            reg = PCA9685_LED0_ON_L + 4 * ch
            try:
                # Atomic 4-byte read: ON_L, ON_H, OFF_L, OFF_H.
                data = read_block(reg, 4)
            except OSError:
                rejected[ch] += 1
                continue
            on = data[0] | (data[1] << 8)
            off = data[2] | (data[3] << 8)
            # Plausibility gate — see module docstring.
            if on != 0 or off < OFF_MIN or off > OFF_MAX:
                rejected[ch] += 1
                if args.keep_invalid:
                    invalid[ch].append((round((loop_t - t_start) * 1000.0, 1), on, off))
                continue
            samples[ch].append((round((loop_t - t_start) * 1000.0, 1), off))
        slept = time.time() - loop_t
        if slept < period:
            time.sleep(period - slept)

    report = {'address': args.address, 'duration_s': round(time.time() - t_start, 2), 'channels': {}}
    for ch in channels:
        s = samples[ch]
        angles = [off_to_angle(off) for _, off in s]
        transitions = 0
        for i in range(1, len(s)):
            if s[i][1] != s[i - 1][1]:
                transitions += 1
        elapsed = report['duration_s'] or 1.0
        report['channels'][str(ch)] = {
            'samples': len(s),
            'rejected': rejected[ch],
            'min_angle': round(min(angles), 2) if angles else None,
            'max_angle': round(max(angles), 2) if angles else None,
            'mean_angle': round(sum(angles) / len(angles), 2) if angles else None,
            'distinct_counts': len(set(off for _, off in s)),
            'transitions': transitions,
            'transitions_per_s': round(transitions / elapsed, 2),
            'p05_angle': round(sorted(angles)[int(len(angles) * 0.05)], 2) if angles else None,
            'p50_angle': round(sorted(angles)[int(len(angles) * 0.50)], 2) if angles else None,
            'p95_angle': round(sorted(angles)[int(len(angles) * 0.95)], 2) if angles else None,
        }
        if args.keep_invalid:
            report['channels'][str(ch)]['invalid_values'] = [
                {'t_ms': t, 'on': on, 'off': off} for t, on, off in invalid[ch][:50]
            ]

    if args.mode1:
        report['mode1'] = {
            'sleep_events': mode1_sleep_events,
            'distinct_values': sorted(set(v for _, v in mode1_samples)),
            'changes': len(mode1_samples),
            'timeline': [{'t_ms': t, 'mode1': v} for t, v in mode1_samples[:100]],
        }

    if args.out:
        with open(args.out, 'w') as fh:
            json.dump({'report': report,
                       'samples': {str(c): samples[c] for c in channels},
                       'invalid': {str(c): invalid[c] for c in channels},
                       'mode1': mode1_samples}, fh)

    if not args.quiet:
        print(json.dumps(report, indent=1))
    return 0


if __name__ == '__main__':
    sys.exit(main())
