"""Generate the Nosferatu tribute scenes: one part scene per animatronic (its own voice track
plus moves cued to the lines) and Groundbreaker's conductor scene (fleet hold, the three
Goblin reels, every part and his score started together).

Every move is a wait { untilMs } on the scene clock followed by a concurrent step, so a
seven-minute show cannot drift. Moves stay inside the windows the Slipknot show and the idle
poses already use: the Knight's neck 374-404, PumpkinHead's motor at 40% or less, Renfield's
shake motor forward only. Orlok gestures with his right arm only: his left arm, bow, elbow and
forearm are listed broken in config/physical-faults.json (the daemon refuses them).

usage: python gen_scenes.py SHOW_DIR [CID=lagMs ...]
  a lag delays that node's moves to match a measured delay before its voice track sounds.
"""
import json
import os
import random
import sys

SHOW = os.path.abspath(sys.argv[1])
LAG = {int(a.split('=')[0]): int(a.split('=')[1]) for a in sys.argv[2:] if '=' in a}
TL = json.load(open(f'{SHOW}/timeline.json'))
TOTAL = TL['total']
LINES = TL['lines']
L = {ln['id']: ln['start'] for ln in LINES}
E = {ln['id']: ln['end'] for ln in LINES}
ACT = {a['act']: a for a in TL['acts']}
OUT = f'{SHOW}/scenes'
os.makedirs(OUT, exist_ok=True)
rnd = random.Random(1838)


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


def speaking(cid, t):
    return any(ln['start'] - 0.5 <= t <= ln['end'] + 0.5 for ln in lines_of(cid))


def sweep(part, t0, t1, lo, hi, every, ms, k=0):
    """Alternate a servo between lo and hi from t0 to t1."""
    out, t = [], t0
    while t < t1:
        out.append((t, servo(part, hi if k % 2 else lo, ms)))
        t += every
        k += 1
    return out


def orlok():
    m = []
    for ln in lines_of(3):  # he turns his head slowly as he speaks
        m += sweep('15', ln['start'] + 0.3, ln['end'], 82, 98, 3.2, 1800)
    t = 4.0
    while t < TOTAL - 6:  # and drifts while he listens
        if not speaking(3, t):
            m.append((t, servo('15', rnd.choice([85, 88, 92, 95]), 2600)))
        t += rnd.uniform(6.5, 9.5)
    m += [(L['o1'] + 0.5, act_('1', 'extend', 1500)), (L['o1'] + 4.0, act_('1', 'retract', 2200))]  # "come in freely"
    m += [(L['o3'] + 3.5, act_('1', 'extend', 1500)), (E['o3'] + 1.0, act_('1', 'retract', 2200))]  # "give me your hand"
    m += [(L['o5'] + 5.0, act_('1', 'extend', 1500)), (E['o5'] + 0.5, act_('1', 'retract', 2200))]  # "I shall come"
    m += [(L['o6'], light('8', True)), (L['o6'] + 2.0, act_('1', 'extend', 1500)),
          (E['o6'] - 1.0, act_('1', 'retract', 2200)), (E['o6'] + 3.0, light('8', False))]           # the monologue
    m += [(L['o10'], light('8', True)), (E['o10'] + 0.5, light('8', False))]
    m += [(L['o11'] + 1.0, act_('1', 'extend', 1500)), (L['o11'] + 9.0, act_('1', 'retract', 2200))]  # the Turks
    m += [(L['o8'] + 3.0, act_('1', 'extend', 1500)), (E['o8'] + 0.5, act_('1', 'retract', 2200))]    # reaching for Mina
    # dawn: the Hand gutters, his head thrashes, his arm flails up and falls
    t = L['o9']
    for k in range(10):
        m.append((t + k * 0.4, light('8', k % 2 == 0)))
    m.append((t + 4.2, light('8', False)))
    m += [(L['o9'] + 0.3 + k * 0.55, servo('15', 76 if k % 2 else 104, 450)) for k in range(7)]
    m += [(L['o9'] + 0.5, act_('1', 'extend', 1200, 70)), (L['o9'] + 5.0, act_('1', 'retract', 2600, 35)),
          (L['o9'] + 6.0, servo('15', 80, 3000)), (E['k7'] + 0.5, servo('15', 90, 1500))]
    return m


