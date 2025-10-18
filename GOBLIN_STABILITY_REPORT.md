# Goblin System Stability Report
**Date:** 2025-10-18
**Status:** QUEUE FIX COMPLETE - VIDEO PLAYBACK ISSUES IDENTIFIED

---

## Executive Summary

The Goblin system (distributed Raspberry Pi media players) experienced reliability issues including crashes, memory leaks, inconsistent video playback, and hanging queue operations. **Queue hanging issues have been resolved**, but **video playback quality issues remain** (choppy playback, CLI visible between videos).

### Current Status:
- ✅ **All stability fixes committed to GitHub** (commit: 6ca6929e)
- ✅ **Queue hanging fix implemented** - Non-blocking queue start with state persistence
- ✅ **All three Goblins rebooted and online**
- ⚠️ **Goblin Three (192.168.8.14)** - Running video successfully
- ❌ **Goblin One (192.168.8.40)** - No video playing, old code (VLC), needs deployment
- ❌ **Goblin Two (192.168.8.106)** - No video playing, needs queue start
- ❌ **Video playback quality issues** - Choppy playback, CLI visible between videos
- ❌ **ffplay deployment incomplete** - Only Goblin Two/Three have new code

---

## Goals

### Primary Goals:
1. **Bulletproof Reliability** - Goblins must never crash or require manual intervention
2. **Auto-Start on Boot** - Video queues must resume automatically after power cycle/reboot
3. **Memory Stability** - No memory leaks from orphaned processes
4. **Seamless Video Playback** - 720p@60Hz with fade transitions, no console visible
5. **Consistent Media Player** - Use ffplay exclusively (not VLC)

### Secondary Goals:
1. Real-time playback status monitoring
2. Queue management (sequential and loop modes)
3. Priority queue for instant playback
4. Graceful error handling and recovery

---

## Work Completed Since Last Report

### 1. Queue Hanging Fix (✅ COMPLETE)

**Problem:** `/queue/start` API endpoint was blocking indefinitely because `startQueue()` awaited the long-running `runQueue()` loop.

**Solution Implemented:**
- Modified `videoQueue.js` to use `setImmediate()` for non-blocking queue execution
- Queue runs in background, API returns immediately (~0.2-0.3 seconds)
- Added queue state persistence to `/home/remote/goblin/queue-state.json`
- Implemented auto-restore functionality on server startup
- Updated `server.js` to auto-resume queues after reboot

**Files Modified:**
- `goblin-system/src/videoQueue.js` - Non-blocking queue start, state persistence
- `goblin-system/src/server.js` - Auto-restore on startup

**Test Results:**
- Goblin Two: Queue start in **0.328 seconds** ✅
- Goblin Three: Queue start in **0.223 seconds** ✅
- Auto-resume after service restart: **Working** ✅

### 2. ffplay Video Player Deployment (⚠️ PARTIAL)

**Problem:** Goblins were using VLC which causes choppy playback and visible CLI between videos on Raspberry Pi 3B+.

**Solution from Previous Work (Commit 4eb79554):**
- Standardized on **ffplay** with real-time 720p@60Hz transcoding
- Video filter chain: `scale → pad → fps=60 → fade`
- Fullscreen with suppressed console output
- Hardware-accelerated decoding

**Deployment Status:**
- ✅ Goblin Two (192.168.8.106): ffplay code deployed
- ✅ Goblin Three (192.168.8.14): ffplay code deployed, **video playing**
- ❌ Goblin One (192.168.8.40): Still has old VLC code, **deployment failed**

**Issue:** SSH deployment to Goblin One hangs, needs manual intervention.

### 3. Previous Stability Fixes (✅ COMPLETE - From Earlier Work)

#### Memory Leak Prevention
**Files Modified:** `goblin-system/src/mediaPlayer.js`

- Added `activeProcesses` Map to track all spawned ffplay processes
- Proper cleanup in exit/error handlers
- `stopAll()` method kills orphaned processes and clears Map
- Process tracking with unique `processId` for each video

