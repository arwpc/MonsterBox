# 🎃 Goblin Video Playback - Task Handoff for New Agent

## 📋 CRITICAL CONTEXT

### Current Situation:
- **Goblin video directory**: `/home/remote/goblin/media/video` (NOT `/media/usb/video`)
- **Goblin 1 IP**: 192.168.8.160
- **Goblin 2 IP**: 192.168.8.161
- **SSH Password**: `klrklr89!` (use sshpass)
- **Videos exist**: Both goblins have extensive video libraries (fire, electric, ethereal, poltergeist, etc.)
- **Current issues**: 
  - Videos not looping properly
  - Playback still slow/choppy
  - Console text visible on HDMI
  - No thumbnails
  - No settings UI for video configuration

### What Was Already Fixed:
1. ✅ Edit Goblin Settings button (public/js/goblin-management.js)
2. ✅ Resolution changed to 720p60 in mediaPlayer.js
3. ✅ Loop default changed to `true` in server.js
4. ✅ Console output suppression added to mediaPlayer.js

### What Still Needs Work:
- Video directory path verification
- Thumbnail generation
- Settings UI for video configuration
- Settings API endpoints
- Testing everything end-to-end

---

## 🎯 TASK LIST (IN ORDER)

### Task 1: Fix Goblin Video Directory Path
**Status**: IN PROGRESS
**Priority**: CRITICAL

**Description**: 
Verify that fileManager.js correctly scans `/home/remote/goblin/media/video` and discovers all videos.

**Steps**:
1. Check current fileManager.js on both goblins
2. Verify the base path is set to `path.join(__dirname, 'media', 'video')`
3. Test the `/media` endpoint: `curl http://192.168.8.160:3001/media`
4. Verify videos are listed in the response
5. If not working, fix the path and restart goblin service

**Verification**:
```bash
# Should return JSON with video list
curl -s http://192.168.8.160:3001/media | python3 -m json.tool | grep -A 5 video
curl -s http://192.168.8.161:3001/media | python3 -m json.tool | grep -A 5 video
```

**Files to check/modify**:
- `/home/remote/goblin/fileManager.js` (on both goblins)

---

### Task 2: Generate Thumbnails for All Goblin Videos
**Status**: NOT STARTED
**Priority**: HIGH

**Description**:
Create thumbnails for all videos in `/home/remote/goblin/media/video` on both goblins.

**Steps**:
1. Create thumbnail generation script that:
   - Scans `/home/remote/goblin/media/video` recursively
   - Generates 320x240 thumbnails at 1-second mark
   - Saves to `/home/remote/goblin/media/thumbnails`
   - Skips existing thumbnails
2. Copy script to both goblins
3. Run script on both goblins
4. Verify thumbnails are created
5. Update goblin server to serve thumbnails

**Script location**: Create as `/home/remote/goblin/generate-thumbnails.sh`

**Example command**:
```bash
ffmpeg -i "$video_file" -ss 00:00:01 -vframes 1 -vf scale=320:240 "$thumbnail_file"
```

**Verification**:
```bash
# Check thumbnails exist
sshpass -p 'klrklr89!' ssh remote@192.168.8.160 "ls -lh /home/remote/goblin/media/thumbnails/ | head -20"
sshpass -p 'klrklr89!' ssh remote@192.168.8.161 "ls -lh /home/remote/goblin/media/thumbnails/ | head -20"
```

---

### Task 3: Add Goblin Settings UI for Video Configuration
**Status**: NOT STARTED
**Priority**: HIGH

**Description**:
Add UI fields in the Edit Goblin Settings modal for video configuration.

**Fields to add**:
1. **Video Directory Path** (text input)
   - Default: `/home/remote/goblin/media/video`
   - Label: "Video Directory Path"
   - Help text: "Absolute path to video directory on Goblin"

2. **Frame Rate** (select dropdown)
   - Options: 30, 60
   - Default: 60
   - Label: "Video Frame Rate (fps)"

3. **Resolution** (select dropdown)
   - Options: "1280x720" (720p), "1920x1080" (1080p)
   - Default: "1280x720"
   - Label: "Video Resolution"

4. **Apply Settings Button**
   - Button text: "Apply & Replay Video"
   - Action: Save settings, restart current video with new settings

