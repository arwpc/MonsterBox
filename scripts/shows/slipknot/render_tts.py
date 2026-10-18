"""Render every raw voice clip for the Slipknot scene through ElevenLabs, once.

Each character speaks with its own voice settings (data/character-N/ai-config/tts-config.json).
Clips land in raw/<char>-<clip>.mp3; existing files are not re-rendered (no repeat spend).
usage: python render_tts.py REPO_DIR KEY_FILE
"""
import json
import os
import sys
import urllib.request

repo, keyfile = sys.argv[1], sys.argv[2]
KEY = open(keyfile).read().strip()
os.makedirs('raw', exist_ok=True)

CLIPS = {
    # sung vowels: tuned and stretched later
    (3, 'ooh'): '[sings, deep and slow] Ooooooooooooooooooooooh.',
    (2, 'aah'): '[sings softly, ethereal] Aaaaaaaaaaaaaaaaaaaaaah.',
    (1, 'ooh'): '[sings, low and eerie] Ooooooooooooooooooh.',
    (6, 'aah'): '[sings, trembling] Aaaaaaaaaaaaaaaaaaah.',
    (4, 'aah'): '[sings, solemn] Aaaaaaaaaaaaaaaaaaaaah.',
    # whispers
    (1, 'virus'): '[whispers] the virus...',
    (1, 'spreads'): '[whispers] it spreads...',
    (6, 'oflife'): '[whispers] ...of life.',
    (6, 'infected'): '[whispers, frantic] infected... infected...',
    (2, 'feel'): '[whispers] can you feel it...',
    # chant hits
    (4, 'huh'): '[shouting] HUH!',
    (4, 'ha'): '[shouting] HA!',
    # Groundbreaker over his own song
    (5, 'yeah'): '[shouting] YEAAAH!',
    (5, 'lovepart'): '[shouting] GROUNDBREAKER LOVE THIS PART!',
    (5, 'iowa'): '[shouting] IOWAAA!',
}

for (cid, name), text in CLIPS.items():
    out = f'raw/{cid}-{name}.mp3'
    if os.path.exists(out) and os.path.getsize(out) > 1000:
        print('cached', out)
        continue
    cfg = json.load(open(os.path.join(repo, f'data/character-{cid}/ai-config/tts-config.json')))
    body = {
        'text': text,
        'model_id': cfg.get('model') or 'eleven_v3',
        'voice_settings': {'stability': cfg.get('stability', 0.5), 'similarity_boost': cfg.get('similarity_boost', 0.75)},
    }
    req = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{cfg['voice_id']}?output_format=mp3_44100_128",
        data=json.dumps(body).encode(), headers={'xi-api-key': KEY, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read()
    open(out, 'wb').write(data)
    print('rendered', out, len(data), 'bytes')