**Code Changes:**
```javascript
// Track process for cleanup
const processId = `video-${Date.now()}`;
this.activeProcesses.set(processId, ffplayProcess);

// Clean up on exit
ffplayProcess.on('exit', (code, signal) => {
  this.activeProcesses.delete(processId);
  // ... reset playback status
});

// Clean up on error
ffplayProcess.on('error', (error) => {
  this.activeProcesses.delete(processId);
  // ... reset playback status
});
```

#### Infinite Loop Prevention
**Files Modified:** `goblin-system/src/videoQueue.js`

- Added 2-hour timeout per video to prevent infinite loops
- Safety check breaks loop if video hangs
- 100ms delay between videos for clean transitions

**Code Changes:**
```javascript
const maxWaitTime = 2 * 60 * 60 * 1000; // 2 hours
const startTime = Date.now();

while (this.mediaPlayer.playbackStatus.video.playing && !this.skipRequested && !this.stopRequested) {
  await this.sleep(500);
  
  if (Date.now() - startTime > maxWaitTime) {
    console.error(`❌ Video playback timeout after 2 hours`);
    await this.mediaPlayer.stopVideo();
    break;
  }
}
```

#### Consistent Media Player (ffplay only)
**Files Modified:** `goblin-system/src/statusMonitor.js`

- Changed health checks from VLC to ffplay
- `services.vlc` → `services.ffplay`
- Consistent with actual media player implementation

**Before:**
```javascript
this.status.services.vlc = await this.checkCommand('vlc --version');
```

**After:**
```javascript
this.status.services.ffplay = await this.checkCommand('ffplay -version');
```

#### Video Playback Improvements
**Files Modified:** `goblin-system/src/mediaPlayer.js`

- Real-time transcoding to 720p@60Hz using ffplay video filters
- Removed broken fade-out filter (was fading at start instead of end)
- Fade-in only (0.25s), queue manager handles transitions
- Better DISPLAY environment variable handling
- Completely suppressed console output

**Video Filter Chain:**
```javascript
const videoFilters = [
  'scale=1280:720:force_original_aspect_ratio=decrease',  // Scale to 720p
  'pad=1280:720:(ow-iw)/2:(oh-ih)/2',                     // Center with black bars
  'fps=60',                                                 // Force 60fps
  'fade=in:0:15'                                           // Fade in (0.25s at 60fps)
].join(',');
```

#### Error Handling
**Files Modified:** `goblin-system/src/mediaPlayer.js`

- Try-catch around all `process.kill()` calls
- Graceful degradation on errors
- Warning logs instead of crashes
- Proper cleanup on spawn failure

### 2. UI Improvements (✅ COMPLETE)

**Files Modified:** 
- `views/goblin-management/index.ejs`
- `public/js/goblin-management.js`

- Modal width increased to 95% for better visibility
- Real-time playback status card with color coding (green=playing, yellow=paused, gray=idle)
- Auto-refresh every 2 seconds
- Play button for instant video playback
- Fixed queue resume errors with null checks

### 3. Deployment (⚠️ PARTIAL)

**Status:**
- ✅ Code committed to GitHub (commit: 6ca6929e)
- ✅ MonsterBox server restarted successfully
- ✅ All three Goblins deployed with new code
- ✅ All Goblins report healthy status

**Goblin Status After Deployment:**
| Goblin | IP | Status | Uptime | Memory | Videos |
|--------|-------------|--------|--------|---------|--------|
| Goblin One | 192.168.8.40 | ✅ Healthy | 459s | 12/14 MB | 8 |
| Goblin Two | 192.168.8.106 | ✅ Healthy | 417s | 11/12 MB | 11 |
| Goblin Three | 192.168.8.14 | ✅ Healthy | 407s | 11/11 MB | 4 |

---

## Issues Unresolved

### 1. Video Playback Quality (🚨 CRITICAL)

**Symptom:** Choppy video playback and CLI visible between video transitions

**User Report:**
- Goblin Two: Choppy playback, CLI visible
- Goblin Three: Running video but quality issues reported earlier

**Root Cause:** Goblins need both:
1. **ffplay with 720p@60Hz transcoding** (partially deployed)
2. **Raspberry Pi OS optimization** (not yet applied)