**Files to modify**:
- `views/goblin-management/index.ejs` (add form fields to Edit Goblin Settings modal)
- `public/js/goblin-management.js` (handle form submission, call API)

**Database schema**:
Add to Goblin model in database:
```javascript
{
  videoSettings: {
    directory: String,  // default: '/home/remote/goblin/media/video'
    framerate: Number,  // default: 60
    resolution: String  // default: '1280x720'
  }
}
```

---

### Task 4: Implement Goblin Settings API Endpoints
**Status**: NOT STARTED
**Priority**: HIGH

**Description**:
Create API endpoints on the goblin server to get/update settings.

**Endpoints to create**:

1. **GET /settings** - Get current settings
   ```javascript
   {
     success: true,
     settings: {
       videoDirectory: '/home/remote/goblin/media/video',
       framerate: 60,
       resolution: '1280x720'
     }
   }
   ```

2. **POST /settings** - Update settings
   ```javascript
   // Request body:
   {
     videoDirectory: '/home/remote/goblin/media/video',
     framerate: 30,
     resolution: '1920x1080'
   }
   
   // Response:
   {
     success: true,
     message: 'Settings updated'
   }
   ```

3. **POST /settings/apply** - Apply settings and restart current video
   ```javascript
   // Response:
   {
     success: true,
     message: 'Settings applied, video restarted'
   }
   ```

**Files to modify**:
- `/home/remote/goblin/server.js` (add endpoints)
- `/home/remote/goblin/config/settings.json` (store settings)
- `/home/remote/goblin/mediaPlayer.js` (read settings)

**Implementation notes**:
- Store settings in a JSON file: `/home/remote/goblin/config/settings.json`
- Load settings on server startup
- Apply settings to mediaPlayer when playing videos

---

### Task 5: Wire Up Settings to MediaPlayer
**Status**: NOT STARTED
**Priority**: HIGH

**Description**:
Update mediaPlayer.js to read settings from config and apply them dynamically.

**Changes needed**:

1. Load settings from config file on initialization
2. Use settings when building mpv/ffmpeg arguments:
   ```javascript
   const settings = this.loadSettings();
   const resolution = settings.resolution || '1280x720';
   const framerate = settings.framerate || 60;
   
   // For mpv:
   `--drm-mode=${resolution}@${framerate}`
   `--vf=scale=${resolution}`
   
   // For ffmpeg:
   `-vf scale=${resolution}`
   ```

3. Implement apply-and-replay functionality:
   - Store currently playing video info
   - Stop current video
   - Reload settings
   - Restart video with new settings

**Files to modify**:
- `/home/remote/goblin/mediaPlayer.js`

**Settings file location**: `/home/remote/goblin/config/settings.json`

---

### Task 6: Test Video Playback with Loop
**Status**: NOT STARTED
**Priority**: CRITICAL

**Description**:
Test that videos play smoothly, loop automatically, and show no console text.

**Test steps**:

1. **Play a video on Goblin 1**:
   ```bash
   curl -X POST http://192.168.8.160:3001/play-video \
     -H "Content-Type: application/json" \
     -d '{"filename": "/home/remote/goblin/media/video/fire/544_JB_HD.mov"}'
   ```

2. **Verify playback**:
   - Check HDMI display - should see video playing
   - Video should be smooth (not choppy)
   - No text visible on console

3. **Wait for video to end**:
   - Video should automatically loop
   - Should continue looping indefinitely

4. **Check process**:
   ```bash
   sshpass -p 'klrklr89!' ssh remote@192.168.8.160 "ps aux | grep mpv"
   ```

5. **Repeat for Goblin 2**

**Success criteria**:
- ✅ Video plays smoothly at 720p60
- ✅ Video loops automatically
- ✅ No console text visible on HDMI
- ✅ No errors in logs

---

### Task 7: Test Settings Changes and Replay
**Status**: NOT STARTED
**Priority**: HIGH

**Description**:
Test changing video settings via UI and applying them.

**Test steps**:

1. **Open Goblin Management page**: `/goblin-management`
2. **Click on a goblin** to view details
3. **Click "Edit Settings"** button
4. **Change video settings**:
   - Change resolution to 1920x1080
   - Change framerate to 30
