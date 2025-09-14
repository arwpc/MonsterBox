#!/usr/bin/env python3
"""
Safe smoke test for Servo WebSocket service.
Sends a neutral 1500µs pulse to servo ID 31, waits briefly, then stops PWM.
Designed to be non-destructive and validate connectivity only.
"""

import asyncio
import json
import sys
import websockets

WS_URL = 'ws://127.0.0.1:8404'
SERVO_ID = '31'

async def send(ws, msg):
    await ws.send(json.dumps(msg))
    try:
        while True:
            # Read until we get a response object with status or matches request type
            raw = await asyncio.wait_for(ws.recv(), timeout=10.0)
            resp = json.loads(raw)
            # Skip welcome/broadcasts
            if isinstance(resp, dict) and resp.get('type') in ('welcome',):
                continue
            return resp
    except Exception as e:
        return {"status": "error", "message": str(e)}

async def main():
    print(f"🔌 Connecting to {WS_URL}...")
    try:
        async with websockets.connect(WS_URL) as ws:
            print("✅ Connected")

            # Drain initial welcome message if any
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=1.0)
                msg = json.loads(raw)
                if isinstance(msg, dict) and msg.get('type') == 'welcome':
                    print("ℹ️ Received welcome message")
                else:
                    # Push back? Can't push back; just note it.
                    print("ℹ️ First message:", msg)
            except Exception:
                pass

            # Neutral center pulse
            print("📡 Sending neutral pulse: 1500µs to servo 31...")
            resp = await send(ws, {
                "type": "servo_test_pulse",
                "servo_id": SERVO_ID,
                "pulse_width": 1500
            })
            print("   ↪", resp)

            # Small wait
            await asyncio.sleep(1.0)

            # Stop PWM (0 turns off)
            print("🛑 Stopping PWM (0µs)...")
            resp2 = await send(ws, {
                "type": "servo_test_pulse",
                "servo_id": SERVO_ID,
                "pulse_width": 0
            })
            print("   ↪", resp2)

            ok = (resp.get('status') == 'success') and (resp2.get('status') == 'success')
            print("✅ Smoke test PASSED" if ok else "❌ Smoke test FAILED")
            sys.exit(0 if ok else 1)
    except Exception as e:
        print("❌ Connection failed:", e)
        sys.exit(2)

if __name__ == '__main__':
    asyncio.run(main())

