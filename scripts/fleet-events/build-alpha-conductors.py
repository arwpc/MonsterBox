"""Usage: python3 scripts/fleet-events/build-alpha-conductors.py OUT.json  (then merge OUT.json into Alpha's data/character-7/scenes.json)

Build Alpha-hosted conductors from each show's Groundbreaker conductor (conductor-5.json).

Alpha has no speakers, so every step that played on Groundbreaker himself moves to him:
- the score `audio` step becomes a `wait` of the score's length (the show's timeline anchor stays on Alpha);
  the score itself is played by Groundbreaker's own part scene (prepended there separately);
- Slipknot's local `sayThis` lines become `fleet-say` to Groundbreaker, and the song gets a
  "Slipknot: Groundbreaker part" fleet-scene (that show had no Groundbreaker part).
Scene ids match Groundbreaker's so events.json keeps its ids.
"""
import json, math, os, subprocess, sys

SHOWS = os.path.expanduser('~/monsterbox-console/shows')
OUT = sys.argv[1]
PLAN = [('slipknot', 19), ('nosferatu', 20), ('lighting', 23), ('orders', 25), ('song', 27)]


def duration_ms(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
                         capture_output=True, text=True, check=True).stdout
    return math.ceil(float(out) * 1000)


scenes = []
for slug, sid in PLAN:
    cond = json.load(open(f'{SHOWS}/{slug}/scenes/conductor-5.json'))
    steps = []
    has_gb_part = any(s['type'] == 'fleet-scene' and s['node'] == 'Groundbreaker' for s in cond['steps'])
    for s in cond['steps']:
        if s['type'] == 'audio':
            ms = duration_ms(f'{SHOWS}/{slug}/audio/{s["audioId"]}')
            if not has_gb_part:
                steps.append({'type': 'fleet-scene', 'node': 'Groundbreaker', 'scene': cond['steps'][[x['type'] for x in cond['steps']].index('fleet-scene')]['scene'].split(':')[0] + ': Groundbreaker part',
                              'wait': False, 'concurrent': True})
            steps.append({'type': 'wait', 'duration': ms,
                          'note': f'score length ({s["audioId"]}); the score plays on Groundbreaker (100%) and Orlok (50%) in their parts'})
        elif s['type'] == 'sayThis':
            steps.append({'type': 'fleet-say', 'node': 'Groundbreaker', 'text': s['text'], 'wait': True})
        else:
            steps.append(s)
    scenes.append({'id': sid, 'name': cond['name'], 'description': cond.get('description', '') +
                   ' Conducted from Alpha (all scheduled events run only from Alpha, operator 2026-10-24).',
                   'tags': cond.get('tags', []) + ['alpha-conductor'], 'steps': steps,
                   'created': '2026-10-24T23:40:00.000Z'})

json.dump(scenes, open(OUT, 'w'), indent=2)
for sc in scenes:
    print(sc['id'], sc['name'], len(sc['steps']), [st['type'] for st in sc['steps']])
