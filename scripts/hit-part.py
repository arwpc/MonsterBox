#!/usr/bin/env python3
"""hit-part.py: hit one channel, sweep it five times back and forth, ask for the next, until Esc.

Interactive (run ON the node, in a terminal):

    python3 ~/hit.py
      Channel?            15        PCA9685 channel 0-15, or the DIR GPIO of an MDD10A
      Type?               s         s = servo on PCA9685   o = on/off on PCA9685 (laser, LED, relay)
                                    m = motor on MDD10A (DIR GPIO = the channel, PWM GPIO asked next)
      Sweep [110-136]?    Enter     servo only: default is that part's calibrated window, else 60-120
      ...five sweeps back and forth, the channel is released, and it asks again.
      Esc (or q) at any prompt, or in the middle of a sweep, quits.

One shot, no prompts:

    python3 ~/hit.py 15 servo            python3 ~/hit.py 15 servo 40-140
    python3 ~/hit.py 11 onoff
    python3 ~/hit.py 17 mdd 18           python3 ~/hit.py 17 mdd 18 2.0      (DIR, PWM, seconds per leg)
    add  --cycles N  to change the five.

Raw by design: smbus2 register writes to the PCA9685 (0x40, bus 1) and lgpio on the MDD10A pins, nothing of
MonsterBox in the path. The lurk machine is held while this runs (idle poses and head tracking cannot write the
chip) and released on exit. Every swept channel is left RELEASED (no pulse): the servo goes limp and leads can be
moved safely; the next app command re-energises it. The MDD10A pins are left low.
"""
import json
import os
import select
import sys
import time
import urllib.request

ADDR = 0x40
BUS = 1
APP = os.environ.get('MB_APP', 'http://127.0.0.1:3100')
DEFAULT_CYCLES = 5
SERVO_MIN_US, SERVO_MAX_US = 500, 2400           # same 0-180 mapping MonsterBox uses
REPO = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))


class Quit(Exception):
    pass


# ---------------------------------------------------------------- terminal: single keys, Esc anywhere
IS_TTY = sys.stdin.isatty()
_saved = None


def term_raw():
    global _saved
    if not IS_TTY:
        return
    import termios
    import tty
    _saved = termios.tcgetattr(sys.stdin.fileno())
    tty.setcbreak(sys.stdin.fileno())


def term_restore():
    if _saved is not None:
        import termios
        termios.tcsetattr(sys.stdin.fileno(), termios.TCSADRAIN, _saved)


def getkey(timeout=None):
    """One key, or None on timeout. A bare Esc raises Quit; escape sequences (arrows) are ignored."""
    r, _, _ = select.select([sys.stdin], [], [], timeout)
    if not r:
        return None
    k = os.read(sys.stdin.fileno(), 1).decode('utf-8', 'replace')
    if k == '\x1b':
        r, _, _ = select.select([sys.stdin], [], [], 0.03)
        if r:                                   # arrow key etc: drain and ignore
            os.read(sys.stdin.fileno(), 16)
            return ''
        raise Quit()
    if k in ('q', 'Q', '\x03'):
        raise Quit()
    return k


def ask(prompt, default=''):
    """Line prompt. Enter accepts the default. Esc/q quits."""
    label = '%s [%s]: ' % (prompt, default) if default != '' else '%s: ' % prompt
    if not IS_TTY:
        line = input(label).strip()
        if line.lower() in ('q', '\x1b'):
            raise Quit()
        return line or default
    sys.stdout.write(label)
    sys.stdout.flush()
    buf = ''
    while True:
        k = getkey()
        if k in ('\r', '\n'):
            sys.stdout.write('\n')
            return buf.strip() or default
        if k in ('\x7f', '\b'):
            if buf:
                buf = buf[:-1]
                sys.stdout.write('\b \b')
        elif k and k.isprintable():
            buf += k
            sys.stdout.write(k)
        sys.stdout.flush()


