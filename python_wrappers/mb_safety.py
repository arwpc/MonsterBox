#!/usr/bin/env python3

"""
Wrapper-side hardware safety backstop.

Why this exists
---------------
config/hardware-safety.json was enforced only in services/hardwareService.
That made it a convention, not a limit: `python3 servo_cli.py move_to_pca 4 170`
or `python3 linear_actuator_control_v2.py '{...}'` skipped every clamp, every
block, and the fused-rail serialization — including the blockAllMotion
quarantines on the parts that most needed them. The calibration adapters in
server/calibration/adapters/ call runWrapper() directly and skipped it too.

This module reads the SAME committed config and re-applies it at the wrapper
boundary. It is a second, independent backstop:

  * it can only ever NARROW what Node already decided, never widen it;
  * it never consults calibration profiles (those are Node's job) — only the
    committed config/hardware-safety.json, so the two layers cannot disagree
    about a value that was measured on one node and not another;
  * if the config cannot be read it degrades to "no extra limits" with a loud
    stderr warning. Bricking every part because a JSON file is unreadable is a
    worse failure than falling back to the Node-side enforcement that already
    ran. It does NOT degrade for a part it did resolve — a resolved blocked
    part is always refused.

Part resolution
---------------
Wrappers are told a channel or a set of pins, not a part id. The part is looked
up in data/character-<id>/parts.json for the character resolved the same way
Node resolves it (config/app-config.json `selectedCharacter`), overridable with
MB_CHARACTER_ID for callers that know better. An unresolvable part is allowed
through with a warning unless MB_SAFETY_STRICT=1.
"""

import errno
import json
import os
import re
import sys
import time
from contextlib import contextmanager

from mb_response import (
    E_BUSY,
    E_CONFIG,
    E_SAFETY,
    WrapperError,
    clamp_record,
    warn,
)

APP_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAFETY_CONFIG_PATH = os.path.join(APP_ROOT, 'config', 'hardware-safety.json')
APP_CONFIG_PATH = os.path.join(APP_ROOT, 'config', 'app-config.json')
PHYSICAL_FAULTS_PATH = os.path.join(APP_ROOT, 'config', 'physical-faults.json')
DATA_ROOT = os.path.join(APP_ROOT, 'data')

# Mirrors RETRACT_DIRECTIONS in services/hardwareService/safetyLimits.js.
RETRACT_DIRECTIONS = frozenset({'retract', 'reverse', 'backward', 'back', 'down', 'in', 'ccw'})

# Only these part types get an angle window applied, matching the `isAngular`
# test in safetyLimits.js. A PCA9685-driven light is commanded with angle 0/180
# as a duty cycle and must not be clamped into a servo's travel window.
ANGULAR_TYPES = frozenset({'servo', 'continuous_servo'})

_json_cache = {}


def _strict():
    return os.environ.get('MB_SAFETY_STRICT', '') == '1'


def _load_json(path, default=None):
    """Read and cache a JSON file. Never raises; returns `default` on failure."""
    if path in _json_cache:
        return _json_cache[path]
    value = default
    try:
        with open(path, 'r', encoding='utf-8') as handle:
            value = json.loads(handle.read() or 'null')
        if value is None:
            value = default
    except FileNotFoundError:
        pass
    except (OSError, ValueError) as exc:
        warn(f'safety: {os.path.basename(path)} unreadable ({exc}) — '
             f'continuing without the limits it holds')
    _json_cache[path] = value
    return value


def resolve_character_id(explicit=None):
    """Same precedence Node uses, plus an env override for direct CLI callers."""
    if explicit not in (None, ''):
        return str(explicit)
    env = os.environ.get('MB_CHARACTER_ID', '').strip()
    if env:
        return env
    cfg = _load_json(APP_CONFIG_PATH, {}) or {}
    selected = cfg.get('selectedCharacter')
    return None if selected in (None, '') else str(selected)


def load_parts(character_id):
    if character_id is None:
        return []
    path = os.path.join(DATA_ROOT, f'character-{character_id}', 'parts.json')
    parts = _load_json(path, [])
    return parts if isinstance(parts, list) else []


def _part_channel(part):
    cfg = part.get('config') or {}
    for source in (cfg, part):
        if source.get('channel') is not None:
            try:
                return int(source['channel'])
            except (TypeError, ValueError):
                return None
    return None


