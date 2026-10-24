"""Fleet show engine, audio half: timeline, one voice part per animatronic, and the score.

usage: python build.py SHOW_DIR
Reads SHOW_DIR/script.json (acts of lines, the Nosferatu format), SHOW_DIR/show.json (timing, sfx,
music plan) and voices/*.mp3 + durations.json (render with scripts/shows/nosferatu/render_lines.py).
Writes timeline.json, audio/<slug>-part-<character>.mp3, audio/<slug>-score.mp3, work/preview-mix.mp3.

The score is ONE generated cue the length of the show (music.py renders it from the timeline, with a
section per act or per beat), ducked under every line. Every part starts together, so a line lands where
the timeline puts it. Generalised from scripts/shows/nosferatu/build_show.py (operator 2026-10-23: every
scheduled event as expansive as the story).
"""
import json
import os
import subprocess
import sys

import numpy as np

SHOW = os.path.abspath(sys.argv[1])
CFG = json.load(open(f'{SHOW}/show.json'))
SLUG = CFG['slug']
SR = 44100
PART = {1: 'pumpkinhead', 2: 'mina', 3: 'orlok', 4: 'dragomir', 5: 'groundbreaker', 6: 'renfield'}
OPEN_S = float(CFG.get('openS', 3.0))
ACT_TITLE_S = float(CFG.get('actTitleS', 4.0))
ACT_TAIL_S = float(CFG.get('actTailS', 2.0))
END_S = float(CFG.get('endS', 3.0))
VOICE_DB = {int(k): v for k, v in CFG.get('voiceDb', {}).items()}
VOICE_DEFAULT_DB = float(CFG.get('voiceDefaultDb', -13))
SFX = CFG.get('sfx', {})          # key: {file, lead, play, gain}
SFX_DIR = os.path.expanduser(CFG.get('sfxDir', f'{SHOW}/sfx'))


def load(path, ch=2, af=None):
    cmd = ['ffmpeg', '-v', 'error', '-i', path] + (['-af', af] if af else []) + \
          ['-ac', str(ch), '-ar', str(SR), '-f', 'f32le', '-']
    x = np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, np.float32)
    return x.reshape(-1, ch).copy()


def db(g):
    return 10 ** (g / 20)


def rms(x):
    return float(np.sqrt(np.mean(x ** 2)) + 1e-12)


def fade(x, a=0.05, b=1.5):
    n = len(x)
    na, nb = min(n, int(a * SR)), min(n, int(b * SR))
    x[:na] *= np.linspace(0, 1, na)[:, None]
    x[n - nb:] *= np.linspace(1, 0, nb)[:, None]
    return x


def put(buf, t, x, gain=1.0):
    i = int(round(t * SR))
    if i >= len(buf):
        return
    n = min(len(x), len(buf) - i)
    buf[i:i + n] += x[:n] * gain


def write(path, x, br, gain_db=0.0):
    raw = (x * db(gain_db)).astype(np.float32).tobytes()
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', str(x.shape[1]), '-i', '-',
                    '-af', 'alimiter=limit=0.94:level=disabled', '-b:a', br, path], input=raw, check=True)


def timeline():
    script = json.load(open(f'{SHOW}/script.json'))
    dur = json.load(open(f'{SHOW}/voices/durations.json'))
    lines, sfx, acts, t = [], [], [], 0.0
    for n, act in enumerate(script['acts']):
        a0 = t
        t += OPEN_S if n == 0 else ACT_TITLE_S
        for s in act.get('openSfx', []):
            sfx.append(dict(key=s, start=round(a0 + 0.3, 3)))
        prev = None
        for ln in act['lines']:
            d = dur[ln['id']]
            # "together": start with the line before (a shout from the whole yard at once)
            st = prev['start'] if ln.get('together') and prev else t
            entry = dict(id=ln['id'], cid=ln['cid'], act=act['act'], start=round(st, 3), dur=d, end=round(st + d, 3))
            lines.append(entry)
            if ln.get('together') and prev:
                t = max(t, st + d + ln.get('gapAfter', 0.6))
                prev = entry
                continue
            prev = entry
            t += d
            gap = ln.get('gapAfter', 0.6)
            for k in ln.get('sfx', []):
                sfx.append(dict(key=k, start=round(t + SFX[k].get('offset', 0.0), 3)))
                gap = max(gap, SFX[k].get('lead', 0.0))
            t += gap
        t += ACT_TAIL_S
        acts.append(dict(act=act['act'], title=act['title'], start=round(a0, 3), end=round(t, 3)))
    return lines, sfx, acts, t + END_S


if __name__ == '__main__':
    lines, sfx, acts, total = timeline()
    os.makedirs(f'{SHOW}/audio', exist_ok=True)
    os.makedirs(f'{SHOW}/work', exist_ok=True)
    tl = dict(total=round(total, 3), acts=acts, lines=lines, sfx=sfx)
    json.dump(tl, open(f'{SHOW}/timeline.json', 'w'), indent=1)
    if '--timeline-only' in sys.argv:
        print(f'timeline {total:.1f} s, {len(lines)} lines; acts {[(a["title"], a["start"], a["end"]) for a in acts]}')
        sys.exit(0)

    N = int(total * SR) + SR
    speech = np.zeros(N, np.float32)
    for ln in lines:
        speech[int(ln['start'] * SR):int((ln['end'] + 0.25) * SR)] = 1.0
    k = int(0.35 * SR)
    duck = np.convolve(speech, np.ones(k) / k, mode='same')

    score = np.zeros((N, 2), np.float32)
    mus = load(f'{SHOW}/music/score.mp3')
    mus *= db(float(CFG.get('music', {}).get('rmsDb', -16))) / rms(mus)
    mus = fade(mus[:N], 0.5, 3.0)
    depth = float(CFG.get('music', {}).get('duck', 0.6))
    put(score, 0.0, mus * (1 - depth * duck[:len(mus)])[:, None])
    for s in sfx:
        spec = SFX[s['key']]
        x = load(os.path.join(SFX_DIR, spec['file']))[:int(spec.get('play', 8) * SR)]
        x = fade(x * (db(-14) / rms(x)), 0.05, 1.2)
        put(score, s['start'], x, db(spec.get('gain', -6)))

    parts = {cid: np.zeros((N, 1), np.float32) for cid in PART}
    for ln in lines:
        v = load(f"{SHOW}/voices/{ln['id']}.mp3", ch=1)
        put(parts[ln['cid']], ln['start'], v * (db(VOICE_DB.get(ln['cid'], VOICE_DEFAULT_DB)) / rms(v)))
    used = sorted({ln['cid'] for ln in lines})
    for cid in used:
        write(f'{SHOW}/audio/{SLUG}-part-{PART[cid]}.mp3', parts[cid], '128k')
    write(f'{SHOW}/audio/{SLUG}-score.mp3', score, '256k', gain_db=float(CFG.get('music', {}).get('gainDb', 2)))
    mix = score * db(-4) + np.repeat(sum(parts[c] for c in used), 2, axis=1)
    write(f'{SHOW}/work/preview-mix.mp3', mix, '192k')
    print(f'{SLUG}: {total:.1f} s ({total / 60:.1f} min), {len(lines)} lines, {len(sfx)} sfx, voices for {[PART[c] for c in used]}')
