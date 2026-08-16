#!/usr/bin/env python3

"""
MonsterBox wrapper response envelope and error taxonomy.

Why this exists
---------------
The hardware layer used to return at least four different shapes on stdout
("success" as a bare word, {"status": ...}, {"success": ...}, and a bare
traceback), mixed in with log lines from imported modules. Node then guessed,
and an operator staring at `int() argument must be ... not 'NoneType'` had no
way to know a pin was missing from parts.json.

Contract
--------
  * stdout is the RESULT channel. Exactly one JSON object, printed once, at the
    end of the process. Nothing else may write to stdout.
  * stderr is the LOG channel. Diagnostics, warnings and the human-readable
    form of a failure go here (Node surfaces stderr when a wrapper exits
    non-zero, so a failure must always say something on stderr too).

Envelope
--------
  {
    "ok":        bool,
    "op":        "move_to_pca",             # the CLI verb that ran
    "part":      "4" | null,                # part id when one could be resolved
    "data":      { ... },                   # op-specific payload
    "error":     null | {"code","message","hint"},
    "timing_ms": 12,
    "clamps":    [ {"field","requested","applied","reason"} ]
  }

Backward compatibility (do not remove without updating Node)
------------------------------------------------------------
services/hardwareService/index.js decides success with wrapperSucceeded(), which
reads `success` / `status`, and several call sites still fall back to a regex on
the raw string. So the envelope also carries `success`, `status` and `message`.
They are mirrors of `ok`, never an independent source of truth.
"""

import json
import sys
import time

# --- Error taxonomy ---------------------------------------------------------
# Keep this list short and meaningful; a code the operator cannot act on is
# noise. `hint` is where the actionable part goes.
E_ARGS = 'E_ARGS'              # bad/missing CLI arguments
E_CONFIG = 'E_CONFIG'          # parts.json / config problem (missing pin, bad channel)
E_SAFETY = 'E_SAFETY'          # refused by config/hardware-safety.json
E_BUS_IO = 'E_BUS_IO'          # I2C / GPIO transport failure
E_BUSY = 'E_BUSY'              # resource held (power group, gpiochip, daemon)
E_UNSUPPORTED = 'E_UNSUPPORTED'  # unknown command / board type / backend absent
E_TIMEOUT = 'E_TIMEOUT'        # operation exceeded its own deadline
E_INTERNAL = 'E_INTERNAL'      # anything we failed to classify

ERROR_CODES = (
    E_ARGS, E_CONFIG, E_SAFETY, E_BUS_IO, E_BUSY,
    E_UNSUPPORTED, E_TIMEOUT, E_INTERNAL,
)

_START = time.monotonic()

# Guard against a wrapper emitting twice (which would put two JSON objects on
# stdout and make the "last JSON line wins" parser pick the wrong one).
_emitted = False


class WrapperError(Exception):
    """A classified failure. Raise this instead of printing and exiting."""

    def __init__(self, code, message, hint=None, part=None, data=None):
        super().__init__(message)
        self.code = code if code in ERROR_CODES else E_INTERNAL
        self.message = str(message)
        self.hint = hint
        self.part = part
        self.data = data or {}

    def to_dict(self):
        return {'code': self.code, 'message': self.message, 'hint': self.hint}


def log(message, level='info'):
    """Diagnostics go to stderr — stdout belongs to the single result object."""
    sys.stderr.write(json.dumps({'level': level, 'message': str(message)}) + '\n')
    sys.stderr.flush()


def warn(message):
    log(message, 'warning')


def elapsed_ms():
    return int((time.monotonic() - _START) * 1000)


def clamp_record(field, requested, applied, reason):
    """One clamp, in the shape the envelope reports.

    Callers were being told "done" after asking for 8s and getting 5s. Every
    narrowing the layer performs has to end up in this list.
    """
    return {
        'field': field,
        'requested': requested,
        'applied': applied,
        'reason': reason,
    }


