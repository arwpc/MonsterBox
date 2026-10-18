"""Build one beat-locked audio part per animatronic for the Slipknot 'Virus of Life' scene.

Every part is exactly as long as the song, so all parts started together stay in sync for
the whole song (no per-step timing drift). Sung vowels are pitch-shifted (rubberband,
formant preserved) to D-minor notes and stretched to whole bars; whispers and shouts land
on beats. Groundbreaker's part is the song itself, bass-boosted, with his shouts mixed in.

usage: python build_parts.py SONG.mp3 analysis.json OUTDIR [--lead CID=ms ...]
  --lead moves a node's whole part earlier by ms, to cancel that node's measured start lag.
"""
import json
import os
import subprocess
import sys

import numpy as np

SR = 44100
song, analysis, outdir = sys.argv[1], sys.argv[2], sys.argv[3]
LEAD = {}
for a in sys.argv[4:]:
    if a.startswith('--lead'):
        continue
    if '=' in a:
        k, v = a.split('=')
        LEAD[int(k)] = int(v)
A = json.load(open(analysis))
BEAT = A['beatPeriod']
BAR = 4 * BEAT
T0 = A['firstBeat']
DUR = A['duration']
N = int(round(DUR * SR))
os.makedirs(outdir, exist_ok=True)
os.makedirs('tuned', exist_ok=True)

NOTE = {'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11}


# Tracked beats (track_beats.py, -10 ms analysis latency removed): the fixed tempo grid
# drifted ~2 s by the end of this song; cues land on the drummer's actual beats.
TB = json.load(open('beats-corrected.json'))['beats']


def t(bar, beat=0.0):
    i = 4 * bar + int(beat)
    frac = beat - int(beat)
    if i + 1 >= len(TB):
        return TB[-1] + (i - len(TB) + 1 + frac) * BEAT
    return TB[i] + frac * (TB[i + 1] - TB[i])


def load(path, sr=SR):
    pcm = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(sr), '-f', 'f32le', '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(pcm, dtype=np.float32).copy()


def trim(x, thr=0.02):
    idx = np.where(np.abs(x) > thr * np.max(np.abs(x)))[0]
    return x[idx[0]:idx[-1] + 1] if len(idx) else x


def f0_median(x, sr=SR):
    """Median fundamental over voiced frames: YIN (cumulative mean normalised difference), 55..700 Hz."""
    frame, hop = 4096, 1024
    tmin, tmax = int(sr / 700), int(sr / 55)
    out = []
    for s0 in range(0, len(x) - frame - tmax, hop):
        w = x[s0:s0 + frame + tmax]
        if np.sqrt(np.mean(w[:frame] ** 2)) < 0.02:
            continue
        d = np.array([np.sum((w[:frame] - w[tau:tau + frame]) ** 2) for tau in range(tmax + 1)])
        cm = d.copy()
        cm[1:] = d[1:] * np.arange(1, tmax + 1) / np.maximum(np.cumsum(d[1:]), 1e-12)
        cm[0] = 1
        cand = np.where(cm[tmin:tmax] < 0.15)[0]
        if len(cand) == 0:
            continue
        tau = tmin + cand[0]
        while tau + 1 < tmax and cm[tau + 1] < cm[tau]:
            tau += 1
        a, b, c = cm[tau - 1], cm[tau], cm[tau + 1]
        den = a - 2 * b + c
        tau = tau + (0.5 * (a - c) / den if den else 0)
        out.append(sr / tau)
    return float(np.median(out)) if out else None


def target_freq(note, near):
    """Frequency of `note` in the octave nearest `near` Hz."""
    pc = NOTE[note]
    cands = [440.0 * 2 ** ((pc - 9) / 12 + o) for o in range(-4, 3)]
    return min(cands, key=lambda f: abs(np.log2(f / near)))


def tune(cid, clip, note, bars):
    """Pitch-shift a sung vowel to `note` and stretch it to `bars` bars; cached per variant."""
    out = f'tuned/{cid}-{clip}-{note}-{bars}.wav'
    src = f'raw/{cid}-{clip}.mp3'
    x = trim(load(src))
    f0 = f0_median(x)
    if f0 is None:
        raise SystemExit(f'no pitch found in {src}')
    tf = target_freq(note, f0)
    ratio = tf / f0
    want = bars * BAR - 0.15
    tempo = (len(x) / SR) / want
    if not os.path.exists(out):
        tmp = 'tuned/_in.wav'
        import wave
        with wave.open(tmp, 'wb') as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
            w.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes())
        fade_out = min(1.2, want / 3)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp, '-af',
                        f'rubberband=pitch={ratio:.5f}:tempo={tempo:.5f}:formant=preserved:transients=smooth,'
                        f'afade=t=in:d=0.25,afade=t=out:st={max(0, want - fade_out):.3f}:d={fade_out:.3f}',
                        '-ar', str(SR), '-ac', '1', out], check=True)
    y = load(out)
    got = f0_median(y)
    passes = 0
    if os.path.exists(out + '.fixed'):
        first = open(out + '.fixed').read().split()[0]
        passes = int(first) if first.isdigit() else 1
    while got and abs(12 * np.log2(tf / got)) > 0.3 and passes < 3:
        passes += 1
        fix = tf / got
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', out, '-af', f'rubberband=pitch={fix:.5f}:formant=preserved',
                        '-ar', str(SR), '-ac', '1', out + '.tmp.wav'], check=True)
        os.replace(out + '.tmp.wav', out)
        open(out + '.fixed', 'w').write(f'{passes} {fix}')
        y = load(out)
        got = f0_median(y)
    return y, {'clip': f'{cid}-{clip}', 'note': note, 'srcHz': round(f0, 1), 'targetHz': round(tf, 1),
               'resultHz': round(got, 1) if got else None, 'bars': bars, 'sec': round(len(y) / SR, 2)}


