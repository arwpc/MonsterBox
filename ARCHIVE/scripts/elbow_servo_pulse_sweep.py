#!/usr/bin/env python3
"""
Elbow Servo Pulse Sweep (Non-interactive)
- Targets Servo ID 31 (Elbow) via Servo WebSocket service
- Sends conservative, incremental pulse widths with neutral resets between steps
- Designed for observation without interactive prompts

Safety:
- Starts at 1500µs (neutral)
- Small steps away from neutral first, gradually extending range
- Returns to 1500µs between each test pulse
- Sends 0µs at the end to stop PWM

Usage:
  python3 scripts/elbow_servo_pulse_sweep.py [host] [port]
Defaults:
  host=127.0.0.1, port=8404
"""

import asyncio
import json
import sys
import websockets
from typing import List

HOST = sys.argv[1] if len(sys.argv) > 1 else '127.0.0.1'
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8404
WS_URL = f'ws://{HOST}:{PORT}'
SERVO_ID = '31'

# Conservative pulse plan (µs):
#  - oscillate around 1500 with small deltas first
#  - then cautiously extend towards 1200/1800, then 1000/2000, finally 900/2100
PULSE_PLAN: List[int] = [
    1500,
    1475, 1500, 1525, 1500,
    1450, 1500, 1550, 1500,
    1425, 1500, 1575, 1500,
    1400, 1500, 1600, 1500,
    1350, 1500, 1650, 1500,
    1300, 1500, 1700, 1500,
    1250, 1500, 1750, 1500,
    1200, 1500, 1800, 1500,
    1150, 1500, 1850, 1500,
    1100, 1500, 1900, 1500,
    1050, 1500, 1950, 1500,
    1000, 1500, 2000, 1500,
    950,  1500, 2050, 1500,
    900,  1500, 2100, 1500,
]

async def send(ws, msg, timeout=10.0):
    await ws.send(json.dumps(msg))
    # Drain until we get a non-welcome response
    while True:
        raw = await asyncio.wait_for(ws.recv(), timeout=timeout)
        try:
            resp = json.loads(raw)
        except Exception:
            continue
        # Skip welcome/broadcast
        if isinstance(resp, dict) and resp.get('type') == 'welcome':
            continue
        return resp

async def set_pulse(ws, pulse):
    req = {"type": "servo_test_pulse", "servo_id": SERVO_ID, "pulse_width": int(pulse)}
    resp = await send(ws, req)
    ok = resp and resp.get('status') == 'success'
    print(f"   ↪ {pulse}µs -> {'OK' if ok else 'ERR'} | {resp}")
    return ok

async def main():
    print(f"🔌 Connecting to {WS_URL}...")
    try:
        async with websockets.connect(WS_URL) as ws:
            print("✅ Connected")
            # Try to drain initial welcome
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=1.0)
                # best-effort drain; ignore content
            except Exception:
                pass

            print("🎯 Starting conservative pulse sweep for Servo 31 (Elbow)")
            print("ℹ️ Observe the elbow movement; the script will pause briefly at each step.")

            success_count = 0
            total = 0
            for pulse in PULSE_PLAN:
                total += 1
                print(f"📡 Sending {pulse}µs ...")
                ok = await set_pulse(ws, pulse)
                if ok:
                    success_count += 1
                # Wait for movement/settle
                await asyncio.sleep(1.5 if pulse != 1500 else 1.0)

            print("🛑 Stopping PWM (0µs)...")
            await set_pulse(ws, 0)

            print(f"✅ Sweep complete. Success {success_count}/{total} commands acknowledged by service.")
            print("📌 If you noted the first and last pulses that produced motion, we can update parts.json for servo 31 with those values.")
            sys.exit(0)
    except Exception as e:
        print("❌ Sweep failed:", e)
        sys.exit(1)

if __name__ == '__main__':
    asyncio.run(main())

