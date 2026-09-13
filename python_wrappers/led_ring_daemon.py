#!/usr/bin/env python3

"""
MonsterBox WS2812B LED Ring Daemon

One long-lived root process owns the addressable pixel chain for the whole box.
Everything that wants to light an LED asks this process to do it.

Why this exists
---------------
Three separate constraints force a daemon rather than a per-command CLI:

  1. rpi_ws281x drives WS2812B through the PWM peripheral and DMA, which needs
     root. monsterbox.service runs as User=remote. Spawning a sudo Python
     process per frame is not an option, and running the whole web server as
     root to blink LEDs is a bad trade.
  2. WS2812B has no latch: the strip holds whatever was last clocked out. An
     animation is therefore a continuous stream of frames, not a command. A
     one-shot CLI would render one frame and exit.
  3. PixelStrip.begin() claims the PWM channel and a DMA channel. Two owners of
     that hardware is the same class of bug servo_daemon.py exists to prevent
     on the I2C bus, so the socket is bound by exactly one process.

Frames render on this daemon's own thread at FRAME_HZ. Node never blocks on an
animation; it sends a state and returns immediately.

PWM0/audio contention
---------------------
GPIO18 is PWM0, which the onboard analog audio driver (snd_bcm2835) also drives.
Both loaded at once produces flicker or a dead strip. MonsterBox audio is all
USB (ReSpeaker XVF3800), so snd_bcm2835 is blacklisted in
/etc/modprobe.d/blacklist-snd-bcm2835.conf. If pixels misbehave, check
`lsmod | grep snd_bcm2835` first — a loaded module is the usual cause.

Front end
---------
Unix socket at $MB_LED_SOCKET (default /tmp/monsterbox-led.sock), one JSON
object per line, one JSON object per line back. Same shape as servo_daemon.py.

Protocol
--------
  {"cmd":"ping"}                                  -> {"status":"pong","pixels":16}
  {"cmd":"set_state","state":"idle"}              -> {"status":"ok"}
  {"cmd":"set_state","state":"thinking","options":{"color":[0,120,255],"speed":1.5}}
  {"cmd":"set_brightness","brightness":60}        -> {"status":"ok"}
  {"cmd":"audio_level","level":0.72}              -> {"status":"ok"}   (drives 'speaking')
  {"cmd":"set_pixels","pixels":[[255,0,0],...]}   -> {"status":"ok"}   (manual/test)
  {"cmd":"state"}                                 -> {"status":"ok","state":...}
  {"cmd":"off"}                                   -> {"status":"ok"}
  {"cmd":"shutdown"}                              -> {"status":"shutdown"}
  An optional "id" on any request is echoed back on the reply.

Ring addressing
---------------
Two 8-pixel rings are chained on one data line, so the hardware is a single
16-pixel strip. "target" selects a span: left = pixels 0-7, right = 8-15,
both = the whole chain. Spans come from --count and --split so a different
build can wire a different geometry without editing this file.
"""

import argparse
import errno
import json
import math
import os
import signal
import socket
import sys
import threading
import time

DEFAULT_SOCKET_PATH = '/tmp/monsterbox-led.sock'
FRAME_HZ = 50.0
FRAME_INTERVAL = 1.0 / FRAME_HZ
TRANSITION_MS = 300.0

# Audio level decays toward zero when nothing is feeding it, so a 'speaking'
# state left running after playback ends settles dark instead of freezing at
# whatever the last sample happened to be.
AUDIO_DECAY_PER_SEC = 2.5

STATES = ('off', 'idle', 'listening', 'thinking', 'speaking', 'error', 'fade')

# WS2812B output is linear in duty cycle but human brightness perception is not.
# Without gamma the low end of a breathing pulse spends most of its travel in a
# range the eye reads as identical, which makes a slow fade look like a step.
#
# This is deliberately a float curve rather than a 256-entry lookup: it is
# applied to a pixel's intensity envelope (see _push), which is a continuous
# 0..1 value, not to each channel's already-quantised 8-bit level. Quantising
# before the curve is what made the low end collapse to black.
GAMMA_EXP = 2.2


