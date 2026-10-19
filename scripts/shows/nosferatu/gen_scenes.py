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


def arm_gestures(cues, gap=4.4):
    """Right-arm extends on the given (time, hold) cues, dropping any that would start
    before the previous extend+retract has finished: the actuator must never overlap itself."""
    out, free_at = [], -1.0
    for t, hold in sorted(cues):
        if t < free_at:
            continue
        out += [(t, act_('1', 'extend', 1500)), (t + max(hold, 1.6), act_('1', 'retract', 2200))]
        free_at = t + max(hold, 1.6) + 2.2 + 0.3
    return out


def orlok():
    m = []
    for ln in lines_of(3):  # wider, quicker turns while he speaks, the Hand glowing on every line
        m += sweep('15', ln['start'] + 0.2, ln['end'], 72, 108, 2.2, 1300)
        if ln['id'] != 'o9':
            m += [(ln['start'], light('8', True)), (ln['end'] + 0.3, light('8', False))]
    t = 4.0
    while t < TOTAL - 6:  # and he never quite settles while he listens
        if not speaking(3, t):
            m.append((t, servo('15', rnd.choice([70, 78, 86, 94, 102, 110]), 1800)))
        t += rnd.uniform(3.5, 5.5)
    m += arm_gestures([(L['o1'] + 0.5, 3.0),    # "come in freely"
                       (L['o3'] + 1.5, 2.5),    # "give me your hand"
                       (L['o5'] + 2.5, 2.0),    # "I shall come"
                       (L['o6'] + 2.0, 6.0),    # the monologue
                       (L['o13'] + 0.4, 4.5),   # "now... be still"
                       (L['o15'] + 0.3, 2.5),   # "everything is offered"
                       (L['o17'] + 0.3, 2.5),   # "I am coming" (v3)
                       (L['o8'] + 1.5, 3.0)])   # reaching for Mina
    # dawn: the Hand gutters, his head thrashes, his arm flails up and falls
    t = L['o9']
    for k in range(10):
        m.append((t + k * 0.4, light('8', k % 2 == 0)))
    m.append((t + 4.2, light('8', False)))
    m += [(L['o9'] + 0.3 + k * 0.55, servo('15', 72 if k % 2 else 108, 450)) for k in range(7)]
    m += [(L['o9'] + 0.5, act_('1', 'extend', 1200, 70)), (L['o9'] + 5.0, act_('1', 'retract', 2600, 35)),
          (L['o9'] + 6.0, servo('15', 80, 3000)), (E['k18'] + 0.5, servo('15', 90, 1500))]
    return m


