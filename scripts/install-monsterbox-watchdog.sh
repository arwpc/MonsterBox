#!/bin/bash
#
# Install (or update) the MonsterBox liveness watchdog timer on this node.
# Idempotent; safe to re-run after every deploy. Run as root:
#
#   sudo bash /home/remote/MonsterBox/scripts/install-monsterbox-watchdog.sh
#
# What it does: templates scripts/monsterbox-watchdog.{service,timer} into
# /etc/systemd/system with this repo's real path, then enables and starts the
# timer. The timer curls /health once a minute and restarts monsterbox.service
# after 3 consecutive failures — see scripts/monsterbox-liveness-watchdog.sh
# for the full rationale (UP-5).

set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
    echo "Must run as root (it installs systemd units)." >&2
    exit 1
fi

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

sed "s|/home/remote/MonsterBox|$REPO_DIR|g" \
    "$REPO_DIR/scripts/monsterbox-watchdog.service" \
    > /etc/systemd/system/monsterbox-watchdog.service

cp "$REPO_DIR/scripts/monsterbox-watchdog.timer" \
    /etc/systemd/system/monsterbox-watchdog.timer

systemctl daemon-reload
systemctl enable --now monsterbox-watchdog.timer

echo "monsterbox-watchdog.timer installed and started."
systemctl list-timers monsterbox-watchdog.timer --no-pager | head -3 || true
