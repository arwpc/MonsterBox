# Goblin Management System

## Overview

The Goblin Management system provides a web-based interface for controlling multiple Goblin video display units from the MonsterBox dashboard. Each Goblin is a Raspberry Pi 3B+ or 4B running an MPV-based video player with a REST API for remote control.

## Architecture

### Components

1. **MonsterBox Server** (Raspberry Pi 4B at 192.168.8.120:3000)
   - Web interface for Goblin management
   - Playlist storage and distribution
   - Real-time status monitoring
   - Video library aggregation

2. **Goblin Units** (Raspberry Pi 3B+/4B)
   - **Goblin1** (goblin-one): 192.168.8.40:3001
   - **Goblin2** (goblin-two): 192.168.8.106:3001
   - **Goblin3** (goblin-three): 192.168.8.14:3001

3. **Video Storage**
   - Local storage on each Goblin: `/home/remote/media/video/`
   - Videos copied from USB sticks (not uploaded from MonsterBox)
   - Standardized format: 720p (1280x720) @ 30fps, H.264, MP4

### Network Architecture

```
MonsterBox (192.168.8.120:3000)
    |
    +-- HTTP API --> Goblin1 (192.168.8.40:3001)
    +-- HTTP API --> Goblin2 (192.168.8.106:3001)
    +-- HTTP API --> Goblin3 (192.168.8.14:3001)
```

## Web Interface

### Accessing the Interface

Navigate to: `http://orlok:3000/goblin-management` or `http://192.168.8.120:3000/goblin-management`

### Features

#### 1. Goblin Status Cards

Each Goblin displays:
- **Name**: Goblin One, Goblin Two, Goblin Three
- **Status**: Online (green) / Offline (red)
- **IP Address**: Network location
- **Heartbeat**: Last communication timestamp
- **Video Count**: Number of videos in library

**Interaction**: Double-click any Goblin card to open the video queue modal.

#### 2. Video Queue Modal

The modal provides complete control over a single Goblin's video playback:

**Left Panel - Current Queue:**
- Shows all videos in the queue
- Displays queue status (Running/Stopped)
- Loop mode indicator (none/sequential/continuous)
- Remove individual videos with X button
- Queue controls:
  - **Start Queue**: Begin playback from first video
  - **Stop Queue**: Stop playback
  - **Clear Queue**: Remove all videos (with confirmation)
  - **Skip**: Move to next video in queue

**Right Panel - Available Videos:**
- Browse all 57+ videos from `/home/remote/media/video`
- Search/filter videos by filename
- Each video shows:
  - Filename
  - File size
  - Duration
  - Resolution
- Actions per video:
  - **Add**: Add to end of queue
  - **Play**: Play immediately (priority queue)

**Bottom Panel - Playback Status:**
- Real-time playback status (updates every 2 seconds)
- Current video filename
- Playing/Stopped indicator
- Goblin name

**Playlist Management:**
- **Save Playlist**: Save current queue as named playlist
- **Load Playlist**: Load previously saved playlist
- **Distribute to All**: Copy current playlist to all Goblins

## API Endpoints

### MonsterBox API

#### Get All Goblins
```bash
GET /goblin-management/api/goblins
```

Response:
```json
{
  "success": true,
  "goblins": [
    {
      "id": "goblin-one",
      "name": "Goblin One",
      "ip": "192.168.8.40",
      "port": 3001,
      "status": "online",
      "lastHeartbeat": "2025-10-21T05:30:00.000Z",
      "videoCount": 57
    }
  ]
}
```

#### Scan All Videos
```bash
POST /goblin-management/api/goblins/scan-all-videos
```

Triggers video library scan on all Goblins.

### Goblin API

Each Goblin exposes the following REST API on port 3001:

#### Health Check
```bash
GET http://GOBLIN_IP:3001/health
```

#### Get Video Library
```bash
GET http://GOBLIN_IP:3001/media
```

Response:
```json
{
  "success": true,
  "videos": [
    {
      "filename": "Spinster/PHA_Spinster_Idle_H.mp4",
      "size": 12345678,
      "duration": 30.5,
      "resolution": "1280x720"
    }
  ]
}
```

