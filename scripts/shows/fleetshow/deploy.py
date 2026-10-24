"""Deploy a fleet show (scripts/shows/fleetshow) to the fleet. Idempotent: re-run after any rebuild.

  python3 scripts/shows/fleetshow/deploy.py SHOW_DIR [--dry-run] [--clips-from-here]

SHOW_DIR holds show.json (slug, title), audio/<slug>-part-*.mp3 and <slug>-score.mp3,
video/<slug>-g1.mp4 g2 g3, scenes/part-<cid>.json and scenes/conductor-5.json. Each node's part scene is
saved by name (replacing an earlier build), every audio file it plays is uploaded to that node, the
Goblin reels go to Goblins 1-3, and Groundbreaker's conductor is saved last. Locked characters are
unlocked for the save and relocked. SSH uses MONSTERBOX_SSH_PASSWORD from /etc/monsterbox/env.
"""
import json
import os
import re
import ssl
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
SHOW = os.path.abspath(sys.argv[1])
DRY = '--dry-run' in sys.argv
# Copy Goblin clips from this machine instead of through Groundbreaker (he needs MONSTERBOX_SSH_PASSWORD for that)
CLIPS_FROM_HERE = '--clips-from-here' in sys.argv
REG = {a['characterId']: a for a in json.load(open(f'{REPO}/config/animatronics.json'))['animatronics']}
LOCK_REASON = {l['characterId']: l.get('reason', '') for l in json.load(open(f'{REPO}/config/character-locks.json'))['locks']}
LOCKS = set(LOCK_REASON)
SHOWCFG = json.load(open(f'{SHOW}/show.json'))
SHOWSLUG = SHOWCFG['slug']
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


def copy_clip_from_here(gb, n, path):
    """Copy a clip straight onto Goblin n from this machine, the way Groundbreaker's own
    deploy does (rsync to the player's media dir, then a rescan), for when Groundbreaker
    has no SSH credential to reach the Goblins himself."""
    g = api(gb, f'/video-library/api/goblins/resolve?name=Goblin%20{n}')
    host = urllib.parse.urlparse(g['endpoint']).hostname
    name = os.path.basename(path)
    env = dict(os.environ)
    if 'SSHPASS' not in env:
        m = re.search(r'MONSTERBOX_SSH_PASSWORD=(.*)', open('/etc/monsterbox/env').read())
        env['SSHPASS'] = m.group(1).strip().strip('"\'')
    cp = subprocess.run(['rsync', '-t', '--partial', '--inplace', '--timeout=90',
                         '-e', 'sshpass -e ssh -o StrictHostKeyChecking=no -o ConnectTimeout=8 -o LogLevel=ERROR',
                         path, f'remote@{host}:/home/remote/media/video/{name}'],
                        capture_output=True, text=True, env=env, timeout=900)
    if cp.returncode != 0:
        raise SystemExit(f'copy of {name} to Goblin {n} failed (rsync {cp.returncode}): {cp.stderr.strip()[-200:]}')
    with urllib.request.urlopen(f'{g["endpoint"]}/api/videos/scan', timeout=60) as r:
        listed = any(v.get('filename') == name for v in json.loads(r.read()).get('videos', []))
    log(f'  {name} -> Goblin {n} ({host}): copied from here, listed after rescan: {listed}')
    if not listed:
        raise SystemExit(f'Goblin {n} does not list {name} after the copy')


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
    """Replace this node's scene of the same name; returns the scene id."""
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
                   if (f'audioId "{SHOWSLUG}-' in e and 'is not in the audio library' in e)
                   or (f'"{SHOWSLUG}-g' in e and 'clip manifest' in e)
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
            reason = (LOCK_REASON.get(cid, '') + f' Relocked after saving the {SHOWCFG["title"]} show part.').strip()
            b64 = base64.b64encode(reason.encode()).decode()
            res = ssh(cid, f"cd /home/remote/MonsterBox && node scripts/character-lock.mjs lock {cid} --by 'Aaron Warner' "
                           f"--reason \"$(echo {b64} | base64 -d)\"")
            log(f'  char {cid} relocked:', (res.stdout or res.stderr).strip()[-80:])
    log(f'  char {cid}: scene "{scene["name"]}" saved as id {sid} ({len(new["steps"])} steps)')
    return sid


def main():
    part_ids = {}
    # Groundbreaker (5) has a part too since v2: his turn motor, no voice track
    for cid in list(SLUG) + [5]:
        name = REG[cid]['name']
        log(f'== {name} (char {cid}, {REG[cid]["ip"]})')
        scene = json.load(open(f'{SHOW}/scenes/part-{cid}.json'))
        if not DRY:
            # Every file a part plays (Orlok carries the score under his voice), uploaded once per node
            uploaded = {}
            for st in scene['steps']:
                if st['type'] != 'audio':
                    continue
                f = st['audioId']
                if f not in uploaded:
                    uploaded[f] = audio_id(upload(cid, f'{SHOW}/audio/{f}', 'audioFiles', '/audio-library/api/upload'))
                    log(f'  {f} uploaded as {uploaded[f]}')
                st['audioId'] = uploaded[f]
        part_ids[name] = save_scene(cid, scene)
        DRY_PART_IDS.add(part_ids[name])

    log(f'== Groundbreaker (char 5): score, videos, conductor for {SHOWCFG["title"]}')
    gb = 5
    cond = json.load(open(f'{SHOW}/scenes/conductor-5.json'))
    if not DRY:
        sid = audio_id(upload(gb, f'{SHOW}/audio/{SHOWSLUG}-score.mp3', 'audioFiles', '/audio-library/api/upload'))
        for s in cond['steps']:
            if s['type'] == 'audio':
                s['audioId'] = sid
        for n in (1, 2, 3):
            if CLIPS_FROM_HERE:
                copy_clip_from_here(gb, n, f'{SHOW}/video/{SHOWSLUG}-g{n}.mp4')
                continue
            up = upload(gb, f'{SHOW}/video/{SHOWSLUG}-g{n}.mp4', 'videoFiles', '/video-library/api/upload')
            vids = up.get('videos') or up.get('files') or up.get('uploaded') or []
            vid = (vids[0].get('id') if vids and isinstance(vids[0], dict) else None) or up.get('id')
            gid = api(gb, f'/video-library/api/goblins/resolve?name=Goblin%20{n}')['id']
            dep = api(gb, '/video-library/api/deploy', {'videoId': vid, 'goblinId': gid}, timeout=600)
            log(f'  {SHOWSLUG}-g{n}.mp4 -> Goblin {n}: {dep.get("success")} {dep.get("error") or ""}')
        if CLIPS_FROM_HERE:
            # The conductor's clip check reads Groundbreaker's manifests; refresh them from the Goblins' own listings
            r = ssh(gb, 'cd /home/remote/MonsterBox && node scripts/goblins/publish-manifests.mjs 2>&1 | tail -4')
            log('  manifests on Groundbreaker:', (r.stdout or r.stderr).strip().replace('\n', ' | ')[-240:])
    for s in cond['steps']:
        if s['type'] == 'fleet-scene' and s['node'] in part_ids:
            s['scene'] = part_ids[s['node']]
    cond_id = save_scene(gb, cond)

    if not DRY:
        log('== dry run of the conductor (resolution only)')
        r = api(gb, f'/scenes/api/{cond_id}/play?characterId=5&dryRun=1', {}, timeout=120)
        log('  dry run:', json.dumps({k: r.get(k) for k in ('success', 'error')}))


if __name__ == '__main__':
    main()
