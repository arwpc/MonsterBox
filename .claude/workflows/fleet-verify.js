export const meta = {
  name: 'fleet-verify',
  description: 'Prove what each live animatronic is ACTUALLY running and hearing — by grep and by log, never by version string',
  whenToUse: 'After any deploy, before tagging a release, or whenever a node "looks fine" but behaves wrong. Pass {symbols:[...]} to prove a specific fix landed.',
  phases: [
    { title: 'Roster', detail: 'read the fleet roster from config, ping each entry' },
    { title: 'Nodes', detail: 'one agent per live node: health, deployed-symbol grep, both logs, mute state' },
    { title: 'Synthesis', detail: 'single fleet verdict, separating proven from claimed' },
  ],
}

// The roster is NOT hardcoded here. Workflow scripts run in a sandbox with no filesystem
// access, so the script itself cannot read config/animatronics.json — an agent reads it in
// the Roster phase below and returns the list. That keeps this file character-independent
// (audit:independence forbids hardcoded names, character ids and node IPs) and means adding
// or re-addressing an animatronic needs no edit here, the same rule the deploy scripts follow.
const ROSTER_SCHEMA = {
  type: 'object',
  properties: {
    nodes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          ip: { type: 'string' },
          characterId: { type: 'integer' },
          reachable: { type: 'boolean' },
        },
        required: ['name', 'ip', 'characterId', 'reachable'],
      },
    },
    skipped: { type: 'string' },
  },
  required: ['nodes'],
}

const symbols = (args && args.symbols) || []

const GROUND_RULES = [
  'GROUND RULES — each encodes an incident, not a preference. Violating one produces a confidently wrong report.',
  '',
  '1. A version number is not proof. Deploys rsync files and exclude .git, so a node git HEAD',
  '   and its /health version BOTH lie about what code is running — peer nodes have been seen',
  '   reporting v9.3.0 while running current code. Prove a fix by grepping the real file on the node.',
  '2. SSH lands in /home/remote, NOT the repo. Every remote command needs an absolute path or a',
  '   leading "cd /home/remote/MonsterBox &&". A bare npm run over SSH fails in a way that reads',
  '   exactly like a missing script. Credentials:',
  '   sudo grep MONSTERBOX_SSH_PASSWORD /etc/monsterbox/env | cut -d= -f2-',
  '   then sshpass -e ssh -o StrictHostKeyChecking=no remote@<ip> "..."',
  '3. Read BOTH logs. console.log goes to /var/log/monsterbox.log; console.warn and console.error',
  '   go ONLY to /var/log/monsterbox.err. The refusal reason sits in .err while .log reads healthy.',
  '   Logs are binary-ish, so every read is grep -a.',
  '4. Establish the boot boundary before reading a log tail. monsterbox.err has no timestamps of',
  '   its own; a previous session raised a false servo alarm off a timestamp-less tail and the',
  '   spins turned out to be historical. Anchor on',
  '   systemctl show -p ActiveEnterTimestamp monsterbox.service',
  '5. Node-local files differ per node by design — parts.json, calibration_profiles.json,',
  '   super-powers.json, app-config.json are excluded from deploy. NEVER read one node copy to',
  '   reason about another.',
  '6. Change nothing. No restarts, deploys, commits, servo commands, audio playback, or mute',
  '   changes. This is a read-only proof pass.',
].join('\n')

