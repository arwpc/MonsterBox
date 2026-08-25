#!/usr/bin/env python3

"""
MonsterBox Shared Servo Daemon

One long-lived process owns the I2C bus and the PCA9685 for the whole box.
Everything that wants to move a servo asks this process to do it.

Why this exists
---------------
The PCA9685 prescaler can only be written while the chip is asleep, and sleeping
stops the oscillator, which drops the PWM output on all sixteen channels at once.
MonsterBox used to spawn a fresh Python process for every servo command, and each
of those processes re-initialised the chip, so every servo move blanked every
other servo. Measured on a reference node: 24 one-shot commands aimed at an
unconnected channel produced 11 SLEEP entries and 53 no-pulse reads on the head
servo's channel in 8 seconds. That is the head twitch, and it makes concurrent
motion impossible.

With a single owner the chip is configured once, and two channels written
back-to-back under one lock land ~0.3ms apart, which reads as simultaneous.

Front ends (both served at once, both optional)
-----------------------------------------------
  * Unix socket at $MB_SERVO_SOCKET (default /tmp/monsterbox-servo.sock).
    This is how other *processes* reach the daemon — one-shot CLI invocations,
    calibration adapters, and Node.
  * stdin/stdout JSON lines. This is the original jaw-daemon protocol and is
    kept byte-for-byte compatible so services/jawServoDaemon.js is unchanged.

Protocol (JSON object per line, reply is one JSON object per line)
------------------------------------------------------------------
  {"cmd":"ping"}                                    -> {"status":"pong"}
  {"cmd":"set_angle","channel":3,"angle":85}        -> {"status":"ok"}
  {"cmd":"set_angle","channel":3,"angle":85,"min":60,"max":120}
  {"cmd":"set_angles","moves":[{"channel":0,"angle":100},
                               {"channel":5,"angle":110}]} -> {"status":"ok","results":[...]}
  {"cmd":"set_pulse","channel":5,"pulse_us":1500}   -> {"status":"ok"}
  {"cmd":"set_raw","channel":5,"off":307}           -> {"status":"ok"}
  {"cmd":"release","channel":5}                     -> {"status":"ok"}
  {"cmd":"release_all"}                             -> {"status":"ok"}
  {"cmd":"state"}                                   -> {"status":"ok","channels":{...}}
  {"cmd":"shutdown"}                                -> {"status":"shutdown"}
  An optional "id" on any request is echoed back on the reply.

Safety
------
This daemon is a transport, not a policy engine. Calibrated bounds and
config/hardware-safety.json are enforced in Node before a command gets here, and
that must stay true — the daemon can only ever narrow, never widen:
  * every angle is clamped to 0-180 unconditionally;
  * an optional per-move min/max is applied on top, and is intersected with,
    never substituted for, the 0-180 clamp;
  * an I2C failure releases the offending channel rather than leaving it
    commanded to a value that was only half-written.
"""

import errno
import json
import os
import signal
import socket
import stat
import sys
import threading
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Tell pca9685_control not to try to call the daemon — we ARE the daemon.
os.environ['MB_SERVO_DAEMON'] = '1'

from pca9685_control import (  # noqa: E402
    PCA9685_DEFAULT_ADDRESS,
    SERVO_SOCKET_PATH,
    angle_to_off,
    chip_is_configured,
    ensure_chip,
    open_bus,
    us_to_off,
    write_channel,
)

# Re-verify the chip is still configured at most this often. Cheap insurance
# against some other process resetting it behind our back; not a hot-path cost.
VERIFY_INTERVAL_S = 5.0

_bus = None
_bus_lock = threading.RLock()
_initialized = {}          # i2c_address -> last verification timestamp
_last_off = {}             # (address, channel) -> last off-count written
_shutdown_event = threading.Event()
_stats = {'commands': 0, 'errors': 0, 'reinits': 0, 'started_at': time.time()}

# Path we successfully bound, or None. Only set while this process is the owner,
# so cleanup can remove the socket file without probing (and racing) for it.
_bound_socket_path = None


def _log(msg):
    """Daemon logging goes to stderr — stdout is the jaw protocol channel."""
    sys.stderr.write(f"[servo_daemon] {msg}\n")
    sys.stderr.flush()


# ---------------------------------------------------------------------------
# Bus ownership
# ---------------------------------------------------------------------------

def _get_bus():
    global _bus
    if _bus is None:
        _bus = open_bus(1)
    return _bus


def _drop_bus():
    """Forget the bus so the next command reopens and re-verifies it."""
    global _bus
    if _bus is not None:
        try:
            _bus.close()
        except Exception:
            pass
    _bus = None
    _initialized.clear()


