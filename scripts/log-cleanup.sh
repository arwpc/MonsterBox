#!/bin/bash
# MonsterBox Log Cleanup Script
# Prevents logs from consuming more than 40% of disk space.
# Designed for RPi4B with SD card storage — minimizes writes.
#
# Usage: sudo bash scripts/log-cleanup.sh [--dry-run]
#
# Install as systemd timer: sudo bash scripts/log-cleanup.sh --install

set -euo pipefail

MAX_DISK_PERCENT=40
JOURNAL_TARGET_MB=500
LOG_DIR="/var/log"
DRY_RUN=false
INSTALL_MODE=false

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --install) INSTALL_MODE=true ;;
  esac
done

# Get disk usage percentage for root filesystem
get_disk_percent() {
  df / --output=pcent | tail -1 | tr -d ' %'
}

# Get disk used in MB
get_disk_used_mb() {
  df / --output=used --block-size=1M | tail -1 | tr -d ' '
}

# Get disk total in MB
get_disk_total_mb() {
  df / --output=size --block-size=1M | tail -1 | tr -d ' '
}

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Install systemd timer and exit
if [ "$INSTALL_MODE" = true ]; then
  log "Installing log-cleanup systemd timer..."

  cat > /etc/systemd/system/monsterbox-log-cleanup.service <<'SVCEOF'
[Unit]
Description=MonsterBox Log Cleanup
After=network.target

[Service]
Type=oneshot
ExecStart=/bin/bash /home/remote/MonsterBox/scripts/log-cleanup.sh
User=root
SVCEOF

  cat > /etc/systemd/system/monsterbox-log-cleanup.timer <<'TMREOF'
[Unit]
Description=Run MonsterBox log cleanup daily

[Timer]
OnCalendar=daily
RandomizedDelaySec=1h
Persistent=true

[Install]
WantedBy=timers.target
TMREOF

  # Also set journald SystemMaxUse to prevent unbounded growth
  mkdir -p /etc/systemd/journald.conf.d
  cat > /etc/systemd/journald.conf.d/monsterbox.conf <<'JEOF'
[Journal]
SystemMaxUse=2G
SystemMaxFileSize=100M
MaxRetentionSec=30day
JEOF

  systemctl daemon-reload
  systemctl enable monsterbox-log-cleanup.timer
  systemctl start monsterbox-log-cleanup.timer
  systemctl restart systemd-journald

  log "Installed and enabled monsterbox-log-cleanup.timer"
  log "Set journald max to 2G with 30-day retention"
  systemctl list-timers monsterbox-log-cleanup.timer
  exit 0
fi

# Main cleanup logic
DISK_PERCENT=$(get_disk_percent)
DISK_TOTAL_MB=$(get_disk_total_mb)
DISK_USED_MB=$(get_disk_used_mb)
MAX_LOG_MB=$(( DISK_TOTAL_MB * MAX_DISK_PERCENT / 100 ))

log "Disk: ${DISK_USED_MB}MB used of ${DISK_TOTAL_MB}MB (${DISK_PERCENT}%)"
log "Max allowed for logs: ${MAX_LOG_MB}MB (${MAX_DISK_PERCENT}%)"

FREED_MB=0

# 1. Vacuum journald logs (usually the biggest consumer)
JOURNAL_SIZE_MB=$(journalctl --disk-usage 2>&1 | grep -oP '\d+\.\d+G' | head -1 | awk '{printf "%d", $1 * 1024}' || echo "0")
if [ -z "$JOURNAL_SIZE_MB" ] || [ "$JOURNAL_SIZE_MB" = "0" ]; then
  # Try MB format
  JOURNAL_SIZE_MB=$(journalctl --disk-usage 2>&1 | grep -oP '\d+\.\d+M' | head -1 | awk '{printf "%d", $1}' || echo "0")
fi

log "Journal size: ~${JOURNAL_SIZE_MB}MB (target: ${JOURNAL_TARGET_MB}MB)"

if [ "$JOURNAL_SIZE_MB" -gt "$JOURNAL_TARGET_MB" ]; then
  if [ "$DRY_RUN" = true ]; then
    log "[DRY-RUN] Would vacuum journald to ${JOURNAL_TARGET_MB}M"
  else
    log "Vacuuming journald to ${JOURNAL_TARGET_MB}M..."
    journalctl --vacuum-size=${JOURNAL_TARGET_MB}M 2>&1 | tail -3
    NEW_SIZE=$(journalctl --disk-usage 2>&1 | grep -oP '\d+\.\d+[GM]' | head -1 || echo "unknown")
    log "Journal now: ${NEW_SIZE}"
    FREED_MB=$(( JOURNAL_SIZE_MB - JOURNAL_TARGET_MB ))
  fi
