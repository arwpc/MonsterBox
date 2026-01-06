# MonsterBox Agent Handoff - Complete Goblin Deployment & v5.4 Release

## Mission
Complete Goblin deployment, comprehensive testing, and release MonsterBox 5.4 to all animatronics.

## Current State

### ✅ Completed (Previous Agent)
1. **Automatic Scene Execution** - Live connection testing works perfectly
2. **Console Blanker Service** - Deployed to Goblin One and Goblin Three
3. **Video Dropdown** - Fully restored with async loading
4. **Goblin Standardization** - Renamed `goblin-gold` → `goblin` throughout codebase

### ⏸️ Blocked (Your Mission)
1. **Deploy CLI Fix to Goblin Two** - Goblin currently offline
2. **Test ReturnToQueue Behavior** - Needs online goblins
3. **Comprehensive Page Testing** - Using Chrome DevTools Browser MCP
4. **Version 5.4 Release** - Commit, tag, and deploy to all animatronics

## Architecture Context

### Goblin System
- **Goblin One**: 192.168.8.40 (Music Room) - Console blanker deployed
- **Goblin Two**: 192.168.8.160 (Halloween Display) - **NEEDS DEPLOYMENT**
- **Goblin Three**: 192.168.8.14 (Halloween Display) - Console blanker deployed

### Animatronics
- **Orlok**: 192.168.8.17 (Count Orlok - vampire)
- **Coffin Breaker**: 192.168.8.150 (Coffin breaker)
- **Groundbreaker**: 192.168.8.157 (Ground breaker)
- **Pumpkinhead**: (IP unknown - check network)
- **Skulltalker**: (IP unknown - check network)

### Critical Files
- **Deployment Script**: `./scripts/deploy-goblin-stability-fix.sh`
- **Scene Executor**: `services/scenes/sceneExecutor.js` (live connection testing)
- **Video Dropdown**: `views/scenes/scene-editor.ejs` (lines 673-854)
- **Console Blanker**: `goblin/scripts/console-blanker.sh`
- **MPV Controller**: `goblin/src/mpvController.js` (pre-playback blanking)

## Your Tasks (Execute Without Human Intervention)

### Phase 1: Goblin Deployment (Priority 1)

**Objective**: Get all three goblins online and deploy CLI fix to Goblin Two.

**Steps**:
1. Check goblin connectivity (avoid curl with pipes - use browser or node script):
   ```bash
   # Use node script or fetch API to check:
   # GET http://localhost:3000/goblin-management/api/goblins
   ```

2. If goblins are offline, check if they're pingable:
   ```bash
   ping -c 3 192.168.8.40  # Goblin One
   ping -c 3 192.168.8.160 # Goblin Two
   ping -c 3 192.168.8.14  # Goblin Three
   ```

3. Deploy CLI fix to Goblin Two:
   ```bash
   ./scripts/deploy-goblin-stability-fix.sh 192.168.8.160
   ```

4. Verify all three goblins have console blanker running:
   - Use browser to navigate to: `http://localhost:3000/goblin-management`
   - Check status of all three goblins
   - Verify "Console Blanker: Active" or similar indicator

**Success Criteria**:
- ✅ All three goblins show "online" status
- ✅ Console blanker service running on all three
- ✅ Health endpoints respond: `http://192.168.8.XX:3001/health`

### Phase 2: Test ReturnToQueue Behavior (Priority 1)

**Objective**: Verify video returns to queue after immediate playback.

**Steps**:
1. Navigate to goblin management
2. Start a queue playing on Goblin Three (has 57 videos cached)
3. Execute scene #22 "Goblin One Spinster Test" (should interrupt queue)
4. Observe:
   - Video plays immediately
   - After completion, queue resumes (not from beginning)
   - Console stays blank on goblin display

**Success Criteria**:
- ✅ Spinster video plays immediately (interrupts queue)
- ✅ Queue resumes after video finishes
- ✅ No CLI visible during transition
- ✅ No manual reconnection needed

### Phase 3: Comprehensive Testing with Browser MCP (Priority 1)

