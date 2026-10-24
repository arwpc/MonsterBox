"""Fleet show engine, pictures: one Goblin reel for a show, frame by frame on its timeline.

usage: python video.py SHOW_DIR g1|g2|g3 OUT.mp4 [--stills t1,t2,...]
Each line cues a picture (show.json `shots`); every Goblin shows a different take of the same moment.
images/<key>-<take>.png, `takes` says how many takes each key has. `look` names which keys are candle-lit
(indoor), foggy, warm (not desaturated) or stormy (lightning flashes); `burst` lights a gold flash on a line.
Titles: show.json `title`/`subtitle` (the strip uses `stripTitle`), and an act card per act when there is
more than one. Generalised from scripts/shows/nosferatu/render_video.py (same look, same encode: mirrored
for the screens seen through the windows, Goblin 1 lifted).
"""
import json
import math
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

SHOW, REEL, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
W, H, FPS = 1280, 720, 30
PREROLL = 3.0
XF = 1.2  # crossfade seconds
STRIP = REEL == 'g3'
# Operator 2026-10-18: the Goblins' screens are seen through the windows from outside, so every
# reel reads mirror-reversed; flip on encode so the titles read the right way round.
MIRROR = True
# Goblin 1 (the showcase screen) was "barely visible" at night: lift it on encode.
GRADE = {'g1': "curves=all='0/0 0.12/0.32 0.40/0.72 1/1',eq=saturation=1.2"}  # lifts shadows, keeps black
VF = ','.join(f for f in (('hflip' if MIRROR else ''), GRADE.get(REEL, '')) if f)
CW = 406 if STRIP else W
TL = json.load(open(f'{SHOW}/timeline.json'))
CFG = json.load(open(f'{SHOW}/show.json'))
TOTAL = TL['total']
LINE = {ln['id']: ln for ln in TL['lines']}
ACTS = TL['acts']

# which picture each line cues (held until the next cue)
def _when(v):
    if isinstance(v, str) and v.startswith('act:'):
        return ACTS[int(v[4:]) - 1]['start']
    return v


SHOTS = [(k, _when(v)) for k, v in CFG['shots']]
TAKES = {'g1': [1, 3], 'g2': [2, 1], 'g3': [3, 2]}[REEL]  # a long shot changes take halfway
AVAIL = {k: list(range(1, n + 1)) for k, n in CFG.get('takes', {}).items()}
LOOK = CFG.get('look', {})
INDOOR, FOGGY, WARM, STORMY = (set(LOOK.get(x, [])) for x in ('indoor', 'foggy', 'warm', 'storm'))


def at(v):
    return LINE[v]['start'] if isinstance(v, str) else float(v)


def build_shots():
    raw = [(k, at(v)) for k, v in SHOTS] + [(None, TOTAL)]
    shots, n = [], 0
    for (k, t0), (_, t1) in zip(raw, raw[1:]):
        avail = AVAIL.get(k, [1, 2, 3])
        halves = [(t0, t1)] if t1 - t0 < 24 else [(t0, (t0 + t1) / 2), ((t0 + t1) / 2, t1)]
        for j, (a, b) in enumerate(halves):
            take = avail[(TAKES[j] - 1 + (REEL == 'g2' and k in AVAIL)) % len(avail)]
            shots.append(dict(key=k, take=take, t0=a, t1=b, dir=1 if n % 2 == 0 else -1))
            n += 1
    return shots


SH = build_shots()
_img = {}


def img(key, take):
    p = f'{SHOW}/images/{key}-{take}.png'
    if p not in _img:
        _img[p] = Image.open(p).convert('RGB').resize((W, H), Image.LANCZOS)
    return _img[p]


def view(s, t):
    """The shot at time t: a slow push-in (the weed grows), panned across on the strip."""
    p = min(1.0, max(0.0, (t - s['t0']) / max(1.0, s['t1'] - s['t0'] + XF)))
    push = 0.25 if s['key'] == 'weed' else 0.09
    z = 1.0 + push * p
    h = H / z
    w = h * CW / H
    if STRIP:
        cx = W / 2 + s['dir'] * (W / 2 - w / 2) * (0.6 * p - 0.3) * 1.6
    else:
        cx = W / 2 + s['dir'] * 0.03 * W * p
    cy = H / 2 - 0.02 * H * p
    cx = min(max(cx, w / 2), W - w / 2)
    box = (cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2)
    return np.asarray(img(s['key'], s['take']).resize((CW, H), Image.BILINEAR, box=box)).astype(np.float32)


