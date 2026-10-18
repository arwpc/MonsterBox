"""Generate the Slipknot 'Virus of Life' scenes: one part scene per animatronic plus
Groundbreaker's conductor scene. Every move is placed on the song's tracked beats with
wait.untilMs (the scene clock), so nothing drifts over the five-minute song.

usage: python gen_scenes.py OUTDIR [--lag CID=ms ...]
  --lag delays a node's moves to match a measured delay before its music track sounds.
"""
import json
import os
import sys

import numpy as np

OUT = sys.argv[1]
LAG = {int(a.split('=')[0]): int(a.split('=')[1]) for a in sys.argv[2:] if '=' in a}
TB = json.load(open('beats-corrected.json'))['beats']
SONG = json.load(open('analysis.json'))['duration']
BEAT = float(np.median(np.diff(TB)))
os.makedirs(OUT, exist_ok=True)


def tb(bar, beat=0.0):
    i = 4 * bar + int(beat)
    frac = beat - int(beat)
    if i + 1 < len(TB):
        return TB[i] + frac * (TB[i + 1] - TB[i])
    return TB[-1] + (i - len(TB) + 1 + frac) * BEAT


SECTIONS = [('build', 2, 18, 'calm'), ('heavyA', 18, 51, 'heavy'), ('dip', 51, 56, 'calm'),
            ('heavyB', 56, 67, 'heavy'), ('breakdown', 67, 75, 'calm'), ('full', 75, 155, 'full'),
            ('finale', 155, 163, 'calm')]


def every(bar_a, bar_b, step_beats):
    """Beat positions (bar, beat) from bar_a to bar_b in steps of step_beats."""
    b = bar_a * 4
    while b < bar_b * 4:
        yield b
        b += step_beats


def sway(part, lo, hi, dur, calm=8, heavy=2, full=1, calm_dur=None, heavy_dur=None):
    moves, k = [], 0
    for _, a, b, kind in SECTIONS:
        st = {'calm': calm, 'heavy': heavy, 'full': full}[kind]
        d = {'calm': calm_dur or dur * 4, 'heavy': heavy_dur or dur * 1.5, 'full': dur}[kind]
        for beat in every(a, b, st):
            moves.append((tb(0, beat), {'type': 'servo', 'partId': part, 'angle': hi if k % 2 else lo, 'duration': int(d)}))
            k += 1
    return moves


def motor_sway(part, speed_full, speed_calm, ms):
    moves, k = [], 0
    for _, a, b, kind in SECTIONS:
        st = 8 if kind == 'calm' else 4
        sp = speed_calm if kind == 'calm' else speed_full
        for beat in every(a, b, st):
            moves.append((tb(0, beat), {'type': 'motor', 'partId': part, 'direction': 'reverse' if k % 2 else 'forward',
                                        'speed': sp, 'duration': ms}))
            k += 1
    if k % 2:  # end where it started
        moves.append((tb(163), {'type': 'motor', 'partId': part, 'direction': 'reverse', 'speed': speed_calm, 'duration': ms}))
    return moves


DROPS = (18, 56, 75, 155)