def _ensure(address):
    """Make sure the chip at `address` is usable, disturbing it as little as possible."""
    now = time.time()
    last = _initialized.get(address)
    if last is not None and (now - last) < VERIFY_INTERVAL_S:
        return

    bus = _get_bus()
    if last is not None:
        # Already ours — a cheap read-only check is enough. Only a chip that has
        # actually been reset gets the disruptive sequence.
        if chip_is_configured(bus, address):
            _initialized[address] = now
            return
        _log(f"chip at 0x{address:02x} lost its configuration — re-initialising")
        _stats['reinits'] += 1

    state = ensure_chip(bus, address)
    _initialized[address] = now
    if state == 'initialized':
        _stats['reinits'] += 1
    _log(f"chip 0x{address:02x} {state}")


_broken_cache = {'at': 0.0, 'channels': {}}
BROKEN_REFRESH_S = 30.0


class ChannelDenied(RuntimeError):
    """A write was refused because the channel's part is declared physically broken.

    Raised instead of silently dropping the write: every front end replies
    through dispatch_line, and a caller that hears {'status':'ok'} for a pulse
    that never left the chip reports phantom motion all the way up to the
    operator — the bench saw "Moved to 60°" while zero pulses went out
    (2026-08-22, the knight's magic box on a denied channel).
    """

    def __init__(self, channel, reason):
        super().__init__(
            f"REFUSED ch{channel} — {reason}. "
            f"Clear it in config/physical-faults.json once repaired.")
        self.channel = channel
        self.denied = True


def _broken_channels():
    """{channel: reason} for parts declared physically broken, cached briefly.

    Cheap and fail-open on error: a daemon that cannot read the fault list must not
    stop driving healthy hardware mid-show.
    """
    now = time.time()
    if (now - _broken_cache['at']) < BROKEN_REFRESH_S:
        return _broken_cache['channels']
    channels = {}
    try:
        import mb_safety
        channels = mb_safety.broken_channels(mb_safety.resolve_character_id())
    except Exception as exc:
        _log(f"could not read physical-faults ({exc}) — not denying any channel")
    _broken_cache['at'] = now
    _broken_cache['channels'] = channels
    return channels


def _write(address, channel, off):
    """One guarded channel write. Releases the channel if it cannot be trusted.

    This daemon is the only PERSISTENT holder of /dev/i2c-1, so every lasting
    channel state on the chip passes through here. Set MB_SERVO_TRACE=1 to log each
    write. That exists because a channel belonging to a physically damaged part kept
    ending up energized during a full test-suite run with no corresponding entry in
    the Node-side log — the Node layer logs its own intent, not what actually
    reached the chip, so attribution needs a probe at this boundary.
    """
    # LAST LINE OF DEFENCE: never energize a channel owned by a physically broken
    # part. Releasing one (off == 0) is always allowed.
    #
    # The Node layer already refuses these in scene playback, poses, batch moves,
    # transitions, head-tracking selection and automated test target selection. This
    # check exists because on 2026-08-21 a full test-suite run STILL energized a
    # damaged part's channel, and the Node-side logs showed no such command — the
    # Node layer logs its intent, not what reaches the chip. A trace at this
    # boundary proved the daemon really did receive channel 4 twice. Rather than keep
    # hunting the caller, the deny lives where every caller must pass: this is the
    # only persistent owner of /dev/i2c-1, and the stdin jaw protocol, the unix
    # socket, and one-shot CLI invocations all funnel through here.
    #
    # Consistent with the daemon's stated contract — "can only ever narrow, never
    # widen" — exactly like the unconditional 0-180 clamp above it.
    #
    # To drive a part that is listed: clear its entry in config/physical-faults.json.
    # That is deliberately an explicit, one-line operator action, not a flag a
    # background job can set.
    if off:
        denied = _broken_channels().get(int(channel))
        if denied:
            _log(f"REFUSED ch{channel} off={off} — {denied}. "
                 f"Clear it in config/physical-faults.json once repaired.")
            # The refusal must reach the caller, not just this log. Silently
            # returning here made every front end answer {'status':'ok'} for a
            # write that never happened.
            raise ChannelDenied(channel, denied)

    try:
        _ensure(address)
        if os.environ.get('MB_SERVO_TRACE') == '1':
            _log(f"TRACE write ch{channel} off={off} "
                 f"({off / 4096.0 * 20000.0:.1f}us) addr=0x{address:02x}")
        write_channel(_get_bus(), address, channel, 0, off)
        _last_off[(address, channel)] = off
    except OSError as exc:
        _stats['errors'] += 1
        _log(f"I2C error on ch{channel}: {exc} — releasing channel")
        # Fail safe: a half-written channel is a pulse width nobody chose.
        # Stop driving it rather than leave it at an unknown command.
        try:
            write_channel(_get_bus(), address, channel, 0, 0)
        except Exception:
            pass
        _last_off.pop((address, channel), None)
        _drop_bus()
        raise