# ---- effects -------------------------------------------------------------------------
rng = np.random.default_rng(7)
GRAIN = [rng.normal(0, 7, (H, CW, 1)).astype(np.float32) for _ in range(10)]
yy, xx = np.mgrid[0:H, 0:CW]
VIGNETTE = (1.0 - 0.55 * np.clip(np.sqrt(((xx - CW / 2) / (CW * 0.62)) ** 2 + ((yy - H / 2) / (H * 0.62)) ** 2) - 0.35, 0, 1) ** 1.5)[..., None].astype(np.float32)


def fog_texture():
    """Soft drifting fog: two octaves of smooth noise, blurred, three frames wide to scroll."""
    from PIL import ImageFilter
    acc = np.zeros((H, CW * 3), np.float32)
    for cells, wgt in ((6, 0.65), (14, 0.35)):
        small = rng.random((cells, int(cells * CW * 3 / H) + 1)).astype(np.float32)
        im = Image.fromarray((small * 255).astype(np.uint8)).resize((CW * 3, H), Image.BICUBIC)
        acc += wgt * np.asarray(im.filter(ImageFilter.GaussianBlur(H / cells / 2))).astype(np.float32) / 255.0
    acc = np.clip((acc - acc.mean()) * 2.2 + 0.5, 0, 1)
    acc *= np.linspace(0.6, 1.0, H)[:, None]  # heavier near the ground
    return acc[..., None]


FOG = fog_texture()
THUNDER = [s['start'] for s in TL['sfx'] if s['key'] == 'thunder']
HEART = [s['start'] for s in TL['sfx'] if s['key'] == 'heartbeat']
BURST = CFG.get('burst')  # {"key": "<shot key>", "at": "<line id>"}: a gold flash as that line starts
DAWN_T = LINE[BURST['at']]['start'] if BURST else -1e9
# lightning in the stormy shots, deterministic
STORM = sorted(THUNDER + [t for t in np.arange(4, TOTAL, 1.0) if rng.random() < 0.05])


def lightning(t, key):
    if key not in STORMY:
        return 0.0
    f = 0.0
    for t0 in STORM:
        d = t - t0
        if 0 <= d < 0.6:
            f = max(f, math.exp(-d * 14) + 0.7 * (d > 0.12) * math.exp(-(d - 0.12) * 10))
    return min(f, 1.2)


def flicker(t):
    return 1.0 + 0.05 * math.sin(t * 7.1) * math.sin(t * 2.3 + 1) + 0.03 * math.sin(t * 13.7)


def heartbeat(t):
    for t0 in HEART:
        d = t - t0
        if 0 <= d < 8:
            ph = (d / max(0.55, 0.95 - d * 0.05)) % 1.0
            return math.exp(-ph * 9) + 0.5 * math.exp(-max(0, ph - 0.18) * 11) * (ph > 0.18)
    return 0.0


def grade(f, key, t):
    if key in WARM:
        return f
    g = f.mean(axis=2, keepdims=True)
    f = f * 0.72 + g * 0.28  # a little desaturated, an old print
    return f * np.array([0.97, 1.0, 1.05], np.float32)  # cool night


# ---- titles ----------------------------------------------------------------------------
SERIF = '/usr/share/fonts/opentype/urw-base35/C059-Roman.otf'
ITALIC = '/usr/share/fonts/opentype/urw-base35/C059-Italic.otf'


