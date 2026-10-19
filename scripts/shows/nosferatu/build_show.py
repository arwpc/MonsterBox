"""Build the Nosferatu tribute's timeline and audio: one voice part per animatronic and
Groundbreaker's score (three act cues, the SFX and a wind bed, ducked under every line).

usage: python build_show.py SHOW_DIR
Reads SHOW_DIR/script.json, voices/*.mp3 + durations.json, music/<pick>.mp3, sfx/*.mp3.
Writes SHOW_DIR/timeline.json, audio/nosferatu-part-<slug>.mp3,
audio/nosferatu-groundbreaker-score.mp3 and work/preview-mix.mp3 (everything summed).

All parts start together, so a line can only land where the timeline put it. Each act's cue
is time-stretched so its swell lands on a chosen line (ANCHORS), never past 0.75-1.35x.
"""
import json
import os
import subprocess
import sys

import numpy as np

SHOW = os.path.abspath(sys.argv[1])
SR = 44100
SLUG = {1: 'pumpkinhead', 2: 'mina', 3: 'orlok', 4: 'dragomir', 6: 'renfield'}
# Each act's score is one or two cue segments (picked by loudness shape, see README).
# align=(cue seconds, line id): that moment of the cue lands on the line; the part of the cue
# before the act starts is dropped. after=True: the segment starts 4 s before the previous one
# ends and is stretched (ratio=None) to run to the act's end. Joins crossfade over 4 s.
MUSIC = {
    1: [dict(cue='act1-4', ratio=1.35, align=(75.0, 'o6')),                    # the build peaks into the monologue
        dict(cue='act1-2', lead=True, gain_db=-3)],                             # a quiet bed from the first word until it
    2: [dict(cue='act2-3', ratio=1.2, src=(0, 62), align=(60.0, 'k4')),       # the storm ends as the ship runs aground
        dict(cue='act2-2', ratio=None, after=True)],                            # then a slow build under the plague town
    3: [dict(cue='act3-1', ratio=1.05, align=(118.0, 'k9')),                    # the swell lands on the Knight's "the sun is coming"
        dict(cue='act3-4', ratio=None, src=(118, 150), after=True)]}           # and a quiet tail for the farewell
# lead=True: fills the act from its start until the anchored segment, crossfading into it
XF = 4.0
ACT_TITLE_S = 5.0     # title card and music alone before an act's first line
ACT_TAIL_S = 4.0      # after an act's last line, before the next act starts
OPEN_S = 3.0          # wind, thunder and wolves before the Knight's first word (v3: shorter opening)
# key: (lead s reserved before the next line, seconds played, gain dB, offset s after the line ends)
SFX = {
    'wolves': (4.0, 9.0, -4, 0.0), 'coach': (4.0, 8.0, -5, 1.0), 'door': (2.5, 6.0, -3, 0.0),
    'fire': (1.0, 18.0, -13, 0.0), 'heartbeat': (2.0, 8.0, -6, 0.0), 'sea': (4.0, 20.0, -8, 0.0),
    'rats': (2.0, 7.0, -9, 1.5), 'shipbell': (3.0, 8.0, -6, 0.0), 'bells': (3.0, 12.0, -6, 0.0),
    'pump': (2.5, 7.0, -6, 0.0), 'vines': (2.5, 10.0, -5, 0.0), 'dig': (3.0, 7.0, -6, 0.0),
    'clock': (6.0, 14.0, -5, 0.0), 'rooster': (3.0, 6.0, -3, 0.0), 'dawn': (4.0, 10.0, -3, 0.0),
    'thunder': (0.0, 8.0, -4, 0.0)}
BEDS = {'fire', 'sea'}  # long beds duck under speech like the music


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


# ---- timeline -------------------------------------------------------------------------
script = json.load(open(f'{SHOW}/script.json'))
dur = json.load(open(f'{SHOW}/voices/durations.json'))
lines, sfx, acts = [], [], []
t = 0.0
for act in script['acts']:
    a0 = t
    t += OPEN_S if act['act'] == 1 else ACT_TITLE_S
    if act['act'] == 1:
        sfx += [dict(key='thunder', start=0.5), dict(key='wolves', start=2.0)]
    for ln in act['lines']:
        d = dur[ln['id']]
        lines.append(dict(id=ln['id'], cid=ln['cid'], act=act['act'], start=round(t, 3), dur=d, end=round(t + d, 3)))
        t += d
        gap = ln.get('gapAfter', 1.0)
        for k in ln.get('sfx', []):
            lead, play, gain, off = SFX[k]
            sfx.append(dict(key=k, start=round(t + off, 3)))
            gap = max(gap, lead)
        if ln['id'] == 'o6':  # the monologue ends on thunder under the wolves
            sfx.append(dict(key='thunder', start=round(t + 0.3, 3)))
        t += gap
    t += ACT_TAIL_S
    acts.append(dict(act=act['act'], title=act['title'], start=round(a0, 3), end=round(t, 3)))
TOTAL = t + 2.0
line_at = {ln['id']: ln for ln in lines}

# ---- music: stretch each cue so its anchor lands on its line ---------------------------
os.makedirs(f'{SHOW}/audio', exist_ok=True)
os.makedirs(f'{SHOW}/work', exist_ok=True)
N = int(TOTAL * SR) + SR
score = np.zeros((N, 2), np.float32)
speech = np.zeros(N, np.float32)  # 1 while anyone is speaking, smoothed into a duck envelope
for ln in lines:
    speech[int(ln['start'] * SR):int((ln['end'] + 0.25) * SR)] = 1.0
k = int(0.35 * SR)
duck = np.convolve(speech, np.ones(k) / k, mode='same')  # 350 ms ramps