def askkey(prompt, allowed, default):
    label = '%s [%s]: ' % (prompt, default)
    if not IS_TTY:
        line = input(label).strip().lower()
        if line in ('q', '\x1b'):
            raise Quit()
        return (line[:1] or default) if (line[:1] or default) in allowed else default
    sys.stdout.write(label)
    sys.stdout.flush()
    while True:
        k = getkey()
        if k in ('\r', '\n'):
            sys.stdout.write(default + '\n')
            return default
        if k and k.lower() in allowed:
            sys.stdout.write(k.lower() + '\n')
            return k.lower()


def wait(seconds):
    """Sleep, but a bare Esc (or q) during the wait quits."""
    end = time.time() + seconds
    while True:
        left = end - time.time()
        if left <= 0:
            return
        if IS_TTY:
            getkey(timeout=min(left, 0.1))
        else:
            time.sleep(min(left, 0.1))


# ---------------------------------------------------------------- node knowledge (labels and defaults only)
def selected_character():
    try:
        with open(os.path.join(REPO, 'config', 'app-config.json')) as f:
            return int(json.load(f).get('selectedCharacter') or 0) or None
    except Exception:
        return None


def load_parts(cid):
    try:
        with open(os.path.join(REPO, 'data', 'character-%d' % cid, 'parts.json')) as f:
            return json.load(f)
    except Exception:
        return []


def load_profiles():
    try:
        with open(os.path.join(REPO, 'data', 'calibration_profiles.json')) as f:
            return json.load(f)
    except Exception:
        return {}


def part_on_channel(parts, ch):
    for p in parts:
        c = p.get('config') or {}
        if p.get('type') in ('servo', 'light', 'led', 'laser') and (p.get('channel', c.get('channel'))) == ch:
            return p
    return None


def mdd_part(parts, dir_pin):
    for p in parts:
        c = p.get('config') or {}
        if (p.get('directionPin', c.get('directionPin'))) == dir_pin:
            return p
    return None


def default_range(cid, part, profiles):
    if cid and part:
        prof = profiles.get('%d:%s' % (cid, part.get('id'))) or {}
        b = prof.get('bounds') or {}
        lo, hi = b.get('minAngle'), b.get('maxAngle')
        if lo is not None and hi is not None and not prof.get('autoGenerated') and abs(hi - lo) >= 5:
            return '%d-%d' % (lo, hi)
    return '60-120'


def parse_range(text):
    lo, hi = [float(x) for x in text.replace(' ', '').replace('..', '-').split('-', 1)]
    lo, hi = max(0.0, min(180.0, lo)), max(0.0, min(180.0, hi))
    if abs(hi - lo) < 1:
        raise ValueError('range too small')
    return lo, hi


# ---------------------------------------------------------------- lurk hold (so nothing else writes the chip)
def lurk(cmd, cid, reason='hit-part.py'):
    if not cid:
        return 'skipped (no selected character)'
    try:
        body = json.dumps({'characterId': cid, 'reason': reason, 'maxMs': 1800000}).encode()
        req = urllib.request.Request('%s/conversation/api/lurk/%s?characterId=%d' % (APP, cmd, cid), data=body,
                                     headers={'Content-Type': 'application/json'}, method='POST')
        with urllib.request.urlopen(req, timeout=5) as r:
            d = json.loads(r.read().decode() or '{}')
        return 'ok' if d.get('success', True) else str(d.get('error') or d)
    except Exception as e:
        return 'unreachable (%s)' % e


# ---------------------------------------------------------------- PCA9685, raw registers
class Chip:
    def __init__(self):
        try:
            import smbus2 as smbus
        except ImportError:
            import smbus
        self.b = smbus.SMBus(BUS)
        mode1 = self.b.read_byte_data(ADDR, 0x00)
        if mode1 & 0x10:                                   # asleep: wake it, keep the other bits
            self.b.write_byte_data(ADDR, 0x00, mode1 & ~0x10)
            time.sleep(0.005)
        prescale = self.b.read_byte_data(ADDR, 0xFE)
        self.hz = 25e6 / (4096 * (prescale + 1))

    def _regs(self, ch, on, off):
        base = 0x06 + 4 * ch
        self.b.write_byte_data(ADDR, base, on & 0xFF)
        self.b.write_byte_data(ADDR, base + 1, (on >> 8) & 0x1F)
        self.b.write_byte_data(ADDR, base + 2, off & 0xFF)
        self.b.write_byte_data(ADDR, base + 3, (off >> 8) & 0x1F)

    def pulse_us(self, ch, us):
        self._regs(ch, 0, int(round(us * 4096 * self.hz / 1e6)))

    def angle(self, ch, deg):
        self.pulse_us(ch, SERVO_MIN_US + (SERVO_MAX_US - SERVO_MIN_US) * deg / 180.0)

    def full_on(self, ch):
        self._regs(ch, 0x1000, 0)

    def release(self, ch):
        self._regs(ch, 0, 0x1000)                          # FULL OFF: no pulse at all

    def close(self):
        try:
            self.b.close()
        except Exception:
            pass