**Objective**: Test every MonsterBox page with zero console errors.

**Important**: Use Chrome DevTools Browser MCP for all testing. This automatically validates:
- No console errors/warnings
- No HTTP 5xx responses
- No network failures
- Visual rendering correctness

**Pages to Test**:

1. **Dashboard** (`/`)
   - Navigate and check console
   - Verify character selector works
   - Check hardware status indicators

2. **Calibration** (`/setup/calibration`)
   - Select character (Orlok - ID 3)
   - Select part (servo-jaw)
   - Test jog controls (up/down)
   - Verify position updates
   - Save calibration
   - **Critical**: No console errors during part selection

3. **Characters** (`/setup/characters`)
   - View all characters
   - Edit character (Orlok)
   - Update character details
   - Save successfully

4. **Parts** (`/setup/parts`)
   - View parts list
   - Create new part
   - Edit existing part
   - Delete test part

5. **Poses** (`/poses`)
   - View poses for Orlok
   - Create new pose
   - Edit pose positions
   - Execute pose
   - Delete test pose

6. **Scenes** (`/scenes`)
   - View scenes list
   - Create new scene
   - Add multiple step types:
     - Say This step
     - Servo step
     - Audio step
     - Goblin Video step (verify dropdown works!)
   - Test scene execution
   - Delete test scene

7. **Audio Library** (`/audio`)
   - View audio files
   - Upload audio file
   - Play audio file
   - Delete test audio

8. **Goblin Management** (`/goblin-management`)
   - View all goblins
   - Check goblin status
   - Scan videos on Goblin Three
   - Start/stop queue
   - Play individual video
   - Verify video dropdown in scene editor populates

9. **AI Management** (`/ai-management`)
   - View STT settings
   - View AI Agent settings
   - View TTS settings
   - Test voice preview

10. **Conversation Mode** (`/conversation`)
    - Load conversation interface
    - Verify WebSocket connection
    - Check microphone permissions (may skip)
    - Verify no console errors

**Testing Method** (use Browser MCP):
```javascript
// Example workflow for each page:
await browser_navigate({ url: 'http://localhost:3000/page-url' });
await browser_wait_for({ time: 2 }); // Let page fully load
const console = await browser_console_messages({ onlyErrors: true });
const snapshot = await browser_snapshot(); // Verify elements render
const network = await browser_network_requests(); // Check for failures

// Assert no errors
if (console.length > 0) {
  throw new Error(`Console errors on /page-url: ${JSON.stringify(console)}`);
}
```

**Success Criteria**:
- ✅ All 10 pages load without console errors
- ✅ All interactive elements work (buttons, forms, dropdowns)
- ✅ All API calls return 2xx status codes
- ✅ Video dropdown in scene editor populates correctly
- ✅ No JavaScript exceptions thrown

### Phase 4: Git Commit & Version 5.4 Tag (Priority 2)

**Objective**: Commit all changes and tag as version 5.4.

**Steps**:
1. Review all changes:
   ```bash
   git status
   git diff
   ```

2. Stage all changes:
   ```bash
   git add -A
   ```

3. Commit with descriptive message:
   ```bash
   git commit -m "Release v5.4: Goblin system standardization, console blanker, video dropdown, auto-reconnect

   Major Features:
   - Automatic scene execution with live connection testing
   - Console blanker service prevents CLI visibility on goblins
   - Video dropdown with async loading in scene editor
   - Goblin system standardized (renamed goblin-gold → goblin)
   - Pre-playback console blanking in MPV controller
   
   Deployment:
   - Console blanker deployed to Goblin One, Two, Three
   - Updated sceneExecutor.js with automatic heartbeat
   - All improvements tested and verified
   
   Testing:
   - Comprehensive page testing with Browser MCP
   - All pages load without console errors
   - Video dropdown functionality confirmed
   - ReturnToQueue behavior verified
   
   Hardware Safety:
   - No GPIO/I2C changes
   - MB_TEST_MODE=1 for safe testing
   - All changes reversible"
   ```

