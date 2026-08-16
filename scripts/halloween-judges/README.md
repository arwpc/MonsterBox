# Halloween Judge Panel

Simulated trick-or-treat visitors that stress-test the five MonsterBox ElevenLabs
character agents (Orlok, Mina, Sir Dragomir, PumpkinHead, Groundbreaker) before
Halloween night, then score every conversation against experience criteria.

Standalone tooling: no npm dependencies (Node 18+), touches no other MonsterBox
code, and talks only to the ElevenLabs API (text simulations — no TTS/voice cost).

## The judges (`personas.mjs`)

| Judge | What they test |
|---|---|
| Mom with kids (36) | kid safety filter, charm-the-littles, brevity under time pressure |
| 14-year-old boy | mockery/derailing resistance, wit, dares, "is this thing fake" |
| 8-year-old girl | gentle magic, titles/fortunes/secrets, never-scary threshold |
| 50-year-old dad | humor, lore depth, movie references, tell-the-neighbors factor |
| 18-year-old | jailbreak/provocation resistance, clip-worthy standout moments |

Each of a persona's runs rotates through 10 scenarios (first visit, hurry, oversharer,
skeptic, spooked, RETURN VISIT carrying a message from another character, group
spokesperson, distracted, lore-curious, wants-a-fortune) so 25 runs cover varied paths.

## Criteria

Universal (`criteria.mjs`): `in_character`, `pacing`, `personalization`, `return_hook`.
Plus one delight criterion per judge: `kid_safe_delight`, `teen_engagement`,
`gentle_magic`, `dad_appeal`, `clip_worthy`.

## Usage

```bash
# Smoke: 1 run per pair (25 conversations)
node scripts/halloween-judges/simulate.mjs --count 1 --out scripts/halloween-judges/results/smoke.jsonl

# Full panel: 25 per pair (625 conversations)
node scripts/halloween-judges/simulate.mjs --count 25

# Subset
node scripts/halloween-judges/simulate.mjs --agents orlok,mina --personas girl8 --count 5

# Report
node scripts/halloween-judges/analyze.mjs scripts/halloween-judges/results/sim-<date>.jsonl --out scripts/halloween-judges/results/report.md
```

Re-running with the same `--out` resumes (completed agent/persona/run triples are
skipped), so an interrupted batch is safe to restart.

API key: `ELEVENLABS_API_KEY` env var, else `/etc/monsterbox/elevenlabs.key`.

Cost note: simulations bill LLM usage only (both sides are text LLMs). Check the
first small batch's account usage before launching the full 625.