#### Get Queue Status
```bash
GET http://GOBLIN_IP:3001/queue
```

Response:
```json
{
  "success": true,
  "queue": {
    "videos": [
      {
        "id": "1234567890",
        "filename": "video.mp4",
        "addedAt": "2025-10-21T05:30:00.000Z",
        "playCount": 0
      }
    ],
    "currentIndex": 0,
    "loopMode": "none",
    "playing": false
  },
  "currentVideo": null,
  "mpvRunning": false
}
```

#### Add to Queue
```bash
POST http://GOBLIN_IP:3001/queue/enqueue
Content-Type: application/json

{
  "filename": "Spinster/PHA_Spinster_Idle_H.mp4"
}
```

#### Play Immediately (Priority)
```bash
POST http://GOBLIN_IP:3001/queue/enqueue-priority
Content-Type: application/json

{
  "filename": "Poltergeist/PHA_Poltergeist_Intro_H.mp4"
}
```

#### Start Queue
```bash
POST http://GOBLIN_IP:3001/queue/start
Content-Type: application/json

{
  "loopMode": "sequential"
}
```

Loop modes:
- `none`: Play once and stop
- `sequential`: Loop through queue
- `continuous`: Loop current video

#### Stop Queue
```bash
POST http://GOBLIN_IP:3001/queue/stop
```

#### Clear Queue
```bash
POST http://GOBLIN_IP:3001/queue/clear
```

#### Skip to Next
```bash
POST http://GOBLIN_IP:3001/queue/skip
```

#### Playback Status
```bash
GET http://GOBLIN_IP:3001/playback-status
```

Response:
```json
{
  "success": true,
  "playing": true,
  "currentVideo": "Spinster/PHA_Spinster_Idle_H.mp4",
  "queueLength": 3,
  "mpvRunning": true
}
```

## Playlists

### Playlist Format

Playlists are stored as JSON files in `goblin/playlists/`:

```json
{
  "name": "Spinster",
  "description": "Spinster character videos",
  "videos": [
    "Spinster/PHA_Spinster_Idle_H.mp4",
    "Spinster/PHA_Spinster_Intro_H.mp4"
  ],
  "loopMode": "sequential",
  "createdAt": "2025-10-21T05:30:00.000Z"
}
```

### Pre-configured Playlists

1. **Spinster.json**: Spinster character videos
2. **Fire.json**: Fire-themed videos (541-560 series)
3. **Poltergeist.json**: Poltergeist character videos
4. **Test.json**: Sample test videos

### Creating Playlists

**Via Web Interface:**
1. Open Goblin Management page
2. Double-click a Goblin card
3. Add videos to queue using "Add" buttons
4. Click "Save Playlist"
5. Enter playlist name
6. Click "Save"

**Via API:**
```bash
POST /goblin-management/api/playlists
Content-Type: application/json

{
  "name": "MyPlaylist",
  "description": "Custom playlist",
  "videos": ["video1.mp4", "video2.mp4"],
  "loopMode": "sequential"
}
```

### Loading Playlists

**Via Web Interface:**
1. Open Goblin modal
2. Click "Load Playlist"
3. Select playlist from dropdown
4. Click "Load"

**Via API:**
```bash
POST /goblin-management/api/playlists/MyPlaylist/deploy
Content-Type: application/json

{
  "goblinId": "goblin-one"
}
```

### Distributing Playlists

To copy a playlist to all Goblins:
1. Load playlist on one Goblin
2. Click "Distribute to All"
3. Confirm distribution

## Deployment

### Deploying to Goblins

Use the deployment script to deploy the Goblin system to any Raspberry Pi:

```bash
./deploy-goblin.sh 192.168.8.40   # Deploy to Goblin1
./deploy-goblin.sh 192.168.8.106  # Deploy to Goblin2
./deploy-goblin.sh 192.168.8.14   # Deploy to Goblin3
```

