#!/bin/bash
# Prove a deploy actually landed, by grepping each node for the code itself.
#
# Why this exists: a node's /health version, its package.json AND its git HEAD are
# all worthless as deploy evidence. deploy-all.sh rsyncs files without moving git,
# so on 2026-08-19 Orlok and Dragomir both served version 10.1.0 from a checkout
# whose HEAD read v9.3.0 with 32 dirty files. Only the presence of the actual new
# symbol proves the code arrived.
#
# Usage: sudo bash scripts/verify-deploy.sh
# Add a "file:symbol" pair here for every release whose landing you need to prove.

set -u
REPO=/home/remote/MonsterBox
NODES="192.168.8.120 192.168.8.130 192.168.8.140"

# One representative symbol per fix that shipped. Each must be absent before the
# deploy and present after; a symbol that already existed proves nothing.
# NOTE: this list once carried restoreArmedSuperpowers / restoreArmed /
# restoreHeadTrackingArmedState. That feature was reverted before release, and the
# script correctly reported them MISSING on every node — including the one that
# built them. A verifier that only ever agrees with you is not a verifier; leaving
# this note so the next person reads a MISS as "check which is stale, the code or
# the list" rather than assuming a bad deploy.
CHECKS="
python_wrappers/webcam_cli.py:device_index
server/calibration/router.js:describeServoMove
server/calibration/adapters/OpenLoopLinearAdapter.js:MAX_DRIVE_MS
server/calibration/adapters/AbsoluteServoAdapter.js:positionUnknown
routes/api/partsApi.js:drivenAngle
routes/api/systemRoutes.js:usb-devices
data/models/webcam_models.json:usbId
tests/browser/scene-concurrency.spec.js:dryRun
"

. /etc/monsterbox/env 2>/dev/null || true
export SSHPASS="${MONSTERBOX_SSH_PASSWORD:-}"

fail=0
for ip in $NODES; do
  echo "=== $ip ==="
  for pair in $CHECKS; do
    file="${pair%%:*}"; sym="${pair##*:}"
    # SSH lands in /home/remote, NOT the repo — absolute paths always.
    n=$(sshpass -e ssh -o StrictHostKeyChecking=no -o ConnectTimeout=8 \
          "remote@$ip" "grep -ac -- '$sym' $REPO/$file 2>/dev/null || echo 0" 2>/dev/null | tr -d '\r')
    n="${n:-0}"
    if [ "$n" -gt 0 ] 2>/dev/null; then
      printf "  ok   %-52s %s hit(s)\n" "$file:$sym" "$n"
    else
      printf "  MISS %-52s NOT DEPLOYED\n" "$file:$sym"
      fail=1
    fi
  done
  printf "  health: %s\n" "$(curl -sk --max-time 6 "https://$ip:3000/health" 2>/dev/null | head -c 60)"
  printf "  mute:   %s\n" "$(curl -sk --max-time 6 "https://$ip:3000/conversation/api/speaker-mute" 2>/dev/null | head -c 40)"
done

if [ "$fail" -eq 0 ]; then
  echo "ALL NODES VERIFIED — every symbol present on every node."
else
  echo "DEPLOY INCOMPLETE — at least one node is missing shipped code. Do not tag."
  exit 1
fi
