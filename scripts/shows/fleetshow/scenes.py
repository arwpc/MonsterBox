"""Fleet show engine, scenes: one part scene per animatronic (its voice track plus moves cued to the
timeline) and Groundbreaker's conductor (fleet hold, the Goblin reels, every part, the score).

usage: python scenes.py SHOW_DIR [CID=lagMs ...]

Every move is wait { untilMs } on the scene clock, so nothing drifts. The choreography is generic and
follows the script: each character moves on its own lines and reacts to the others, inside the part
windows the Nosferatu show proved (scripts/shows/nosferatu/gen_scenes.py). show.json may add `beats`:
  {"mina_door": [["<line id>", "<line id>"]]}  close Mina's coffin door at the first line, reopen at the second
  {"orlok_arm": ["<line id>", ...]}            full arm lifts on these Orlok lines (default: his long lines)
Orlok also plays the score at half volume as a second audio step (jawSync false), so his jaw follows only
his voice. Orlok's arm, head 15 and Hand 8 only: parts 2-5 are listed broken in config/physical-faults.json.
"""
import json
import os
import random
import re
import sys

SHOW = os.path.abspath(sys.argv[1])
CFG = json.load(open(f'{SHOW}/show.json'))
SLUG = CFG['slug']
LAG = {int(a.split('=')[0]): int(a.split('=')[1]) for a in sys.argv[2:] if '=' in a}
TL = json.load(open(f'{SHOW}/timeline.json'))
TOTAL = TL['total']
LINES = TL['lines']
TEXT = {ln['id']: ln['text'] for act in json.load(open(f'{SHOW}/script.json'))['acts'] for ln in act['lines']}
L = {ln['id']: ln['start'] for ln in LINES}
E = {ln['id']: ln['end'] for ln in LINES}
ACTS = TL['acts']
BEATS = CFG.get('beats', {})
OUT = f'{SHOW}/scenes'
os.makedirs(OUT, exist_ok=True)
rnd = random.Random(CFG.get('seed', 1031))
PART = {1: ('PumpkinHead', 'pumpkinhead'), 2: ('Mina', 'mina'), 3: ('Orlok', 'orlok'), 4: ('Sir Dragomir', 'dragomir'),
        5: ('Groundbreaker', 'groundbreaker'), 6: ('Renfield', 'renfield')}
JAW = {2: True, 3: True, 4: True}          # jaw-synced voices; the others drive LED eyes (ledSync)
PEN_EVERY = 0.7                            # Renfield's GPIO pen holds the line 0.4-0.6 s per stroke
ARM_UP_MS, ARM_DOWN_MS, ARM_SPEED = 4500, 5000, 90   # Orlok's arm: full travel ~5 s at 90%


def servo(part, angle, ms):
    return {'type': 'servo', 'partId': part, 'angle': angle, 'duration': int(ms)}


def act_(part, direction, ms, speed=50):
    return {'type': 'linear-actuator', 'partId': part, 'direction': direction, 'speed': speed, 'duration': int(ms)}


def light(part, on):
    return {'type': 'light', 'partId': part, 'state': 'on' if on else 'off'}


def motor(part, direction, speed, ms):
    return {'type': 'motor', 'partId': part, 'direction': direction, 'speed': speed, 'duration': int(ms)}


def lines_of(cid):
    return [ln for ln in LINES if ln['cid'] == cid]


def speaking(cid, t, pad=0.5):
    return any(ln['start'] - pad <= t <= ln['end'] + pad for ln in lines_of(cid))


def sweep(part, t0, t1, lo, hi, every, ms, k=0):
    out, t = [], t0
    while t < t1:
        out.append((t, servo(part, hi if k % 2 else lo, ms)))
        t += every
        k += 1
    return out


def frantic(lid):
    text = TEXT.get(lid, '')
    return bool(re.search(r'\[(frantic|shriek|shout|scream|cackl|manic)', text, re.I)) or text.count('!') >= 2


def arm_gestures(cues):
    out, free_at = [], -1.0
    for t, hold in sorted(cues):
        if t < free_at:
            continue
        down = t + ARM_UP_MS / 1000 + min(max(hold, 1.0), 3.0)
        out += [(t, act_('1', 'extend', ARM_UP_MS, ARM_SPEED)), (down, act_('1', 'retract', ARM_DOWN_MS, ARM_SPEED))]
        free_at = down + ARM_DOWN_MS / 1000 + 0.3
    return out