def attack_samples(y):
    """Where a spoken clip actually hits: first 20 ms window above 30% of its loudest.
    TTS clips start with breath; placing the first sample on the beat put every hit late."""
    w = int(0.02 * SR)
    rms = np.sqrt(np.convolve(y ** 2, np.ones(w) / w, mode='same'))
    idx = np.where(rms > 0.3 * rms.max())[0]
    return int(idx[0]) if len(idx) else 0


def plain(cid, clip, gain_db=0.0):
    return trim(load(f'raw/{cid}-{clip}.mp3')) * (10 ** (gain_db / 20))


# --- the score: (cid, kind, clip, bar, beat, bars/note/gain) -----------------------------
S = []
def sing(cid, clip, bar, note, bars, beat=0.0): S.append((cid, 'sing', clip, bar, beat, (note, bars)))
def say(cid, clip, bar, beat=0.0, gain_db=0.0): S.append((cid, 'say', clip, bar, beat, gain_db))

# build (bars 5-16): PumpkinHead and Renfield trade whispers, one bar apart
for b in (5, 7, 9, 11, 13, 15):
    say(1, 'virus', b, 0, 6)
    say(6, 'oflife', b + 1, 0, 6)
# Groundbreaker into the drop (bar 19)
say(5, 'yeah', 17, 2.5)
# heavy A: Orlok's long low notes on the 8-bar phrases from the drop
for b, n in ((19, 'D'), (27, 'A'), (35, 'D'), (43, 'A')):
    sing(3, 'ooh', b, n, 4)
# dip (bars 51-55): Mina floats, PumpkinHead hisses
sing(2, 'aah', 51, 'A', 2); sing(2, 'aah', 53, 'D', 2)
say(1, 'spreads', 55, 0, 6)
# heavy B: the Knight chants every bar, Orlok under him
for b in range(56, 64):
    say(4, 'huh', b, 0, 3)
sing(3, 'ooh', 59, 'D', 4)
# breakdown (bars 67-74): Mina's line, Renfield frantic between her notes
for b, n in ((67, 'A'), (69, 'F'), (71, 'A'), (73, 'D')):
    sing(2, 'aah', b, n, 2)
