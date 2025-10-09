# 🎃 5x Reboot Test - In Progress

**Started:** October 8, 2025 22:31:00 CDT  
**Status:** 🔄 RUNNING  
**Mode:** Safe Mode (Remote animatronics first, Coffin last)

---

## Test Overview

The comprehensive 5x reboot test is now running. Each animatronic will be rebooted 5 times to verify that it can survive consecutive reboots and come back fully operational.

### Test Order
1. **Orlok** (192.168.8.120) - Remote ← Currently testing
2. **PumpkinHead** (192.168.8.150) - Remote
3. **Skulltalker** (192.168.8.130) - Remote
4. **Groundbreaker** (192.168.8.200) - Remote
5. **Coffin** (192.168.8.140) - Local (with 3-minute reconnection delay)

---

## Test Parameters

- **Reboots per animatronic:** 5
- **Total reboots:** 25 (5 animatronics × 5 reboots)
- **Boot wait time:** 3 minutes max per boot
- **Verification:** Full system check after each boot
- **Coffin reconnection delay:** 3 minutes after each reboot

---

## Estimated Timeline

| Animatronic | Reboots | Est. Time | Status |
|-------------|---------|-----------|--------|
| Orlok | 5 | ~25 min | 🔄 In Progress |
| PumpkinHead | 5 | ~25 min | ⏳ Pending |
| Skulltalker | 5 | ~25 min | ⏳ Pending |
| Groundbreaker | 5 | ~25 min | ⏳ Pending |
| Coffin | 5 | ~30 min | ⏳ Pending (Last) |

**Total Estimated Time:** ~2.5 hours  
**Expected Completion:** ~01:00 CDT (October 9)

---

## Monitoring the Test

### View Live Progress
```bash
tail -f /tmp/5x-reboot-safe-output.log
```

### Check Current Status
```bash
tail -50 /tmp/5x-reboot-safe-output.log
```

### View Full Report (when complete)
```bash
cat /tmp/halloween-5x-reboot-20251008-223100.log
```

---

## What's Being Tested

After each reboot, the system verifies:
- ✅ SSH connectivity restored
- ✅ MonsterBox application responding (port 3000)
- ✅ mjpg-streamer webcam streaming (port 8090)
- ✅ Conversation page accessible
- ✅ Audio system (PipeWire/WirePlumber) running
- ✅ Webcam integration configured
- ✅ Speaker configuration

---

## Important Notes

### About Coffin (Local Machine)
- Coffin will be tested LAST
- Each Coffin reboot will disconnect the session
- The script waits 3 minutes after each Coffin reboot
- This allows time for the system to come back and reconnect
- The test will continue automatically after reconnection

### If Disconnected
If you get disconnected during Coffin's reboot testing:
1. Wait 3 minutes for Coffin to boot
2. Reconnect to Coffin
3. Check test progress: `tail -f /tmp/5x-reboot-safe-output.log`
4. The test continues automatically in the background

---

## Success Criteria

For each animatronic to PASS:
- All 5 reboots must complete successfully
- All services must start automatically after each boot
- All verification checks must pass after each boot

For the overall test to PASS:
- All 5 animatronics must pass all 5 reboots
- Total: 25 successful boots required

---

## Current Progress

**Test Started:** 22:31:00 CDT  
**Current Animatronic:** Orlok  
**Current Reboot:** 1 of 5  
**Overall Progress:** 0% (0 of 25 reboots complete)

---

## Next Steps

1. **Monitor Progress** - Check logs periodically
2. **Wait for Completion** - Test runs automatically (~2.5 hours)
3. **Review Final Report** - Check results when complete
4. **Address Any Failures** - Fix issues if any animatronic fails
5. **Halloween Readiness** - Confirm all 5 animatronics pass

---

## Background Process

The test is running as a background process (nohup).

**Process ID:** Check with `ps aux | grep verify-5x-reboot-safe`  
**Log File:** `/tmp/5x-reboot-safe-output.log`  
**Report File:** `/tmp/halloween-5x-reboot-20251008-223100.log`

The test will continue even if you disconnect and reconnect.

---

**Status:** 🔄 RUNNING  
**Last Updated:** October 8, 2025 22:31:00 CDT  
**Next Update:** Check log file for real-time progress

