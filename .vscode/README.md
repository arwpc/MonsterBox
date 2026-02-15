# VS Code Configuration — Auto-Restoration Guide

## Files in This Directory

| File | Purpose | Committed to Git |
|------|---------|-----------------|
| `settings.json` | Workspace settings (Claude Code, RPI optimizations) | ✅ Yes |
| `tasks.json` | Quick-launch tasks (12 commands) | ✅ Yes |
| `launch.json` | Debug configurations | ✅ Yes |
| `extensions.json` | Recommended extensions | ✅ Yes |
| `README.md` | This file | ✅ Yes |

## Auto-Restoration After Reset

When you reset/reload VS Code, these settings automatically restore:

### ✅ What Survives a Reset

1. **Workspace Settings** (`.vscode/settings.json`)
   - Claude Code auto-execution enabled
   - File watcher exclusions for RPI performance
   - Terminal auto-approve rules
   - Python/Node.js configs

2. **Tasks** (`.vscode/tasks.json`)
   - All 12 quick-launch tasks
   - Keyboard shortcuts (Ctrl+Shift+B, Ctrl+Shift+T)

3. **Debug Configurations** (`.vscode/launch.json`)
   - Launch MonsterBox Server (with debugger)
   - Debug Mocha Tests
   - Test Jaw Animation Direct

4. **Project Memory** (`CLAUDE.md` in root)
   - Automatically read by Claude Code on session start
   - Contains MonsterBox architecture, conventions, pitfalls

5. **Extension Recommendations** (`.vscode/extensions.json`)
   - Claude Code, Copilot, Playwright, ESLint, Python

### ❌ What Doesn't Survive (by design)

- Open files/tabs — use "File → Reopen Closed Editor" or workspace file
- Terminal sessions — disposable, recreated on demand
- Running tasks — must be manually restarted

## How to Open the Workspace

**Method 1: Workspace File (Recommended)**
```bash
code /home/remote/MonsterBox/MonsterBox.code-workspace
```
This opens VS Code with the full configuration active immediately.

**Method 2: Direct Folder**
```bash
code /home/remote/MonsterBox
```
This also works — `.vscode/` settings apply automatically.

**Method 3: From VS Code UI**
```
File → Open Workspace from File → MonsterBox.code-workspace
```

## Verifying Auto-Restoration

After opening the workspace, check:

1. **Claude Code enabled:**
   - Open Command Palette (`Ctrl+Shift+P`)
   - Type "Claude Code" — you should see commands

2. **Tasks available:**
   - Press `Ctrl+Shift+P`
   - Type "Tasks: Run Task"
   - You should see 12 MonsterBox-specific tasks

3. **Auto-execution active:**
   - Open `.vscode/settings.json`
   - Line 126: `"claude.confirmBeforeExecutingCommands": false`

4. **CLAUDE.md loaded:**
   - Ask Claude Code: "What's the current character?"
   - It should answer "Orlok (character 3)" without asking for context

## First-Time Setup on a New Machine

If you clone the repo on a new RPI4B:

```bash
# 1. Clone the repo
git clone <repo-url> /home/remote/MonsterBox
cd /home/remote/MonsterBox

# 2. Install dependencies
npm install

# 3. Open workspace in VS Code
code MonsterBox.code-workspace

# 4. Install recommended extensions (when prompted)
# - Claude Code, Copilot, Playwright, ESLint, Python

# 5. Verify service is running
sudo systemctl status monsterbox.service

# 6. Run tests to confirm
npm run verify
```

**That's it!** All `.vscode/` settings are committed to git and apply automatically.

## Customization

To modify settings:

**Workspace-specific** (applies only to MonsterBox):
- Edit `.vscode/settings.json` (committed to git)

**User-global** (applies to all projects):
- Edit `~/.vscode/settings.json` (not in git)
- Or: `Ctrl+,` → Settings UI → toggle "User" tab

## Troubleshooting

### "Tasks not showing up"
**Fix:** Open `MonsterBox.code-workspace` instead of just the folder:
```bash
code /home/remote/MonsterBox/MonsterBox.code-workspace
```

### "Claude Code not auto-executing"
**Fix:** Check `.vscode/settings.json` line 126:
```json
"claude.confirmBeforeExecutingCommands": false
```

### "CLAUDE.md not being read"
**Fix:** Check `.vscode/settings.json` line 124:
```json
"claude.autoReadClaudeMd": true
```

### "File watchers consuming too much RAM"
**Already configured** — excluded directories in `settings.json:134-140`.
Current exclusions:
- `node_modules/`
- `dist/`, `build/`
- `.vscode-server/`
- `.claude/`
- `data/audio-library/`

---

*Updated: 2025-02-14*