def _part_controller(part):
    cfg = part.get('config') or {}
    return str(cfg.get('controllerType') or part.get('controllerType') or '').lower()


def broken_part_ids(character_id):
    """Part ids the operator has declared PHYSICALLY BROKEN for this character.

    Mirrors getPhysicalFault() in services/hardwareService/safetyLimits.js. This is
    NOT the retired per-part safety-limit system (config/hardware-safety.json, empty
    by permanent operator ruling) — it is an inventory of damaged hardware.
    """
    cfg = _load_json(PHYSICAL_FAULTS_PATH, {}) or {}
    chars = cfg.get('characters') or {}
    entry = chars.get(str(character_id)) or {}
    parts = entry.get('parts') or {}
    return {str(pid) for pid, meta in parts.items()
            if isinstance(meta, dict) and meta.get('status') == 'broken'}


def broken_channels(character_id, address=None):
    """PCA9685 channels owned by a physically broken part.

    Returned as {channel: reason} so a refusal can say WHY. Used by the servo
    daemon as a last line of defence: it is the single transport every caller
    passes through, so a channel denied here cannot be energized by any code path,
    including ones that bypass the Node-side guards entirely.
    """
    broken = broken_part_ids(character_id)
    if not broken:
        return {}
    out = {}
    for part in load_parts(character_id):
        if str(part.get('id')) not in broken:
            continue
        if _part_controller(part) not in ('pca9685', ''):
            continue
        channel = _part_channel(part)
        if channel is None:
            continue
        out[channel] = f"part {part.get('id')} ({part.get('name')}) is declared physically broken"
    return out


def find_part_by_channel(character_id, channel, address=None):
    """Resolve a PCA9685 channel to its part. Any part type, not just servos."""
    try:
        channel = int(channel)
    except (TypeError, ValueError):
        return None
    for part in load_parts(character_id):
        if not isinstance(part, dict):
            continue
        if _part_controller(part) != 'pca9685':
            continue
        if _part_channel(part) != channel:
            continue
        if address is not None:
            cfg = part.get('config') or {}
            part_addr = cfg.get('address', part.get('address'))
            if part_addr is not None:
                try:
                    if int(part_addr) != int(address):
                        continue
                except (TypeError, ValueError):
                    pass
        return part
    return None


def find_part_by_pins(character_id, pins):
    """Resolve a GPIO part from the pins a wrapper was handed.

    `pins` is a dict like {'rpwmPin': 19, 'lpwmPin': 21}. A part matches when
    every pin named in `pins` that the part also declares agrees, and at least
    one pin matched — so a BTS7960 config identifies its actuator even if the
    enable pins were omitted by the caller.
    """
    wanted = {}
    for key, value in (pins or {}).items():
        if value is None:
            continue
        try:
            wanted[key] = int(value)
        except (TypeError, ValueError):
            continue
    if not wanted:
        return None

    for part in load_parts(character_id):
        if not isinstance(part, dict):
            continue
        matched = 0
        conflict = False
        for key, value in wanted.items():
            declared = part.get(key, (part.get('config') or {}).get(key))
            if declared is None:
                continue
            try:
                declared = int(declared)
            except (TypeError, ValueError):
                continue
            if declared == value:
                matched += 1
            else:
                conflict = True
        if matched and not conflict:
            return part
    return None


def _min_defined(a, b):
    if a is None:
        return b
    if b is None:
        return a
    return min(a, b)


def _max_defined(a, b):
    if a is None:
        return b
    if b is None:
        return a
    return max(a, b)


def _character_config(character_id):
    cfg = _load_json(SAFETY_CONFIG_PATH, {}) or {}
    characters = cfg.get('characters') or {}
    return characters.get(str(character_id)) or {}


def get_part_safety(character_id, part_id):
    """Committed limits for one part. Empty dict means no configured limits."""
    char_cfg = _character_config(character_id)
    entry = (char_cfg.get('parts') or {}).get(str(part_id)) or {}
    safety = dict(entry)
    group = entry.get('powerGroup')
    if group:
        groups = char_cfg.get('powerGroups') or {}
        safety['powerGroupConfig'] = groups.get(group) or {'serialize': True, 'cooldownMs': 0}
    return safety