for b in (68, 70, 72):
    say(6, 'infected', b, 2, 4)
say(2, 'feel', 66, 0, 4)
say(5, 'lovepart', 74, 0)
# full section (bars 75-154)
for b, n in ((75, 'D'), (91, 'A'), (107, 'D'), (123, 'A'), (139, 'D')):
    sing(3, 'ooh', b, n, 4)
for start in (83, 115, 147):
    for b in range(start, start + 8):
        say(4, 'huh', b, 0, 3)
        say(4, 'ha', b, 2, 3)
sing(2, 'aah', 99, 'A', 4); sing(2, 'aah', 131, 'D', 4)
for b in (100, 102, 104, 106):
    say(1, 'virus', b, 0, 6)
    say(6, 'oflife', b + 1, 0, 6)
for b in (132, 134):
    say(6, 'infected', b, 0, 4)
# finale (bars 155-163): the whole castle sings the D-minor chord
sing(3, 'ooh', 155, 'D', 8)
sing(2, 'aah', 155, 'A', 8)
sing(1, 'ooh', 159, 'F', 4)
sing(6, 'aah', 159, 'A', 4)
sing(4, 'aah', 159, 'D', 4)
say(5, 'iowa', 162, 2)

# --- render ----------------------------------------------------------------------------
parts = {cid: np.zeros(N, dtype=np.float32) for cid in (1, 2, 3, 4, 6)}
shouts = np.zeros(N, dtype=np.float32)
report = []
for cid, kind, clip, bar, beat, arg in S:
    if kind == 'sing':
        y, info = tune(cid, clip, arg[0], arg[1])
        report.append(info)
    else:
        y = plain(cid, clip, arg)
    lead_in = attack_samples(y) if kind == 'say' else 0
    at = int(round((t(bar, beat) - LEAD.get(cid, 0) / 1000.0) * SR)) - lead_in
    at = max(0, at)
    dest = shouts if cid == 5 else parts[cid]
    end = min(N, at + len(y))
    dest[at:end] += y[:end - at]


def write(path, x, stereo=False):
    peak = float(np.max(np.abs(x))) or 1.0
    x = x / peak * 0.89  # -1 dBFS
    raw = (np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes()
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 's16le', '-ar', str(SR), '-ac', '1', '-i', '-',
                    '-ac', '2' if stereo else '1', '-b:a', '192k', path], input=raw, check=True)


names = {1: 'pumpkinhead', 2: 'mina', 3: 'orlok', 4: 'dragomir', 6: 'renfield'}
for cid, x in parts.items():
    write(f'{outdir}/slipknot-part-{names[cid]}.mp3', x)

# Groundbreaker: the song, deep bass, his shouts on top (song ducked 6 dB under each shout)
songx = subprocess.run(['ffmpeg', '-v', 'error', '-i', song, '-af', 'volume=-4dB,bass=g=8:f=70:w=0.9,lowshelf=g=3:f=45',
                        '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
songx = np.frombuffer(songx, dtype=np.float32)[:N].copy()
if len(songx) < N:
    songx = np.pad(songx, (0, N - len(songx)))
env = np.convolve((np.abs(shouts) > 0.01).astype(np.float32), np.ones(int(0.3 * SR)) / int(0.3 * SR), mode='same')
duck = 1 - 0.5 * np.clip(env * 4, 0, 1)
mix = songx * duck + shouts / (np.max(np.abs(shouts)) or 1) * 0.8
raw = mix.astype(np.float32).tobytes()
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-',
                '-af', 'alimiter=limit=0.95:level=disabled', '-ac', '2', '-b:a', '320k',
                f'{outdir}/slipknot-groundbreaker-virus-of-life.mp3'], input=raw, check=True)

json.dump({'bar': BAR, 'firstBeat': T0, 'cues': len(S), 'tuned': report, 'lead': LEAD},
          open(f'{outdir}/build-report.json', 'w'), indent=1)
print(f'{len(S)} cues; tuned notes:')
for r in report:
    print(' ', r)
