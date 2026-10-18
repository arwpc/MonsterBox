"""Deploy Groundbreaker's Slipknot 'Virus of Life' show to the fleet. Idempotent: re-run it
after re-tuning (it replaces any earlier "Slipknot:" scenes, re-uploads audio, re-deploys video).

  python3 scripts/shows/slipknot/deploy_show.py SHOW_DIR [--dry-run]

SHOW_DIR (on the console node, not in git: band audio and art) holds:
  audio/slipknot-part-<slug>.mp3, audio/slipknot-groundbreaker-virus-of-life.mp3
  video/slipknot-g1.mp4 g2 g3, scenes/part-<cid>.json, scenes/conductor-5.json
SSH (lock/unlock, prerender) uses MONSTERBOX_SSH_PASSWORD from /etc/monsterbox/env.
"""
import json
import os
import re
import ssl
import subprocess
import sys
import urllib.error
import urllib.request

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
SHOW = os.path.abspath(sys.argv[1])
DRY = '--dry-run' in sys.argv
REG = {a['characterId']: a for a in json.load(open(f'{REPO}/config/animatronics.json'))['animatronics']}
LOCK_REASON = {l['characterId']: l.get('reason', '') for l in json.load(open(f'{REPO}/config/character-locks.json'))['locks']}
LOCKS = set(LOCK_REASON)
SLUG = {1: 'pumpkinhead', 2: 'mina', 3: 'orlok', 4: 'dragomir', 6: 'renfield'}
# Part scene ids a dry run would have saved, so the conductor's references to them are expected misses
DRY_PART_IDS = set()
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE


def url(cid, path):
    return f"https://{REG[cid]['ip']}:3000{path}"


def api(cid, path, body=None, method=None, timeout=60):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url(cid, path), data=data, method=method or ('POST' if data else 'GET'),
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, context=CTX, timeout=timeout) as r:
        return json.loads(r.read() or b'{}')