def _normalized_type(part):
    return str((part or {}).get('type') or '').replace('-', '_').lower()


def guard(character_id, part, op, angle=None, speed=None, duration_ms=None,
          direction=None):
    """Apply the committed limits to one outgoing command.

    Returns (values, clamps, safety) where `values` holds the possibly-narrowed
    angle/duration_ms; `speed` is passed through unchanged. Raises
    WrapperError(E_SAFETY) for a refusal.
    """
    clamps = []
    values = {'angle': angle, 'speed': speed, 'duration_ms': duration_ms}

    if part is None:
        if _strict():
            raise WrapperError(
                E_CONFIG,
                'No part in parts.json matches this command and MB_SAFETY_STRICT=1',
                hint='Pass --character <id>, or set MB_CHARACTER_ID, so the '
                     'wrapper can find the part and apply its safety limits.')
        warn(f'safety: {op} does not map to any part of character '
             f'{character_id} — configured limits cannot be applied')
        return values, clamps, {}

    part_id = part.get('id')
    safety = get_part_safety(character_id, part_id)
    if not safety:
        return values, clamps, safety

    # --- Refusals ----------------------------------------------------------
    if safety.get('blockAllMotion'):
        reason = safety.get('blockReason') or 'no reason recorded'
        raise WrapperError(
            E_SAFETY,
            f"Part {part_id} ({part.get('name')}) is quarantined by "
            f"config/hardware-safety.json",
            hint=reason,
            part=part_id)

    if safety.get('noRetractBelowMin') and direction is not None:
        if str(direction).lower() in RETRACT_DIRECTIONS:
            raise WrapperError(
                E_SAFETY,
                f"Part {part_id} ({part.get('name')}) is at its mechanical "
                f"minimum; retraction ('{direction}') is disabled",
                hint='Clear noRetractBelowMin in config/hardware-safety.json '
                     'only after confirming the linkage has travel left.',
                part=part_id)

    # --- Clamps ------------------------------------------------------------
    if angle is not None and _normalized_type(part) in ANGULAR_TYPES:
        lo = safety.get('minAngle')
        hi = safety.get('maxAngle')
        applied = float(angle)
        if lo is not None:
            applied = max(float(lo), applied)
        if hi is not None:
            applied = min(float(hi), applied)
        if applied != float(angle):
            clamps.append(clamp_record(
                'angleDeg', angle, applied,
                f"hardware-safety angle window {lo if lo is not None else '-'}"
                f"..{hi if hi is not None else '-'}"))
            values['angle'] = applied

    max_duration = safety.get('maxDurationMs')
    if duration_ms is not None and max_duration is not None and \
            float(duration_ms) > float(max_duration):
        clamps.append(clamp_record('duration', duration_ms, max_duration,
                                   'hardware-safety duration cap'))
        values['duration_ms'] = max_duration

    return values, clamps, safety


# ---------------------------------------------------------------------------
# Power-group serialization (cross-process)
# ---------------------------------------------------------------------------
# Node serializes a fused rail with an in-process promise chain, which does
# nothing about a second process. A file lock is the only thing that covers
# both, and fcntl is stdlib so it costs no dependency.

def _lock_path(character_id, group):
    safe = re.sub(r'[^A-Za-z0-9_.-]', '_', f'{character_id}-{group}')
    return os.path.join('/tmp', f'monsterbox-powergroup-{safe}.lock')