**Solution Required:**

**A. Complete ffplay Deployment:**
- Deploy `mediaPlayer.js` to Goblin One (192.168.8.40)
- Verify all Goblins using ffplay (not VLC)
- Start video queues on all three Goblins

**B. Apply Pi Configuration Optimizations:**

From `pi_config_optimized.txt` and previous work (commit 1327b25f):

```bash
# GPU Memory
gpu_mem=128

# Hardware Video Codecs
gpu_codec_h264=enabled
gpu_codec_h265=enabled
gpu_codec_vp6=enabled
gpu_codec_vp8=enabled

# GPU Performance
gpu_freq=500
core_freq=500

# HDMI Output
hdmi_force_hotplug=1
hdmi_drive=2
hdmi_group=1
hdmi_mode=16  # 1080p@60Hz

# CPU Performance
force_turbo=1
arm_freq=1300
over_voltage=2

# Framebuffer
framebuffer_width=1920
framebuffer_height=1080
framebuffer_depth=24

# Video Driver
dtoverlay=vc4-fkms-v3d
```

**Files to Apply:**
- `/boot/firmware/config.txt` on each Goblin
- Reboot required after changes

**Reference Scripts:**
- `scripts/fix-rpi-config.sh` - Automates Pi configuration
- `scripts/optimize-pi-performance.sh` - Runtime performance tuning

### 2. Goblin One Deployment Failure (❌ BLOCKING)

**Symptom:** SSH deployment to Goblin One (192.168.8.40) hangs indefinitely

**Attempted:**
- `scp` with password authentication - hangs
- `sshpass` with password - hangs
- `ssh-copy-id` for key-based auth - hangs

**Current State:**
- Goblin One is online and responding to HTTP (uptime: 22s)
- Queue API works but uses old VLC code
- SSH connection attempts hang

**Workaround Needed:**
- Manual file copy via USB drive, or
- Physical access to copy files locally, or
- Debug SSH connectivity issue

### 3. Goblin Three Network Issue (⚠️ INTERMITTENT)

**Symptom:** Goblin Three (192.168.8.14) intermittently times out on HTTP/ping

**Observed:**
- Sometimes responds normally
- Sometimes times out completely
- After reboot: Initially unresponsive, then came online
- Currently: **Running video successfully** (only Goblin with working playback)

**Possible Causes:**
- Network instability
- WiFi signal issues (if using WiFi)
- Power supply issues
- Ethernet cable/switch issues

**Recommendation:** Monitor network stability, consider wired connection if using WiFi

---

## System Architecture

### Goblin Hardware
- **Platform:** Raspberry Pi 3B+
- **OS:** Debian GNU/Linux (Raspberry Pi OS)
- **Display:** HDMI output, X11 display `:0`
- **Memory:** 11-14 MB used (very lightweight)

### Goblin Software Stack
- **Runtime:** Node.js
- **Service Manager:** systemd (`goblin.service`)
- **Media Player:** ffplay (from ffmpeg suite)
- **Audio:** ALSA (aplay)
- **Video Resolution:** 720p@60Hz (1280x720)

### Key Files
```
goblin-system/
├── src/
│   ├── server.js           # Express server, API endpoints
│   ├── mediaPlayer.js      # Video/audio playback (ffplay)
│   ├── videoQueue.js       # Queue management
│   ├── statusMonitor.js    # Health checks, metrics
│   └── fileManager.js      # Media file management
├── media/
│   ├── video/              # Video files (.mp4)
│   └── audio/              # Audio files
└── goblin.service          # systemd service file
```

### API Endpoints
- `GET /health` - Health check
- `GET /status` - Playback status
- `GET /media` - List available media files
- `POST /play-video` - Play single video
- `POST /queue/start` - Start video queue (✅ FIXED)
- `GET /queue/status` - Queue status
- `POST /queue/pause` - Pause queue
- `POST /queue/resume` - Resume queue
- `POST /queue/stop` - Stop queue

---

## Deployment Process

