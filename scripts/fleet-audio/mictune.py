"""Measure what a MonsterBox mic actually hears, so gain can be tuned by numbers.

Judges on FRAMES and LEVEL, never on "the device opened". Prints a per-0.25s
level trace plus a verdict, so a mic that is alive-but-deaf is distinguishable
from one that is simply not streaming.
"""
import sys, time, math, audioop, pyaudio

device = sys.argv[1] if len(sys.argv) > 1 else "default"
seconds = float(sys.argv[2]) if len(sys.argv) > 2 else 6.0
RATE, CHUNK = 16000, 512

import os
if device not in ("default", "pulse", "pipewire"):
    os.environ["PULSE_SOURCE"] = device

pa = pyaudio.PyAudio()

# Match microphone_cli: honour PULSE_SOURCE by going through "pulse".
want = ("pulse", "pipewire") if os.environ.get("PULSE_SOURCE") else ("pipewire", "pulse")
idx = None
for w in want:
    for i in range(pa.get_device_count()):
        info = pa.get_device_info_by_index(i)
        if info["maxInputChannels"] >= 1 and info["name"].strip().lower() == w:
            idx = i
            break
    if idx is not None:
        break
if idx is None:
    print("no usable input device"); sys.exit(2)

print("host device : %s" % pa.get_device_info_by_index(idx)["name"])
print("PULSE_SOURCE: %s" % os.environ.get("PULSE_SOURCE", "(default)"))

stream = pa.open(format=pyaudio.paInt16, channels=1, rate=RATE, input=True,
                 input_device_index=idx, frames_per_buffer=CHUNK)

frames = 0
total_bytes = 0
peak = 0
window = []
levels = []
t0 = time.time()
acc = []
while time.time() - t0 < seconds:
    data = stream.read(CHUNK, exception_on_overflow=False)
    frames += 1
    total_bytes += len(data)
    r = audioop.rms(data, 2)
    peak = max(peak, r)
    acc.append(r)
    if len(acc) >= int(0.25 * RATE / CHUNK):
        levels.append(sum(acc) / len(acc))
        acc = []
stream.stop_stream(); stream.close()

print("frames=%d bytes=%d peakRMS=%d" % (frames, total_bytes, peak))
if not levels:
    print("VERDICT: NO FRAMES — mic is not streaming"); sys.exit(1)

avg = sum(levels) / len(levels)
quiet = min(levels)
print("avg=%.0f  floor=%.0f  peak=%d   (16-bit full scale = 32768)" % (avg, quiet, peak))
for i, l in enumerate(levels):
    bar = "#" * int(min(l / 60, 60))
    print("  %4.2fs %6.0f %s" % (i * 0.25, l, bar))

# dBFS is the number worth tuning on.
def dbfs(v):
    return 20 * math.log10(v / 32768.0) if v > 0 else -99.0

print("floor %.1f dBFS | avg %.1f dBFS | peak %.1f dBFS" % (dbfs(quiet), dbfs(avg), dbfs(peak)))
if peak < 100:
    print("VERDICT: STREAMING BUT DEAF — frames flow, no signal. Check gain/wiring.")
elif peak > 30000:
    print("VERDICT: CLIPPING — reduce capture gain.")
else:
    print("VERDICT: HEALTHY — real signal, headroom left.")