def _duty(level):
    """Perceptual level 0..1 -> PWM duty 0..255, un-quantised."""
    if level <= 0.0:
        return 0.0
    if level >= 1.0:
        return 255.0
    return pow(level, GAMMA_EXP) * 255.0

_state_lock = threading.RLock()
# rpi_ws281x is not thread-safe: ws2811_render() from two threads at once (the
# animator mid-frame and a shutdown-path blackout) can wedge inside the C
# library with the process alive but unkillable by SIGTERM — which leaves a
# zombie owning PWM0, and the NEXT service start then looks like "the LEDs are
# dead". Every _strip access goes through this lock.
_strip_lock = threading.Lock()
_shutdown_event = threading.Event()
_bound_socket_path = None
_strip = None

# If the orderly shutdown path stalls anyway (a render call wedged in DMA wait),
# dying without a blackout is the lesser harm: a frozen frame is visible and
# explainable, a zombie holding the PWM channel silently breaks every restart.
FAILSAFE_EXIT_S = 10.0
_failsafe_armed = False

# A signal handler runs on the main thread between bytecodes and must be
# async-signal-safe: it may NOT touch a threading lock the interrupted frame
# might already hold (Event.set / Timer / a buffered stderr write all do), or it
# can self-deadlock into the very SIGTERM-unkillable zombie the failsafe exists
# to prevent. The handler therefore only records the signal; the main loop polls
# this and calls _request_shutdown from normal context.
_pending_signal = 0

_current = {
    'state': 'off',
    'options': {},
    'brightness': 100,
    'audio_level': 0.0,
    'audio_stamp': 0.0,
    'manual': None,        # explicit pixel buffer, overrides the animator
    'since': 0.0,
}
_prev_frame = None
_transition_start = 0.0


def _log(msg):
    sys.stderr.write(f"[led-daemon] {msg}\n")
    sys.stderr.flush()


# ---------------------------------------------------------------------------
# Strip ownership
# ---------------------------------------------------------------------------

class StripUnavailable(RuntimeError):
    pass


def _init_strip(count, pin, freq_hz, dma, invert, channel, color_order='GRB', brightness=255):
    global _strip
    try:
        from rpi_ws281x import PixelStrip, ws
    except ImportError as exc:
        raise StripUnavailable(
            f"rpi_ws281x is not installed ({exc}). "
            "Install with: sudo pip3 install --break-system-packages rpi-ws281x"
        )

    if os.geteuid() != 0:
        raise StripUnavailable(
            "WS2812B on PWM/DMA requires root; this daemon is not running as root"
        )

    # The library default happens to be GRB — which is why colorOrder being
    # silently dropped went unnoticed. Passing it explicitly keeps the part
    # config honest for the ring that isn't GRB.
    strip_types = {
        'RGB': ws.WS2811_STRIP_RGB, 'RBG': ws.WS2811_STRIP_RBG,
        'GRB': ws.WS2811_STRIP_GRB, 'GBR': ws.WS2811_STRIP_GBR,
        'BRG': ws.WS2811_STRIP_BRG, 'BGR': ws.WS2811_STRIP_BGR,
    }
    strip = PixelStrip(count, pin, freq_hz, dma, invert, brightness, channel,
                       strip_types[color_order])
    try:
        strip.begin()
    except Exception as exc:
        raise StripUnavailable(f"PixelStrip.begin() failed on GPIO{pin}: {exc}")
    _strip = strip
    _log(f"owning {count} pixels on GPIO{pin} "
         f"(dma={dma}, channel={channel}, freq={freq_hz}, order={color_order})")
    return strip


def _blackout():
    """Clear every pixel and push it. Safe to call more than once."""
    if _strip is None:
        return
    try:
        with _strip_lock:
            for i in range(_strip.numPixels()):
                _strip.setPixelColor(i, 0)
            _strip.show()
    except Exception as exc:
        _log(f"blackout failed: {exc}")


