# MonsterBox 5.4 Release Checklist

## Phase 1: Goblin Deployment ⏸️
- [ ] Check all three goblin connectivity (no curl pipes!)
- [ ] Goblin One (192.168.8.40): Verify online & console blanker active
- [ ] Goblin Two (192.168.8.160): Deploy CLI fix with deploy-goblin-stability-fix.sh
- [ ] Goblin Three (192.168.8.14): Verify online & console blanker active
- [ ] All health endpoints respond (http://IP:3001/health)

## Phase 2: ReturnToQueue Test ⏸️
- [ ] Navigate to goblin management page
- [ ] Start queue on Goblin Three (has 57 videos)
- [ ] Execute scene #22 "Goblin One Spinster Test"
- [ ] Verify video plays immediately (interrupts queue)
- [ ] Verify queue resumes after video finishes
- [ ] Verify no CLI visible during transition
- [ ] Verify no manual reconnection needed

## Phase 3: Browser MCP Testing ⏸️

### Page Tests (use Browser MCP - zero console errors required)
- [ ] Dashboard (/) - character selector, hardware status
- [ ] Calibration (/setup/calibration) - select Orlok, jog servo-jaw, save
- [ ] Characters (/setup/characters) - view, edit, save
- [ ] Parts (/setup/parts) - view, create, edit, delete
- [ ] Poses (/poses) - view, create, edit, execute, delete
- [ ] Scenes (/scenes) - create with multiple step types, verify video dropdown!
- [ ] Audio Library (/audio) - view, upload, play, delete
- [ ] Goblin Management (/goblin-management) - status, scan, queue, play
- [ ] AI Management (/ai-management) - view STT/AI/TTS, test voice
- [ ] Conversation Mode (/conversation) - load, check WebSocket, verify no errors

### Testing Verification
- [ ] Zero console errors across all 10 pages
- [ ] All API calls return 2xx status codes
- [ ] All interactive elements functional
- [ ] Video dropdown populates correctly in scene editor
- [ ] Screenshots captured for visual verification

## Phase 4: Git Commit & Tag ⏸️
- [ ] Review changes: `git status` and `git diff`
- [ ] Stage changes: `git add -A`
- [ ] Commit with comprehensive message (see AGENT_HANDOFF.md)
- [ ] Tag release: `git tag -a v5.4.0 -m "MonsterBox 5.4 - Goblin System Complete"`
- [ ] Push to GitHub: `git push origin main` and `git push origin v5.4.0`
- [ ] Verify on GitHub web interface

## Phase 5: Animatronic Deployment ⏸️

### Pre-Deployment
- [ ] All tests pass on Orlok
- [ ] Git committed and tagged
- [ ] No console errors on any page
- [ ] All goblins working correctly
- [ ] Run `npm run verify` one final time

### Deployment Execution
- [ ] Create deployment script (see AGENT_HANDOFF.md)
- [ ] Make script executable
- [ ] Deploy to Orlok (192.168.8.17) - current machine, verify works
- [ ] Deploy to Coffin Breaker (192.168.8.150)
- [ ] Deploy to Groundbreaker (192.168.8.157)
- [ ] Deploy to Pumpkinhead (find IP, deploy)
- [ ] Deploy to Skulltalker (find IP, deploy)

### Post-Deployment Testing (each animatronic)
- [ ] Orlok: Dashboard loads, calibration works, pose executes
- [ ] Coffin: Dashboard loads, calibration works, pose executes
- [ ] Groundbreaker: Dashboard loads, calibration works, pose executes
- [ ] Pumpkinhead: Dashboard loads, calibration works, pose executes
- [ ] Skulltalker: Dashboard loads, calibration works, pose executes

## Final Report ⏸️
- [ ] Create completion summary (see AGENT_HANDOFF.md for format)
- [ ] Document any issues encountered
- [ ] List all changes made
- [ ] Confirm zero console errors maintained
- [ ] Verify all animatronics operational

## Notes
- Use ✅ when complete, ❌ if failed, ⏸️ if blocked
- Do NOT proceed to next phase if critical items fail
- Document all errors encountered
- Take screenshots of any issues

## Current Status
- Phase 1: ⏸️ Blocked - Goblins offline
- Phase 2: ⏸️ Blocked - Needs online goblins
- Phase 3: ⏸️ Waiting - Needs Phase 1 complete
- Phase 4: ⏸️ Waiting - Needs Phase 3 complete
- Phase 5: ⏸️ Waiting - Needs Phase 4 complete

---

**Last Updated**: 2025-10-22 by Agent completing standardization
**Next Agent**: Pick up at Phase 1
