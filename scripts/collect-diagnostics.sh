#!/usr/bin/env bash
set -euo pipefail

OUTDIR="/tmp/monsterbox-diagnostics-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUTDIR"

log() { echo "[collect] $*" | tee -a "$OUTDIR/summary.txt"; }
run() {
  local name="$1"; shift
  log "Running: $name: $*"
  if command -v sudo >/dev/null 2>&1; then sudo bash -lc "$*" >"$OUTDIR/${name}.log" 2>&1 || true; else bash -lc "$*" >"$OUTDIR/${name}.log" 2>&1 || true; fi
}

log "Collecting system diagnostics into $OUTDIR"

# Basic system info
run uname "uname -a"
run os-release "cat /etc/os-release"
run uptime "uptime"

# CPU/GPU/thermal
run cpuinfo "lscpu || cat /proc/cpuinfo"
run temp "vcgencmd measure_temp || true"
run throttled "vcgencmd get_throttled || true"

# Memory/disk/IO
run mem "free -h"
run disk "df -h"
run mounts "mount | sort"
run iostat "iostat -xz 1 3 || true"
run vmstat "vmstat 1 5 || true"

# Processes
run top "top -b -n 1 | head -n 60"
run ps "ps aux --sort=-%cpu | head -n 60"

# Services likely relevant
run systemd-failed "systemctl --failed || true"
run svc-monsterbox "systemctl status monsterbox --no-pager || true"
run svc-mjpg "systemctl status mjpg-streamer --no-pager || true"
run svc-pipewire "systemctl --user status pipewire --no-pager || true"

# Logs
run journal-prev "journalctl -b -1 -p 4 --no-pager || true"
run journal-cur "journalctl -b -p 4 --no-pager | tail -n 1000 || true"
run journal-monsterbox "journalctl -u monsterbox -n 500 --no-pager || true"
run journal-mjpg "journalctl -u mjpg-streamer -n 500 --no-pager || true"
run dmesg "dmesg -T | tail -n 500 || true"

# Network checks
run ss "ss -tpln || netstat -tpln || true"
run ip "ip -br addr || ifconfig || true"

# Video devices & V4L
run v4l "v4l2-ctl --list-devices || true"
run video-devs "ls -l /dev/video* || true"

# Audio devices
run aplay "aplay -l || true"
run arecord "arecord -l || true"

# Package and kernel info
run kernel-cmdline "cat /boot/cmdline.txt || true"
run gpu-mem "vcgencmd get_mem gpu || true"

TARBALL="$OUTDIR.tgz"
tar -czf "$TARBALL" -C "/tmp" "$(basename "$OUTDIR")"
log "Diagnostics archived: $TARBALL"

# Quick parse summary hints
{
  echo "--- Quick Summary Hints ---"
  temp_line=$(head -n1 "$OUTDIR/temp.log" 2>/dev/null || true)
  temp_num=$(echo "$temp_line" | grep -oE '[0-9]+\.[0-9]+' || true)
  echo "Temp: ${temp_num:-n/a} C"
  echo "Throttled: $(grep -oE '0x[0-9a-fA-F]+' "$OUTDIR/throttled.log" | head -n1 || echo 'n/a')"
  echo "Failed services:"
  grep -E '●|failed' -n "$OUTDIR/systemd-failed.log" || true
  echo "mjpg-streamer active:"
  grep -E 'Active: ' "$OUTDIR/svc-mjpg.log" | head -n1 || true
  echo "monsterbox active:"
  grep -E 'Active: ' "$OUTDIR/svc-monsterbox.log" | head -n1 || true
} | tee -a "$OUTDIR/summary.txt"

echo "DONE: Diagnostics at $OUTDIR (tar: $TARBALL)"