### Current Deployment Script
**File:** `/tmp/deploy-all-goblins.sh`

**Process:**
1. Create tarball of `goblin-system/` directory
2. For each Goblin (if online):
   - Copy tarball via `scp`
   - Extract to `/home/remote/goblin/`
   - Restart `goblin` service via systemd
3. Verify service status

**Credentials:**
- **User:** `remote`
- **Password:** `klrklr89!`

**Command:**
```bash
bash /tmp/deploy-all-goblins.sh
```

### Manual Deployment (Single Goblin)
```bash
# On MonsterBox
cd /home/remote/MonsterBox
tar czf /tmp/goblin-system.tar.gz goblin-system/

# Copy to Goblin
sshpass -p "klrklr89!" scp /tmp/goblin-system.tar.gz remote@192.168.8.14:/tmp/

# On Goblin (via SSH)
cd /home/remote/goblin
tar xzf /tmp/goblin-system.tar.gz
sudo systemctl restart goblin
```

---

## Next Steps - Priority Order

### 1. Fix Goblin One Deployment (CRITICAL)
**Goal:** Deploy ffplay code to Goblin One (192.168.8.40)

**Options:**
- **A. Debug SSH connectivity** - Why is SSH hanging?
- **B. Manual deployment** - Physical access, USB drive, or local terminal
- **C. Rebuild Goblin One** - Fresh OS install with proper SSH setup

**Files to Deploy:**
- `goblin-system/src/mediaPlayer.js` (ffplay version)
- `goblin-system/src/videoQueue.js` (non-blocking queue)
- `goblin-system/src/server.js` (auto-restore)

### 2. Apply Raspberry Pi Optimizations (CRITICAL)
**Goal:** Fix choppy playback and CLI visibility

**Action:** Apply configuration from `pi_config_optimized.txt` to all three Goblins

**Script:** `scripts/fix-rpi-config.sh` (already exists)

**Manual Steps:**
```bash
# On each Goblin
sudo cp /boot/firmware/config.txt /boot/firmware/config.txt.backup
sudo nano /boot/firmware/config.txt

# Add/modify these settings:
gpu_mem=128
gpu_codec_h264=enabled
gpu_codec_h265=enabled
gpu_freq=500
core_freq=500
hdmi_force_hotplug=1
hdmi_drive=2
hdmi_group=1
hdmi_mode=16
force_turbo=1
arm_freq=1300
over_voltage=2
framebuffer_width=1920
framebuffer_height=1080
dtoverlay=vc4-fkms-v3d

# Reboot
sudo reboot
```

### 3. Start Video Queues on All Goblins
**Goal:** Get all three Goblins playing video loops

**Commands:**
```bash
# Goblin One (192.168.8.40)
curl -X POST http://192.168.8.40:3001/queue/start \
  -H "Content-Type: application/json" \
  -d '{"videos":["07610c3d-6e40-4314-9f96-2f688b445ec3.mp4","da542d7d-7b9c-415a-adb7-cc1b3c725b66.mp4","dad5cf71-097d-42a8-b310-fa6c95fd28e1.mp4"],"mode":"loop"}'

# Goblin Two (192.168.8.106)
curl -X POST http://192.168.8.106:3001/queue/start \
  -H "Content-Type: application/json" \
  -d '{"videos":["07610c3d-6e40-4314-9f96-2f688b445ec3.mp4","da542d7d-7b9c-415a-adb7-cc1b3c725b66.mp4","dad5cf71-097d-42a8-b310-fa6c95fd28e1.mp4"],"mode":"loop"}'

# Goblin Three (192.168.8.14) - Already running, verify
curl -s http://192.168.8.14:3001/queue | jq '.'
```

### 4. Visual Verification
**Goal:** Confirm smooth playback on physical displays

**Check:**
- [ ] Videos play smoothly (not choppy)
- [ ] No CLI/console visible between videos
- [ ] Fade transitions working
- [ ] Videos loop continuously
- [ ] All three Goblins playing simultaneously

### 5. Test Auto-Resume After Reboot
**Goal:** Verify queues auto-start after power cycle

