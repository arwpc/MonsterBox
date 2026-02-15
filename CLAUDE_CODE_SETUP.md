# Claude Code Integration — Quick Start Guide

## What Was Configured

This workspace is now optimized for Claude Code (CLI + VS Code extension) on the Raspberry Pi 4B.

### Files Created/Modified

1. **[CLAUDE.md](CLAUDE.md)** — Project memory (read automatically at session start)
   - MonsterBox conventions, architecture, common pitfalls
   - Jaw animation system details
   - Character profiles, test workflows

2. **[.vscode/settings.json](.vscode/settings.json)** — Claude Code + performance settings
   - Auto-read CLAUDE.md on session start
   - Inline edit mode enabled
   - Command auto-execution (no confirmations)
   - File watcher excludes for RPI performance
   - Python/Node.js configs for MonsterBox stack

3. **[.vscode/tasks.json](.vscode/tasks.json)** — Quick-launch tasks
   - 12 tasks including: test suites, service restart, log viewing, jaw animation tests
   - Access via `Ctrl+Shift+P → Tasks: Run Task`
   - Default build: "Restart MonsterBox Service" (`Ctrl+Shift+B`)
   - Default test: "Verify (Full Test Suite)" (`Ctrl+Shift+T`)

4. **[~/.claude/projects/-home-remote/memory/MEMORY.md](~/.claude/projects/-home-remote/memory/MEMORY.md)** — Auto-memory
   - Cross-session learnings (auto-populated)
   - Persistent across all projects in `/home/remote`

5. **[.gitignore](.gitignore)** — Ignore Claude cache
   - Added `.claude/` (except memory/ subdir)
   - **IMPORTANT:** Removed `.vscode/` from gitignore so settings are committed

6. **[MonsterBox.code-workspace](MonsterBox.code-workspace)** — Workspace file
   - Open with `code MonsterBox.code-workspace` to load full config
   - Auto-checks service status on workspace open

7. **[.vscode/launch.json](.vscode/launch.json)** — Debug configurations
   - Launch MonsterBox Server with debugger
   - Debug Mocha tests
   - Test jaw animation scripts

8. **[.vscode/README.md](.vscode/README.md)** — VS Code configuration guide
   - Explains auto-restoration after reset
   - Troubleshooting steps

---

## ✅ Auto-Restoration After VS Code Reset

**Everything is committed to git** — when you reopen VS Code, all settings automatically restore:

### How to Reopen the Workspace

**Method 1: Workspace File (Recommended)**
```bash
code /home/remote/MonsterBox/MonsterBox.code-workspace
```

**Method 2: Direct Folder**
```bash
code /home/remote/MonsterBox
```

Both methods load all `.vscode/` settings automatically.

### What Auto-Restores

✅ Claude Code auto-execution (no confirmations)
✅ All 12 quick-launch tasks
✅ CLAUDE.md auto-load on session start
✅ File watcher exclusions (RPI performance)
✅ Terminal auto-approve rules
✅ Debug configurations
✅ Extension recommendations

### Verification After Reopen

```bash
# 1. Open workspace
code /home/remote/MonsterBox/MonsterBox.code-workspace

# 2. Check tasks available
# Press Ctrl+Shift+P → "Tasks: Run Task"
# You should see 12 MonsterBox tasks

# 3. Verify Claude Code reads CLAUDE.md
# Ask: "What's the current character?"
# Should answer: "Orlok (character 3)" without extra context

# 4. Test auto-execution
# Say: "Run the test suite"
# Should execute npm run verify without confirmation
```

See [.vscode/README.md](.vscode/README.md) for detailed restoration guide.

---

## How to Use Claude Code

### Terminal (already running)

You're using it right now. Just type naturally:

```
"Fix the failing jaw animation tests"
"Add error handling to the audio playback service"
"Show me how the servo calibration works"
```

Claude Code will read CLAUDE.md automatically and have full MonsterBox context.

### VS Code Extension (if installed)

1. Open Command Palette: `Ctrl+Shift+P`
2. Type `Claude Code: Open Chat`
3. OR click the Claude icon in the sidebar

### Quick Actions