def orlok():
    m = []
    for ln in lines_of(3):
        m += sweep('15', ln['start'] + 0.2, ln['end'], 72, 108, 2.2, 1300)
        m += [(ln['start'], light('8', True)), (ln['end'] + 0.3, light('8', False))]
    t = 3.0
    while t < TOTAL - 4:
        if not speaking(3, t):
            m.append((t, servo('15', rnd.choice([70, 78, 86, 94, 102, 110]), 1800)))
        t += rnd.uniform(3.5, 5.5)
    wanted = BEATS.get('orlok_arm') or [ln['id'] for ln in lines_of(3) if ln['dur'] >= 3.5]
    m += arm_gestures([(L[i] + 0.4, max(1.0, E[i] - L[i] - ARM_UP_MS / 1000)) for i in wanted if i in L])
    m.append((TOTAL - 1.5, servo('15', 90, 1500)))
    return m


def mina():
    m = []
    t = 4.0
    while t < TOTAL - 4:
        if not any(ln['start'] - 0.5 <= t <= ln['end'] + 0.5 for ln in LINES):
            m.append((t, servo('3', rnd.choice([62, 72, 106, 116]), 450)))
            m.append((t + 1.4, servo('3', 89, 450)))
        t += rnd.uniform(5, 8)
    for ln in LINES:
        if ln['cid'] == 2:
            m += [(ln['start'], servo('2', 108, 1100)), (ln['start'] + 0.2, servo('3', 89, 350)),
                  (ln['start'], light('5', True)), (ln['end'] + 0.5, light('5', False))]
            if ln['dur'] > 2.5:
                m.append((ln['start'] + ln['dur'] / 2, servo('2', 100, 1200)))
        elif ln['cid'] == 3:
            m += [(ln['start'] + 0.2, servo('2', 96, 1400)), (ln['start'] + 0.4, servo('3', 68, 450))]
        else:
            m += [(ln['start'] + 0.3, servo('3', 118, 350)), (ln['end'] - 0.2, servo('3', 89, 450))]
    for shut, reopen in BEATS.get('mina_door', []):  # rests OPEN: close more than half, then all the way open
        m += [(L[shut], act_('4', 'retract', 9000, 95)), (max(L[reopen], L[shut] + 9.5), act_('4', 'extend', 10000, 95))]
    m.append((TOTAL - 1.0, servo('2', 90, 2000)))
    return m


def dragomir():
    m = []
    for ln in lines_of(4):
        m += sweep('1', ln['start'] + 0.2, ln['end'], 380, 398, 1.8, 1100)
        m += [(ln['start'], servo('3', 42, 250)), (ln['end'] + 0.8, servo('3', 20, 400))]
    t = 3.0
    while t < TOTAL - 4:
        if not speaking(4, t):
            m.append((t, servo('1', rnd.choice([377, 382, 386, 392, 396, 401]), 1900)))
        t += rnd.uniform(3.5, 5.5)
    m += [(TOTAL - 1.5, servo('1', 389, 1500)), (TOTAL - 1.5, servo('3', 20, 400))]
    return m


def renfield():
    m = []
    for ln in lines_of(6):
        m += sweep('7', ln['start'], ln['end'], 60, 125, PEN_EVERY, 250)
        if frantic(ln['id']):
            t = ln['start']
            while t < ln['end'] - 0.3:
                m.append((t, motor('1', 'forward', 80, 600)))
                t += 1.2
    for ln in lines_of(3):  # taking down the Count's every word
        m += sweep('7', ln['start'] + 0.5, ln['end'], 75, 110, PEN_EVERY + 0.3, 350)
    t = 6.0
    while t < TOTAL - 3:
        if not speaking(6, t) and not speaking(3, t):
            m.append((t, servo('7', rnd.choice([70, 85, 100, 115]), 300)))
        t += rnd.uniform(4, 7)
    m.append((TOTAL - 1.5, servo('7', 90, 300)))
    out, last = [], -9.0
    for t, st in sorted(m, key=lambda mv: mv[0]):
        if st['type'] == 'servo' and st['partId'] == '7':
            if t - last < PEN_EVERY - 0.05:
                continue
            last = t
        out.append((t, st))
    return out