const NODE_REPORT = {
  type: 'object', additionalProperties: false,
  required: ['node', 'reachable', 'health', 'symbols', 'logFindings', 'verdict'],
  properties: {
    node: { type: 'string' },
    reachable: { type: 'boolean' },
    health: {
      type: 'object', additionalProperties: false,
      properties: {
        httpOk: { type: 'boolean' },
        reportedVersion: { type: 'string', description: 'what /health CLAIMS — unverified by definition' },
        muted: { type: 'string', enum: ['true', 'false', 'unknown'] },
        uptimeNote: { type: 'string' },
      },
    },
    symbols: {
      type: 'array',
      description: 'per requested symbol: is it actually present in the deployed file on THIS node',
      items: {
        type: 'object', additionalProperties: false, required: ['symbol', 'present', 'evidence'],
        properties: { symbol: { type: 'string' }, present: { type: 'boolean' }, evidence: { type: 'string' } },
      },
    },
    logFindings: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['source', 'line', 'sinceBoot', 'reading'],
        properties: {
          source: { type: 'string', enum: ['monsterbox.log', 'monsterbox.err'] },
          line: { type: 'string' },
          sinceBoot: { type: 'boolean', description: 'false = historical, do not raise as new' },
          reading: { type: 'string' },
        },
      },
    },
    verdict: { type: 'string' },
    unproven: { type: 'array', items: { type: 'string' } },
  },
}

phase('Roster')

// Read the fleet roster from config rather than hardcoding it here. This agent also
// pings each entry, so nodes that are powered down are reported as unreachable rather
// than silently dropped — "in storage" is an operator fact, not a constant in this file.
const roster = await agent(`Read config/animatronics.json in /home/remote/MonsterBox and return
the fleet roster.

For every entry that has a non-null ip and an id, return { name, ip, characterId, reachable }.
Use the entry's characterId when present, otherwise its id. Skip entries with no ip (never seen
on the network) and say so in "skipped".

Set reachable by trying: curl -sk --max-time 6 https://<ip>:3000/health
Do NOT treat an unreachable node as an error or a finding — some animatronics are physically in
storage and being offline is expected. Just report reachable:false.

Return the structured roster only.`,
  { label: 'roster', phase: 'Roster', schema: ROSTER_SCHEMA })

const NODES = ((roster && roster.nodes) || []).filter(n => n && n.reachable)
const offline = ((roster && roster.nodes) || []).filter(n => n && !n.reachable)
if (offline.length) log(`skipping ${offline.length} unreachable node(s): ${offline.map(n => n.name).join(', ')} — expected for anything in storage`)
if (!NODES.length) return { error: 'No reachable animatronics in config/animatronics.json', roster }

phase('Nodes')

const symbolTask = symbols.length
  ? 'Prove these symbols are present in the deployed code ON THIS NODE by grepping the real file, not git:\n   - ' + symbols.join('\n   - ')
  : 'No symbols were requested — skip the symbol grep and return an empty array.'

const reports = (await parallel(NODES.map(n => () =>
  agent(GROUND_RULES + `

TARGET: ${n.name} at ${n.ip} (characterId ${n.characterId}).

Establish, with evidence:
1. Is it serving? curl -sk https://${n.ip}:3000/health — record the version it CLAIMS and
   label it unverified.
2. Is it muted? A muted node reports played:true and makes no sound, so every audio claim
   downstream of an unchecked mute is worthless.
3. ${symbolTask}
4. Read BOTH logs since the boot boundary. Report only what a human would act on, and mark
   anything older than the current service start as sinceBoot:false.

Return the structured report. If you could not establish something, put it in "unproven"
rather than inferring it.`,
    { label: `node:${n.name}`, phase: 'Nodes', schema: NODE_REPORT })
))).filter(Boolean)

log(`${reports.length}/${NODES.length} live nodes reported`)

phase('Synthesis')

const verdict = await agent(`You are writing the fleet verdict for the operator, Aaron.

Per-node reports (JSON):
${JSON.stringify(reports)}

Lead with the outcome: one sentence on whether the fleet is in the state it is supposed to
be in. Then, per node, only what changed or is wrong.

Hard rules:
- Separate PROVEN from CLAIMED. A version a node reported is claimed; a symbol found by
  grep in that node own file is proven.
- Nothing here is ear-verified. If any audio behaviour is in question, say plainly that it
  needs an ear-check (record and transcribe); never let an API success field stand in.
- PumpkinHead, Groundbreaker and Renfield are in storage. Their absence is not a finding.
- Write complete sentences and spell terms out. No arrow chains, no shorthand you invented
  while working — the operator did not watch you work.`,
  { label: 'synthesis', phase: 'Synthesis' })

return { reports, verdict }
