# Gesture client tool — staged, NOT live

The ElevenLabs half of `docs/development/GESTURE-ENGINE-SPEC.md` §5/§9.4, authored and
tested on 2026-08-16, then **deliberately withdrawn from the live agents before
Halloween**. Everything needed to apply it is here.

## Status

| Piece | State |
|---|---|
| `gesture` client tool (workspace) | **created and live** — `tool_6601m04v5wr6ft9sa1p88wmkxg67`, attached to no agent |
| `tool_ids` on the five agents | **empty** (withdrawn) |
| `# Body` prompt sections | **withdrawn** from the live prompts; text preserved in `body-sections/` |
| `services/gestureEngineService.js` handler | not shipped at time of writing |

Renfield has no entry: he has no node and no parts yet, so §7 gives him no vocabulary
and he gets neither the tool nor a `# Body` section.

## Why it was withdrawn — measured, not assumed

The spec expected these tool calls to be "harmless no-ops until the handler ships".
They are not harmless, for a reason the spec did not anticipate: **the character prompts
are dense with `[audio tags]`, so a model handed a list of gesture ids emits them as if
they were more audio tags** — `[nod_commend]`, `[hand_glow]` — inside the text that goes
to TTS. A guest can hear the character say "hand glow".

Judge-panel smoke runs, 25 conversations across the five body-having agents:

| Config | Conversations leaking a spoken gesture | Leaked mentions |
|---|---|---|
| `# Body` as written in spec §5.2 | 13 / 25 | 38 |
| plus a hard "a gesture id is NOT an audio tag" rule | 3 / 25 | 6 |

Renfield, the control with no `# Body`, leaked 0/5 in both runs.

The hardened wording cuts leakage ~85% but not to zero, and the residual 12% of
conversations is a real cost on the night with **zero benefit**, because no handler
exists to act on a correctly-made tool call. So it waits.

Caveat worth stating: the judge harness uses the simulate-conversation API, where no
client exists to execute a client tool. That very likely inflates the leak rate versus a
live voice conversation, where the tool-call channel the model wants is actually
available. The withdrawal is a deadline decision, not a verdict that the design is wrong.

`scripts/halloween-judges/gestures.mjs` now measures this on every run, and
`analyze.mjs` prints a "Spoken-gesture leakage" section. **Ship gate: that section must
read "None."**

## Applying it (after the handler ships)

1. Ship `services/gestureEngineService.js` and the client-tool dispatch hook.
2. Re-attach the tool and the prompt sections. Fetch fresh, edit surgically, re-apply on
   conflict — spec §10:

```bash
python3 - <<'EOF'
import json, urllib.request
KEY = open('/etc/monsterbox/elevenlabs.key').read().strip()
TOOL = json.load(open('config/elevenlabs/gesture/tool.json'))['tool_id']
AGENTS = {a['key']: a['agentId'] for a in
          json.load(open('scripts/halloween-judges/agents.json'))['agents']}

def call(url, method='GET', body=None):
    r = urllib.request.Request(url, method=method,
        data=json.dumps(body).encode() if body else None,
        headers={'xi-api-key': KEY, 'Content-Type': 'application/json'})
    return json.load(urllib.request.urlopen(r))

for key in ['orlok', 'mina', 'dragomir', 'pumpkinhead', 'groundbreaker']:
    url = f'https://api.elevenlabs.io/v1/convai/agents/{AGENTS[key]}'
    prompt = call(url)['conversation_config']['agent']['prompt']['prompt']
    body = open(f'config/elevenlabs/gesture/body-sections/{key}.md').read()
    if '# Body' in prompt:                      # replace, never duplicate
        prompt = prompt.split('\n\n# Body')[0]
    call(url, 'PATCH', {'conversation_config': {'agent': {'prompt': {
        'prompt': prompt.rstrip() + '\n\n' + body,
        'tool_ids': [TOOL]}}}})
    print('applied', key)
EOF
```

3. Re-run the judge panel and confirm the leakage section reads "None." before the
   config is left on the fleet unattended.
4. Refresh `config/elevenlabs/agents/*.json` so the snapshots stay canonical.

## Rolling it back

Strip the `# Body` section (`prompt.split('\n\n# Body')[0]`, preserving the original
trailing newline) and set `tool_ids: []`. Do not delete the workspace tool — the id above
is referenced by this directory.
