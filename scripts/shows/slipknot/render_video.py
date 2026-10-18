"""Render one beat-locked Goblin video for the Slipknot 'Virus of Life' scene.

Frames are drawn here (Pillow + numpy) and piped to x264, so every effect sits on the
song's tracked beats: zoom pulses on each beat (scaled by section energy), red flash and
shake on heavy downbeats, hard cuts on bar lines, the red S centred after every mask.
A black pre-roll (PREROLL s) lets the conductor start the song once the Goblin is playing.

usage: python render_video.py g1|g2|g3 OUT.mp4
"""
import json
import math
import os
import random
import subprocess
import sys

import numpy as np
from PIL import Image

REEL, OUT = sys.argv[1], sys.argv[2]
W, H, FPS = 1280, 720, 30
PREROLL = 3.0
SRC = os.path.expanduser('~/monsterbox-console/goblin-reels/sources/slipknot')
TB = json.load(open('beats-corrected.json'))['beats']
SONG = json.load(open('analysis.json'))['duration']
BEAT = float(np.median(np.diff(TB)))
STRIP = REEL == 'g3'
CW = 406 if STRIP else W  # content width (Goblin 3: 9:16 strip centred on black)


def tb(bar, beat=0.0):
    i = 4 * bar + int(beat)
    frac = beat - int(beat)
    if i + 1 < len(TB):
        return TB[i] + frac * (TB[i + 1] - TB[i])
    return TB[-1] + (i - len(TB) + 1 + frac) * BEAT


SECTIONS = [  # name, start bar, end bar, energy
    ('intro', 0, 2, 0.2), ('build', 2, 18, 0.5), ('heavyA', 18, 51, 0.8), ('dip', 51, 56, 0.4),
    ('heavyB', 56, 67, 0.8), ('breakdown', 67, 75, 0.35), ('full', 75, 163, 1.0), ('outro', 163, 172, 0.2)]


def section_at(t):
    for name, a, b, e in SECTIONS:
        if tb(a) <= t < tb(b):
            return name, e
    return ('outro', 0.2) if t >= tb(163) else ('intro', 0.2)


# ---- assets --------------------------------------------------------------------------
IMG = {n: f'{SRC}/images/{n:02d}-image.{"png" if n in (3, 9) else "jpg"}' for n in range(1, 13)}
MASKS = [1, 2, 6, 4, 5, 7, 8, 9, 3]
LOGO_S, LOGO_W, LOGO_D = 11, 10, 12
BD = {k: f'{SRC}/backdrops/bd-{k:02d}.png' for k in (2, 4, 5, 8, 10, 12)}
_cache = {}


