"""Generate a fleet show's score with the ElevenLabs music API, the exact length of its timeline.

usage: python music.py SHOW_DIR KEY_FILE [--force]
Reads SHOW_DIR/show.json `music` and timeline.json (run build.py --timeline-only first). Writes
SHOW_DIR/music/score.mp3 once (no repeat spend unless --force).

show.json music:
  styles:   global positive styles ("gothic orchestral", "harpsichord", ...)
  avoid:    global negative styles ("vocals", "drums", ...)
  sections: [{"name": "...", "until": "<line id>" | "end", "styles": [...]}]  in order; each section runs
            from the previous one's end to the START of its `until` line (or to the end of the show), so
            the music turns where the story turns.
The composition plan is tried first; if the API refuses it, one prompt of the same length is used.
"""
import json
import os
import sys
import urllib.error
import urllib.request

SHOW = os.path.abspath(sys.argv[1])
KEY = open(sys.argv[2]).read().strip()
CFG = json.load(open(f'{SHOW}/show.json'))['music']
TL = json.load(open(f'{SHOW}/timeline.json'))
OUT = f'{SHOW}/music/score.mp3'
if os.path.exists(OUT) and os.path.getsize(OUT) > 10000 and '--force' not in sys.argv:
    sys.exit(f'{OUT} exists (use --force to spend again)')
os.makedirs(os.path.dirname(OUT), exist_ok=True)

start_of = {ln['id']: ln['start'] for ln in TL['lines']}
total_ms = int(round(TL['total'] * 1000))
sections, t0 = [], 0.0
for sec in CFG['sections']:
    t1 = TL['total'] if sec['until'] == 'end' else start_of[sec['until']]
    ms = int(round((t1 - t0) * 1000))
    if ms >= 3000:
        sections.append({'section_name': sec['name'], 'positive_local_styles': sec.get('styles', []),
                         'negative_local_styles': [], 'duration_ms': ms, 'lines': []})
        t0 = t1
if sections:  # the last section absorbs rounding so the plan is exactly the show's length
    sections[-1]['duration_ms'] += total_ms - sum(s['duration_ms'] for s in sections)


def post(body):
    req = urllib.request.Request('https://api.elevenlabs.io/v1/music?output_format=mp3_44100_192', data=json.dumps(body).encode(),
                                 headers={'xi-api-key': KEY, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=600) as r:
        return r.read()


plan = {'positive_global_styles': CFG.get('styles', []), 'negative_global_styles': CFG.get('avoid', ['vocals', 'singing']),
        'sections': sections}
try:
    audio = post({'composition_plan': plan, 'model_id': 'music_v1'})
    how = f'composition plan, {len(sections)} sections'
except urllib.error.HTTPError as e:
    print('composition plan refused:', e.code, e.read()[:300].decode(errors='replace'))
    prompt = (', '.join(CFG.get('styles', [])) + '. Instrumental, no vocals. ' +
              ' Then '.join(f"{s['section_name']} ({s['duration_ms'] // 1000} s): {', '.join(s['positive_local_styles'])}" for s in sections))
    audio = post({'prompt': prompt[:2000], 'music_length_ms': total_ms, 'model_id': 'music_v1'})
    how = 'single prompt'
open(OUT, 'wb').write(audio)
print(f'score: {OUT} ({len(audio) // 1024} KB, {total_ms / 1000:.1f} s, {how})')