def _clamp_angle(angle, lo=None, hi=None):
    """0-180 always; an optional caller window narrows it further, never widens."""
    angle = max(0.0, min(180.0, float(angle)))
    if lo is not None:
        angle = max(float(lo), angle)
    if hi is not None:
        angle = min(float(hi), angle)
    # Re-apply the hard clamp in case a caller passed a nonsense window.
    return max(0.0, min(180.0, angle))


def _address_of(cmd):
    address = cmd.get('address', PCA9685_DEFAULT_ADDRESS)
    if isinstance(address, str):
        address = int(address, 0)
    return int(address)


def _validate_channel(channel):
    channel = int(channel)
    if not 0 <= channel <= 15:
        raise ValueError(f"Channel must be 0-15, got {channel}")
    return channel


# ---------------------------------------------------------------------------
# Command dispatch
# ---------------------------------------------------------------------------

def handle_command(cmd):
    """Execute one decoded command and return the reply dict."""
    action = cmd.get('cmd', '')
    _stats['commands'] += 1

    if action == 'ping':
        return {'status': 'pong'}

    if action == 'stats':
        return {'status': 'ok', 'stats': dict(_stats),
                'uptime_s': round(time.time() - _stats['started_at'], 1)}

    if action == 'state':
        with _bus_lock:
            channels = {f"{addr}:{ch}": off for (addr, ch), off in _last_off.items()}
        return {'status': 'ok', 'channels': channels}

    if action == 'set_angle':
        channel = _validate_channel(cmd['channel'])
        angle = _clamp_angle(cmd['angle'], cmd.get('min'), cmd.get('max'))
        address = _address_of(cmd)
        with _bus_lock:
            _write(address, channel, angle_to_off(angle))
            if cmd.get('release'):
                # Continuous servos are pulsed, then released so they stop.
                _write(address, channel, 0)
        return {'status': 'ok', 'channel': channel, 'angle': angle}

    if action == 'set_angles':
        moves = cmd.get('moves') or []
        address = _address_of(cmd)
        prepared = []
        for move in moves:
            channel = _validate_channel(move['channel'])
            angle = _clamp_angle(move['angle'], move.get('min'), move.get('max'))
            prepared.append((channel, angle))

        results = []
        # One lock hold for the whole group: this is what makes the channels
        # move together instead of being interleaved by other callers.
        with _bus_lock:
            for channel, angle in prepared:
                try:
                    _write(address, channel, angle_to_off(angle))
                    results.append({'channel': channel, 'angle': angle, 'status': 'success'})
                except Exception as exc:
                    entry = {'channel': channel, 'angle': angle,
                             'status': 'error', 'error': str(exc)}
                    if getattr(exc, 'denied', False):
                        entry['denied'] = True
                    results.append(entry)
        return {'status': 'ok', 'results': results}

    if action == 'set_pulse':
        channel = _validate_channel(cmd['channel'])
        address = _address_of(cmd)
        with _bus_lock:
            _write(address, channel, us_to_off(cmd['pulse_us']))
            if cmd.get('release'):
                _write(address, channel, 0)
        return {'status': 'ok', 'channel': channel}

    if action == 'set_raw':
        channel = _validate_channel(cmd['channel'])
        address = _address_of(cmd)
        off = max(0, min(4095, int(cmd['off'])))
        with _bus_lock:
            _write(address, channel, off)
        return {'status': 'ok', 'channel': channel, 'off': off}

    if action == 'release':
        channel = _validate_channel(cmd['channel'])
        address = _address_of(cmd)
        with _bus_lock:
            _write(address, channel, 0)
        return {'status': 'ok', 'channel': channel, 'released': True}

    if action == 'release_all':
        address = _address_of(cmd)
        with _bus_lock:
            for channel in range(16):
                try:
                    _write(address, channel, 0)
                except Exception:
                    pass
        return {'status': 'ok', 'released': 'all'}

    if action == 'shutdown':
        _shutdown_event.set()
        return {'status': 'shutdown'}

    return {'status': 'error', 'message': f"Unknown command: {action}"}


def dispatch_line(line):
    """Decode one protocol line and return the reply dict (never raises)."""
    try:
        cmd = json.loads(line)
    except (json.JSONDecodeError, ValueError) as exc:
        return {'status': 'error', 'message': f"Invalid JSON: {exc}"}

    if not isinstance(cmd, dict):
        return {'status': 'error', 'message': 'Command must be a JSON object'}

    try:
        reply = handle_command(cmd)
    except Exception as exc:
        _stats['errors'] += 1
        reply = {'status': 'error', 'message': str(exc)}
        if getattr(exc, 'denied', False):
            reply['denied'] = True

    if 'id' in cmd:
        reply['id'] = cmd['id']
    return reply


