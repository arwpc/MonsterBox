# Night Memory — the fleet remembers

After each night, harvest real conversation transcripts from every agent, distill
a Yard Registry document (guest names actually given + conversation summaries),
and attach it to all agents' knowledge bases — replacing the prior night's doc.
Characters then genuinely recognize returning guests on later nights.

```bash
node scripts/night-memory/scrub-test.mjs            # PHI suite — run this FIRST
node scripts/night-memory/harvest.mjs --dry-run     # preview the registry
node scripts/night-memory/harvest.mjs --hours 12    # harvest tonight, attach fleet-wide
```

Cron suggestion (2am after each show night) — note the `&&`, which makes the PHI
suite a precondition of publishing anything:
`0 2 * * * cd /home/remote/MonsterBox && node scripts/night-memory/scrub-test.mjs && node scripts/night-memory/harvest.mjs --hours 12`

Standalone ElevenLabs API client (key from `ELEVENLABS_API_KEY`, else
`/etc/monsterbox/elevenlabs.key`); no application code involved. Roster comes
from `scripts/halloween-judges/agents.json`. Prompts already instruct recognition
behavior via the registry document's own PURPOSE header — no per-agent prompt
changes needed.

Caveat: judge-panel simulations also appear as conversations — only run the
harvest after real show nights, or the castle will remember imaginary guests.

## Privacy

The registry stores **first names only**. Everything that reaches it passes
through `scrub.mjs`, which is an allow-list, not a deny-list: any run of two or
more consecutive capitalized tokens collapses to its first token unless the whole
run is an explicit canon phrase. A surname is removed because it is a second name
token — so surnames nobody has ever seen are removed too. It also strips emails
(typed and spoken), phone-like number runs, handles, links, dates, street
addresses (numbered, unnumbered and lowercase), apartment numbers, school names
and ages, then deletes every remaining digit except canon 1462. `isClean()` is a
final guard: a registry line still carrying a digit, an `@` or a URL is dropped
whole rather than published.

Two rules were adopted because the obvious version leaked, both proven against
real data:

- "keep a Capitalized pair if EITHER word is canon" kept **Emily Rodriguez**
  whole, because Emily is a canon name.
- "keep it if BOTH words are canon" kept **Aaron Warner**, and would keep any
  real child named Ben Rubin or Emily Castle — canon contains ordinary first
  names and ordinary surnames. Hence whole-phrase matching.

`scrub-test.mjs` is the adversarial suite (51 checks): full names in every shape
a transcript really produces, contact details, addresses, ages, schools — plus
canon cases asserting what must SURVIVE, so it cannot pass by deleting
everything. Run it before trusting a harvest; the cron line above enforces that.