def pumpkinhead():
    m, k = [], 0
    own = lines_of(1)
    t = 6.0
    while t < TOTAL - 4:
        if speaking(1, t, 1.0):
            t += 1.0
            continue
        m.append((t, motor('1', 'reverse' if k % 2 else 'forward', 30, 450)))
        k += 1
        t += rnd.uniform(6, 10)
    for ln in own:
        t = ln['start'] + 0.4
        while t < ln['end']:
            m.append((t, motor('1', 'reverse' if k % 2 else 'forward', 40, 600)))
            k += 1
            t += 1.6
    if k % 2:
        m.append((TOTAL - 2.0, motor('1', 'reverse', 30, 450)))
    return m


def groundbreaker():
    """Out-and-back turn pairs, 700 ms each way at 50%, inside his 1500 ms window: he always comes home."""
    cues = [a['start'] + 0.5 for a in ACTS] + [ln['start'] + 0.3 for ln in lines_of(5)]
    m, last, k = [], -99.0, 0
    for t in sorted(cues):
        if t - last < 6.0:
            continue
        first, back = ('forward', 'reverse') if k % 2 == 0 else ('reverse', 'forward')
        m += [(t, motor('1', first, 50, 700)), (t + 2.5, motor('1', back, 50, 700))]
        last, k = t, k + 1
    return m


MOVES = {1: pumpkinhead, 2: mina, 3: orlok, 4: dragomir, 5: groundbreaker, 6: renfield}


def part_scene(cid):
    name, slug = PART[cid]
    lag = LAG.get(cid, 0)
    steps = []
    if lines_of(cid):
        voice = {'type': 'audio', 'audioId': f'{SLUG}-part-{slug}.mp3', 'volume': 100, 'jawSync': JAW.get(cid, False), 'concurrent': True}
        if not JAW.get(cid, False):
            voice['ledSync'] = True
        steps.append(voice)
    if cid == 3:  # the score at half volume under the Count (operator 2026-10-18)
        steps.append({'type': 'audio', 'audioId': f'{SLUG}-score.mp3', 'volume': 50, 'jawSync': False, 'concurrent': True})
    moves = [(t, st) for t, st in MOVES[cid]() if 0 <= t <= TOTAL]
    for t, step in sorted(moves, key=lambda mv: mv[0]):
        steps.append({'type': 'wait', 'untilMs': max(0, int(round(t * 1000)) + lag)})
        steps.append(dict(step, concurrent=True))
    steps.append({'type': 'wait', 'untilMs': int(round(TOTAL * 1000)) + lag + 500})
    return {'name': f"{CFG['title']}: {name} part", 'tags': [SLUG, 'fleet-part'],
            'description': f"{name}'s part in '{CFG['title']}': pre-recorded lines on the show timeline plus {len(moves)} "
                           f"moves cued to them (wait.untilMs). Started by Groundbreaker's conductor; not for solo play.",
            'steps': steps}


def conductor(names):
    s = [{'type': 'fleet-mode', 'mode': 'hold', 'node': 'all', 'maxMs': 900000, 'reason': CFG['title']}]
    for n in (1, 2, 3):
        s.append({'type': 'goblin-video', 'goblinName': f'Goblin {n}', 'videoId': f'{SLUG}-g{n}.mp4', 'concurrent': n < 3})
    s.append({'type': 'wait', 'duration': int(CFG.get('prerollWaitMs', 1500))})
    for node, scene in names.items():
        s.append({'type': 'fleet-scene', 'node': node, 'scene': scene, 'wait': False, 'concurrent': True})
    s += [{'type': 'audio', 'audioId': f'{SLUG}-score.mp3', 'volume': 100, 'jawSync': False},
          {'type': 'wait', 'duration': 1000},
          {'type': 'fleet-mode', 'mode': 'release', 'node': 'all', 'reason': f"{CFG['title']} finished"}]
    return {'name': CFG['title'], 'tags': [SLUG, 'fleet-show'], 'description': CFG.get('description', CFG['title']), 'steps': s}


if __name__ == '__main__':
    names = {}
    for cid in PART:
        sc = part_scene(cid)
        json.dump(sc, open(f'{OUT}/part-{cid}.json', 'w'), indent=1)
        names[PART[cid][0]] = sc['name']
        print(f"part {cid} {PART[cid][0]}: {len(sc['steps'])} steps")
    json.dump(conductor(names), open(f'{OUT}/conductor-5.json', 'w'), indent=1)
    print('conductor written')