def build(ok, op, part=None, data=None, error=None, clamps=None, message=None):
    """Build the envelope dict without printing it."""
    err = None
    if error is not None:
        err = error.to_dict() if isinstance(error, WrapperError) else dict(error)

    clamps = list(clamps or [])
    if message is None:
        if err:
            message = err.get('message') or 'error'
        else:
            message = f"{op} ok"
    if clamps and ok:
        message = f"{message} (clamped: " + '; '.join(
            f"{c['field']} {c['requested']}->{c['applied']}" for c in clamps
        ) + ')'

    return {
        'ok': bool(ok),
        'op': op,
        'part': None if part is None else str(part),
        'data': data if isinstance(data, dict) else ({} if data is None else {'value': data}),
        'error': err,
        'timing_ms': elapsed_ms(),
        'clamps': clamps,
        # --- legacy mirrors: services/hardwareService/index.js reads these ---
        'success': bool(ok),
        'status': 'success' if ok else 'error',
        'message': message,
    }


def emit(ok, op, part=None, data=None, error=None, clamps=None, message=None,
         exit_code=None):
    """Print the single result object and (optionally) exit.

    A failure is also written to stderr in human form, because runWrapper()
    rejects on a non-zero exit with stderr as the message — stdout would be
    dropped exactly when the operator most needs to read it.
    """
    global _emitted
    envelope = build(ok, op, part=part, data=data, error=error,
                     clamps=clamps, message=message)

    if not envelope['ok']:
        err = envelope['error'] or {}
        detail = f"[{err.get('code', E_INTERNAL)}] {envelope['message']}"
        if err.get('hint'):
            detail += f" | hint: {err['hint']}"
        sys.stderr.write(detail + '\n')
        sys.stderr.flush()
    elif envelope['clamps']:
        warn(envelope['message'])

    if not _emitted:
        sys.stdout.write(json.dumps(envelope) + '\n')
        sys.stdout.flush()
        _emitted = True

    if exit_code is None:
        exit_code = 0 if envelope['ok'] else 1
    if exit_code is not False:
        sys.exit(exit_code)
    return envelope


def emit_error(op, exc, part=None, data=None, exit_code=1):
    """Emit a failure envelope from an exception, classifying it if needed."""
    if not isinstance(exc, WrapperError):
        exc = classify(exc)
    return emit(False, op, part=part or exc.part,
                data=data if data is not None else exc.data,
                error=exc, exit_code=exit_code)


def classify(exc):
    """Best-effort mapping of a raw exception onto the taxonomy.

    The specific case this was written for: a part missing a pin in parts.json
    reached the operator as `int() argument must be a string ... not 'NoneType'`,
    which names neither the part nor the file to fix.
    """
    if isinstance(exc, WrapperError):
        return exc

    text = str(exc)

    if isinstance(exc, TypeError) and 'NoneType' in text:
        return WrapperError(
            E_CONFIG,
            f'A required pin/channel is not set for this part ({text})',
            hint='Open the part in /parts and fill in every pin the selected '
                 'control board needs, then retry.')
    if isinstance(exc, (FileNotFoundError,)):
        return WrapperError(E_CONFIG, text,
                            hint='A configuration or data file is missing.')
    if isinstance(exc, PermissionError):
        return WrapperError(E_BUSY, text,
                            hint='Check group membership for i2c/gpio, or whether '
                                 'another process holds the device.')
    if isinstance(exc, OSError):
        return WrapperError(E_BUS_IO, text,
                            hint='I2C/GPIO transport failure. Check wiring, the '
                                 'PCA9685 address, and `i2cdetect -y 1`.')
    if isinstance(exc, (ValueError, IndexError, KeyError)):
        return WrapperError(E_ARGS, text)
    if isinstance(exc, ImportError):
        return WrapperError(E_UNSUPPORTED, text,
                            hint='A GPIO/I2C python module is missing on this node.')
    return WrapperError(E_INTERNAL, text)
