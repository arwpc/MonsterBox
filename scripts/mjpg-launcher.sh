#!/usr/bin/env bash
# MJPG-Streamer launcher — portable across ANY MonsterBox node and any camera.
#
# Why this exists: the old unit hardcoded `-d /dev/video0`. When a USB
# over-current burst re-enumerated Orlok's camera to /dev/video1 (2026-08-17),
# mjpg-streamer crash-looped 42+ times against a device that no longer existed
# and the operator lost the webcam mid-day. /dev/v4l/by-id/ paths are stable
# across re-enumeration, so resolving the camera HERE, at every start, means a
# USB blip heals itself on the next service restart.
#
# Defaults are the operator's spec (2026-08-17): remote monitoring happens on a
# phone and motion matters more than detail — 640x480 @ 15fps q60 keeps USB
# bandwidth and CPU down. Override per-node via /etc/default/monsterbox-cam
# (MB_CAM_RES / MB_CAM_FPS / MB_CAM_Q / MB_CAM_PORT / MB_CAM_DEV).

[ -f /etc/default/monsterbox-cam ] && . /etc/default/monsterbox-cam

DEV="${MB_CAM_DEV:-}"
if [ -z "$DEV" ]; then
    # First stable by-id capture device; index0 is the video stream (index1 is metadata).
    DEV=$(ls /dev/v4l/by-id/*video-index0 2>/dev/null | head -1)
fi
# Last resort: the bare device node (a camera with no by-id entry).
[ -z "$DEV" ] && DEV=/dev/video0

echo "mjpg-launcher: using camera $DEV ($(readlink -f "$DEV" 2>/dev/null || echo unresolved))"
exec /usr/local/bin/mjpg_streamer \
    -i "input_uvc.so -d $DEV -r ${MB_CAM_RES:-640x480} -f ${MB_CAM_FPS:-15} -q ${MB_CAM_Q:-60}" \
    -o "output_http.so -p ${MB_CAM_PORT:-8090} -w /usr/local/share/mjpg-streamer/www"