# ---------------------------------------------------------------------------
# Front end 1 — Unix socket (serves every other process on the box)
# ---------------------------------------------------------------------------

def _serve_connection(conn):
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
                reply = dispatch_line(raw.decode('utf-8', 'replace'))
                conn.sendall((json.dumps(reply) + '\n').encode('utf-8'))
    except OSError:
        pass  # client hung up mid-command; nothing to recover
    finally:
        try:
            conn.close()
        except Exception:
            pass


def _try_bind(path):
    """Bind the socket if nobody live is already on it. Returns a socket or None."""
    if os.path.exists(path):
        probe = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        probe.settimeout(0.5)
        try:
            probe.connect(path)
            return None  # a live daemon owns it — never steal the bus from it
        except OSError:
            # Stale socket from a daemon that died. Safe to clear.
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
        os.chmod(path, 0o660)
        server.listen(32)
        server.settimeout(0.5)
        global _bound_socket_path
        _bound_socket_path = path
        return server
    except OSError as exc:
        _log(f"cannot bind {path}: {exc}")
        try:
            server.close()
        except Exception:
            pass
        return None


def _socket_server(path):
    """Own the Unix socket for as long as this daemon lives.

    Binding is retried rather than attempted once. If another daemon already
    holds the socket we stand down — two owners of one I2C bus is the bug this
    whole change exists to remove — but we keep checking, so when that daemon
    exits this one takes over instead of leaving the box with no socket and
    every caller silently falling back to spawning processes again.
    """
    server = None
    announced_standby = False
    try:
        while not _shutdown_event.is_set():
            if server is None:
                server = _try_bind(path)
                if server is None:
                    if not announced_standby:
                        _log(f"{path} is owned by another servo daemon — standing by")
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
            threading.Thread(target=_serve_connection, args=(conn,), daemon=True).start()
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


# ---------------------------------------------------------------------------
# Front end 2 — stdin/stdout (the original jaw-daemon protocol, unchanged)
# ---------------------------------------------------------------------------

def _send_stdout(obj):
    sys.stdout.write(json.dumps(obj) + '\n')
    sys.stdout.flush()


def _stdin_loop():
    for line in sys.stdin:
        if _shutdown_event.is_set():
            break
        line = line.strip()
        if not line:
            continue
        reply = dispatch_line(line)
        _send_stdout(reply)
        if reply.get('status') == 'shutdown':
            break
    _shutdown_event.set()


def _stdin_is_a_live_pipe():
    """True only when stdin is a pipe or socket fed by a parent process.

    Node spawns this daemon with stdio ['pipe',...], so EOF on that pipe really
    does mean the parent is gone and shutting down is right. Launched by hand
    with stdin at /dev/null, EOF is immediate and means nothing at all — reading
    it as "parent went away" made the daemon exit the instant it started.
    """
    try:
        mode = os.fstat(0).st_mode
    except OSError:
        return False
    return stat.S_ISFIFO(mode) or stat.S_ISSOCK(mode)


def _handle_signal(*_args):
    # Servos are deliberately left holding their last commanded position.
    # Releasing every channel on shutdown would drop the head under gravity,
    # which is a worse failure than holding.
    _shutdown_event.set()


def main():
    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT, _handle_signal)

    use_stdin = '--no-stdin' not in sys.argv and _stdin_is_a_live_pipe()

    socket_path = os.environ.get('MB_SERVO_SOCKET', SERVO_SOCKET_PATH)
    threading.Thread(target=_socket_server, args=(socket_path,), daemon=True).start()

    # Announce readiness on stdout for the jaw-daemon Node manager.
    _send_stdout({'status': 'ready'})

    if use_stdin:
        threading.Thread(target=_stdin_loop, daemon=True).start()
    else:
        _log('stdin is not a live pipe — running socket-only')

    while not _shutdown_event.is_set():
        time.sleep(0.2)

    _send_stdout({'status': 'shutdown'})
    with _bus_lock:
        _drop_bus()

    # The socket server runs on a daemon thread, so the process can exit before
    # that thread's own cleanup runs and leave the socket file behind. A stale
    # socket is recoverable — the next daemon unlinks it — but until then every
    # caller pays a refused connection before falling back. Remove it here, using
    # the recorded ownership rather than a probe: probing races the listener
    # thread, which may still be inside its half-second accept timeout.
    if _bound_socket_path:
        try:
            os.unlink(_bound_socket_path)
        except OSError as exc:
            if exc.errno != errno.ENOENT:
                _log(f"could not remove {_bound_socket_path}: {exc}")

    return 0


if __name__ == '__main__':
    sys.exit(main())