5. **Click "Apply & Replay Video"**
6. **Verify**:
   - Settings are saved
   - Video restarts with new settings
   - Video continues to loop

**Success criteria**:
- ✅ Settings modal opens correctly
- ✅ Settings are saved to database
- ✅ Settings are applied to goblin
- ✅ Video restarts with new settings
- ✅ Video continues looping

---

### Task 8: Test Edit Goblin Settings Modal
**Status**: NOT STARTED
**Priority**: MEDIUM

**Description**:
Verify the Edit Goblin Settings modal works correctly (already fixed but needs testing).

**Test steps**:

1. **Open Goblin Management page**: `/goblin-management`
2. **Click on a goblin card** to view details
3. **Click "Edit Settings"** button
4. **Verify modal opens** with correct data:
   - Goblin name
   - Endpoint
   - Location
   - Description
   - Platform
   - Version
   - Capabilities checkboxes
5. **Make changes** to any field
6. **Click "Save Changes"**
7. **Verify**:
   - Changes are saved
   - Modal closes
   - Goblin list refreshes
   - Changes are visible

**Success criteria**:
- ✅ Modal opens without errors
- ✅ All fields populated correctly
- ✅ Changes save successfully
- ✅ Changes persist after page refresh

---

## 🔧 USEFUL COMMANDS

### SSH to Goblins:
```bash
sshpass -p 'klrklr89!' ssh remote@192.168.8.160
sshpass -p 'klrklr89!' ssh remote@192.168.8.161
```

### Check Goblin Service:
```bash
sshpass -p 'klrklr89!' ssh remote@192.168.8.160 "sudo systemctl status goblin"
```

### Restart Goblin Service:
```bash
sshpass -p 'klrklr89!' ssh remote@192.168.8.160 "sudo systemctl restart goblin"
```

### Check Logs:
```bash
sshpass -p 'klrklr89!' ssh remote@192.168.8.160 "tail -50 /home/remote/goblin/logs/goblin.log"
```

### Check Videos:
```bash
sshpass -p 'klrklr89!' ssh remote@192.168.8.160 "ls -lh /home/remote/goblin/media/video/"
```

### Test Video Playback:
```bash
curl -X POST http://192.168.8.160:3001/play-video \
  -H "Content-Type: application/json" \
  -d '{"filename": "/home/remote/goblin/media/video/fire/544_JB_HD.mov"}'
```

### Check Playback Status:
```bash
curl -s http://192.168.8.160:3001/status | python3 -m json.tool | grep -A 10 playback
```

---

## 📁 KEY FILES

### On Goblins (192.168.8.160, 192.168.8.161):
- `/home/remote/goblin/server.js` - Main server
- `/home/remote/goblin/mediaPlayer.js` - Video playback logic
- `/home/remote/goblin/fileManager.js` - File scanning
- `/home/remote/goblin/media/video/` - Video directory
- `/home/remote/goblin/logs/goblin.log` - Main log file

### On MonsterBox Server:
- `views/goblin-management/index.ejs` - Goblin management UI
- `public/js/goblin-management.js` - Goblin management JS
- `routes/goblinManagement.js` - Goblin management routes
- `services/goblinManagerService.js` - Goblin manager service

---

## ⚠️ IMPORTANT NOTES

1. **Always use sshpass** with password 'klrklr89!' for SSH to goblins
2. **Test on both goblins** - they may have different configurations
3. **Check HDMI display** - this is the primary output, not just logs
4. **Videos are large** - some are 1GB+, be patient with operations
5. **Use tasks** - update task status as you complete each one
6. **Test thoroughly** - user wants no more broken GOLD releases

---

## 🎯 SUCCESS CRITERIA FOR GOLD RELEASE

- ✅ Videos play smoothly (720p60 by default)
- ✅ Videos loop forever automatically
- ✅ No console text visible on HDMI
- ✅ Thumbnails visible in Video Library
- ✅ Settings UI allows configuration
- ✅ Settings can be applied and video replays
- ✅ Edit Goblin Settings modal works
- ✅ All tests pass

---

## 📞 HANDOFF COMPLETE

New agent should:
1. Review this document thoroughly
2. Start with Task 1 (Fix Goblin video directory path)
3. Update task status as you progress
4. Test each task before moving to the next
5. Ask user for clarification if needed

**Good luck! 🎃**