def sweep_servo(chip, ch, lo, hi, cycles, label):
    dwell = max(0.5, abs(hi - lo) / 15.0 * 0.1 + 0.3)     # ~0.1 s per 15 deg of travel, plus settle
    print('%s  ch%-2d %s: servo %g <-> %g deg, %d times back and forth' % (time.strftime('%H:%M:%S'), ch, label, lo, hi, cycles))
    try:
        sys.stdout.write('   ')
        for _ in range(cycles):
            for deg in (lo, hi):
                chip.angle(ch, deg)
                sys.stdout.write(' %g' % deg)
                sys.stdout.flush()
                wait(dwell)
    finally:
        chip.release(ch)
        print('   -> ch%d released (limp)' % ch)


def sweep_onoff(chip, ch, cycles, label):
    print('%s  ch%-2d %s: FULL ON / OFF, %d times' % (time.strftime('%H:%M:%S'), ch, label, cycles))
    try:
        sys.stdout.write('   ')
        for _ in range(cycles):
            chip.full_on(ch)
            sys.stdout.write(' ON')
            sys.stdout.flush()
            wait(0.6)
            chip.release(ch)
            sys.stdout.write(' off')
            sys.stdout.flush()
            wait(0.6)
    finally:
        chip.release(ch)
        print('   -> ch%d released' % ch)


# ---------------------------------------------------------------- MDD10A, lgpio on DIR + PWM (100 % = pin high)
def sweep_mdd(dir_pin, pwm_pin, secs, cycles, label):
    import lgpio
    print('%s  MDD10A %s: DIR GPIO%d / PWM GPIO%d, %gs each way at 100%%, %d times back and forth'
          % (time.strftime('%H:%M:%S'), label, dir_pin, pwm_pin, secs, cycles))
    h = lgpio.gpiochip_open(0)
    claimed = []
    try:
        for pin in (dir_pin, pwm_pin):
            try:
                lgpio.gpio_claim_output(h, pin, 0)
                claimed.append(pin)
            except Exception as e:
                print('   !! GPIO%d could not be claimed (%s). Another process holds it: sudo fuser -v /dev/gpiochip0' % (pin, e))
                return
        sys.stdout.write('   ')
        for _ in range(cycles):
            for d in (1, 0):
                lgpio.gpio_write(h, dir_pin, d)
                lgpio.gpio_write(h, pwm_pin, 1)
                sys.stdout.write(' DIR=%d' % d)
                sys.stdout.flush()
                wait(secs)
                lgpio.gpio_write(h, pwm_pin, 0)
                wait(0.3)
    finally:
        for pin in claimed:
            try:
                lgpio.gpio_write(h, pin, 0)
                lgpio.gpio_free(h, pin)
            except Exception:
                pass
        lgpio.gpiochip_close(h)
        print('   -> GPIO%d/GPIO%d low and freed' % (dir_pin, pwm_pin))