def _request_shutdown(reason):
    """Begin shutdown and arm the hard-exit failsafe (once).

    Never call this from a signal handler — it uses threading primitives. The
    handler sets _pending_signal and the main loop calls this instead.
    """
    global _failsafe_armed
    _shutdown_event.set()
    with _state_lock:
        if _failsafe_armed:
            return
        _failsafe_armed = True
    # Arm the timer BEFORE anything that can fail. _log writes to a stderr pipe
    # that raises once the parent Node process is gone, and a raise here after
    # _failsafe_armed=True would leave the failsafe marked-armed but never
    # started — defeating the guarantee. Start first, log last.
    timer = threading.Timer(FAILSAFE_EXIT_S, os._exit, args=(1,))
    timer.daemon = True
    timer.start()
    try:
        _log(f"shutdown requested ({reason})")
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Colour helpers
# ---------------------------------------------------------------------------

def _scale(rgb, factor):
    f = 0.0 if factor < 0 else (1.0 if factor > 1.0 else factor)
    return (rgb[0] * f, rgb[1] * f, rgb[2] * f)


def _mix(a, b, t):
    t = 0.0 if t < 0 else (1.0 if t > 1.0 else t)
    return (a[0] + (b[0] - a[0]) * t,
            a[1] + (b[1] - a[1]) * t,
            a[2] + (b[2] - a[2]) * t)


def _coerce_rgb(value, fallback):
    if not isinstance(value, (list, tuple)) or len(value) != 3:
        return fallback
    try:
        return tuple(max(0.0, min(255.0, float(c))) for c in value)
    except (TypeError, ValueError):
        return fallback


def _coerce_palette(value, fallback):
    """A palette is a list of [r,g,b]. Anything unparseable falls back whole
    rather than per-entry: a half-read palette would fade through colours the
    operator never chose, which is worse than ignoring the edit."""
    if not isinstance(value, (list, tuple)) or not value:
        return fallback
    out = []
    for entry in value:
        rgb = _coerce_rgb(entry, None)
        if rgb is None:
            return fallback
        out.append(rgb)
    return out


