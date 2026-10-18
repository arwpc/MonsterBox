"""Render every script line in its speaker's own ElevenLabs voice, once.

usage: python render_lines.py REPO SHOW_DIR KEY_FILE
Writes SHOW_DIR/voices/<lineId>.mp3 and SHOW_DIR/voices/durations.json. A line whose
file exists is not rendered again (no repeat spend); delete it to re-render.
"""
import json
import os
import subprocess
import sys
import urllib.request

repo, show, keyfile = sys.argv[1:4]
KEY = open(keyfile).read().strip()
script = json.load(open(f'{show}/script.json'))
os.makedirs(f'{show}/voices', exist_ok=True)
durations = {}
for act in script['acts']:
    for ln in act['lines']:
        out = f"{show}/voices/{ln['id']}.mp3"
        if not (os.path.exists(out) and os.path.getsize(out) > 1000):
            cfg = json.load(open(f"{repo}/data/character-{ln['cid']}/ai-config/tts-config.json"))
            body = {'text': ln['text'], 'model_id': cfg.get('model') or 'eleven_v3',
                    'voice_settings': {'stability': cfg.get('stability', 0.5),
                                       'similarity_boost': cfg.get('similarity_boost', 0.75)}}
            req = urllib.request.Request(
                f"https://api.elevenlabs.io/v1/text-to-speech/{cfg['voice_id']}?output_format=mp3_44100_128",
                data=json.dumps(body).encode(), headers={'xi-api-key': KEY, 'Content-Type': 'application/json'})
            with urllib.request.urlopen(req, timeout=90) as r:
                open(out, 'wb').write(r.read())
            print('rendered', ln['id'], flush=True)
        d = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out],
                                 capture_output=True, text=True).stdout)
        durations[ln['id']] = round(d, 3)
json.dump(durations, open(f'{show}/voices/durations.json', 'w'), indent=1)
print(f'{len(durations)} lines, {sum(durations.values()):.1f} s of speech')
