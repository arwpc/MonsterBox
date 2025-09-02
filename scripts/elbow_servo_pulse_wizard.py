#!/usr/bin/env python3
"""
Interactive Elbow Servo Pulse Wizard
- Uses direct pulse testing (servo_test_pulse) for reliability
- Prompts after each step for your observation (y/n/q)
- Targets Servo ID 31 (Elbow) on ws://127.0.0.1:8404 by default

Usage:
  python3 scripts/elbow_servo_pulse_wizard.py [host] [port]

Safety:
- Starts at 1500µs (neutral)
- Expands gradually to find working min/max
- Sends 0µs on exit to stop PWM
"""

import asyncio
import json
import sys
import websockets

HOST = sys.argv[1] if len(sys.argv) > 1 else '127.0.0.1'
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8404
WS_URL = f'ws://{HOST}:{PORT}'
SERVO_ID = '31'

# Ordered test pulses (centered cycles, expanding outwards)
PULSES = [
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

async def recv_until_non_welcome(ws, timeout=10.0):
    while True:
        raw = await asyncio.wait_for(ws.recv(), timeout=timeout)
        try:
            data = json.loads(raw)
        except Exception:
            continue
        if isinstance(data, dict) and data.get('type') == 'welcome':
            continue
        return data

async def send(ws, msg, timeout=10.0):
    await ws.send(json.dumps(msg))
    return await recv_until_non_welcome(ws, timeout)

async def main():
    print("🤖 Elbow Servo Pulse Wizard (Servo 31)")
    print("=" * 50)
    print(f"🔌 Connecting to {WS_URL}...")
    async with websockets.connect(WS_URL) as ws:
        print("✅ Connected. We'll work from safe center outward.")
        # Drain welcome if present
        try:
            await asyncio.wait_for(ws.recv(), timeout=1.0)
        except Exception:
            pass

        working = []
        try:
            input("Press Enter to begin (Ctrl+C to abort)...")
            for pulse in PULSES:
                print(f"\n📡 Sending {pulse}µs to servo {SERVO_ID}...")
                resp = await send(ws, {
                    "type": "servo_test_pulse",
                    "servo_id": SERVO_ID,
                    "pulse_width": int(pulse)
                })
                status = resp.get('status')
                print("   ↪", resp)
                await asyncio.sleep(1.5 if pulse != 1500 else 1.0)

                ans = input("   Did you see movement? (y/n/q to quit): ").strip().lower()
                if ans == 'q':
                    print("🛑 Stopping as requested")
                    break
                if ans == 'y':
                    working.append(pulse)
                    print(f"   ✅ Recorded {pulse}µs as working")
                else:
                    print(f"   ❌ No movement at {pulse}µs")

        except KeyboardInterrupt:
            print("\n🛑 Interrupted, stopping PWM...")
        finally:
            # Stop PWM
            try:
                print("\n🛑 Sending 0µs (stop)...")
                resp = await send(ws, {
                    "type": "servo_test_pulse",
                    "servo_id": SERVO_ID,
                    "pulse_width": 0
                })
                print("   ↪", resp)
            except Exception as e:
                print("   ⚠️ Stop failed:", e)

            if working:
                min_w = min(working)
                max_w = max(working)
                print("\n📊 RESULTS")
                print("-" * 20)
                print(f"Working pulses observed: {len(working)}")
                print(f"Recommended minPulse: {min_w}µs")
                print(f"Recommended maxPulse: {max_w}µs")
                print("Center: 1500µs")
            else:
                print("\n❌ No working pulses recorded. Check wiring, power, channel, or servo health.")

if __name__ == '__main__':
    try:
        asyncio.run(main())
    except Exception as e:
        print("❌ Wizard error:", e)
        sys.exit(1)