def title_layer(big, small, big_size, small_size):
    lay = Image.new('RGBA', (CW, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    lines_b = big.split('\n')
    while big_size > 24:  # shrink a long title until every line fits the frame with a margin
        fb = ImageFont.truetype(SERIF, big_size)
        if max(d.textbbox((0, 0), s, font=fb)[2] for s in lines_b) <= CW * 0.9:
            break
        big_size -= 4
    fs = ImageFont.truetype(ITALIC, small_size)
    hb = [d.textbbox((0, 0), s, font=fb) for s in lines_b]
    tot = sum(b[3] - b[1] + 12 for b in hb) + (small_size + 24 if small else 0)
    y = H / 2 - tot / 2
    for s, b in zip(lines_b, hb):
        x = CW / 2 - (b[2] - b[0]) / 2
        for dx, dy in ((3, 3), (0, 0)):
            d.text((x + dx, y + dy), s, font=fb, fill=(0, 0, 0, 200) if dx else (238, 228, 205, 255))
        y += b[3] - b[1] + 12
    if small:
        for s in small.split('\n'):
            b = d.textbbox((0, 0), s, font=fs)
            x = CW / 2 - (b[2] - b[0]) / 2
            d.text((x + 2, y + 18), s, font=fs, fill=(0, 0, 0, 200))
            d.text((x, y + 16), s, font=fs, fill=(205, 190, 160, 255))
            y += small_size + 8
    a = np.asarray(lay).astype(np.float32)
    return a[..., :3], a[..., 3:] / 255.0


ROMAN = {1: 'I', 2: 'II', 3: 'III', 4: 'IV'}
MAIN = (CFG.get('stripTitle') if STRIP else None) or CFG['title'].upper()
SUB = CFG.get('subtitle', '')
TITLE_S = float(CFG.get('titleSeconds', 5.0))
TITLES = [(0.0, TITLE_S, title_layer(MAIN, SUB.replace(' ', '\n') if STRIP else SUB, 96 if STRIP else 130, 30 if STRIP else 40))]
if len(ACTS) > 1:
    TITLES += [(a['start'] + (TITLE_S if a['act'] == ACTS[0]['act'] else 0.0), a['start'] + (TITLE_S + 4.5 if a['act'] == ACTS[0]['act'] else 4.5),
                title_layer(f"PART {ROMAN.get(n + 1, n + 1)}", a['title'], 72 if STRIP else 110, 34 if STRIP else 48))
               for n, a in enumerate(ACTS)]


def frame(t, k):
    if t < 0:
        return np.zeros((H, CW, 3), np.float32)
    i = next((n for n, s in enumerate(SH) if s['t0'] <= t < s['t1']), len(SH) - 1)
    s = SH[i]
    f = view(s, t)
    if i > 0 and t - s['t0'] < XF and SH[i - 1]['key'] is not None:
        a = (t - s['t0']) / XF
        f = view(SH[i - 1], t) * (1 - a) + f * a
    key = s['key']
    if key in INDOOR:
        f *= flicker(t)
    if key in FOGGY:
        off = int((t * 18) % (CW * 2))
        f += FOG[:, off:off + CW] * 40
    lt = lightning(t, key)
    if lt:
        f = f * (1 + 0.9 * lt) + np.array([55, 65, 95], np.float32) * lt
    hb = heartbeat(t)
    if hb:
        f *= 1 + 0.10 * hb
        f[..., 0] += 30 * hb
    f = grade(f, key, t)
    if BURST and key == BURST['key']:  # a gold burst as the line lands
        d = t - DAWN_T
        if 0 <= d < 4:
            f = f + np.array([255, 220, 150], np.float32) * (0.8 * math.exp(-d * 1.2))
    f = f * VIGNETTE + GRAIN[k % len(GRAIN)]
    for t0, t1, (rgb, al) in TITLES:
        if t0 <= t < t1:
            a = min(1.0, (t - t0) / 1.0, (t1 - t) / 1.0)
            f = f * (1 - al * a) + rgb * al * a
    if t < 1.5:
        f *= t / 1.5
    if t > TOTAL - 4:
        f *= max(0.0, (TOTAL - t) / 4)
    return f


if '--stills' in sys.argv:  # contact frames for a quick look: OUT is a .jpg
    ts = [float(x) for x in sys.argv[sys.argv.index('--stills') + 1].split(',')]
    tiles = [Image.fromarray(np.clip(frame(t, i), 0, 255).astype(np.uint8)).resize((CW // 2, H // 2)) for i, t in enumerate(ts)]
    cols = 4 if not STRIP else 8
    sheet = Image.new('RGB', (cols * (CW // 2), ((len(tiles) + cols - 1) // cols) * (H // 2)))
    for i, tile in enumerate(tiles):
        sheet.paste(tile, ((i % cols) * (CW // 2), (i // cols) * (H // 2)))
    sheet.save(OUT, quality=85)
    sys.exit(0)

total = PREROLL + TOTAL + 1.0
nframes = int(total * FPS)
enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS),
                        '-i', '-'] + (['-vf', VF] if VF else []) + ['-c:v', 'libx264', '-profile:v', 'high', '-level', '4.0', '-preset', 'medium',
                        '-b:v', '2500k', '-maxrate', '3500k', '-bufsize', '5000k', '-g', str(2 * FPS), '-keyint_min', str(2 * FPS),
                        '-sc_threshold', '0', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', OUT], stdin=subprocess.PIPE)
black = np.zeros((H, W, 3), np.uint8)
for k in range(nframes):
    t = k / FPS - PREROLL
    c = np.clip(frame(t, k), 0, 255).astype(np.uint8)
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
json.dump({'reel': REEL, 'preroll': PREROLL, 'shots': SH}, open(OUT.replace('.mp4', '.json'), 'w'), indent=1)
print(f'{REEL}: done {OUT} ({nframes} frames, {len(SH)} shots)')
