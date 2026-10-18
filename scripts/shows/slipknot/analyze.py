"""Tempo, beat grid, key and section energy for the Slipknot fleet scene.

usage: python analyze.py SONG.mp3 OUT.json
"""
import json
import subprocess
import sys

import numpy as np
from scipy.signal import find_peaks, stft

SR = 22050
song, out = sys.argv[1], sys.argv[2]
pcm = subprocess.run(['ffmpeg', '-v', 'error', '-i', song, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'],
                     capture_output=True, check=True).stdout
x = np.frombuffer(pcm, dtype=np.float32)
dur = len(x) / SR

# --- onset envelope (spectral flux, log magnitude) ---
HOP = 512
f, t, Z = stft(x, fs=SR, nperseg=2048, noverlap=2048 - HOP, boundary=None)
mag = np.log1p(np.abs(Z) * 100)
flux = np.maximum(0, np.diff(mag, axis=1)).sum(axis=0)
flux = np.concatenate([[0], flux])
flux = flux - np.convolve(flux, np.ones(16) / 16, mode='same')
flux = np.maximum(flux, 0)
fps = SR / HOP

# --- tempo: autocorrelation of the onset envelope, 70..190 BPM ---
ac = np.correlate(flux, flux, mode='full')[len(flux) - 1:]
lags = np.arange(len(ac))
bpm_of = lambda lag: 60 * fps / lag
lo, hi = int(60 * fps / 190), int(60 * fps / 70)
cand = lags[lo:hi]
best = cand[np.argmax(ac[lo:hi])]
# refine with parabolic interpolation
a, b, c = ac[best - 1], ac[best], ac[best + 1]
frac = 0.5 * (a - c) / (a - 2 * b + c) if (a - 2 * b + c) != 0 else 0
period = (best + frac)
bpm = bpm_of(period)

# --- beat phase: comb that best fits the onset peaks ---
best_phase, best_score = 0, -1
for ph in np.linspace(0, period, 64, endpoint=False):
    idx = np.arange(ph, len(flux), period).astype(int)
    s = flux[idx].sum()
    if s > best_score:
        best_score, best_phase = s, ph
beats = np.arange(best_phase, len(flux), period) / fps
beats = beats[beats < dur]

# --- key: chroma (55..2000 Hz) + Krumhansl-Schmuckler ---
P = np.abs(Z) ** 2
freqs = f
band = (freqs > 55) & (freqs < 2000)
pc = np.round(12 * np.log2(freqs[band] / 440.0)) % 12  # 0 = A
chroma = np.zeros(12)
energy = P[band].sum(axis=1)
for k, e in zip(pc.astype(int), energy):
    chroma[k] += e
chroma = np.roll(chroma, -3)  # 0 = C
chroma /= chroma.sum()
maj = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
minr = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
scores = []
for r in range(12):
    scores.append((np.corrcoef(chroma, np.roll(maj, r))[0, 1], names[r] + ' major'))
    scores.append((np.corrcoef(chroma, np.roll(minr, r))[0, 1], names[r] + ' minor'))
scores.sort(reverse=True)

# --- loudness per bar (4 beats) for sections ---
rms_win = int(SR * 0.05)
rms = np.sqrt(np.convolve(x ** 2, np.ones(rms_win) / rms_win, mode='same'))
bars = []
for i in range(0, len(beats) - 4, 4):
    s, e = int(beats[i] * SR), int(beats[i + 4] * SR)
    bars.append({'bar': i // 4, 'start': round(float(beats[i]), 3),
                 'db': round(float(20 * np.log10(np.mean(rms[s:e]) + 1e-9)), 1)})

res = {'duration': round(dur, 3), 'bpm': round(float(bpm), 2), 'beatPeriod': round(float(period / fps), 4),
       'firstBeat': round(float(beats[0]), 3), 'beats': len(beats),
       'key': scores[0][1], 'keyCandidates': [[round(float(s), 3), n] for s, n in scores[:5]],
       'chroma': {n: round(float(v), 3) for n, v in zip(names, chroma)}, 'bars': bars}
json.dump(res, open(out, 'w'), indent=1)
print(json.dumps({k: v for k, v in res.items() if k not in ('bars', 'chroma')}))
db = np.array([b['db'] for b in bars])
print('bar loudness (dB), 8 bars per row:')
for i in range(0, len(db), 8):
    print(f"  bars {i:3d}-{i+7:3d} @ {bars[i]['start']:6.1f}s: " + ' '.join(f'{v:5.1f}' for v in db[i:i + 8]))
