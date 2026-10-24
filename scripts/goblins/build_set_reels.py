"""Build the coordinated Goblin reels: one file per Goblin, the same sets in the same order,
every set exactly `setSeconds` long on every reel, so the windows show one subject together.

usage: python3 scripts/goblins/build_set_reels.py SOURCE_DIR OUT_DIR [--plan PLAN] [--metrics METRICS]
  SOURCE_DIR  the 72 original Goblin clips (Orlok/Alpha: goblin-reels/source)
  OUT_DIR     where the four reels and their manifests land

Per slot: the clip's active span (black lead-in/out cut with blackdetect), looped to fill the slot,
framed for its window (full, or a 9:16 strip around the measured subject for the roof window), faded
in and out, encoded to the Pi 3B spec scripts/goblins/build-reels.mjs uses (1280x720 H.264 High@4.0,
30 fps CFR, ~2.5 Mbit/s, 2 s GOP, no audio). Slots are then joined by stream copy. A slot is a fixed
number of frames, so every reel is exactly sets x setSeconds and the reels cannot drift apart in content.
"""
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SOURCE, OUT = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2])


def arg(name, default):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


PLAN = json.load(open(arg('--plan', f'{REPO}/scripts/goblins/set-plan.json')))
METRICS_PATH = arg('--metrics', os.path.join(os.path.dirname(SOURCE), 'clip-metrics.json'))
METRICS = {c['filename']: c for c in json.load(open(METRICS_PATH))['clips']} if os.path.exists(METRICS_PATH) else {}
W, H, FPS = 1280, 720, 30
SLOT = float(PLAN['setSeconds'])
FRAMES = int(round(SLOT * FPS))
FADE_FRAMES = 15
ENC = ['-c:v', 'libx264', '-profile:v', 'high', '-level', '4.0', '-preset', 'medium', '-b:v', '2500k',
       '-maxrate', '3500k', '-bufsize', '5000k', '-g', str(2 * FPS), '-keyint_min', str(2 * FPS),
       '-sc_threshold', '0', '-pix_fmt', 'yuv420p', '-r', str(FPS), '-an']


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True, check=True)


def probe(path):
    out = run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration',
               '-of', 'json', path]).stdout
    j = json.loads(out)
    return j['streams'][0]['width'], j['streams'][0]['height'], float(j['format']['duration'])


def active_span(path, duration):
    """First non-black frame to the last one: the window-ghost clips open and close on long black."""
    err = subprocess.run(['ffmpeg', '-v', 'info', '-i', path, '-vf', 'blackdetect=d=0.3:pix_th=0.08', '-an', '-f', 'null', '-'],
                         capture_output=True, text=True).stderr
    blacks = [(float(a), float(b)) for a, b in re.findall(r'black_start:([\d.]+) black_end:([\d.]+)', err)]
    start, end = 0.0, duration
    if blacks and blacks[0][0] < 0.2:
        start = blacks[0][1]
    if blacks and blacks[-1][1] > duration - 0.2:
        end = blacks[-1][0]
    if end - start < 1.0:  # all black by the detector's measure: keep the whole clip
        start, end = 0.0, duration
    return round(start, 2), round(min(end, start + SLOT), 2)


def frame_filter(reel, clip, w, h):
    if reel['mode'] == 'center-strip':
        cw = int(round(h * float(reel.get('stripAspect', 0.5625))))
        cw = min(cw, w)
        fx = float(METRICS.get(clip, {}).get('focusX') or 0.5)
        x = int(min(max(fx * w - cw / 2, 0), w - cw))
        return (f'crop={cw}:{h}:{x}:0,scale=-2:{H}:flags=lanczos,'
                f'pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:black,setsar=1')
    return (f'scale={W}:{H}:force_original_aspect_ratio=decrease:flags=lanczos,'
            f'pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:black,setsar=1')


def render_slot(key, reel, index, clip, tmp):
    src = os.path.join(SOURCE, clip)
    w, h, dur = probe(src)
    s0, s1 = active_span(src, dur)
    span = os.path.join(tmp, f'{key}-{index:02d}-span.mp4')
    run(['ffmpeg', '-v', 'error', '-y', '-ss', str(s0), '-t', str(s1 - s0), '-i', src, '-an',
         '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '12', '-pix_fmt', 'yuv420p', span])
    out = os.path.join(tmp, f'{key}-{index:02d}.mp4')
    vf = (frame_filter(reel, clip, w, h) + f',fps={FPS},'
          f'fade=t=in:s=0:n={FADE_FRAMES},fade=t=out:s={FRAMES - FADE_FRAMES}:n={FADE_FRAMES}')
    run(['ffmpeg', '-v', 'error', '-y', '-stream_loop', '-1', '-i', span, '-vf', vf, '-frames:v', str(FRAMES)] + ENC + [out])
    return dict(index=index, clip=clip, activeIn=s0, activeOut=s1, loops=round(SLOT / max(0.1, s1 - s0), 2), file=out)


def build_reel(key):
    reel = PLAN['reels'][key]
    with tempfile.TemporaryDirectory(dir=OUT) as tmp:
        slots = [render_slot(key, reel, i, st[key], tmp) for i, st in enumerate(PLAN['sets'])]
        listing = os.path.join(tmp, 'list.txt')
        with open(listing, 'w') as f:
            for s in slots:
                f.write(f"file '{s['file']}'\n")
        path = os.path.join(OUT, reel['file'])
        run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', listing, '-c', 'copy',
             '-movflags', '+faststart', path])
    _, _, total = probe(path)
    sha = hashlib.sha256(open(path, 'rb').read()).hexdigest()
    manifest = dict(name=reel['file'], goblin=reel['goblin'], mode=reel['mode'], setSeconds=SLOT, duration=round(total, 3),
                    bytes=os.path.getsize(path), sha256=sha,
                    sets=[dict(name=st['name'], at=round(i * SLOT, 1), **{k: v for k, v in s.items() if k != 'file'})
                          for i, (st, s) in enumerate(zip(PLAN['sets'], slots))])
    json.dump(manifest, open(path.replace('.mp4', '.json'), 'w'), indent=1)
    return key, total


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    missing = sorted({st[k] for st in PLAN['sets'] for k in PLAN['reels'] if not os.path.exists(os.path.join(SOURCE, st[k]))})
    if missing:
        sys.exit(f'missing source clips: {missing}')
    only = arg('--only', None)
    keys = [only] if only else list(PLAN['reels'])
    with ThreadPoolExecutor(max_workers=len(keys)) as pool:
        for key, total in pool.map(build_reel, keys):
            print(f'{key}: {PLAN["reels"][key]["file"]} {total:.2f} s ({len(PLAN["sets"])} sets x {SLOT:.0f} s)', flush=True)
