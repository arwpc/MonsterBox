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
# Why the retry loop exists (2026-08-23): Orlok's Arducam fails VIDIOC_STREAMON
# with -EPROTO on roughly five of every six opens. mjpg_streamer does NOT exit
# when that happens — it keeps its HTTP server up and holds /dev/video0 open
# while serving zero frames, so `Restart=on-failure` never fires and the page
# shows "webcam stream unavailable" forever. Once a start DOES succeed the
# stream is completely stable (300 frames / 13.7 MB / 20 s, no drops), so the
# only thing needed is to notice a dead start and try again. We prove the start
# by fetching a real JPEG from the snapshot endpoint, not by "the process is up".
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

PORT="${MB_CAM_PORT:-8090}"
SNAP_URL="http://127.0.0.1:${PORT}/?action=snapshot"
# A camera that needs more than this many tries is a hardware fault, not a flaky
# start; exit non-zero and let systemd back off rather than spin forever.
MAX_TRIES="${MB_CAM_START_ATTEMPTS:-40}"
# Seconds to wait for the first real frame before declaring the start dead.
# A start that is going to work delivers its first frame in about 1-2 s (Dragomir
# 1 s, Orlok 2 s), so 4 s is a generous margin. Keeping it tight matters: every
# second here is a second the page shows "stream unavailable" while we retry.
HEALTH_WAIT="${MB_CAM_HEALTH_WAIT:-4}"

echo "mjpg-launcher: using camera $DEV ($(readlink -f "$DEV" 2>/dev/null || echo unresolved))"

CHILD=""

stop_child() {
    [ -z "$CHILD" ] && return 0
    kill "$CHILD" 2>/dev/null
    # Give it a moment to release the V4L2 device, then insist.
    for _ in 1 2 3 4 5 6 7 8 9 10; do
        kill -0 "$CHILD" 2>/dev/null || break
        sleep 0.2
    done
    kill -9 "$CHILD" 2>/dev/null
    wait "$CHILD" 2>/dev/null
    CHILD=""
}

trap 'stop_child; exit 0' INT TERM
trap 'stop_child' EXIT

# Non-zero only when the endpoint hands back a real JPEG. "The socket answered"
# is exactly the lie this function exists to catch.
snapshot_bytes() {
    local tmp code size
    tmp=$(mktemp /tmp/mjpg-health.XXXXXX) || return 1
    code=$(curl -sS -m 3 -o "$tmp" -w '%{http_code}' "$SNAP_URL" 2>/dev/null || echo 000)
    size=$(wc -c <"$tmp" 2>/dev/null || echo 0)
    rm -f "$tmp"
    [ "$code" = "200" ] && [ "$size" -gt 1000 ] && echo "$size" && return 0
    return 1
}

# Frame verification is the whole point of the loop below, and it is done over
# HTTP. On a node without curl we cannot tell a live stream from a dead one, and
# guessing "dead" would kill a camera that works — so fall back to the old
# straight-through exec. Healthy nodes must never be made worse by this script.
if ! command -v curl >/dev/null 2>&1; then
    echo "mjpg-launcher: curl absent — cannot verify frames; starting unsupervised" >&2
    exec /usr/local/bin/mjpg_streamer \
        -i "input_uvc.so -d $DEV -r ${MB_CAM_RES:-640x480} -f ${MB_CAM_FPS:-15} -q ${MB_CAM_Q:-60}" \
        -o "output_http.so -p ${PORT} -w /usr/local/share/mjpg-streamer/www"
fi

try=0
while [ "$try" -lt "$MAX_TRIES" ]; do
    try=$((try + 1))

    /usr/local/bin/mjpg_streamer \
        -i "input_uvc.so -d $DEV -r ${MB_CAM_RES:-640x480} -f ${MB_CAM_FPS:-15} -q ${MB_CAM_Q:-60}" \
        -o "output_http.so -p ${PORT} -w /usr/local/share/mjpg-streamer/www" &
    CHILD=$!

    bytes=""
    deadline=$((SECONDS + HEALTH_WAIT))
    while [ "$SECONDS" -lt "$deadline" ]; do
        if ! kill -0 "$CHILD" 2>/dev/null; then
            break   # died on its own; the retry below covers it
        fi
        if bytes=$(snapshot_bytes); then
            break
        fi
        bytes=""
        sleep 0.25
    done

    if [ -n "$bytes" ]; then
        echo "mjpg-launcher: streaming (attempt $try, first frame ${bytes} bytes)"
        # Stable from here on — hand the process our lifetime.
        wait "$CHILD"
        rc=$?
        CHILD=""
        echo "mjpg-launcher: mjpg_streamer exited rc=$rc; letting systemd restart us"
        exit "$rc"
    fi

    echo "mjpg-launcher: no frames on attempt $try (VIDIOC_STREAMON likely refused) — retrying"
    stop_child
    sleep 0.5
done

echo "mjpg-launcher: camera $DEV produced no frames in $MAX_TRIES attempts — treating as hardware fault" >&2
exit 1