**Test:**
```bash
# Reboot each Goblin
ssh remote@192.168.8.40 "sudo reboot"
ssh remote@192.168.8.106 "sudo reboot"
ssh remote@192.168.8.14 "sudo reboot"

# Wait 60 seconds, then check queue status
curl -s http://192.168.8.40:3001/queue | jq '{running: .queue.running}'
curl -s http://192.168.8.106:3001/queue | jq '{running: .queue.running}'
curl -s http://192.168.8.14:3001/queue | jq '{running: .queue.running}'
```

---

## Testing Checklist

### Basic Functionality
- [x] All three Goblins online and healthy
- [ ] Single video playback works on all Goblins
- [x] Goblin Three: Video displays on physical screen
- [ ] Goblin One/Two: Video displays on physical screen
- [ ] 720p@60Hz transcoding working
- [ ] Fade-in transition visible
- [ ] No console visible during playback

### Queue Functionality
- [x] Queue start API responds (not hanging) - **FIXED**
- [ ] Sequential mode plays videos in order
- [ ] Loop mode repeats queue
- [ ] Queue pause/resume works
- [ ] Queue stop works
- [ ] Priority queue (play now) works

### Stability
- [ ] No memory leaks after 1 hour
- [ ] No crashes after 24 hours
- [ ] Graceful handling of missing files
- [ ] Graceful handling of network issues
- [x] Process cleanup verified - **FIXED**

### Auto-Start
- [x] Queue state persists to disk - **IMPLEMENTED**
- [x] Queue resumes after service restart - **TESTED on Goblin Three**
- [ ] Queue resumes after system reboot - **NOT TESTED**
- [ ] Handles missing videos gracefully

---

## Next Steps (Priority Order)

### 1. Fix Queue Start Hanging (CRITICAL)
**Priority:** 🚨 HIGHEST

**Action Items:**
1. Review `/queue/start` endpoint in `server.js`
2. Check if `videoQueue.start()` is blocking
3. Add timeout to queue start operation
4. Test with single video first, then multiple
5. Add detailed logging to identify hang point

**Files to Check:**
- `goblin-system/src/server.js` (lines with `/queue/start` route)
- `goblin-system/src/videoQueue.js` (`start()` method)

### 2. Implement Auto-Start on Boot
**Priority:** 🔴 HIGH

**Action Items:**
1. Add queue state persistence to `videoQueue.js`
2. Save state on queue start/update/stop
3. Load state on server startup
4. Test with manual service restart
5. Test with full system reboot

### 3. Verify Video Playback on Physical Display
**Priority:** 🟡 MEDIUM

**Action Items:**
1. User to visually confirm Goblin Three display
2. Check for console visibility
3. Verify fade transitions
4. Confirm 720p@60Hz output

### 4. Test Queue Loop Behavior
**Priority:** 🟡 MEDIUM

**Action Items:**
1. Start 3-video queue in loop mode
2. Monitor for 30+ minutes
3. Verify seamless looping
4. Check for memory leaks
5. Verify no crashes

---

## Important Notes

### What Works
✅ Goblin health monitoring  
✅ Single video playback via API  
✅ Memory leak prevention  
✅ Process cleanup  
✅ Error handling  
✅ ffplay standardization  
✅ Real-time transcoding to 720p@60Hz  
✅ Deployment to all Goblins  

### What Doesn't Work
❌ Queue start operations (hanging)  
❌ Auto-start on boot (not implemented)  
❌ Visual verification of playback (not tested)  

### What's Unknown
❓ Fade transitions visible on display  
❓ Console visibility between videos  
❓ Long-term stability (24+ hours)  
❓ Queue loop reliability  

---

## Contact Information

**Repository:** https://github.com/arwpc/MonsterBox  
**Branch:** main  
**Latest Commit:** 6ca6929e - "CRITICAL STABILITY FIXES: Prevent Goblin crashes and memory leaks"

**Goblin IPs:**
- Goblin One: 192.168.8.40
- Goblin Two: 192.168.8.106
- Goblin Three: 192.168.8.14

**MonsterBox:** localhost:3000