def parts():
    P = {}
    # Sir Dragomir: head-bang inside the 372-406 neck hazard window, box lid on downbeats
    m = sway('1', 380, 398, 280, calm=8, heavy=2, full=1, calm_dur=1400, heavy_dur=380)
    for beat in every(75, 155, 4):
        m.append((tb(0, beat), {'type': 'servo', 'partId': '3', 'angle': 42, 'duration': 150}))
        m.append((tb(0, beat + 1), {'type': 'servo', 'partId': '3', 'angle': 20, 'duration': 200}))
    m.append((tb(163), {'type': 'servo', 'partId': '1', 'angle': 389, 'duration': 1500}))
    m.append((tb(163), {'type': 'servo', 'partId': '3', 'angle': 20, 'duration': 400}))
    P[4] = ('Sir Dragomir', 'dragomir', True, m)

    # Orlok: head sway, right arm up at each drop, Hand of Azura strobing in the full section
    m = sway('15', 80, 100, 300, calm_dur=1500, heavy_dur=420)
    for d in DROPS:
        m.append((tb(d), {'type': 'linear-actuator', 'partId': '1', 'direction': 'extend', 'speed': 50, 'duration': 1500}))
        m.append((tb(d + 6), {'type': 'linear-actuator', 'partId': '1', 'direction': 'retract', 'speed': 50, 'duration': 2200}))
    m.append((tb(67), {'type': 'light', 'partId': '8', 'state': 'on'}))
    for beat in every(75, 155, 4):
        m.append((tb(0, beat), {'type': 'light', 'partId': '8', 'state': 'on'}))
        m.append((tb(0, beat + 2), {'type': 'light', 'partId': '8', 'state': 'off'}))
    m.append((tb(155), {'type': 'light', 'partId': '8', 'state': 'on'}))
    m.append((tb(163), {'type': 'light', 'partId': '8', 'state': 'off'}))
    m.append((tb(163), {'type': 'servo', 'partId': '15', 'angle': 90, 'duration': 1500}))
    P[3] = ('Orlok', 'orlok', True, m)

    # Mina: neck sway, eyes look around, coffin door shuts for the breakdown and bursts open at the drop
    m = sway('2', 72, 108, 300, calm_dur=1500, heavy_dur=420)
    m += sway('3', 58, 120, 200, calm=8, heavy=4, full=4, calm_dur=900, heavy_dur=300)
    m.append((tb(67), {'type': 'linear-actuator', 'partId': '4', 'direction': 'retract', 'speed': 95, 'duration': 2500}))
    m.append((tb(75), {'type': 'linear-actuator', 'partId': '4', 'direction': 'extend', 'speed': 95, 'duration': 3500}))
    m.append((tb(18), {'type': 'light', 'partId': '5', 'state': 'on'}))
    m.append((tb(75), {'type': 'light', 'partId': '10', 'state': 'on'}))
    m.append((tb(163), {'type': 'light', 'partId': '10', 'state': 'off'}))
    m.append((tb(163), {'type': 'light', 'partId': '5', 'state': 'off'}))
    m.append((tb(163), {'type': 'servo', 'partId': '2', 'angle': 90, 'duration': 1500}))
    m.append((tb(163), {'type': 'servo', 'partId': '3', 'angle': 89, 'duration': 800}))
    P[2] = ('Mina', 'mina', True, m)

    # PumpkinHead: forward/back sway on the bars, never above 40% (60% browns out his Pi)
    P[1] = ('PumpkinHead', 'pumpkinhead', False, motor_sway('1', 40, 30, 450))

    # Renfield: scribbling in time, a shake (forward only: his reverse half-bridge is dead) at every drop
    m = sway('7', 60, 125, 150, calm=4, heavy=2, full=1, calm_dur=300, heavy_dur=200)
    for d in DROPS:
        m.append((tb(d), {'type': 'motor', 'partId': '1', 'direction': 'forward', 'speed': 70, 'duration': 500}))
    m.append((tb(163), {'type': 'servo', 'partId': '7', 'angle': 90, 'duration': 300}))
    P[6] = ('Renfield', 'renfield', False, m)
    return P


def part_scene(cid, name, slug, jaw, moves):
    lag = LAG.get(cid, 0)
    steps = [{'type': 'audio', 'audioId': f'slipknot-part-{slug}.mp3', 'volume': 100, 'jawSync': jaw, 'concurrent': True}]
    for t, step in sorted(moves, key=lambda m: m[0]):
        steps.append({'type': 'wait', 'untilMs': int(round(t * 1000)) + lag})
        steps.append(dict(step, concurrent=True))
    steps.append({'type': 'wait', 'untilMs': int(round(SONG * 1000)) + lag + 500})
    return {'name': f'Slipknot: {name} part', 'tags': ['slipknot', 'fleet-part'],
            'description': f"{name}'s part in Groundbreaker's 'Virus of Life' show: their own beat-locked vocal track "
                           f"(wordless notes in D minor and whispers) plus {len(moves)} moves on the song's tracked beats "
                           f"(wait.untilMs, scene clock). Started by Groundbreaker's conductor scene; not for solo play.",
            'steps': steps}


