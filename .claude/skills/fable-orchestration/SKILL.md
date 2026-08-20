---
name: fable-orchestration
description: How to actually get value out of Claude Fable 5 and ultracode on MonsterBox — model and effort selection per job, the prompting shifts Fable needs (looser, not tighter), workflow shapes that survive on a 4-core Pi, and the delegation and verification patterns this repo has already paid for. Load when choosing a model for a subagent, authoring a workflow, deciding whether to fan out, or when a long agentic run is producing unreadable or unverified output.
---

# Fable 5 + ultracode on MonsterBox

## The one thing to internalise

**Prompts and skills written for older models are too prescriptive for Fable 5 and measurably
reduce its output quality.** Step-by-step scaffolding, "CRITICAL: you MUST", enumerated
prohibitions, forced progress cadences — these were mitigations for models that under-followed
instructions. Fable follows them literally and the scaffolding becomes the ceiling.

State the goal, the constraints, and how to verify. Let it choose the method. When migrating an
older prompt, the first experiment is *deleting* the scaffolding, not rewriting it.

This is the same direction as the Claude 5 context-engineering guidance, which is why the lean
CLAUDE.md and the topic skills in this repo are shaped the way they are.

## Cost, plainly

Fable 5 is **$10 / $50 per million tokens** — twice Opus 5's $5 / $25. It is not the default
upgrade; it is the tier you reach for when the problem is genuinely hard. 1M context (the
default *and* the maximum), 128K max output, thinking always on.

`effort` (`low` → `max`) is the real cost lever, and **Fable at `low`/`medium` often beats prior
models at `xhigh`**. Start at `high`, then sweep *down* and keep the cheapest level that holds
quality on your own work. Do not reflexively reach for `max` — it can overthink routine work.

## Choosing the model for a job

Set this in `.claude/agents/<name>.md` frontmatter — the keys are `model`, `effort`, `isolation`.
Pinning them explicitly matters: an agent with no `model:` inherits the session model, so when the
operator switches the session to Fable, every unpinned subagent silently doubles in cost.

| Job shape | Model | Why |
|---|---|---|
| Long-horizon, ambiguous, low physical blast radius — "find out what ElevenLabs ships now, upgrade the canonical implementation, prove it by ear" | `fable` | Exactly the profile Fable is best at: scope the problem, ask, execute across many steps |
| Hardware diagnosis, pose authoring, Python wrappers, security triage | `opus` | Deep reasoning, but with real-world blast radius — see the boundary rule below |
| Running suites and triaging, doc writing, the character-independence audit | `sonnet` | Judgment is classification, not deep reasoning; these run often |
| Pure mechanical transforms with a verifier behind them | `haiku` | Only where a wrong answer is cheaply caught |

**Do not put a hardware-driving agent on Fable.** Fable is documented to take unrequested-but-
adjacent actions, and on this fleet the adjacent action is commanding a servo on a rail that has
already blown a fuse. That is a deliberate exception, not an oversight.

## The four prompt blocks Fable needs on this repo

Fable is highly responsive to explicit communication-style instructions. Four are worth carrying
into any long-running agent here.

**1. Ground every progress claim in a tool result.** This is the single highest-value block for
MonsterBox, because the repo's recurring defect class is software reporting the number it was
*given* rather than the one it *used*.

> Before reporting progress, audit each claim against a tool result from this session. Only report
> work you can point to evidence for; if something is not yet verified, say so explicitly. If tests
> fail, say so with the output. If a step was skipped, say that. When something is done and
> verified, state it plainly without hedging.

**2. State the boundary.** Fable will otherwise do the helpful adjacent thing.

> When the operator is describing a problem or thinking out loud rather than requesting a change,
> the deliverable is your assessment — report it and stop. Before running anything that changes
> state (a restart, a deploy, a servo command, a mute change), check that the evidence supports
> that specific action. Do not command Orlok parts 3, 4 or 5, or Sir Dragomir part 1, at all.

**3. Delegate, and delegate asynchronously.** Fable's sub-agent coordination is dependable — the
opposite of Opus 5, which over-delegates and needs a cap. Here the guidance is to *encourage* it,
and to say when.

> Delegate independent subtasks and keep working while they run. Intervene if a subagent goes off
> track or is missing context. Do not delegate work you could finish in a handful of tool calls.

**4. Re-ground the final summary.** Deep into a long run, Fable produces dense shorthand the
operator never saw built.

> Terse shorthand between tool calls is fine. The final summary is different — it is the operator's
> first look at any of this. Lead with the outcome in one sentence, then the one or two things you
> need from them. Complete sentences, terms spelled out, no arrow chains, no labels you invented
> while working.

Two rarer ones: in a fully autonomous run add an instruction not to ask permission it does not need
and not to end a turn on a promise ("I'll now run X") without the tool call; and **never surface a
remaining-token countdown** to a Fable agent — it can trigger premature wrap-up.

## Workflow shapes that survive on this Pi

The runtime executes `min(16, cores − 2)` = **2 agents at a time** per workflow on a 4-core Pi.
The operator has confirmed **3 concurrent is fine**, so reach 3+ by running two workflows side by
side rather than by enlarging one. Wide adversarial fan-outs belong in a cloud session.

**Size an agent by what it can finish, not by what is logically one task.** The workflow journal
only records a result when an agent *returns*. An agent that dies at event 161 has journaled
nothing, so a resume replays nothing and the retry starts from zero. Counted across this repo's
sessions, monolithic agents produced `result=0` runs again and again while small schema'd agents
returned reliably.

Three habits that follow from that:

- **Have every agent write its result to disk as well as returning it.** A container restart during
  this very session destroyed a five-agent run mid-flight; the digests that had been written to
  `/tmp/` were the only thing recoverable.
- **Deterministic shell work belongs inline in the lead session**, not in an agent. The lead's own
  Bash results are checkpointed in the conversation permanently and survive any agent death.
- **Detect a hung agent by byte growth, not by the journal.** A healthy long agent also shows zero
  results. Compare `cat <transcriptDir>/agent-*.jsonl | wc -c` across ~70 seconds; kill at four
  minutes of zero growth.

Salvaging a dead run: the payload in `journal.jsonl` is under the key **`result`**, not `value`.
And when cleaning up processes, `pkill -f <pattern>` matches the shell running it and kills your own
Bash call with exit 144 — list PIDs with `ps` and kill by PID.

## Verification

For anything long-running, make self-verification explicit and give it a fresh context. A separate
verifier agent that never saw the build reliably outperforms asking the builder to self-critique.
On this repo the verification bar is physical, not textual: a deploy is proven by grepping the node
for the symbol, and audio is proven by ear-check. See `monsterbox-fleet` and `monsterbox-hardware`.

## Memory

Fable performs notably better when it can write what it learns somewhere durable. This project
already has that surface at `~/.claude/projects/-home-remote-MonsterBox/memory/` — one fact per
file, `MEMORY.md` as the index. Point long-running agents at it, tell them to consult it before
starting, and keep the format: one lesson per file, why it mattered, how to apply it. Update an
existing note rather than adding a near-duplicate; delete notes that turn out to be wrong.

## Give the reason, not just the request

Fable connects a task to relevant context instead of inferring intent, so the framing pays off:

> I'm working on <the larger goal> for <who it's for>. They need <what the output enables>. With
> that in mind: <request>.

And start at the top of your difficulty range — the best results here have come from handing it the
hardest unsolved problem first, letting it scope and ask, then executing.