@contextmanager
def power_group(character_id, safety, timeout_s=15.0):
    """Hold the part's fused rail for the duration of the block.

    Degrades to a no-op (with a warning) if the lock file cannot be used, so a
    permissions problem on /tmp cannot stop a show.
    """
    group = (safety or {}).get('powerGroup')
    group_cfg = (safety or {}).get('powerGroupConfig') or {}
    if not group or group_cfg.get('serialize') is False:
        yield
        return

    try:
        import fcntl
    except ImportError:
        warn('safety: fcntl unavailable — power group not serialized')
        yield
        return

    path = _lock_path(character_id, group)
    handle = None
    try:
        handle = open(path, 'a+')
    except OSError as exc:
        warn(f'safety: cannot open power-group lock {path} ({exc}) — '
             f'proceeding unserialized')
        yield
        return

    acquired = False
    deadline = time.monotonic() + max(0.0, float(timeout_s))
    try:
        while True:
            try:
                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                acquired = True
                break
            except OSError as exc:
                if exc.errno not in (errno.EACCES, errno.EAGAIN):
                    raise
                if time.monotonic() >= deadline:
                    raise WrapperError(
                        E_BUSY,
                        f"Power group '{group}' is busy — another process is "
                        f"driving a part on this fused rail",
                        hint='Parts on a shared fuse are never energized '
                             'together. Retry once the other move finishes.')
                time.sleep(0.02)

        # Inrush currents must not stack: keep a gap since the last release.
        cooldown_ms = float(group_cfg.get('cooldownMs') or 0)
        if cooldown_ms > 0:
            try:
                last_end = os.fstat(handle.fileno()).st_mtime
            except OSError:
                last_end = 0
            wait_s = (cooldown_ms / 1000.0) - (time.time() - last_end)
            if wait_s > 0:
                time.sleep(min(wait_s, cooldown_ms / 1000.0))
        yield
    finally:
        if acquired:
            try:
                os.utime(path, None)   # stamps "last release" for the cooldown
            except OSError:
                pass
            try:
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
            except OSError:
                pass
        try:
            handle.close()
        except OSError:
            pass


# ---------------------------------------------------------------------------
# Power-group voltage validation
# ---------------------------------------------------------------------------

# "9-12.6V", "6.0-7.4 V", "4.8~7.4V" — the way the operating range is actually
# written in part descriptions and safety notes today.
_VOLTAGE_RE = re.compile(r'(\d+(?:\.\d+)?)\s*[-–~to]{1,2}\s*(\d+(?:\.\d+)?)\s*V\b',
                         re.IGNORECASE)


def _voltage_range(part, safety):
    explicit = (safety or {}).get('voltageRange')
    if isinstance(explicit, (list, tuple)) and len(explicit) == 2:
        try:
            return float(explicit[0]), float(explicit[1])
        except (TypeError, ValueError):
            pass
    for text in ((safety or {}).get('notes'), (part or {}).get('description')):
        if not text:
            continue
        match = _VOLTAGE_RE.search(str(text))
        if match:
            lo, hi = float(match.group(1)), float(match.group(2))
            if lo <= hi:
                return lo, hi
    return None


def validate_power_groups(character_id):
    """Warn when one fused rail carries parts with incompatible voltage ranges.

    This is the latent hazard the v9.0 retrospective called out: a 9-12.6V servo
    and a 4.8-7.4V servo on the same rail. Whatever the rail is set to, one of
    them is out of spec, and that rail's fuse has blown before.

    Returns a list of warning strings (empty when everything overlaps).
    """
    char_cfg = _character_config(character_id)
    parts_cfg = char_cfg.get('parts') or {}
    parts_by_id = {}
    for part in load_parts(character_id):
        if isinstance(part, dict) and part.get('id') is not None:
            parts_by_id[str(part['id'])] = part

    groups = {}
    for part_id, entry in parts_cfg.items():
        group = (entry or {}).get('powerGroup')
        if not group:
            continue
        groups.setdefault(group, []).append((part_id, entry))

    warnings = []
    for group, members in sorted(groups.items()):
        ranges = []
        for part_id, entry in members:
            rng = _voltage_range(parts_by_id.get(str(part_id)), entry)
            if rng:
                ranges.append((part_id, rng))
        if len(ranges) < 2:
            continue
        overlap_lo = max(r[1][0] for r in ranges)
        overlap_hi = min(r[1][1] for r in ranges)
        if overlap_lo > overlap_hi:
            detail = ', '.join(f"part {pid} {lo}-{hi}V" for pid, (lo, hi) in ranges)
            warnings.append(
                f"power group '{group}' mixes incompatible voltage classes "
                f"({detail}) — no single rail voltage is in spec for all of them")
    return warnings


def reset_cache():
    """Test hook: forget cached JSON reads."""
    _json_cache.clear()


if __name__ == '__main__':
    # Small self-check so the module can be exercised without hardware:
    #   python3 mb_safety.py [characterId]
    char = resolve_character_id(sys.argv[1] if len(sys.argv) > 1 else None)
    report = {
        'characterId': char,
        'parts': len(load_parts(char)),
        'powerGroupWarnings': validate_power_groups(char),
    }
    sys.stdout.write(json.dumps(report, indent=2) + '\n')