def base(path, mode='contain', scale=1.18, fill=0.92, nearest=False):
    """Image fitted onto a black canvas 18% larger than the frame (room to zoom and shake)."""
    key = (path, mode, scale, fill, nearest, CW)
    if key in _cache:
        return _cache[key]
    bw, bh = int(CW * scale), int(H * scale)
    im = Image.open(path).convert('RGB')
    r = (min if mode == 'contain' else max)(bw * fill / im.width, bh * fill / im.height) if mode == 'contain' \
        else max(bw / im.width, bh / im.height)
    im = im.resize((max(1, int(im.width * r)), max(1, int(im.height * r))),
                   Image.NEAREST if nearest else Image.LANCZOS)
    canvas = Image.new('RGB', (bw, bh))
    canvas.paste(im, ((bw - im.width) // 2, (bh - im.height) // 2))
    arr = np.asarray(canvas).astype(np.float32)
    _cache[key] = arr
    return arr


def composite(bd_path, mask_n):
    """A mask blended over a backdrop: lighten blend inside a soft oval, backdrop dimmed."""
    key = ('comp', bd_path, mask_n, CW)
    if key in _cache:
        return _cache[key]
    b = base(bd_path, 'cover') * 0.7
    m = base(IMG[mask_n], 'contain', fill=0.8, nearest=(mask_n == 3))
    hh, ww = m.shape[:2]
    yy, xx = np.mgrid[0:hh, 0:ww]
    v = np.clip(1.25 - np.sqrt(((xx - ww / 2) / (ww * 0.42)) ** 2 + ((yy - hh / 2) / (hh * 0.48)) ** 2), 0, 1)[..., None]
    out = b * (1 - v) + np.maximum(b, m) * v
    _cache[key] = out
    return out


# ---- timelines -----------------------------------------------------------------------
def build_timeline(reel):
    seg = []  # (t0, t1, kind, frame_fn_key)
    mi = {'g1': 0, 'g2': 3, 'g3': 6}[reel]
    bds = [2, 5, 10, 4, 8, 12]
    bi = {'g1': 0, 'g2': 2, 'g3': 4}[reel]

    def mask():
        nonlocal mi
        n = MASKS[mi % len(MASKS)]
        mi += 1
        return n

    def bd():
        nonlocal bi
        k = bds[bi % len(bds)]
        bi += 1
        return k

    def show(kind, a, b, **kw):
        seg.append(dict(t0=a, t1=b, kind=kind, **kw))

    def cycle(bar_a, bar_b, mask_beats, logo_beats):
        b = bar_a * 4
        while b < bar_b * 4:
            m_end = min(b + mask_beats, bar_b * 4)
            if reel == 'g2':
                show('comp', tb(0, b), tb(0, m_end), bd=bd(), mask=mask())
            else:
                show('mask', tb(0, b), tb(0, m_end), mask=mask())
            l_end = min(m_end + logo_beats, bar_b * 4)
            if l_end > m_end:
                show('logo', tb(0, m_end), tb(0, l_end), logo=LOGO_S)
            b = l_end

    first = {'g1': LOGO_W, 'g2': None, 'g3': LOGO_S}[reel]
    if first:
        show('logo', 0.0, tb(2), logo=first, fade_in=True)
    else:
        show('bd', 0.0, tb(2), bd=5, fade_in=True)
    if reel == 'g2':
        show('bd', tb(2), tb(10), bd=5); show('bd', tb(10), tb(18), bd=8)
    else:
        cycle(2, 18, 12, 4)
    cycle(18, 51, 12 if reel != 'g3' else 8, 4)
    show('bd', tb(51), tb(56), bd=12 if reel != 'g1' else 5)
    cycle(56, 67, 8, 4)
    show('bd', tb(67), tb(75), bd={'g1': 10, 'g2': 4, 'g3': 10}[reel])
    cycle(75, 163, {'g1': 7, 'g2': 7, 'g3': 3}[reel], 1)
    show('logo' if reel != 'g2' else 'bd', tb(163), SONG + 1.0,
         logo=LOGO_D if reel == 'g1' else LOGO_S, bd=2, fade_out=True)
    return seg


TL = build_timeline(REEL)


def source_for(s):
    if s['kind'] == 'mask':
        return base(IMG[s['mask']], 'contain', nearest=(s['mask'] == 3))
    if s['kind'] == 'logo':
        return base(IMG[s['logo']], 'contain', fill=0.7 if s['logo'] == LOGO_S else 0.85)
    if s['kind'] == 'bd':
        return base(BD[s['bd']], 'cover')
    return composite(BD[s['bd']], s['mask'])


def beat_phase(t):
    i = int(np.searchsorted(TB, t, side='right')) - 1
    if i < 0:
        return 1.0, -1
    nxt = TB[i + 1] if i + 1 < len(TB) else TB[i] + BEAT
    return (t - TB[i]) / max(1e-3, nxt - TB[i]), i


def frame(song_t, rng_cache={}):
    if song_t < 0:
        return np.zeros((H, CW, 3), np.uint8)
    s = next((x for x in TL if x['t0'] <= song_t < x['t1']), TL[-1])
    src = source_for(s)
    _, energy = section_at(song_t)
    ph, bi = beat_phase(song_t)
    down = bi >= 0 and bi % 4 == 0
    seg_len = max(0.1, s['t1'] - s['t0'])
    push = 1 + 0.07 * (song_t - s['t0']) / seg_len
    pulse = math.exp(-6 * ph) if bi >= 0 else 0
    z = push * (1 + 0.05 * energy * pulse + (0.04 * energy * pulse if down else 0))
    if s['kind'] == 'logo':
        # the logo images carry wide black margins; on the narrow strip they read tiny
        z *= (1.6 if STRIP else 1.0) * (1 + 0.06 * pulse)
    bh, bw = src.shape[:2]
    cw, ch = bw / 1.18 / z, bh / 1.18 / z
    dx = dy = 0.0
    if energy >= 0.8 and bi >= 0:
        if bi not in rng_cache:
            r = random.Random(bi)
            rng_cache[bi] = (r.uniform(-1, 1), r.uniform(-1, 1))
        amp = 14 * energy * math.exp(-10 * ph) * (1.6 if down else 1.0)
        dx, dy = rng_cache[bi][0] * amp, rng_cache[bi][1] * amp
    cx, cy = bw / 2 + dx, bh / 2 + dy
    box = (cx - cw / 2, cy - ch / 2, cx + cw / 2, cy + ch / 2)
    im = Image.fromarray(src.astype(np.uint8)).resize((CW, H), Image.BILINEAR, box=box)
    f = np.asarray(im).astype(np.float32)
    # red flash on downbeats in the heavy sections
    if down and energy >= 0.8:
        a = (0.33 if energy >= 1.0 else 0.18) * math.exp(-8 * ph)
        f = f * (1 - a) + np.array([200, 0, 0], np.float32) * a
    # gentle breathing in calm sections
    if energy < 0.5:
        f *= 0.85 + 0.15 * pulse
    if s.get('fade_in'):
        f *= min(1.0, (song_t - s['t0']) / max(0.5, seg_len * 0.6))
    if s.get('fade_out'):
        f *= max(0.0, 1 - (song_t - s['t0']) / seg_len)
    return np.clip(f, 0, 255).astype(np.uint8)


total = PREROLL + SONG + 1.0
nframes = int(total * FPS)
enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS),
                        '-i', '-', '-c:v', 'libx264', '-profile:v', 'high', '-level', '4.0', '-preset', 'medium',
                        '-b:v', '2500k', '-maxrate', '3500k', '-bufsize', '5000k', '-g', str(2 * FPS), '-keyint_min', str(2 * FPS),
                        '-sc_threshold', '0', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', OUT], stdin=subprocess.PIPE)
black = np.zeros((H, W, 3), np.uint8)
for k in range(nframes):
    t = k / FPS - PREROLL
    c = frame(t)
    if STRIP:
        out = black.copy()
        x0 = (W - CW) // 2
        out[:, x0:x0 + CW] = c
    else:
        out = c
    enc.stdin.write(out.tobytes())
    if k % 1500 == 0:
        print(f'{REEL}: {k}/{nframes}', flush=True)
enc.stdin.close()
enc.wait()
json.dump({'reel': REEL, 'preroll': PREROLL, 'segments': [{k: (round(v, 3) if isinstance(v, float) else v) for k, v in s.items()} for s in TL]},
          open(OUT.replace('.mp4', '.json'), 'w'), indent=1)
print(f'{REEL}: done {OUT} ({nframes} frames, {len(TL)} segments)')