fi

# 2. Clean rotated/compressed log files older than 7 days
OLD_LOGS=$(find "$LOG_DIR" -name '*.gz' -o -name '*.old' -o -name '*.1' | head -50)
if [ -n "$OLD_LOGS" ]; then
  OLD_SIZE=$(du -scm $OLD_LOGS 2>/dev/null | tail -1 | cut -f1 || echo "0")
  log "Rotated log files: ~${OLD_SIZE}MB"
  if [ "$OLD_SIZE" -gt 10 ]; then
    if [ "$DRY_RUN" = true ]; then
      log "[DRY-RUN] Would remove ${OLD_SIZE}MB of rotated logs"
    else
      log "Removing old rotated logs..."
      find "$LOG_DIR" -name '*.gz' -mtime +7 -delete 2>/dev/null || true
      find "$LOG_DIR" -name '*.old' -mtime +7 -delete 2>/dev/null || true
      FREED_MB=$(( FREED_MB + OLD_SIZE ))
    fi
  fi
fi

# 3. Clean MonsterBox test artifacts
MB_DIR="/home/remote/MonsterBox"
if [ -d "$MB_DIR" ]; then
  # Clean test result files
  TEST_ARTIFACTS=$(find "$MB_DIR/tests" -name '*.output' -o -name '*.log' -mtime +3 2>/dev/null | head -50)
  if [ -n "$TEST_ARTIFACTS" ]; then
    TA_SIZE=$(du -scm $TEST_ARTIFACTS 2>/dev/null | tail -1 | cut -f1 || echo "0")
    if [ "$TA_SIZE" -gt 1 ]; then
      if [ "$DRY_RUN" = true ]; then
        log "[DRY-RUN] Would remove ${TA_SIZE}MB of test artifacts"
      else
        log "Removing old test artifacts..."
        echo "$TEST_ARTIFACTS" | xargs rm -f 2>/dev/null || true
        FREED_MB=$(( FREED_MB + TA_SIZE ))
      fi
    fi
  fi

  # Clean tmp files from claude agent tasks
  CLAUDE_TASKS="/tmp/claude-1000"
  if [ -d "$CLAUDE_TASKS" ]; then
    CT_SIZE=$(du -sm "$CLAUDE_TASKS" 2>/dev/null | cut -f1 || echo "0")
    if [ "$CT_SIZE" -gt 100 ]; then
      if [ "$DRY_RUN" = true ]; then
        log "[DRY-RUN] Would clean ${CT_SIZE}MB of claude task outputs"
      else
        log "Cleaning old claude task outputs..."
        find "$CLAUDE_TASKS" -type f -mtime +3 -delete 2>/dev/null || true
        FREED_MB=$(( FREED_MB + CT_SIZE / 2 ))
      fi
    fi
  fi
fi

# 4. Clean apt cache
APT_SIZE=$(du -sm /var/cache/apt/archives/ 2>/dev/null | cut -f1 || echo "0")
if [ "$APT_SIZE" -gt 100 ]; then
  if [ "$DRY_RUN" = true ]; then
    log "[DRY-RUN] Would clean ${APT_SIZE}MB of apt cache"
  else
    log "Cleaning apt cache..."
    apt-get clean -y 2>/dev/null || true
    FREED_MB=$(( FREED_MB + APT_SIZE ))
  fi
fi

# 5. Clean tmp files older than 7 days
TMP_OLD=$(find /tmp -maxdepth 2 -type f -mtime +7 -not -path '/tmp/claude-*' 2>/dev/null | head -100)
if [ -n "$TMP_OLD" ]; then
  TMP_SIZE=$(du -scm $TMP_OLD 2>/dev/null | tail -1 | cut -f1 || echo "0")
  if [ "$TMP_SIZE" -gt 50 ]; then
    if [ "$DRY_RUN" = true ]; then
      log "[DRY-RUN] Would clean ${TMP_SIZE}MB of old /tmp files"
    else
      log "Cleaning old /tmp files..."
      echo "$TMP_OLD" | xargs rm -f 2>/dev/null || true
      FREED_MB=$(( FREED_MB + TMP_SIZE ))
    fi
  fi
fi

# Final status
NEW_DISK_PERCENT=$(get_disk_percent)
log "Cleanup complete. Freed ~${FREED_MB}MB. Disk now at ${NEW_DISK_PERCENT}%"

if [ "$NEW_DISK_PERCENT" -gt "$MAX_DISK_PERCENT" ]; then
  log "WARNING: Disk still above ${MAX_DISK_PERCENT}% after cleanup. Manual intervention may be needed."
  exit 1
fi

exit 0