**Run Tasks:**
- `Ctrl+Shift+B` → Restart MonsterBox Service (default build)
- `Ctrl+Shift+P → Tasks: Run Task` → choose from 12 tasks

**Common workflows:**
```
# After editing server-side code:
Ctrl+Shift+B (restart service)
Then: Ctrl+Shift+P → Run Task → "Verify (Full Test Suite)"

# View live logs:
Ctrl+Shift+P → Run Task → "View Service Logs"

# Test jaw animation:
Ctrl+Shift+P → Run Task → "Test Jaw Animation (Direct)"
```

---

## Enabling Auto-Execution (No Confirmations)

**Already configured!** The workspace settings include:

```json
"claude.confirmBeforeExecutingCommands": false
```

This means Claude Code will:
- ✅ Edit files without asking
- ✅ Run terminal commands without asking
- ✅ Create/delete files without asking

**To disable** (require manual approval):
1. Open [.vscode/settings.json](.vscode/settings.json)
2. Change `"claude.confirmBeforeExecutingCommands": false` to `true`

**Global override** (all projects):
Edit `~/.vscode/settings.json` or use VS Code Settings UI:
- `Ctrl+,` (Settings)
- Search "claude confirm"
- Toggle "Claude: Confirm Before Executing Commands"

---

## Auto-Approval Configuration Details

### What's Already Auto-Approved

From your existing Copilot Agent config (also inherited by Claude Code):

**Terminal Commands:**
- ✅ Core filesystem: `ls`, `cat`, `grep`, `find`, `sed`, `awk`, etc.
- ✅ Git operations (except branch deletion)
- ✅ Package managers: `npm`, `pip`, `apt`, `docker`
- ✅ Development tools: `node`, `mocha`, `playwright`
- ✅ System management: `systemctl`, `journalctl`, `sudo`
- ✅ SSH/networking: `ssh`, `scp`, `rsync`, `curl`, `wget`
- ❌ **Blocked:** `rm -rf /`, `mkfs`, `dd of=/dev/`, destructive operations

**File Operations:**
- ✅ Read any file
- ✅ Edit any file
- ✅ Create new files
- ✅ Delete files (via explicit tool calls, not `rm -rf`)

### Safety Guardrails

Even with auto-execution enabled, Claude Code has built-in safety:
1. **No destructive root operations** — `rm -rf /`, `mkfs`, filesystem formatting blocked
2. **Git safety** — No force push to main/master, no uncommitted work loss
3. **Semantic analysis** — Claude validates commands before execution
4. **Sandboxing** — Runs in user context (not root) by default

---

## Performance Optimizations for RPI4B

**File Watchers:** Disabled for `node_modules/`, `.vscode-server/`, `data/audio-library/`
- Saves CPU cycles and I/O bandwidth
- Reduces inotify watch count (Linux limit: 8192 by default)

**Git Operations:** Auto-fetch and auto-refresh disabled
- Manual `git pull` when needed
- Reduces background network/disk activity

**Editor:** Minimap disabled, selective quick suggestions
- Reduces memory footprint and render overhead

**Terminal:** Persistent sessions disabled, 10k line scrollback
- Faster terminal startup, lower memory usage

---

## VS Code Tasks Reference

| Task | Keyboard | Command |
|------|----------|---------|
| Restart Service | `Ctrl+Shift+B` | `sudo systemctl restart monsterbox.service` |
| Full Test Suite | `Ctrl+Shift+T` | `npm run verify` |
| Unit Tests | — | `npm run test:unit` |
| System Tests | — | `npm run test:system` |
| Browser Tests | — | `npm run test:e2e` |
| Quick Tests | — | `npm run test:quick` |
| View Logs (live) | — | `sudo journalctl -u monsterbox.service -f` |
| Check Status | — | `sudo systemctl status monsterbox.service` |
| Dev Server | — | `npm run dev` |
| Test Jaw (Direct) | — | `node scripts/test-jaw-direct.mjs` |
| Test Jaw (HTTP) | — | `node scripts/test-jaw-sync.mjs` |
| Restart + Test | — | Sequential: restart → verify |

---

