# Proposed `.claude/settings.json` permissions — needs the operator's hand

This was asked for three sessions running and it cannot be applied by an agent: editing
your own permission allowlist is a privilege-escalation shape, and Claude Code's auto-mode
classifier blocks it by design. That is the correct behaviour — the block is the feature,
not a bug to route around. **Apply this by hand, or ask for it in an interactive session
where you can approve the edit yourself.**

Merge these entries into the existing `permissions.allow` array in `.claude/settings.json`
(keep everything already there — this is an addition, not a replacement):

```json
      "Bash(git add:*)",
      "Bash(git commit:*)",
      "Bash(git tag:*)",
      "Bash(npm run deploy:all)",
      "Bash(curl -sk https://192.168.8.120:3000/*)",
      "Bash(curl -sk https://192.168.8.130:3000/*)",
      "Bash(curl -sk https://192.168.8.140:3000/*)",
      "Bash(curl -sk https://localhost:3000/*)",
      "Bash(curl -s http://localhost:3100/*)",
      "Bash(wpctl:*)",
      "Bash(pw-dump:*)",
      "Bash(i2cdetect:*)",
      "Bash(arecord:*)",
      "Bash(aplay -l)",
      "Bash(lsusb:*)",
      "Bash(grep -a:*)",
      "Bash(tail:*)",
      "Bash(head:*)",
      "Bash(wc:*)",
      "mcp__claude_ai_ElevenLabs__*"
```

## Why each one

- **`mcp__claude_ai_ElevenLabs__*`** — the six agent prompts live at ElevenLabs, and every
  session so far has had to re-establish that the connector works. Two agents were lost
  outright to a stale "needs authorization" notice.
- **The three node `curl -sk` rules** — Orlok `.120`, Dragomir `.130`, Mina `.140`. Health,
  mute state and fleet status are checked dozens of times a session. `localhost:3000` is
  whichever node you are on; `localhost:3100` is the plain-HTTP test listener the browser
  suite needs.
- **`wpctl` / `pw-dump`** — the only audio-graph tools installed. `pactl` and `bc` are not
  on these nodes; reaching for them wastes a turn every time.
- **`i2cdetect` / `arecord` / `lsusb`** — the PCA9685 scan, the acoustic witness, and the
  USB VID:PID probe. All read-only.
- **`grep -a` / `tail` / `head` / `wc`** — the logs are binary-ish, so every log read is
  `grep -a`, and there are two files per node to check.

## Two of these are NOT read-only — deliberate, but know what you are allowing

- **`git add` / `git commit` / `git tag`** let a session commit without asking. Reasonable
  for an overnight run; it does mean an unattended session can write history. `git push` is
  deliberately NOT on the list, so nothing leaves the machine unprompted.
- **`npm run deploy:all`** writes code to all three animatronics. This is the one entry with
  real blast radius. Add it only if you want unattended deploys; leave it off and you will be
  asked once per deploy, which is cheap.

`.claude/settings.local.json` is gitignored and already holds a few one-off command
allowances; anything you do not want in the repo belongs there instead.