def mina():
    m = []
    a3 = ACT[3]['start']
    t = 6.0
    while t < a3 - 4:  # Acts I-II: she sleeps restlessly, eyes wandering, head stirring
        if not (L['m10'] - 2 <= t <= E['o17'] + 3):
            m.append((t, servo('3', rnd.choice([58, 66, 75, 104, 112, 120]), 450)))
            m.append((t + 1.4, servo('3', 89, 450)))
            if rnd.random() < 0.45:
                m.append((t + 0.6, servo('2', rnd.choice([84, 96, 102]), 1600)))
        t += rnd.uniform(5, 8)
    m += [(L['m10'], servo('2', 104, 1200)), (L['m10'] + 0.4, servo('3', 70, 350)),                    # she calls to him across the water
          (L['m10'] + 1.8, servo('3', 110, 350)), (L['o17'], servo('2', 112, 1400)), (L['o17'] + 0.3, servo('3', 64, 400)),  # and turns as he answers
          (E['o17'] + 1.2, servo('2', 90, 1800)), (E['o17'] + 1.4, servo('3', 89, 500))]
    m += [(L['r5'] + 0.2, servo('3', 64, 300)), (L['r5'] + 0.4, servo('2', 104, 900)),                   # her name
          (L['o5'] + 0.3, servo('3', 60, 300)), (E['o5'] + 2.0, servo('3', 89, 700)), (E['o5'] + 2.2, servo('2', 90, 1500))]
    # Act III: the door draws partway shut, the rose lights, and she rises as she speaks
    m += [(a3 + 0.5, act_('4', 'retract', 2500, 95)), (L['k17'] + 2.0, light('5', True)),
          (L['m1'] - 2.5, act_('4', 'extend', 3500, 95))]
    for ln in LINES:
        if ln['act'] != 3 or ln['start'] < L['m1'] or ln['id'] in ('o9', 'm4', 'k18'):
            continue
        if ln['cid'] == 2:    # she speaks: head up and forward, eyes steady, a small turn mid-line
            m += [(ln['start'], servo('2', 108, 1100)), (ln['start'] + 0.2, servo('3', 89, 350))]
            if ln['dur'] > 2.5:
                m.append((ln['start'] + ln['dur'] / 2, servo('2', 100, 1200)))
        elif ln['cid'] == 3:  # he speaks: she turns to him
            m += [(ln['start'] + 0.2, servo('2', 96, 1400)), (ln['start'] + 0.4, servo('3', 68, 450))]
        else:                 # a comment from the yard: her eyes flick toward it, then back
            m += [(ln['start'] + 0.3, servo('3', 118, 350)), (ln['end'] - 0.2, servo('3', 89, 450))]
    m += [(L['k9'], light('10', True)), (E['o9'] + 2.0, light('10', False)),                                 # the sun
          (L['m4'], servo('2', 90, 2500)), (L['m4'], servo('3', 89, 800)), (E['k18'] + 1.0, light('5', False))]
    return m


def dragomir():
    m = []
    for ln in lines_of(4):  # the herald scans the crowd as he speaks
        m += sweep('1', ln['start'] + 0.2, ln['end'], 380, 398, 1.8, 1100)
    t = 3.0
    while t < TOTAL - 4:  # and keeps watch between his lines, inside the 374-404 neck window
        if not speaking(4, t):
            m.append((t, servo('1', rnd.choice([377, 382, 386, 392, 396, 401]), 1900)))
        t += rnd.uniform(3.5, 5.5)
    for lid in ('k2', 'k16', 'k17', 'k10', 'k12', 'k13', 'k9', 'k18'):  # the magic box opens on every remark
        m += [(L[lid], servo('3', 42, 250)), (E[lid] + 0.8, servo('3', 20, 400))]
    m += [(E['k18'] + 0.5, servo('1', 389, 1500)), (E['k18'] + 0.5, servo('3', 20, 400))]
    return m


# Renfield's pen is a GPIO servo: each command spawns servo_cli and holds GPIO 26 for 0.4-0.6 s
# (measured 2026-10-18, p90 1.4 s); strokes closer than that failed with GPIO busy.
PEN_EVERY = 0.7


def renfield():
    m = []
    dead = E['r14']
    for ln in lines_of(6):  # furious scribbling whenever he talks
        if ln['id'] in ('r11', 'r12', 'r13', 'r14'):
            continue
        m += sweep('7', ln['start'], ln['end'], 60, 125, PEN_EVERY, 250)
    for lid in ('o1', 'o4', 'o6'):  # taking down the Count's every word
        m += sweep('7', L[lid] + 0.5, E[lid], 75, 110, PEN_EVERY + 0.3, 350)
    t = 8.0
    while t < L['r11'] - 3:  # he never sits still: a twitch of the pen between lines
        if not speaking(6, t):
            m.append((t, servo('7', rnd.choice([70, 85, 100, 115]), 300)))
        t += rnd.uniform(4, 7)
    for t in (L['r3'] + 0.1, L['r6'] + 0.5, E['r6'] - 1.5):
        m.append((t, motor('1', 'forward', 70, 500)))
    # THE MASTER: shake bursts and a wild pen from his shriek until the Count says his name
    t = L['r11']
    while t < L['o12'] - 0.4:
        m.append((t, motor('1', 'forward', 80, 600)))
        t += 1.1
    m += sweep('7', L['r11'], L['o12'] - 0.3, 30, 150, PEN_EVERY, 250)
    m.append((L['o12'], servo('7', 90, 300)))                                       # "Renfield." - he freezes
    m += sweep('7', L['r13'], E['r13'], 80, 100, PEN_EVERY, 250)                    # "he said my name"
    m += [(L['o13'] + 0.5 + k * 0.9, motor('1', 'forward', 40, 200)) for k in range(5)]  # trembling at "be still"
    m += [(L['r14'] + 0.3, motor('1', 'forward', 90, 900)),                         # the last gasp
          (E['r14'], servo('7', 10, 2500))]                                         # and the pen falls
    out, last_pen = [], -9.0
    for t, st in sorted(m, key=lambda mv: mv[0]):
        if t > dead + 3.0:                                                          # then nothing: he is still
            continue
        if st.get('partId') == '7' and st['type'] == 'servo':
            if t - last_pen < PEN_EVERY - 0.05:                                     # never two pen strokes inside one command
                continue
            last_pen = t
        out.append((t, st))
    return out