## Example Workflows with Claude Code

### 1. Fix a Bug
```
User: "The jaw servo is closing too slowly. Reduce the releaseTime."
Claude: [Reads CLAUDE.md, finds super-powers.json location]
        [Edits data/character-3/super-powers.json, changes releaseTime from 80 to 50]
        [Restarts service]
        [Runs test]
        "Done. releaseTime reduced from 80ms to 50ms. Service restarted. Tests pass."
```

### 2. Investigate an Issue
```
User: "Why are the jaw animation tests timing out?"
Claude: [Reads test file, notices missing --exit flag]
        [Checks CLAUDE.md, finds "Common Pitfalls: Test Hangs"]
        "Tests hang because Mocha doesn't exit cleanly after completion. The tests need
         the --exit flag. This is documented in CLAUDE.md under 'Common Pitfalls'."
```

### 3. Add a Feature
```
User: "Add a /health endpoint that returns service status and uptime."
Claude: [Reads routes structure, finds patterns in existing code]
        [Creates routes/health.js with uptime logic]
        [Adds route to server.js]
        [Creates test in tests/system/health.test.js]
        [Runs npm run verify]
        "Added /health endpoint at line 87 of server.js. Returns JSON with status and
         uptime. All 119 tests pass."
```

---

## Troubleshooting

### "Claude Code isn't reading CLAUDE.md"
**Fix:** Check [.vscode/settings.json](.vscode/settings.json:8):
```json
"claude.autoReadClaudeMd": true
```

### "Terminal commands require approval"
**Fix:** Check [.vscode/settings.json](.vscode/settings.json:10):
```json
"claude.confirmBeforeExecutingCommands": false
```

### "Auto-memory not persisting"
**Fix:** Ensure directory exists:
```bash
ls ~/.claude/projects/-home-remote/memory/
```

### "File watcher performance issues"
**Already configured** — excluded directories in [.vscode/settings.json](.vscode/settings.json:13-22).
If still slow, increase Linux inotify limit:
```bash
echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

---

## What's Next

1. **Commit the setup:**
   ```bash
   git add CLAUDE.md CLAUDE_CODE_SETUP.md .vscode/ .gitignore
   git commit -m "Add Claude Code integration and optimization for RPI4B"
   ```

2. **Try Claude Code with a real task:**
   - "Investigate why TTS audio amplitude is below volumeThreshold in test-jaw-direct"
   - "Add a config validation endpoint to jaw-animation API"
   - "Profile CPU usage during simultaneous TTS + jaw drive"

3. **Refine CLAUDE.md** as you discover patterns:
   - Add new pitfalls as you encounter them
   - Document hardware quirks (GPIO pin assignments, I2C addresses)
   - Capture character-specific tuning (voice settings, calibration notes)

---

**Quick Reference Card**

```
┌─────────────────────────────────────────────────────────┐
│ CLAUDE CODE — MONSTERBOX QUICK REFERENCE               │
├─────────────────────────────────────────────────────────┤
│ Auto-execution:  ✅ Enabled (no confirmations)          │
│ Project memory:  CLAUDE.md (auto-loaded)               │
│ Auto-memory:     ~/.claude/projects/-home-remote/memory│
│                                                         │
│ SHORTCUTS:                                              │
│  Ctrl+Shift+B  → Restart service                       │
│  Ctrl+Shift+T  → Run full test suite                   │
│  Ctrl+Shift+P  → Tasks: Run Task (12 available)        │
│                                                         │
│ COMMON TASKS:                                           │
│  "Fix the failing tests"                               │
│  "Show me how [feature] works"                         │
│  "Add error handling to [service]"                     │
│  "Why is [thing] happening?"                           │
│  "Restart service and run tests"                       │
│                                                         │
│ FILES TO KNOW:                                          │
│  CLAUDE.md              — Project context              │
│  .vscode/settings.json  — Auto-execution config        │
│  .vscode/tasks.json     — Quick-launch tasks           │
└─────────────────────────────────────────────────────────┘
```

---

*Setup completed: 2025-02-14*
*MonsterBox v5.5.2 on Raspberry Pi 4B*