for a in acts:
    a['music'] = []
    prev_end = None
    has_lead = any(sg.get('lead') for sg in MUSIC[a['act']])
    for sg in MUSIC[a['act']]:
        if sg.get('lead'):
            continue  # placed once the anchored segment's start is known, below
        s0, s1 = sg.get('src', (0, None))
        if sg.get('after'):
            start = prev_end - XF
            if sg['ratio'] is None:
                srclen = (s1 or 1e9) - s0
                full = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0',
                                             f"{SHOW}/music/{sg['cue']}.mp3"], capture_output=True, text=True).stdout)
                srclen = min(srclen, full - s0)
                ratio = float(np.clip((a['end'] + 3.0 - start) / srclen, 0.75, 1.35))
            else:
                ratio = sg['ratio']
        else:
            ratio = sg['ratio']
            cue_t, lid = sg['align']
            start = line_at[lid]['start'] - (cue_t - s0) * ratio
        af = f"atrim={s0}" + (f":{s1}" if s1 else '') + f",asetpts=PTS-STARTPTS,rubberband=tempo={1 / ratio:.5f}"
        m = load(f"{SHOW}/music/{sg['cue']}.mp3", af=af)
        m *= db(-16) / rms(m)
        if start < a['start']:  # drop what would play before the act begins
            m = m[int((a['start'] - start) * SR):]
            start = a['start']
        stop = a['end'] + 3.0
        if start + len(m) / SR > stop:
            m = m[:int((stop - start) * SR)]
        last = sg is [x for x in MUSIC[a['act']] if not x.get('lead')][-1]
        m = fade(m, XF if (prev_end is not None or has_lead) else 0.5, 3.0 if last else XF)
        i0 = int(start * SR)
        seg = m * (1 - 0.65 * duck[i0:i0 + len(m)])[:len(m), None]  # about -9 dB under speech
        put(score, start, seg)
        prev_end = start + len(m) / SR
        a['music'].append(dict(cue=sg['cue'], ratio=round(ratio, 3), start=round(start, 2), end=round(prev_end, 2)))
    for sg in [x for x in MUSIC[a['act']] if x.get('lead')]:
        main_start = a['music'][0]['start']
        if main_start - a['start'] < 2.0:
            continue
        length = main_start + XF - a['start']
        m = load(f"{SHOW}/music/{sg['cue']}.mp3", af=f"atrim=0:{length:.2f},asetpts=PTS-STARTPTS")
        m *= db(-16 + sg.get('gain_db', 0)) / rms(m)
        m = fade(m, 0.5, XF)
        i0 = int(a['start'] * SR)
        put(score, a['start'], m * (1 - 0.65 * duck[i0:i0 + len(m)])[:len(m), None])
        a['music'].insert(0, dict(cue=sg['cue'], lead=True, start=round(a['start'], 2), end=round(a['start'] + len(m) / SR, 2)))

# wind under the whole show, looped with a crossfade, ducked further under speech
w = load(f'{SHOW}/sfx/wind.mp3')
w *= db(-30) / rms(w)
xf = int(2 * SR)
loop = np.zeros((N, 2), np.float32)
pos = 0
while pos < N:
    seg = w.copy()
    seg[:xf] *= np.linspace(0, 1, xf)[:, None]
    seg[-xf:] *= np.linspace(1, 0, xf)[:, None]
    n = min(len(seg), N - pos)
    loop[pos:pos + n] += seg[:n]
    pos += len(seg) - xf
score += loop * (1 - 0.5 * duck)[:, None]

for s in sfx:
    lead, play, gain, off = SFX[s['key']]
    x = load(f"{SHOW}/sfx/{s['key']}.mp3")[:int(play * SR)]
    x = fade(x * (db(-14) / rms(x)), 0.05, 1.5)
    if s['key'] in BEDS:
        i0 = int(s['start'] * SR)
        x = x * (1 - 0.5 * duck[i0:i0 + len(x)])[:len(x), None]
    put(score, s['start'], x, db(gain))
    s['play'] = play

# ---- parts ------------------------------------------------------------------------------
parts = {cid: np.zeros((N, 1), np.float32) for cid in SLUG}
for ln in lines:
    v = load(f"{SHOW}/voices/{ln['id']}.mp3", ch=1)
    put(parts[ln['cid']], ln['start'], v * (db(-18) / rms(v)))


def write(path, x, br, gain_db=0.0):
    """Float buffer to mp3 through a limiter, so an SFX hit can be loud without clipping."""
    raw = (x * db(gain_db)).astype(np.float32).tobytes()
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', str(x.shape[1]), '-i', '-',
                    '-af', 'alimiter=limit=0.8:level=disabled', '-b:a', br, path], input=raw, check=True)


for cid, slug in SLUG.items():
    write(f'{SHOW}/audio/nosferatu-part-{slug}.mp3', parts[cid], '128k')
write(f'{SHOW}/audio/nosferatu-groundbreaker-score.mp3', score, '256k', gain_db=-1)
mix = score * db(-4) + np.repeat(sum(parts.values()), 2, axis=1)
write(f'{SHOW}/work/preview-mix.mp3', mix, '192k')

json.dump(dict(total=round(TOTAL, 3), acts=acts, lines=lines, sfx=sfx), open(f'{SHOW}/timeline.json', 'w'), indent=1)
print(f'show {TOTAL:.1f} s ({TOTAL / 60:.1f} min), {len(lines)} lines, {len(sfx)} sfx')
for a in acts:
    print(f"  Act {a['act']} {a['title']}: {a['start']:.1f}-{a['end']:.1f} s, music {a['music']}")
