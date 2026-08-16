# Night Memory — the fleet remembers

After each night, harvest real conversation transcripts from every agent, distill
a Yard Registry document (guest names actually given + conversation summaries),
and attach it to all agents' knowledge bases — replacing the prior night's doc.
Characters then genuinely recognize returning guests on later nights.

```bash
node scripts/night-memory/harvest.mjs --dry-run     # preview the registry
node scripts/night-memory/harvest.mjs --hours 12    # harvest tonight, attach fleet-wide
```

Cron suggestion (2am after each show night):
`0 2 * * * node scripts/night-memory/harvest.mjs --hours 12`

Standalone ElevenLabs API client (key from /etc/monsterbox/elevenlabs.key); no
application code involved. Roster comes from scripts/halloween-judges/agents.json.
Prompts already instruct recognition behavior via the registry document's own
PURPOSE header — no per-agent prompt changes needed.

Caveat: judge-panel simulations also appear as conversations — only run the
harvest after real show nights, or the castle will remember imaginary guests.