def mina():
    m = []
    t = 8.0
    a3 = ACT[3]['start']
    while t < a3 - 4:  # Acts I-II: she sleeps, her eyes wander now and then
        m.append((t, servo('3', rnd.choice([62, 75, 104, 116]), 500)))
        m.append((t + 1.6, servo('3', 89, 500)))
        t += rnd.uniform(10, 16)
    m += [(L['r5'] + 0.2, servo('3', 64, 300)), (L['r5'] + 0.4, servo('2', 104, 900)),            # her name
          (L['o5'] + 0.3, servo('3', 60, 300)), (E['o5'] + 2.0, servo('3', 89, 700)), (E['o5'] + 2.2, servo('2', 90, 1500))]
    # Act III: the door draws partway shut, the rose lights, and she rises as she speaks
    m += [(a3 + 0.5, act_('4', 'retract', 2500, 95)), (L['k6'] + 5.0, light('5', True)),
          (L['m1'] - 2.5, act_('4', 'extend', 3500, 95))]
    for ln in LINES:
        if ln['act'] != 3 or ln['start'] < L['m1']:
            continue
        if ln['cid'] == 2:
            m += [(ln['start'], servo('2', 100, 1400)), (ln['start'] + 0.2, servo('3', 89, 400))]
        elif ln['cid'] == 3:
            m += [(ln['start'] + 0.3, servo('2', 96, 1800)), (ln['start'] + 0.5, servo('3', 70, 600))]
    m += [(L['o11'] + 3.0, servo('3', 120, 700)), (L['o11'] + 9.0, servo('3', 89, 700))]           # she looks at the Turks
    m += [(L['r9'], light('10', True)), (E['o9'] + 2.0, light('10', False)),                         # the sun
          (L['m4'], servo('2', 90, 2500)), (L['m4'], servo('3', 89, 800)), (E['k7'] + 1.0, light('5', False))]
    return m


def dragomir():
    m = []
    for ln in lines_of(4):  # the herald scans the crowd as he speaks
        m += sweep('1', ln['start'] + 0.2, ln['end'], 380, 398, 3.0, 1500)
    t = 3.0
    while t < TOTAL - 4:  # and keeps watch between his lines
        if not speaking(4, t):
            m.append((t, servo('1', rnd.choice([377, 383, 395, 401]), 2600)))
        t += rnd.uniform(6, 9)
    for lid in ('k2', 'k3', 'k6'):  # "Act the ..." opens the magic box
        m += [(L[lid], servo('3', 42, 250)), (E[lid] + 1.0, servo('3', 20, 400))]
    m += [(E['k7'] + 0.5, servo('1', 389, 1500)), (E['k7'] + 0.5, servo('3', 20, 400))]
    return m


def renfield():
    m = []
    for ln in lines_of(6):  # furious scribbling whenever he talks
        m += sweep('7', ln['start'], ln['end'], 60, 125, 0.25, 180)
    for lid in ('o2', 'o4', 'o6'):  # taking down the Count's every word
        m += sweep('7', L[lid] + 0.5, E[lid], 75, 110, 0.6, 350)
    for t in (L['r1'] + 0.2, L['r3'] + 0.1, L['r10'] + 0.5, E['r6'] - 1.5, L['r9'], L['r9'] + 1.4):
        m.append((t, motor('1', 'forward', 70, 500)))
    m.append((TOTAL - 1.5, servo('7', 90, 300)))
    return m


def pumpkinhead():
    """The weed: an occasional sway, restless through Act II, creeping hard on his own line."""
    m, k = [], 0
    t = 10.0
    while t < TOTAL - 4:
        if L['p3'] - 1 <= t <= E['p3']:
            t = E['p3'] + 1
            continue
        act2 = ACT[2]['start'] <= t < ACT[2]['end']
        m.append((t, motor('1', 'reverse' if k % 2 else 'forward', 35 if act2 else 30, 450)))
        k += 1
        t += rnd.uniform(6, 9) if act2 else rnd.uniform(13, 18)
    t = L['p3'] + 0.5
    while t < E['p3']:
        m.append((t, motor('1', 'reverse' if k % 2 else 'forward', 40, 600)))
        k += 1
        t += 2.2
    if k % 2:  # end where he started
        m.append((TOTAL - 2.0, motor('1', 'reverse', 30, 450)))
    return m