def _palette_color(palette, now, speed, fade_s, hold_s, phase=0.0):
    """Where a palette cycle sits at this instant.

    Each entry owns a (hold + fade) slot: it sits still for `hold_s`, then
    cross-fades into the next over `fade_s`. The cycle wraps on the last entry
    back to the first, so a two-colour palette breathes between them rather than
    snapping back at the end.
    """
    count = len(palette)
    if count == 0:
        return (0.0, 0.0, 0.0)
    if count == 1:
        return palette[0]

    step = hold_s + fade_s
    if step <= 0.0:
        return palette[0]

    cycle = step * count
    t = (now * speed + phase * step) % cycle
    index = int(t // step)
    within = t - index * step

    current = palette[index % count]
    if within <= hold_s or fade_s <= 0.0:
        return current
    return _mix(current, palette[(index + 1) % count], (within - hold_s) / fade_s)


# ---------------------------------------------------------------------------
# Animation
# ---------------------------------------------------------------------------

class Geometry:
    """Which pixel indices belong to which logical ring."""

    def __init__(self, count, split):
        self.count = count
        self.split = split if 0 < split < count else count

    def span(self, target):
        t = str(target or 'both').lower()
        if t in ('left', 'primary', 'ring1', '1'):
            return range(0, self.split)
        if t in ('right', 'secondary', 'ring2', '2'):
            return range(self.split, self.count)
        return range(0, self.count)

    def ring_index(self, i):
        """Position of pixel i within its own ring, and that ring's size."""
        if i < self.split:
            return i, self.split
        return i - self.split, self.count - self.split


def _render(state, opts, geo, now, audio_level):
    """Return a list of `geo.count` (r,g,b) float tuples for this instant."""
    frame = [(0.0, 0.0, 0.0)] * geo.count
    if state == 'off':
        return frame

    speed = float(opts.get('speed', 1.0) or 1.0)
    color = _coerce_rgb(opts.get('color'), _default_color(state))
    color_right = _coerce_rgb(opts.get('colorRight'), color)
    span = list(geo.span(opts.get('target', 'both')))

    if state == 'fade':
        # A whole-ring colour cycle rather than a per-pixel effect: both eyes
        # hold one colour and drift to the next. paletteRight defaults to the
        # left palette, so one list drives both eyes unless they are told apart.
        palette = _coerce_palette(opts.get('palette'), [color])
        palette_right = _coerce_palette(opts.get('paletteRight'), palette)
        fade_s = max(0.0, _number(opts.get('fadeMs'), 1200.0) / 1000.0)
        hold_s = max(0.0, _number(opts.get('holdMs'), 600.0) / 1000.0)
        phase = _number(opts.get('phaseRight'), 0.0)
        left_now = _palette_color(palette, now, speed, fade_s, hold_s)
        right_now = _palette_color(palette_right, now, speed, fade_s, hold_s, phase)
        for i in span:
            frame[i] = left_now if i < geo.split else right_now
        return frame

    if state == 'speaking':
        # Jaw-synced eyes: as the audio level rises 0->1 (the same signal that
        # drives the jaw servo from its min to its max), the colour crossfades
        # colorLow -> colorHigh AND the intensity climbs. When colorHigh is
        # absent this collapses to the legacy behaviour (one base colour whose
        # intensity tracks the level), so the speech pipeline is unchanged.
        color_high = _coerce_rgb(opts.get('colorHigh'), None)
        if color_high is not None:
            color_low = _coerce_rgb(opts.get('colorLow'), color)
            color = _mix(color_low, color_high, audio_level)
            color_right = color

    for i in span:
        pos, ring_size = geo.ring_index(i)
        base = color if i < geo.split else color_right
        frame[i] = _pixel_for(state, base, pos, ring_size, now, speed, audio_level)
    return frame


def _number(value, fallback):
    try:
        out = float(value)
    except (TypeError, ValueError):
        return fallback
    return fallback if out != out else out   # reject NaN, which poisons timing


def _default_color(state):
    return {
        'fade': (255.0, 120.0, 0.0),       # only used if 'fade' is given no palette
        'idle': (120.0, 40.0, 160.0),      # slow amber-violet ambience
        'listening': (0.0, 180.0, 255.0),  # cyan wake cue
        'thinking': (0.0, 120.0, 255.0),   # blue chase
        'speaking': (255.0, 140.0, 30.0),  # warm reactive
        'error': (255.0, 0.0, 0.0),
    }.get(state, (255.0, 255.0, 255.0))


def _pixel_for(state, base, pos, ring_size, now, speed, audio_level):
    if state == 'idle':
        # Breathing: a raised cosine so the pulse eases at both ends rather than
        # bouncing off the limits the way a bare sine does.
        phase = (now * speed) / 4.0
        level = 0.15 + 0.55 * (0.5 - 0.5 * math.cos(2.0 * math.pi * phase))
        return _scale(base, level)

    if state == 'listening':
        # A sweep travelling once around each ring over a dim standing glow, so
        # the cue reads as "woke up and is attending" rather than a flat colour.
        head = (now * speed * 1.6) % 1.0 * ring_size
        dist = min((pos - head) % ring_size, (head - pos) % ring_size)
        comet = max(0.0, 1.0 - dist / 2.2)
        return _scale(base, 0.18 + 0.82 * comet)

    if state == 'thinking':
        # Rotating comet with a trailing tail; the tail only runs one way so the
        # direction of travel is unambiguous.
        head = (now * speed * 0.9) % 1.0 * ring_size
        tail = (head - pos) % ring_size
        level = max(0.05, 1.0 - (tail / (ring_size * 0.75)))
        return _scale(base, level * level)

    if state == 'speaking':
        # Intensity tracks audio amplitude. A floor keeps the eyes visibly lit
        # between syllables; without it the rings flicker off on every gap and
        # read as a fault rather than speech.
        level = 0.22 + 0.78 * audio_level
        # Slight per-pixel shimmer keeps it from looking like a plain dimmer.
        shimmer = 1.0 - 0.12 * (0.5 + 0.5 * math.sin(now * 9.0 * speed + pos * 1.7))
        return _scale(base, level * shimmer)

    if state == 'error':
        # Hard strobe: deliberately square, not a fade, so it cannot be mistaken
        # for any of the ambient states.
        on = int(now * speed * 5.0) % 2 == 0
        return base if on else (0.0, 0.0, 0.0)

    return _scale(base, 1.0)


# ---------------------------------------------------------------------------
# Frame loop
# ---------------------------------------------------------------------------

def _animation_loop(geo):
    global _prev_frame, _transition_start
    next_due = time.monotonic()

    while not _shutdown_event.is_set():
        now = time.monotonic()

        with _state_lock:
            state = _current['state']
            opts = dict(_current['options'])
            brightness = _current['brightness']
            manual = _current['manual']

            # Decay the audio envelope so a stalled feed fades out.
            elapsed = now - (_current['audio_stamp'] or now)
            level = max(0.0, _current['audio_level'] - elapsed * AUDIO_DECAY_PER_SEC)
            _current['audio_level'] = level
            _current['audio_stamp'] = now

        if manual is not None:
            frame = list(manual)
        else:
            frame = _render(state, opts, geo, now, level)

        # Crossfade out of whatever was on screen when the state changed.
        if _prev_frame is not None:
            t = (now - _transition_start) * 1000.0 / TRANSITION_MS
            if t >= 1.0:
                _prev_frame = None
            else:
                frame = [_mix(_prev_frame[i], frame[i], t) for i in range(len(frame))]

        _push(frame, brightness)

        next_due += FRAME_INTERVAL
        sleep_for = next_due - time.monotonic()
        if sleep_for < 0:
            # Fell behind (SD card stall, CPU contention). Resync rather than
            # spin through a backlog of frames nobody will ever see.
            next_due = time.monotonic()
            sleep_for = 0
        _shutdown_event.wait(sleep_for)

    _blackout()


def _push(frame, brightness):
    """Clock one frame out to the strip.

    Gamma is applied ONCE, to the pixel's intensity envelope, with the master
    brightness folded in before it - both in float, with a single rounding step
    at the end.

    Where the curve is applied matters more than it looks. Applying it per
    channel to already-scaled 8-bit values (the original shape) crushed the low
    end twice, because every table input below 15 maps to 0:

      * the default 'idle' breath peaked at RGB(7,1,13) and spent half its cycle
        at literal black - a box that looked switched off, which is exactly the
        fault this daemon was reported for;
      * per-channel gamma also pulled the idle base (120,40,160) to (49,4,91),
        dragging the colour toward its dominant channel instead of dimming it,
        so the hue drifted as the ring breathed.

    Scaling all three channels by one factor keeps the hue the animator asked
    for, and flooring at 1 keeps a lit pixel lit.
    """
    if _strip is None:
        return
    master = max(0.0, min(100.0, float(brightness))) / 100.0
    try:
        with _strip_lock:
            for i, (r, g, b) in enumerate(frame):
                peak = r if r > g else g
                if b > peak:
                    peak = b
                if peak <= 0.0 or master <= 0.0:
                    _strip.setPixelColor(i, 0)
                    continue
                out_peak = _duty(min(1.0, peak / 255.0) * master)
                # A pixel the animator asked to light must never quantise to black.
                # Without this floor a slow fade reads as a strobe, and a dim state
                # reads as a dead strip.
                if out_peak < 1.0:
                    out_peak = 1.0
                scale = out_peak / peak
                rr = int(min(255.0, r * scale) + 0.5)
                gg = int(min(255.0, g * scale) + 0.5)
                bb = int(min(255.0, b * scale) + 0.5)
                _strip.setPixelColor(i, (rr << 16) | (gg << 8) | bb)
            _strip.show()
    except Exception as exc:
        _log(f"frame push failed: {exc}")


def _begin_transition():
    """Snapshot the current frame so the next state crossfades out of it."""
    global _prev_frame, _transition_start
    if _strip is None:
        return
    try:
        snap = []
        with _strip_lock:
            for i in range(_strip.numPixels()):
                c = _strip.getPixelColor(i)
                snap.append((float((c >> 16) & 0xFF), float((c >> 8) & 0xFF), float(c & 0xFF)))
        _prev_frame = snap
        _transition_start = time.monotonic()
    except Exception:
        _prev_frame = None


# ---------------------------------------------------------------------------
# Command handling
# ---------------------------------------------------------------------------

def handle_command(cmd, geo):
    action = str(cmd.get('cmd', '')).lower()

    if action == 'ping':
        return {'status': 'pong', 'pixels': geo.count, 'split': geo.split}

    if action == 'state':
        with _state_lock:
            return {
                'status': 'ok',
                'state': _current['state'],
                'options': dict(_current['options']),
                'brightness': _current['brightness'],
                'audioLevel': round(_current['audio_level'], 3),
                'pixels': geo.count,
                'split': geo.split,
            }

    if action == 'set_state':
        state = str(cmd.get('state', '')).lower()
        if state not in STATES:
            return {'status': 'error', 'message': f"unknown state {state!r}; expected one of {', '.join(STATES)}"}
        opts = cmd.get('options') or {}
        if not isinstance(opts, dict):
            return {'status': 'error', 'message': 'options must be an object'}
        _begin_transition()
        with _state_lock:
            _current['state'] = state
            _current['options'] = opts
            _current['manual'] = None
            _current['since'] = time.monotonic()
            if 'brightness' in opts:
                try:
                    _current['brightness'] = max(0, min(100, float(opts['brightness'])))
                except (TypeError, ValueError):
                    pass
            if state != 'speaking':
                _current['audio_level'] = 0.0
        return {'status': 'ok', 'state': state}

    if action == 'set_brightness':
        try:
            value = max(0.0, min(100.0, float(cmd.get('brightness'))))
        except (TypeError, ValueError):
            return {'status': 'error', 'message': 'brightness must be a number 0-100'}
        with _state_lock:
            _current['brightness'] = value
        return {'status': 'ok', 'brightness': value}

    if action == 'audio_level':
        try:
            level = max(0.0, min(1.0, float(cmd.get('level'))))
        except (TypeError, ValueError):
            return {'status': 'error', 'message': 'level must be a number 0-1'}
        replace = bool(cmd.get('set'))
        with _state_lock:
            if replace:
                # Jaw sync feeds an already-enveloped openness at frame rate, so
                # the level must follow it DOWN as well as up — track it directly
                # rather than latching the peak.
                _current['audio_level'] = level
            else:
                # Raw-RMS feed (legacy): rise immediately, fall gently — speech
                # transients light the rings on the attack, decay handled below.
                _current['audio_level'] = max(level, _current['audio_level'])
            _current['audio_stamp'] = time.monotonic()
        return {'status': 'ok'}

    if action == 'set_pixels':
        pixels = cmd.get('pixels')
        if not isinstance(pixels, list):
            return {'status': 'error', 'message': 'pixels must be an array of [r,g,b]'}
        span = list(geo.span(cmd.get('target', 'both')))
        buf = [(0.0, 0.0, 0.0)] * geo.count
        with _state_lock:
            if _current['manual'] is not None:
                buf = list(_current['manual'])
        for offset, idx in enumerate(span):
            if offset < len(pixels):
                buf[idx] = _coerce_rgb(pixels[offset], (0.0, 0.0, 0.0))
        _begin_transition()
        with _state_lock:
            _current['manual'] = buf
            _current['state'] = 'manual'
        return {'status': 'ok', 'pixels': len(span)}

    if action == 'off':
        _begin_transition()
        with _state_lock:
            _current['state'] = 'off'
            _current['options'] = {}
            _current['manual'] = None
            _current['audio_level'] = 0.0
        return {'status': 'ok', 'state': 'off'}

    if action == 'shutdown':
        _request_shutdown('socket command')
        return {'status': 'shutdown'}

    return {'status': 'error', 'message': f"unknown cmd {action!r}"}


def dispatch_line(line, geo):
    try:
        cmd = json.loads(line)
    except (ValueError, TypeError):
        return {'status': 'error', 'message': 'malformed JSON'}
    if not isinstance(cmd, dict):
        return {'status': 'error', 'message': 'expected a JSON object'}
    try:
        reply = handle_command(cmd, geo)
    except Exception as exc:
        reply = {'status': 'error', 'message': str(exc)}
    if cmd.get('id') is not None:
        reply['id'] = cmd['id']
    return reply


# ---------------------------------------------------------------------------
# Socket front end
# ---------------------------------------------------------------------------

def _serve_connection(conn, geo):
    try:
        conn.settimeout(30.0)
        buf = b''
        while not _shutdown_event.is_set():
            try:
                data = conn.recv(4096)
            except socket.timeout:
                break
            if not data:
                break
            buf += data
            while b'\n' in buf:
                raw, buf = buf.split(b'\n', 1)
                raw = raw.strip()
                if not raw:
                    continue
                reply = dispatch_line(raw.decode('utf-8', 'replace'), geo)
                conn.sendall((json.dumps(reply) + '\n').encode('utf-8'))
    except OSError:
        pass  # client hung up mid-command
    finally:
        try:
            conn.close()
        except Exception:
            pass


def _grant_access(path):
    """The daemon is root but Node runs as 'remote'. Hand the socket to a group
    that user is already in rather than widening it to everyone."""
    import grp
    for group in ('gpio', 'plugdev', 'dialout'):
        try:
            os.chown(path, -1, grp.getgrnam(group).gr_gid)
            os.chmod(path, 0o660)
            return group
        except (KeyError, OSError):
            continue
    os.chmod(path, 0o666)
    return 'world'


def _try_bind(path):
    if os.path.exists(path):
        probe = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        probe.settimeout(0.5)
        try:
            probe.connect(path)
            return None  # a live daemon owns the strip — never take it over
        except OSError:
            try:
                os.unlink(path)
            except OSError as exc:
                if exc.errno != errno.ENOENT:
                    _log(f"cannot clear stale socket {path}: {exc}")
                    return None
        finally:
            try:
                probe.close()
            except Exception:
                pass

    server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    try:
        server.bind(path)
        owner = _grant_access(path)
        server.listen(32)
        server.settimeout(0.5)
        global _bound_socket_path
        _bound_socket_path = path
        _log(f"socket {path} readable by group {owner}")
        return server
    except OSError as exc:
        _log(f"cannot bind {path}: {exc}")
        try:
            server.close()
        except Exception:
            pass
        return None


def _socket_server(path, geo):
    server = None
    announced_standby = False
    try:
        while not _shutdown_event.is_set():
            if server is None:
                server = _try_bind(path)
                if server is None:
                    # We reached here having already claimed the strip in main()
                    # (the pre-check passed), so another daemon that now owns the
                    # socket won a startup race — and it owns the same PWM/DMA
                    # channel we just programmed. Standing by would leave two
                    # processes rendering against one peripheral. Yield instead:
                    # blackout our frames and shut down so exactly one survives.
                    if _peer_alive(path):
                        _log(f"lost {path} to another led daemon — yielding the strip and exiting")
                        _request_shutdown('socket lost to peer')
                        break
                    # Bind failed for a non-peer reason (transient); keep trying.
                    if not announced_standby:
                        _log(f"cannot bind {path} yet — retrying")
                        announced_standby = True
                    _shutdown_event.wait(5.0)
                    continue
                announced_standby = False
                _log(f"listening on {path}")
            try:
                conn, _ = server.accept()
            except socket.timeout:
                continue
            except OSError as exc:
                _log(f"accept failed ({exc}) — rebinding")
                try:
                    server.close()
                except Exception:
                    pass
                server = None
                continue
            threading.Thread(target=_serve_connection, args=(conn, geo), daemon=True).start()
    finally:
        if server is not None:
            try:
                server.close()
            except Exception:
                pass
            try:
                os.unlink(path)
            except OSError:
                pass


def _handle_signal(signum, *_args):
    # Async-signal-safe: a single global store, no locks, no I/O. The main loop
    # (which polls every second) does the real shutdown work. See _pending_signal.
    global _pending_signal
    _pending_signal = signum


def _peer_alive(path):
    """True if a live daemon already answers on the socket. Used to bail BEFORE
    touching the strip — two owners of one PWM/DMA channel corrupt each other's
    frames, and _init_strip cannot be un-done once it has claimed the peripheral."""
    if not os.path.exists(path):
        return False
    probe = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    probe.settimeout(0.5)
    try:
        probe.connect(path)
        return True
    except OSError:
        return False
    finally:
        try:
            probe.close()
        except Exception:
            pass


def main():
    parser = argparse.ArgumentParser(description='MonsterBox WS2812B LED ring daemon')
    parser.add_argument('--count', type=int, default=16, help='total pixels on the chain')
    parser.add_argument('--split', type=int, default=8, help='first index of the second ring')
    parser.add_argument('--pin', type=int, default=18, help='BCM data pin (18 = PWM0)')
    parser.add_argument('--freq', type=int, default=800000)
    parser.add_argument('--dma', type=int, default=10)
    parser.add_argument('--channel', type=int, default=0, help='PWM channel (GPIO18 -> 0)')
    parser.add_argument('--color-order', type=lambda s: str(s).upper(), default='GRB',
                        choices=['RGB', 'RBG', 'GRB', 'GBR', 'BRG', 'BGR'],
                        help='channel order the pixels expect (WS2812B is GRB)')
    parser.add_argument('--invert', action='store_true')
    parser.add_argument('--socket', default=os.environ.get('MB_LED_SOCKET', DEFAULT_SOCKET_PATH))
    args = parser.parse_args()

    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT, _handle_signal)

    geo = Geometry(args.count, args.split)

    # Refuse to claim the strip if a live daemon already owns the socket. The old
    # code init'd the strip first and only checked ownership when binding the
    # socket — so a duplicate (spawned e.g. during the client's backoff window)
    # reprogrammed PWM0/DMA and then rendered against the real daemon forever in
    # "standby". Checking here means a duplicate never touches the peripheral.
    if _peer_alive(args.socket):
        _log(f"another led daemon owns {args.socket} — exiting without touching the strip")
        print(json.dumps({'status': 'ok', 'message': 'peer daemon already owns the strip'}))
        return 0

    try:
        _init_strip(args.count, args.pin, args.freq, args.dma, args.invert, args.channel,
                    args.color_order)
    except StripUnavailable as exc:
        _log(f"FATAL: {exc}")
        print(json.dumps({'status': 'error', 'message': str(exc)}))
        return 1

    _blackout()

    threading.Thread(target=_socket_server, args=(args.socket, geo), daemon=True).start()
    animator = threading.Thread(target=_animation_loop, args=(geo,), daemon=True)
    animator.start()

    print(json.dumps({'status': 'ok', 'message': f'led daemon owning {args.count} pixels on GPIO{args.pin}'}))
    sys.stdout.flush()

    try:
        while not _shutdown_event.is_set():
            if _pending_signal:
                break
            _shutdown_event.wait(1.0)
    except KeyboardInterrupt:
        pass
    reason = f"signal {_pending_signal}" if _pending_signal else "main loop exit"
    _request_shutdown(reason)   # idempotent; arms the failsafe for teardown

    animator.join(timeout=5.0)
    if animator.is_alive():
        # A live animator means a render call is wedged inside the C library; a
        # second render from this thread would join the same wedge. Exit hard —
        # a frozen frame beats a zombie holding PWM0.
        _log('animator did not stop; exiting without final blackout')
        os._exit(1)
    _blackout()   # belt and braces: the loop clears on exit, this covers a crashed loop
    _log('stopped, pixels cleared')
    return 0


if __name__ == '__main__':
    sys.exit(main())
