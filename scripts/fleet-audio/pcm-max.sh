#!/usr/bin/env bash
# Raise every PLAYBACK control on this node's USB audio card to 100%.
#
# WHY: PumpkinHead was inaudible with PipeWire at 1.00 and PCM,0 at 0 dB,
# because a SECOND control — PCM,1 — sat at 40/60 = -20.00 dB. That is a 10x
# amplitude cut living below PipeWire, so wpctl/the app volume slider cannot
# see or fix it. Orlok (audible) had the same control at 0 dB.
#
# Usage:  pcm-max.sh            apply
#         pcm-max.sh --dry-run  show only
set -u

DRY=0
[ "${1:-}" = "--dry-run" ] && DRY=1

# The card carrying the speaker: prefer a reSpeaker array, else the first USB
# audio card that has playback. Never the HDMI/headphone built-ins.
CARD=""
while read -r idx name; do
    case "$name" in
        *reSpeaker*|*Array*) CARD="$idx"; break ;;
    esac
done < <(awk '/^ *[0-9]+ \[/{idx=$1; sub(/.*\]: /,""); print idx" "$0}' /proc/asound/cards)

if [ -z "$CARD" ]; then
    while read -r idx name; do
        case "$name" in
            *vc4*|*HDMI*|*Headphones*|*bcm2835*) continue ;;
        esac
        if aplay -l 2>/dev/null | grep -q "^card $idx:"; then CARD="$idx"; break; fi
    done < <(awk '/^ *[0-9]+ \[/{idx=$1; sub(/.*\]: /,""); print idx" "$0}' /proc/asound/cards)
fi

if [ -z "$CARD" ]; then echo "  no USB playback card found"; exit 1; fi
echo "  card $CARD: $(awk -v c="$CARD" '$1==c{sub(/.*\]: /,""); print; exit}' /proc/asound/cards)"

# Every simple control that has a playback volume, including ,1 ,2 … indexes.
amixer -c "$CARD" scontrols 2>/dev/null | sed "s/^Simple mixer control '//; s/'$//; s/',/,/" \
| while read -r CTL; do
    # NEVER raise a mic/capture monitoring path. On Groundbreaker "Mic,0" carries
    # a PLAYBACK volume (-7 dB) — that is the mic routed back out of the speaker.
    # Driving it to 100% next to a live array is how you get a feedback howl.
    case "$CTL" in
        Mic*|Capture*|*Boost*|*Loopback*|*Monitor*|*Sidetone*)
            echo "    $CTL: skipped (mic/monitor path — raising it risks feedback)"
            continue ;;
    esac
    INFO=$(amixer -c "$CARD" sget "$CTL" 2>/dev/null) || continue
    echo "$INFO" | grep -q "pvolume" || continue
    CUR=$(echo "$INFO" | grep -oE '\[[0-9]+%\]' | head -1 | tr -d '[]%')
    DB=$(echo "$INFO"  | grep -oE '\[-?[0-9.]+dB\]' | head -1 | tr -d '[]')
    if [ "$DRY" = "1" ]; then
        echo "    $CTL: ${CUR:-?}% ${DB:-}"
    else
        amixer -c "$CARD" sset "$CTL" 100% unmute >/dev/null 2>&1
        NEW=$(amixer -c "$CARD" sget "$CTL" 2>/dev/null | grep -oE '\[[0-9]+%\] \[-?[0-9.]+dB\]' | head -1)
        echo "    $CTL: ${CUR:-?}% ${DB:-} -> ${NEW:-100%}"
    fi
done

# Persist across reboot where alsactl is available; harmless if it is not.
[ "$DRY" = "0" ] && alsactl store 2>/dev/null && echo "  alsactl state stored"
exit 0