PARTS = {3: ('Orlok', 'orlok', True, orlok), 2: ('Mina', 'mina', True, mina),
         4: ('Sir Dragomir', 'dragomir', True, dragomir), 6: ('Renfield', 'renfield', False, renfield),
         1: ('PumpkinHead', 'pumpkinhead', False, pumpkinhead)}


def part_scene(cid, name, slug, jaw, moves):
    lag = LAG.get(cid, 0)
    steps = [{'type': 'audio', 'audioId': f'nosferatu-part-{slug}.mp3', 'volume': 100, 'jawSync': jaw, 'concurrent': True}]
    for t, step in sorted(moves, key=lambda mv: mv[0]):
        steps.append({'type': 'wait', 'untilMs': max(0, int(round(t * 1000)) + lag)})
        steps.append(dict(step, concurrent=True))
    steps.append({'type': 'wait', 'untilMs': int(round(TOTAL * 1000)) + lag + 500})
    return {'name': f'Nosferatu: {name} part', 'tags': ['nosferatu', 'fleet-part'],
            'description': f"{name}'s part in the Nosferatu tribute: their own pre-recorded lines on the show timeline "
                           f"plus {len(moves)} moves cued to the story (wait.untilMs, scene clock). Started by "
                           f"Groundbreaker's conductor scene; not for solo play.",
            'steps': steps}


def conductor(scene_ids):
    PREROLL_WAIT = 1500  # video pre-roll (3 s) minus the Goblin cast settling time; tune at rehearsal
    s = [{'type': 'fleet-mode', 'mode': 'hold', 'node': 'all', 'maxMs': 900000, 'reason': 'Nosferatu: a tribute in three acts'},
         {'type': 'goblin-video', 'goblinName': 'Goblin 1', 'videoId': 'nosferatu-g1.mp4', 'concurrent': True},
         {'type': 'goblin-video', 'goblinName': 'Goblin 2', 'videoId': 'nosferatu-g2.mp4', 'concurrent': True},
         {'type': 'goblin-video', 'goblinName': 'Goblin 3', 'videoId': 'nosferatu-g3.mp4'},
         {'type': 'wait', 'duration': PREROLL_WAIT}]
    for node, sid in scene_ids.items():
        s.append({'type': 'fleet-scene', 'node': node, 'scene': sid, 'wait': False, 'concurrent': True})
    s += [{'type': 'audio', 'audioId': 'nosferatu-groundbreaker-score.mp3', 'volume': 100, 'jawSync': False},
          {'type': 'wait', 'duration': 1000},
          {'type': 'fleet-mode', 'mode': 'release', 'node': 'all', 'reason': 'Nosferatu finished'}]
    return {'name': 'Nosferatu: A Tribute in Three Acts', 'tags': ['nosferatu', 'fleet-show'],
            'description': "A seven-minute, three-act tribute to Nosferatu (2024) with original dialogue. The Knight "
                           "announces, Renfield narrates in a frenzy, Orlok signs for the house and crosses the sea, "
                           "PumpkinHead creeps as the evil weed, and Mina keeps the Count until the cock crows. "
                           "Groundbreaker plays the score, wolves and storms; Goblins 1-3 run the picture reels. "
                           "All speech is pre-recorded (no live TTS).",
            'steps': s}


if __name__ == '__main__':
    for cid, (name, slug, jaw, fn) in PARTS.items():
        moves = [(t, st) for t, st in fn() if 0 <= t <= TOTAL]
        sc = part_scene(cid, name, slug, jaw, moves)
        json.dump(sc, open(f'{OUT}/part-{cid}.json', 'w'), indent=1)
        print(f'part {cid} {name}: {len(moves)} moves, {len(sc["steps"])} steps')
    ids = {name: f'Nosferatu: {name} part' for name, *_ in PARTS.values()}
    json.dump(conductor(ids), open(f'{OUT}/conductor-5.json', 'w'), indent=1)
    print('conductor written')