4. Tag the release:
   ```bash
   git tag -a v5.4.0 -m "MonsterBox 5.4 - Goblin System Complete"
   ```

5. Push to GitHub:
   ```bash
   git push origin main
   git push origin v5.4.0
   ```

**Success Criteria**:
- ✅ All changes committed
- ✅ Version tagged as v5.4.0
- ✅ Pushed to GitHub successfully

### Phase 5: Deploy to All Animatronics (Priority 2)

**Objective**: Deploy MonsterBox 5.4 to all five animatronics.

**Pre-Deployment Checklist**:
- ✅ All tests pass on Orlok (current machine)
- ✅ Git committed and tagged
- ✅ No console errors on any page
- ✅ Goblins all working correctly

**Deployment Script** (create if doesn't exist):
```bash
#!/bin/bash
# deploy-monsterbox-v5.4.sh
# Deploys MonsterBox 5.4 to all animatronics

ANIMATRONICS=(
  "orlok:192.168.8.17"
  "coffin:192.168.8.150"
  "groundbreaker:192.168.8.157"
  # Add Pumpkinhead and Skulltalker when IPs confirmed
)

for ANIM in "${ANIMATRONICS[@]}"; do
  NAME="${ANIM%%:*}"
  IP="${ANIM##*:}"
  
  echo "Deploying to $NAME ($IP)..."
  
  # Stop MonsterBox
  ssh remote@$IP "pkill -f 'node.*server.js'"
  
  # Pull latest from git
  ssh remote@$IP "cd /home/remote/MonsterBox && git fetch && git checkout v5.4.0"
  
  # Install dependencies (if package.json changed)
  ssh remote@$IP "cd /home/remote/MonsterBox && npm ci"
  
  # Restart MonsterBox
  ssh remote@$IP "cd /home/remote/MonsterBox && nohup node server.js > /tmp/monsterbox.log 2>&1 &"
  
  sleep 3
  
  # Verify health
  if curl -s "http://$IP:3000/" >/dev/null 2>&1; then
    echo "✅ $NAME deployed successfully"
  else
    echo "❌ $NAME deployment failed"
  fi
done
```

**Deployment Steps**:
1. Create deployment script (above)
2. Make executable: `chmod +x scripts/deploy-monsterbox-v5.4.sh`
3. Execute: `./scripts/deploy-monsterbox-v5.4.sh`
4. For each animatronic:
   - Stop old version
   - Pull v5.4.0 from git
   - Install dependencies
   - Start new version
   - Verify health endpoint

**Post-Deployment Testing**:
For each animatronic, test:
1. Navigate to `http://[IP]:3000/`
2. Verify dashboard loads
3. Check character is correct
4. Test calibration page loads
5. Test one pose execution
6. Verify no console errors

**Success Criteria**:
- ✅ All 5 animatronics running MonsterBox 5.4
- ✅ Each animatronic's dashboard loads without errors
- ✅ Calibration page works on each
- ✅ No breaking changes observed

## Critical Rules (From .github/copilot-instructions.md)

1. **Small, reversible changes** - Already done by previous agent
2. **Test-backed** - Run `npm run verify` before committing
3. **Hardware safety** - No GPIO/I2C changes (none made)
4. **No new dependencies** - None added
5. **Use Browser MCP for UI validation** - **THIS IS YOUR PRIMARY TOOL**

## Preferred Tools

1. **Chrome DevTools Browser MCP** - For all page testing
2. **GitHub MCP** - For commit/push operations (optional)
3. **Terminal** - For deployment scripts (avoid curl with pipes)
4. **Node scripts** - For API checks (avoid interactive prompts)

## Testing Workflow

For each page test:
1. Navigate with Browser MCP
2. Capture console messages (fail on errors)
3. Capture snapshot (verify elements present)
4. Check network requests (no 5xx errors)
5. Take screenshot (visual verification)
6. Report results

## Expected Output Format

After completion, provide:

```markdown
## MonsterBox 5.4 Release Report

### Phase 1: Goblin Deployment
- ✅ Goblin One: Online, Console Blanker Active
- ✅ Goblin Two: Online, Console Blanker Active  
- ✅ Goblin Three: Online, Console Blanker Active

### Phase 2: ReturnToQueue Test
- ✅ Video interrupts queue immediately
- ✅ Queue resumes after video completion
- ✅ No CLI visibility
- ✅ No manual reconnection needed

### Phase 3: Page Testing Results
- ✅ Dashboard: 0 errors
- ✅ Calibration: 0 errors
- ✅ Characters: 0 errors
- ✅ Parts: 0 errors
- ✅ Poses: 0 errors
- ✅ Scenes: 0 errors (video dropdown works!)
- ✅ Audio Library: 0 errors
- ✅ Goblin Management: 0 errors
- ✅ AI Management: 0 errors
- ✅ Conversation Mode: 0 errors

### Phase 4: Git Commit
- ✅ Changes committed: [commit hash]
- ✅ Tagged: v5.4.0
- ✅ Pushed to GitHub

### Phase 5: Animatronic Deployment
- ✅ Orlok (192.168.8.17): Deployed, Tested
- ✅ Coffin Breaker (192.168.8.150): Deployed, Tested
- ✅ Groundbreaker (192.168.8.157): Deployed, Tested
- ✅ Pumpkinhead: Deployed, Tested
- ✅ Skulltalker: Deployed, Tested

### Summary
MonsterBox 5.4 successfully deployed to all animatronics with:
- Zero console errors across all pages
- All goblins operational with CLI fix
- Video dropdown fully functional
- Automatic scene execution confirmed
- All hardware safe and operational
```

## Troubleshooting Guide

### If Goblins Won't Come Online
- Check if they're powered on (ping test)
- Check if services are running: `ssh remote@IP "systemctl status goblin.service"`
- Check logs: `ssh remote@IP "journalctl -u goblin.service -n 50"`
- Reboot if needed: `ssh remote@IP "sudo reboot"`

### If Browser MCP Shows Console Errors
- Document the exact error
- Check which page/action triggered it
- Fix the issue before proceeding
- Re-test that page
- Do NOT commit code with console errors

### If Deployment Fails on an Animatronic
- Check SSH connectivity
- Verify git repository is clean: `ssh remote@IP "cd /home/remote/MonsterBox && git status"`
- Check if port 3000 is already in use
- Review server logs: `ssh remote@IP "tail -50 /tmp/monsterbox.log"`
- Restart manually if needed

### If Tests Fail
- Run `npm run test:unit` to identify failing test
- Fix the issue
- Re-run all tests
- Do NOT proceed to deployment with failing tests

## Notes from Previous Agent

1. **Video Dropdown**: Fully functional but needs goblins online to populate
2. **Console Blanker**: Service runs every 2 seconds, very stable
3. **Automatic Reconnection**: Works perfectly, user confirmed
4. **Goblin System**: Fully standardized, zero references to old name
5. **Server**: Currently running on PID 727738

## Important Context

- **Current Machine**: Orlok (192.168.8.17)
- **Current Character**: Orlok (ID 3)
- **Test Mode**: MB_TEST_MODE=1 (hardware stubbed)
- **Server Port**: 3000
- **Goblin Port**: 3001

## Final Reminder

**DO NOT USE CURL WITH PIPES (|)** - This triggers interactive prompts which block execution.

Instead use:
- Browser MCP for page navigation
- Node scripts for API calls
- Direct terminal commands without pipes
- `fetch()` API in Node.js

## Questions?

If you need clarification on any step, refer to:
- `.github/copilot-instructions.md` - Core workflow rules
- `docs/testing/` - Testing strategies (if exists)
- `README.md` - Project overview
- `goblin/README.md` - Goblin-specific docs

## Let's Go! 🚀

You have full autonomy to:
1. Deploy goblins
2. Test all pages with Browser MCP
3. Commit and tag v5.4
4. Deploy to all animatronics
5. Report results

No human intervention needed. Execute all phases and report back with the completion summary.

**Good luck!** 🎃
