"""Dynamic-programming beat tracker (Ellis 2007) over a spectral-flux onset envelope.

A fixed tempo grid drifted +/-120 ms against this song in places. This follows the
actual onsets: every beat time is chosen to sit on strong onsets while keeping the
spacing close to the global beat period. Writes beats.json: {"beats": [...seconds]}.
usage: python track_beats.py SONG.mp3 analysis.json beats.json
"""
import json
import subprocess
import sys

import numpy as np
from scipy.signal import stft

song, analysis, out = sys.argv[1:4]
A = json.load(open(analysis))
SR, HOP = 22050, 256
x = np.frombuffer(subprocess.run(['ffmpeg', '-v', 'error', '-i', song, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'],
                                 capture_output=True, check=True).stdout, dtype=np.float32)
f, t, Z = stft(x, fs=SR, nperseg=1024, noverlap=1024 - HOP, boundary=None)
m = np.log1p(np.abs(Z) * 100)
# low band (kick) weighted double: the beat lives in the drums
w = np.ones(len(f)); w[f < 150] = 2.0
o = (np.maximum(0, np.diff(m, axis=1)) * w[:, None]).sum(0)
o = np.concatenate([[0], o])
o = o - np.convolve(o, np.ones(64) / 64, mode='same')
o = np.maximum(o, 0)
o = o / (o.std() or 1)
fps = SR / HOP
period = A['beatPeriod'] * fps

ALPHA = 400.0
n = len(o)
score = o.copy()
back = -np.ones(n, dtype=int)
lo, hi = int(round(period * 0.5)), int(round(period * 2))
for i in range(hi, n):
    prev = np.arange(i - hi, i - lo + 1)
    pen = -ALPHA * (np.log((i - prev) / period)) ** 2
    cand = score[prev] + pen
    k = int(np.argmax(cand))
    score[i] = o[i] + cand[k]
    back[i] = prev[k]
# backtrace from the best-scoring frame in the last beat period
i = int(np.argmax(score[n - hi:])) + n - hi
beats = []
while i >= 0:
    beats.append(i)
    i = back[i]
beats = np.array(beats[::-1]) / fps
ibi = np.diff(beats)
json.dump({'beats': [round(float(b), 4) for b in beats]}, open(out, 'w'))
print(f'{len(beats)} beats, first {beats[0]:.3f}s last {beats[-1]:.3f}s; '
      f'interval median {np.median(ibi)*1000:.1f} ms, min {ibi.min()*1000:.0f}, max {ibi.max()*1000:.0f}; '
      f'grid would put beat {len(beats)-1} at {A["firstBeat"] + (len(beats)-1)*A["beatPeriod"]:.3f}s')
