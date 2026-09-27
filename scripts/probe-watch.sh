#!/bin/bash
# Live readout of a bare-GPIO servo signal line: one line a second, healthy or
# LOADED, so leads can be pulled and re-seated while watching. Ctrl-C to stop.
#   bash scripts/probe-watch.sh <gpio>
# Uses servo_cli.py probe (400 us test pulses only; never moves the servo).
pin="${1:?usage: probe-watch.sh <gpio>}"
cd "$(dirname "$0")/.." || exit 1
while true; do
  out=$(python3 python_wrappers/servo_cli.py probe "$pin" 2>/dev/null)
  loaded=$(printf '%s' "$out" | grep -o '"loaded": [a-z]*' | head -1 | cut -d' ' -f2)
  rise=$(printf '%s' "$out" | grep -o '"riseUs": \[[^]]*\]' | head -1)
  case "$loaded" in
    true)  printf '%s  GPIO %s  LOADED   %s\n' "$(date +%T)" "$pin" "$rise" ;;
    false) printf '%s  GPIO %s  healthy  %s\n' "$(date +%T)" "$pin" "$rise" ;;
    *)     printf '%s  GPIO %s  no reading\n' "$(date +%T)" "$pin" ;;
  esac
  sleep 1
done
