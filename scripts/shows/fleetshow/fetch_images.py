"""Save a show's generated images as images/<key>-<take>.png from an ElevenLabs run-status JSON.

usage: python fetch_images.py SHOW_DIR STATUS_JSON [STATUS_JSON ...]
show.json `imageKeys` maps each shot key to a phrase that appears in its prompt; the takes of a key are
numbered 1, 2, 3 in generation order. An existing take is not fetched again.
"""
import json
import os
import subprocess
import sys
import urllib.request

SHOW = os.path.abspath(sys.argv[1])
KEYS = json.load(open(f'{SHOW}/show.json'))['imageKeys']
os.makedirs(f'{SHOW}/images', exist_ok=True)
seen = {}
for path in sys.argv[2:]:
    d = json.load(open(path))
    gens = {g['id']: g for g in d.get('generations', [])}
    for m in sorted(d.get('media', []), key=lambda x: gens.get(x['generation_id'], {}).get('created_at_unix_ms', '0')):
        key = next((k for k, phrase in KEYS.items() if phrase.lower() in m['prompt'].lower()), None)
        if not key or m['generation_id'] in seen:
            continue
        seen[m['generation_id']] = key
        take = sum(1 for v in seen.values() if v == key)
        out = f'{SHOW}/images/{key}-{take}.png'
        if os.path.exists(out):
            continue
        raw = urllib.request.urlopen(m.get('master_url') or m['url'], timeout=120).read()
        tmp = out + '.src'
        open(tmp, 'wb').write(raw)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp, '-vf', 'scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720', out], check=True)
        os.remove(tmp)
        print('saved', os.path.basename(out))
have = sorted(os.listdir(f'{SHOW}/images'))
print(f'{len(have)} images:', ' '.join(have))
