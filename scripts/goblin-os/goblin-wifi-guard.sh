#!/bin/bash
# goblin-wifi-guard — keeps a Goblin on MonsterNet without a human. Installed by harden-goblin.sh as
# /usr/local/sbin/goblin-wifi-guard.sh and run by goblin-wifi-guard.service (root, Restart=always).
#
# Why it exists (2026-10-12): Goblins are switched off at the wall, never shut down. On the
# re-imaged units NetworkManager kept the Wi-Fi profile as /etc/netplan/90-NM-<uuid>.yaml, and a
# power cut during a rewrite left that file 0 bytes: no profile, so the radio came up and never
# joined, and someone had to plug in a keyboard. harden-goblin.sh moves the profile to a keyfile
# and keeps a root-only copy; this loop puts the copy back if the profile ever goes missing, and
# walks a reconnect ladder if the link drops for any other reason.
#
# Ladder, one check every CHECK_SECS (default 30 s) while the gateway does not answer:
#   2 misses  -> nmcli connection up <profile>
#   6 misses  -> Wi-Fi radio off/on
#   10 misses -> reload the brcmfmac driver and restart NetworkManager
#   20 misses -> reboot (only after 15 min uptime, at most 2 guard reboots per 6 h, so a dead
#                access point cannot reboot-loop the show; video keeps playing meanwhile)
# Logs only on state changes (SD card).
set -u
PROFILE_DIR=/etc/NetworkManager/system-connections
BACKUP_DIR=/etc/goblin/wifi
STATE_DIR=/var/lib/goblin-wifi-guard
CHECK_SECS=${GOBLIN_WIFI_CHECK_SECS:-30}
IFACE=${GOBLIN_WIFI_IFACE:-wlan0}
mkdir -p "$STATE_DIR"

log() { echo "goblin-wifi-guard: $*"; }

# The backed-up profile name (harden-goblin.sh stores exactly one).
backup_file() { ls "$BACKUP_DIR"/*.nmconnection 2>/dev/null | head -1; }

profile_ok() {
    local f
    f=$(backup_file) || return 0
    [ -n "$f" ] || return 0
    local live="$PROFILE_DIR/$(basename "$f")"
    [ -s "$live" ] && grep -q '^\[wifi\]' "$live"
}

restore_profile() {
    local f; f=$(backup_file)
    [ -n "$f" ] || return 1
    install -m 600 -o root -g root "$f" "$PROFILE_DIR/$(basename "$f")"
    sync
    nmcli connection reload
    log "Wi-Fi profile was missing or empty; restored $(basename "$f") from $BACKUP_DIR"
}

profile_id() {
    local f; f=$(backup_file)
    [ -n "$f" ] && sed -n 's/^id=//p' "$f" | head -1
}

gateway() {
    ip -4 route show default dev "$IFACE" 2>/dev/null | awk '/default/ {print $3; exit}'
}

link_ok() {
    local gw; gw=$(gateway)
    [ -n "$gw" ] || return 1
    ping -c 1 -W 3 -I "$IFACE" "$gw" >/dev/null 2>&1 && return 0
    # one more try: a single lost ICMP on a busy 2.4 GHz channel is not an outage
    sleep 2
    ping -c 1 -W 3 -I "$IFACE" "$gw" >/dev/null 2>&1
}

may_reboot() {
    local up; up=$(cut -d. -f1 /proc/uptime)
    [ "$up" -ge 900 ] || return 1
    local now; now=$(date +%s)
    local recent=0
    if [ -f "$STATE_DIR/reboots" ]; then
        recent=$(awk -v cut=$((now - 21600)) '$1 >= cut' "$STATE_DIR/reboots" | wc -l)
    fi
    [ "$recent" -lt 2 ]
}

misses=0
was_down=0
log "started (iface $IFACE, profile '$(profile_id)', every ${CHECK_SECS}s)"
while true; do
    if ! profile_ok; then restore_profile; fi

    if link_ok; then
        if [ "$was_down" = 1 ]; then log "link back after $misses missed check(s) ($(ip -4 -br addr show "$IFACE" | awk '{print $3}'))"; fi
        misses=0; was_down=0
    else
        misses=$((misses + 1)); was_down=1
        id=$(profile_id)
        case $misses in
            1) log "gateway not answering on $IFACE" ;;
            2) log "step 1: nmcli connection up '$id'"; nmcli radio wifi on >/dev/null 2>&1; timeout 45 nmcli connection up id "$id" >/dev/null 2>&1 ;;
            6) log "step 2: Wi-Fi radio off/on"; nmcli radio wifi off; sleep 3; nmcli radio wifi on; sleep 5; timeout 45 nmcli connection up id "$id" >/dev/null 2>&1 ;;
            10) log "step 3: reloading brcmfmac and restarting NetworkManager"
                modprobe -r brcmfmac_wcc 2>/dev/null; modprobe -r brcmfmac 2>/dev/null; sleep 2; modprobe brcmfmac; sleep 5
                systemctl restart NetworkManager; sleep 10; timeout 45 nmcli connection up id "$id" >/dev/null 2>&1 ;;
            *)
                if [ "$misses" -ge 20 ] && [ $((misses % 10)) = 0 ]; then
                    if may_reboot; then
                        log "step 4: no link for $((misses * CHECK_SECS))s after every reconnect step; rebooting"
                        date +%s >> "$STATE_DIR/reboots"; sync
                        systemctl reboot
                    else
                        log "still no link after $((misses * CHECK_SECS))s; reboot held (uptime < 15 min or 2 guard reboots in 6 h); retrying the profile"
                        timeout 45 nmcli connection up id "$id" >/dev/null 2>&1
                    fi
                fi ;;
        esac
    fi
    sleep "$CHECK_SECS"
done