def upload(cid, path, field, route):
    out = subprocess.run(['curl', '-sk', '-m', '300', '-F', f'{field}=@{path}', url(cid, route)],
                         capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def ssh(cid, cmd):
    env = dict(os.environ)
    if 'SSHPASS' not in env:
        m = re.search(r'MONSTERBOX_SSH_PASSWORD=(.*)', open('/etc/monsterbox/env').read())
        env['SSHPASS'] = m.group(1).strip().strip('"\'')
    return subprocess.run(['sshpass', '-e', 'ssh', '-o', 'StrictHostKeyChecking=no', '-o', 'LogLevel=ERROR',
                           f"remote@{REG[cid]['ip']}", cmd], capture_output=True, text=True, env=env, timeout=600)


def log(*a):
    print(*a, flush=True)


def audio_id(resp):
    items = resp.get('files') or resp.get('audio') or resp.get('uploaded') or resp.get('results') or []
    if isinstance(items, dict):
        items = [items]
    for it in items:
        a = it.get('audio') if isinstance(it, dict) and 'audio' in it else it
        if isinstance(a, dict) and a.get('id'):
            return a['id']
    raise SystemExit(f'upload returned no audio id: {json.dumps(resp)[:300]}')


def save_scene(cid, scene):
    """Replace this node's Slipknot scene of the same name; returns the scene id."""
    scenes = api(cid, f'/scenes/api/?characterId={cid}')['scenes']
    kept = [s for s in scenes if s.get('name') != scene['name']]
    old = next((s for s in scenes if s.get('name') == scene['name']), None)
    sid = int(old['id']) if old else max([int(s['id']) for s in scenes] + [0]) + 1
    new = dict(scene, id=sid)
    locked = cid in LOCKS
    if DRY:
        try:
            r = api(cid, f'/scenes/api/replace?characterId={cid}&validateOnly=1', {'scenes': kept + [new]})
        except urllib.error.HTTPError as e:
            r = json.loads(e.read() or b'{}')
        # A dry run uploads and saves nothing, so its own audio, clips and part scenes read as missing
        errors = r.get('errors') or []
        pending = [e for e in errors
                   if ('audioId "slipknot-' in e and 'is not in the audio library' in e)
                   or ('"slipknot-g' in e and 'clip manifest' in e)
                   or any(f'fleet-scene: scene "{i}" not found' in e for i in DRY_PART_IDS)]
        real = [e for e in errors if e not in pending]
        log(f'  char {cid}: validate {"FAILED " + str(real) if real else "ok"}'
            + (f' ({len(pending)} ref(s) to show audio, clips or part scenes this run would create)' if pending else ''))
        return sid
    if locked:
        log(f'  char {cid} is locked: unlocking for the save', ssh(cid, f'cd /home/remote/MonsterBox && node scripts/character-lock.mjs unlock {cid}').stdout.strip()[-60:])
    try:
        r = api(cid, f'/scenes/api/replace?characterId={cid}', {'scenes': kept + [new]})
        if not r.get('success'):
            raise SystemExit(f'char {cid} scene save failed: {r.get("errors") or r}')
    finally:
        if locked:
            import base64
            reason = (LOCK_REASON.get(cid, '') + ' 2026-10-18: relocked after adding the Slipknot show part.').strip()
            b64 = base64.b64encode(reason.encode()).decode()
            res = ssh(cid, f"cd /home/remote/MonsterBox && node scripts/character-lock.mjs lock {cid} --by 'Aaron Warner' "
                           f"--reason \"$(echo {b64} | base64 -d)\"")
            log(f'  char {cid} relocked:', (res.stdout or res.stderr).strip()[-80:])
    log(f'  char {cid}: scene "{scene["name"]}" saved as id {sid} ({len(new["steps"])} steps)')
    return sid


def main():
    part_ids = {}
    for cid, slug in SLUG.items():
        name = REG[cid]['name']
        log(f'== {name} (char {cid}, {REG[cid]["ip"]})')
        scene = json.load(open(f'{SHOW}/scenes/part-{cid}.json'))
        if not DRY:
            aid = audio_id(upload(cid, f'{SHOW}/audio/slipknot-part-{slug}.mp3', 'audioFiles', '/audio-library/api/upload'))
            scene['steps'][0]['audioId'] = aid
            log(f'  audio uploaded as {aid}')
        part_ids[name] = save_scene(cid, scene)
        DRY_PART_IDS.add(part_ids[name])

    log('== Groundbreaker (char 5): song, videos, conductor')
    gb = 5
    cond = json.load(open(f'{SHOW}/scenes/conductor-5.json'))
    if not DRY:
        sid = audio_id(upload(gb, f'{SHOW}/audio/slipknot-groundbreaker-virus-of-life.mp3', 'audioFiles', '/audio-library/api/upload'))
        for s in cond['steps']:
            if s['type'] == 'audio':
                s['audioId'] = sid
        for n in (1, 2, 3):
            up = upload(gb, f'{SHOW}/video/slipknot-g{n}.mp4', 'videoFiles', '/video-library/api/upload')
            vids = up.get('videos') or up.get('files') or up.get('uploaded') or []
            vid = (vids[0].get('id') if vids and isinstance(vids[0], dict) else None) or up.get('id')
            gid = api(gb, f'/video-library/api/goblins/resolve?name=Goblin%20{n}')['id']
            dep = api(gb, '/video-library/api/deploy', {'videoId': vid, 'goblinId': gid}, timeout=600)
            log(f'  slipknot-g{n}.mp4 -> Goblin {n}: {dep.get("success")} {dep.get("error") or ""}')
    for s in cond['steps']:
        if s['type'] == 'fleet-scene' and s['node'] in part_ids:
            s['scene'] = part_ids[s['node']]
    cond_id = save_scene(gb, cond)

    if not DRY:
        log('== pre-recording every spoken line on the node that says it')
        lines = {gb: [s['text'] for s in cond['steps'] if s['type'] == 'sayThis']}
        cid_of = {REG[c]['name']: c for c in REG}
        for s in cond['steps']:
            if s['type'] == 'fleet-say':
                lines.setdefault(cid_of[s['node']], []).append(s['text'])
        for cid, texts in lines.items():
            for text in texts:
                q = text.replace("'", "'\\''")
                r = ssh(cid, f"cd /home/remote/MonsterBox && node scripts/prerender-scene-tts.mjs --character {cid} --text '{q}' 2>&1 | tail -1")
                log(f'  char {cid}: {r.stdout.strip()[-90:]}')
        log('== dry run of the conductor (resolution only)')
        r = api(gb, f'/scenes/api/{cond_id}/play?characterId=5&dryRun=1', {}, timeout=120)
        log('  dry run:', json.dumps({k: r.get(k) for k in ('success', 'error')}))


if __name__ == '__main__':
    main()