def pumpkinhead():
    """The weed: restless all night, creeping hard on his own lines (motor at 40% or less)."""
    m, k = [], 0
    own = [ln for ln in lines_of(1)]
    t = 8.0
    while t < TOTAL - 4:
        if any(ln['start'] - 1 <= t <= ln['end'] for ln in own):
            t = max(ln['end'] for ln in own if ln['start'] - 1 <= t <= ln['end']) + 1
            continue
        late = t >= ACT[2]['start']
        m.append((t, motor('1', 'reverse' if k % 2 else 'forward', 35 if late else 30, 450)))
        k += 1
        t += rnd.uniform(5, 8) if late else rnd.uniform(8, 12)
    for ln in own:
        t = ln['start'] + 0.4
        while t < ln['end']:
            m.append((t, motor('1', 'reverse' if k % 2 else 'forward', 40, 600)))
            k += 1
            t += 1.6
    if k % 2:  # end where he started
        m.append((TOTAL - 2.0, motor('1', 'reverse', 30, 450)))
    return m


def groundbreaker():
    """His new turn motor, operator window 1500 ms at 50% either way from center: every turn is
    an out-and-back pair of equal length, so he always comes home facing forward."""
    m = []
    cues = [L['k2'], L['k16'], L['r11'] + 0.5, E['r14'] + 0.5, L['k17'], L['k9'], E['k18'] + 0.5]
    for k, t in enumerate(cues):
        first, back = ('forward', 'reverse') if k % 2 == 0 else ('reverse', 'forward')
        m += [(t, motor('1', first, 50, 700)), (t + 2.5, motor('1', back, 50, 700))]
    return m


PARTS = {3: ('Orlok', 'orlok', True, orlok), 2: ('Mina', 'mina', True, mina),
         4: ('Sir Dragomir', 'dragomir', True, dragomir), 6: ('Renfield', 'renfield', False, renfield),
         1: ('PumpkinHead', 'pumpkinhead', False, pumpkinhead), 5: ('Groundbreaker', None, False, groundbreaker)}
# Orlok also plays the score at half volume, on the same scene clock as his voice (operator 2026-10-18),
# as its own audio step so his jaw keeps following only his voice
EXTRA_AUDIO = {3: [{'type': 'audio', 'audioId': 'nosferatu-groundbreaker-score.mp3', 'volume': 50, 'jawSync': False, 'concurrent': True}]}


def part_scene(cid, name, slug, jaw, moves):
    lag = LAG.get(cid, 0)
    # No jaw servo (PumpkinHead, Renfield): their LED eyes follow the voice instead (ledSync)
    voice = {'type': 'audio', 'audioId': f'nosferatu-part-{slug}.mp3', 'volume': 100, 'jawSync': jaw, 'concurrent': True}
    if not jaw:
        voice['ledSync'] = True
    steps = [voice] if slug else []
    steps += [dict(x) for x in EXTRA_AUDIO.get(cid, [])]
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