LINES = {
    'intro': "[excited] Groundbreaker LOVE Slipknot! They from IOWA, like Groundbreaker's dirt! Cover your ears, friends... Groundbreaker turn it UP!",
    'apology': "[sheepish] Oops. Was that too loud? Groundbreaker sorry. Iowa make Groundbreaker very excited.",
    'complaints': [
        ('PumpkinHead', "[growls] My stalks are still ringing, dirt-boy."),
        ('Mina', "[sighs softly] I was dreaming, Groundbreaker. Now I am only... ringing."),
        ('Renfield', "[frantic] A noise complaint! Filed in triplicate! The Master shall hear of this!"),
        ('Sir Dragomir', "[stern] Five centuries on watch, and never such a din."),
        ('Orlok', "[cold, slow] Never again, Groundbreaker."),
    ]}


def conductor(scene_ids):
    PREROLL_WAIT = 1500  # video pre-roll (3 s) minus the Goblin cast settling time (~1.5 s); tune at rehearsal
    s = [{'type': 'fleet-mode', 'mode': 'hold', 'node': 'all', 'maxMs': 900000, 'reason': 'Slipknot: Virus of Life'},
         {'type': 'sayThis', 'text': LINES['intro']},
         {'type': 'goblin-video', 'goblinName': 'Goblin 1', 'videoId': 'slipknot-g1.mp4', 'concurrent': True},
         {'type': 'goblin-video', 'goblinName': 'Goblin 2', 'videoId': 'slipknot-g2.mp4', 'concurrent': True},
         {'type': 'goblin-video', 'goblinName': 'Goblin 3', 'videoId': 'slipknot-g3.mp4'},
         {'type': 'wait', 'duration': PREROLL_WAIT}]
    for node, sid in scene_ids.items():
        s.append({'type': 'fleet-scene', 'node': node, 'scene': sid, 'wait': False, 'concurrent': True})
    s += [{'type': 'audio', 'audioId': 'slipknot-groundbreaker-virus-of-life.mp3', 'volume': 100, 'jawSync': False},
          {'type': 'wait', 'duration': 1200},
          {'type': 'sayThis', 'text': LINES['apology']}]
    for node, text in LINES['complaints']:
        s.append({'type': 'fleet-say', 'node': node, 'text': text, 'wait': True})
        s.append({'type': 'wait', 'duration': 400})
    s.append({'type': 'fleet-mode', 'mode': 'release', 'node': 'all', 'reason': 'Slipknot: Virus of Life finished'})
    return {'name': 'Slipknot: Virus of Life', 'tags': ['slipknot', 'fleet-show'],
            'description': "Groundbreaker loves Slipknot (they're from Iowa): he plays 'Virus of Life' loud with deep bass "
                           "while every animatronic sings wordless notes or whispers in time and moves on the beat, and "
                           "Goblins 1-3 run beat-cut mask videos. Then he apologizes and everyone complains, Orlok last.",
            'steps': s}


if __name__ == '__main__':
    P = parts()
    for cid, (name, slug, jaw, moves) in P.items():
        sc = part_scene(cid, name, slug, jaw, moves)
        json.dump(sc, open(f'{OUT}/part-{cid}.json', 'w'), indent=1)
        print(f'part {cid} {name}: {len(moves)} moves, {len(sc["steps"])} steps')
    ids = json.load(open('scene-ids.json')) if os.path.exists('scene-ids.json') else \
        {'PumpkinHead': 'Slipknot: PumpkinHead part', 'Mina': 'Slipknot: Mina part', 'Orlok': 'Slipknot: Orlok part',
         'Sir Dragomir': 'Slipknot: Sir Dragomir part', 'Renfield': 'Slipknot: Renfield part'}
    json.dump(conductor(ids), open(f'{OUT}/conductor-5.json', 'w'), indent=1)
    print('conductor written; complaint lines:', [n for n, _ in LINES['complaints']])