The script:
1. Detects Goblin ID from IP address
2. Copies `goblin/` directory to `/home/remote/goblin/`
3. Installs Node.js dependencies
4. Creates systemd service
5. Starts the service
6. Verifies deployment

### Manual Deployment

```bash
# SSH to Goblin
ssh remote@192.168.8.40

# Copy files
scp -r goblin/* remote@192.168.8.40:/home/remote/goblin/

# Install dependencies
cd /home/remote/goblin
npm ci

# Create systemd service
cat > ~/.config/systemd/user/goblin-video.service << 'EOF'
[Unit]
Description=Goblin Video Player
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/remote/goblin
ExecStart=/usr/bin/node /home/remote/goblin/server.js
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
EOF

# Enable and start
systemctl --user daemon-reload
systemctl --user enable goblin-video.service
systemctl --user start goblin-video.service
```

## Troubleshooting

### Goblin Shows Offline

1. **Check network connectivity:**
   ```bash
   ping 192.168.8.40
   ```

2. **Check service status:**
   ```bash
   ssh remote@192.168.8.40
   systemctl --user status goblin-video.service
   ```

3. **Check logs:**
   ```bash
   journalctl --user -u goblin-video.service -f
   ```

4. **Restart service:**
   ```bash
   systemctl --user restart goblin-video.service
   ```

### Videos Not Playing

1. **Verify video exists:**
   ```bash
   ssh remote@192.168.8.40
   ls -lh /home/remote/media/video/
   ```

2. **Check MPV process:**
   ```bash
   ps aux | grep mpv
   ```

3. **Test MPV directly:**
   ```bash
   mpv --vo=drm --drm-connector=HDMI-A-1 /home/remote/media/video/test.mp4
   ```

4. **Check video format:**
   ```bash
   ffprobe /home/remote/media/video/test.mp4
   ```

### CORS Errors

If you see CORS errors in browser console:

1. **Verify CORS headers:**
   ```bash
   curl -I -H "Origin: http://orlok:3000" http://192.168.8.40:3001/health
   ```

2. **Check for Access-Control-Allow-Origin header**

3. **Redeploy if missing:**
   ```bash
   ./deploy-goblin.sh 192.168.8.40
   ```

### Queue Not Updating

1. **Check browser console** for JavaScript errors
2. **Verify API response format:**
   ```bash
   curl http://192.168.8.40:3001/queue | jq '.'
   ```
3. **Clear browser cache** and reload page

## Testing

### Manual Testing

See `tests/manual/GOBLIN-MODAL-TEST.md` for comprehensive manual test checklist.

### API Testing

Run the API test script:
```bash
./tests/manual/goblin-management-test.sh
```

### Playwright E2E Testing

```bash
npx playwright test tests/playwright/goblin-management-full.spec.js
```

## Best Practices

1. **Video Management:**
   - Always use 720p @ 30fps H.264 MP4 format
   - Copy videos to Goblins via USB stick
   - Use relative paths (e.g., `Spinster/video.mp4`)

2. **Playlist Management:**
   - Use descriptive playlist names
   - Set appropriate loop modes
   - Test playlists on one Goblin before distributing

3. **Queue Management:**
   - Clear queue before loading new playlist
   - Use "Play" for immediate effects
   - Use "Add" for building sequences

4. **Monitoring:**
   - Check Goblin status regularly
   - Monitor heartbeat timestamps
   - Verify video counts match expectations

## Future Enhancements

- [ ] Playlist scheduling (time-based playback)
- [ ] Video upload from MonsterBox
- [ ] Thumbnail previews
- [ ] Multi-Goblin synchronized playback
- [ ] Video effects (transitions, overlays)
- [ ] Analytics (play counts, popular videos)

## Related Documentation

- [Goblin Deployment Guide](deployment/goblin-deployment.md)
- [Video Format Specifications](media/video-format-specs.md)
- [API Reference](api/goblin-api.md)
- [Troubleshooting Guide](troubleshooting/goblin-issues.md)

---

**Last Updated**: 2025-10-21  
**Version**: MonsterBox 5.5

