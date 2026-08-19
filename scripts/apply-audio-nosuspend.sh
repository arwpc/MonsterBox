#!/usr/bin/env bash
# apply-audio-nosuspend.sh — keep this node's character speaker sink awake.
#
# WHY: playback uses a one-shot mpg123 per utterance. When WirePlumber has
# suspended the USB sink, the first sound of an utterance waits for the ALSA
# device to resume, which lands the audio behind the jaw timeline (the jaw
# starts at t+0). Disabling suspend for the character speaker removes that
# variable delay so the measured audioLeadTimeMs stays valid.
#
# Scoped on purpose: the rule matches ONLY the character speaker sink by
# node.name, never a blanket "all alsa nodes" rule.
#
# Usage:
#   scripts/apply-audio-nosuspend.sh [sink-node-name]
# With no argument the sink is resolved the way the app resolves it:
#   config/app-config.json -> selectedCharacter
#   data/character-<id>/parts.json -> speaker part -> config.audioDeviceId
#   ("default" or unset -> the current PipeWire default sink)
#
# Idempotent: re-running with the same sink is a no-op (and does not restart
# WirePlumber). Safe to call from install.sh on every provision.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u "${SUDO_USER:-$USER}")}"

log() { echo "[audio-nosuspend] $*"; }

# --- resolve the sink -------------------------------------------------------
SINK_NAME="${1:-}"

pw_default_sink() {
  XDG_RUNTIME_DIR="$RUNTIME_DIR" pw-dump 2>/dev/null | python3 -c '
import json, sys
try:
    objs = json.load(sys.stdin)
except Exception:
    sys.exit(0)
meta = {}
for o in objs:
    if o.get("type") == "PipeWire:Interface:Metadata" and o.get("props", {}).get("metadata.name") == "default":
        for m in o.get("metadata", []):
            if m.get("key") == "default.audio.sink":
                v = m.get("value")
                meta = v if isinstance(v, dict) else {}
name = meta.get("name")
if name:
    print(name)
    sys.exit(0)
# fall back to the first non-HDMI/headphone USB sink
for o in objs:
    if o.get("type") == "PipeWire:Interface:Node":
        p = (o.get("info") or {}).get("props") or {}
        if p.get("media.class") == "Audio/Sink" and "usb" in str(p.get("node.name", "")):
            print(p["node.name"]); sys.exit(0)
'
}

if [ -z "$SINK_NAME" ]; then
  SINK_NAME="$(python3 - "$REPO_ROOT" <<'PY'
import json, os, sys
root = sys.argv[1]
try:
    cfg = json.load(open(os.path.join(root, 'config', 'app-config.json')))
    cid = cfg.get('selectedCharacter')
    parts = json.load(open(os.path.join(root, 'data', 'character-%s' % cid, 'parts.json')))
    spk = next((p for p in parts if str(p.get('type', '')).lower() == 'speaker'), None)
    dev = ((spk or {}).get('config') or {}).get('audioDeviceId') or 'default'
    print('' if dev == 'default' else dev)
except Exception:
    print('')
PY
)"
fi

if [ -z "$SINK_NAME" ]; then
  SINK_NAME="$(pw_default_sink || true)"
fi

if [ -z "$SINK_NAME" ]; then
  log "could not resolve a speaker sink (PipeWire not running?) — nothing to do"
  exit 0
fi
log "target sink: $SINK_NAME"

# --- build the rule for the installed WirePlumber generation -----------------
WP_VER="$(wireplumber --version 2>/dev/null | sed -n 's/.*libwireplumber \([0-9]*\.[0-9]*\).*/\1/p' | head -1)"
WP_VER="${WP_VER:-0.4}"

if [ "${WP_VER%%.*}" = "0" ] && [ "${WP_VER#*.}" -lt 5 ] 2>/dev/null; then
  # WirePlumber 0.4 — Lua fragment appended to the alsa monitor rules
  TARGET_DIR="/etc/wireplumber/main.lua.d"
  TARGET="$TARGET_DIR/51-monsterbox-nosuspend.lua"
  NEW_CONTENT="$(cat <<EOF
-- MonsterBox: never suspend the character speaker sink.
-- Playback is a one-shot mpg123 per utterance; a suspended USB sink adds a
-- variable resume delay to the first sound and desyncs the jaw timeline.
-- Scoped to this node's speaker only. Managed by scripts/apply-audio-nosuspend.sh
table.insert(alsa_monitor.rules, {
  matches = {
    {
      { "node.name", "equals", "$SINK_NAME" },
    },
  },
  apply_properties = {
    ["session.suspend-timeout-seconds"] = 0,
  },
})
EOF
)"
else
  # WirePlumber 0.5+ — SPA-JSON fragment
  TARGET_DIR="/etc/wireplumber/wireplumber.conf.d"
  TARGET="$TARGET_DIR/51-monsterbox-nosuspend.conf"
  NEW_CONTENT="$(cat <<EOF
# MonsterBox: never suspend the character speaker sink (see apply-audio-nosuspend.sh)
monitor.alsa.rules = [
  {
    matches = [ { node.name = "$SINK_NAME" } ]
    actions = {
      update-props = {
        session.suspend-timeout-seconds = 0
      }
    }
  }
]
EOF
)"
fi

# --- install (idempotent) ---------------------------------------------------
SUDO=""
[ "$(id -u)" -ne 0 ] && SUDO="sudo"

if [ -f "$TARGET" ] && [ "$(cat "$TARGET")" = "$NEW_CONTENT" ]; then
  log "rule already present and current at $TARGET — no change"
else
  $SUDO mkdir -p "$TARGET_DIR"
  printf '%s\n' "$NEW_CONTENT" | $SUDO tee "$TARGET" >/dev/null
  log "wrote $TARGET"
  # WirePlumber runs as the desktop/session user, not root.
  WP_USER="${SUDO_USER:-$USER}"
  if [ "$(id -u)" -eq 0 ] && [ -n "${SUDO_USER:-}" ]; then
    sudo -u "$WP_USER" env XDG_RUNTIME_DIR="$RUNTIME_DIR" systemctl --user restart wireplumber || \
      log "WARNING: could not restart wireplumber for $WP_USER — restart it manually"
  else
    XDG_RUNTIME_DIR="$RUNTIME_DIR" systemctl --user restart wireplumber || \
      log "WARNING: could not restart wireplumber — restart it manually"
  fi
  sleep 3
fi

# --- verify -----------------------------------------------------------------
XDG_RUNTIME_DIR="$RUNTIME_DIR" pw-dump 2>/dev/null | python3 -c '
import json, sys
name = sys.argv[1]
objs = json.load(sys.stdin)
for o in objs:
    if o.get("type") == "PipeWire:Interface:Node":
        info = o.get("info") or {}
        p = info.get("props") or {}
        if p.get("node.name") == name:
            t = p.get("session.suspend-timeout-seconds")
            print("[audio-nosuspend] %s state=%s session.suspend-timeout-seconds=%s" % (name, info.get("state"), t))
            sys.exit(0 if str(t) == "0" else 1)
print("[audio-nosuspend] sink %s not found in the graph" % name)
sys.exit(1)
' "$SINK_NAME"