# ---------------------------------------------------------------- main
def banner(cid, parts, chip):
    print('PCA9685 0x%02x on bus %d at %.1f Hz. ' % (ADDR, BUS, chip.hz) + ('character %d' % cid if cid else 'no selected character'))
    if parts:
        pca = ['ch%s %s' % (p.get('channel', (p.get('config') or {}).get('channel')), p.get('name'))
               for p in parts if p.get('type') in ('servo', 'light', 'led', 'laser') and p.get('channel', (p.get('config') or {}).get('channel')) is not None]
        mdd = ['%s DIR%s/PWM%s' % (p.get('name'), p.get('directionPin', (p.get('config') or {}).get('directionPin')), p.get('pwmPin', (p.get('config') or {}).get('pwmPin')))
               for p in parts if p.get('directionPin', (p.get('config') or {}).get('directionPin')) is not None]
        print('parts.json says: ' + ', '.join(pca) + ((' ; MDD10A: ' + ', '.join(mdd)) if mdd else ''))
    print('Esc or q quits at any time.' if IS_TTY else 'type q to quit.')


def run_one(chip, cid, parts, profiles, ch, kind, extra, cycles):
    if kind == 'm':
        p = mdd_part(parts, ch)
        label = '(%s)' % p.get('name') if p else '(no part on that DIR pin)'
        pwm = extra.get('pwm')
        if pwm is None:
            pwm = (p.get('pwmPin', (p.get('config') or {}).get('pwmPin')) if p else None) or ch + 1
        sweep_mdd(ch, int(pwm), float(extra.get('secs') or 2.0), cycles, label)
        return
    if not 0 <= ch <= 15:
        print('   !! PCA9685 channels are 0-15')
        return
    p = part_on_channel(parts, ch)
    label = '(%s)' % p.get('name') if p else '(no part on this channel)'
    if kind == 'o':
        sweep_onoff(chip, ch, cycles, label)
    else:
        lo, hi = parse_range(extra.get('range') or default_range(cid, p, profiles))
        sweep_servo(chip, ch, lo, hi, cycles, label)


def interactive(chip, cid, parts, profiles, cycles):
    last_ch = ''
    while True:
        print()
        text = ask('Channel (0-15 PCA9685, or DIR GPIO for MDD10A)', last_ch)
        try:
            ch = int(text)
        except ValueError:
            print('   !! a number, please')
            continue
        last_ch = str(ch)
        kind = askkey('Type  s=servo PCA9685  o=on/off PCA9685  m=motor MDD10A', 'som', 's')
        extra = {}
        try:
            if kind == 's':
                p = part_on_channel(parts, ch)
                extra['range'] = ask('Sweep angles', default_range(cid, p, profiles))
                parse_range(extra['range'])
            elif kind == 'm':
                p = mdd_part(parts, ch)
                dflt = (p.get('pwmPin', (p.get('config') or {}).get('pwmPin')) if p else None) or ch + 1
                extra['pwm'] = int(ask('PWM GPIO', str(dflt)))
                extra['secs'] = float(ask('Seconds each way', '2'))
        except ValueError as e:
            print('   !! %s' % e)
            continue
        run_one(chip, cid, parts, profiles, ch, kind, extra, cycles)


def main(argv):
    cycles = DEFAULT_CYCLES
    if '--cycles' in argv:
        i = argv.index('--cycles')
        cycles = int(argv[i + 1])
        del argv[i:i + 2]
    if argv and argv[0] in ('-h', '--help'):
        print(__doc__)
        return 0
    cid = selected_character()
    parts = load_parts(cid) if cid else []
    profiles = load_profiles()
    chip = Chip()
    banner(cid, parts, chip)
    print('lurk hold: ' + lurk('event-hold', cid))
    term_raw()
    try:
        if argv:                                            # one shot
            ch = int(argv[0])
            kind = {'servo': 's', 's': 's', 'onoff': 'o', 'o': 'o', 'mdd': 'm', 'm': 'm', 'motor': 'm'}[argv[1] if len(argv) > 1 else 's']
            extra = {}
            if kind == 's' and len(argv) > 2:
                extra['range'] = argv[2]
            if kind == 'm':
                if len(argv) > 2:
                    extra['pwm'] = int(argv[2])
                if len(argv) > 3:
                    extra['secs'] = float(argv[3])
            run_one(chip, cid, parts, profiles, ch, kind, extra, cycles)
        else:
            interactive(chip, cid, parts, profiles, cycles)
    except (Quit, KeyboardInterrupt, EOFError):
        print('\nquit')
    finally:
        term_restore()
        print('lurk release: ' + lurk('event-release', cid))
        chip.close()
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
