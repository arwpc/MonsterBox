# Goblin Video Integration Architecture
## MonsterBox 5.5 - Seamless Video Management for Goblin Displays

## Overview

This document defines the architecture for integrating Goblin video playback into MonsterBox, enabling:
- Video library scanning from Goblins
- Playlist CRUD operations
- Push playlists to one or all Goblins
- Immediate video playback from Steps (for animatronic sequences)

## Current State

### Goblin (Current Implementation)
- **Location**: `goblin/` directory
- **Video Format**: 720p @ 30fps H.264 MP4 (standardized)
- **Video Directory**: `/home/remote/media/video/` on each Goblin
- **API Port**: 3001
- **Playback**: MPV with DRM/KMS, hardware decoding (v4l2m2m-copy)
- **Settings**: `--video-sync=display-vdrop` for smooth 30fps on 60Hz displays

### Existing MonsterBox Structure
- **Video Library**: `/video-library` route with upload, metadata, filtering
- **Audio Library**: `/audio-library` route (similar pattern to follow)
- **Goblin Management**: `/goblin-management` route with registration, monitoring
- **Services**:
  - `videoLibraryService.js` - Video file management
  - `goblinManagerService.js` - Goblin registration and monitoring
  - `goblinDeploymentService.js` - Deployment automation

## Architecture Design

### 1. Data Model

#### Goblin Playlist (New)
```javascript
{
  "id": "playlist-uuid",
  "name": "Halloween Ambiance",
  "description": "Spooky videos for Halloween",
  "goblinId": "goblin-three" | "all",  // Target goblin or "all"
  "videos": [
    {
      "filename": "307 Jb Hd.mp4",
      "order": 1,
      "duration": 5.2  // seconds, from video metadata
    },
    {
      "filename": "312 Jb Hd.mp4",
      "order": 2,
      "duration": 12.8
    }
  ],
  "loopMode": "queue" | "single" | "none",
  "createdAt": "2025-10-20T...",
  "updatedAt": "2025-10-20T...",
  "lastDeployed": "2025-10-20T..."
}
```

#### Goblin Video Metadata (Extended)
```javascript
{
  "filename": "307 Jb Hd.mp4",
  "path": "/home/remote/media/video/307 Jb Hd.mp4",
  "goblinId": "goblin-three",
  "size": 1468006,  // bytes
  "duration": 5.2,  // seconds
  "resolution": "1280x720",
  "fps": 30,
  "codec": "h264",
  "scannedAt": "2025-10-20T...",
  "available": true  // false if file missing
}
```

### 2. API Endpoints

#### Goblin API (on each Goblin - Port 3001)

**Existing:**
- `POST /play-video` - Play video immediately
- `POST /queue/add` - Add video to queue
- `POST /queue/start` - Start queue playback
- `POST /queue/stop` - Stop playback
- `POST /queue/clear` - Clear queue
- `GET /health` - Health check

**New Endpoints Needed:**
```javascript
// Scan local video directory
GET /api/videos/scan
Response: {
  "success": true,
  "videos": [
    {
      "filename": "307 Jb Hd.mp4",
      "size": 1468006,
      "duration": 5.2,
      "resolution": "1280x720",
      "fps": 30
    },
    ...
  ]
}

// Play video immediately (enhanced)
POST /api/video/play-immediate
Body: {
  "filename": "307 Jb Hd.mp4",
  "returnToQueue": true  // Resume queue after video ends
}
Response: {
  "success": true,
  "playing": "307 Jb Hd.mp4",
  "interrupted": "312 Jb Hd.mp4"  // What was playing before
}

// Get current playback status
GET /api/status
Response: {
  "playing": true,
  "currentVideo": "307 Jb Hd.mp4",
  "playCount": 5,
  "queue": {
    "videos": [...],
    "currentIndex": 2,
    "loopMode": "queue"
  }
}
```

#### MonsterBox API (Port 3000)

**New Playlist Endpoints:**
```javascript
// Get all playlists
GET /goblin-management/api/playlists
Response: {
  "success": true,
  "playlists": [...]
}

// Get playlist by ID
GET /goblin-management/api/playlists/:id
Response: {
  "success": true,
  "playlist": {...}
}

// Create playlist
POST /goblin-management/api/playlists
Body: {
  "name": "Halloween Ambiance",
  "description": "...",
  "goblinId": "goblin-three",
  "videos": ["307 Jb Hd.mp4", "312 Jb Hd.mp4"],
  "loopMode": "queue"
}

// Update playlist
PUT /goblin-management/api/playlists/:id
Body: { /* same as create */ }

// Delete playlist
DELETE /goblin-management/api/playlists/:id

// Deploy playlist to Goblin(s)
POST /goblin-management/api/playlists/:id/deploy
Body: {
  "goblinIds": ["goblin-three"] | "all",
  "startImmediately": true
}
Response: {
  "success": true,
  "deployed": ["goblin-three"],
  "failed": []
}

// Scan videos from Goblin
POST /goblin-management/api/goblins/:id/scan-videos
Response: {
  "success": true,
  "goblinId": "goblin-three",
  "videos": [...]
}

// Scan videos from all Goblins
POST /goblin-management/api/goblins/scan-all-videos
Response: {
  "success": true,
  "results": {
    "goblin-three": { "success": true, "videos": [...] },
    "goblin-one": { "success": true, "videos": [...] }
  }
}
```

**Step Integration Endpoints:**
```javascript
// Play video on Goblin (for Step actions)
POST /api/orchestration/goblin-video
Body: {
  "goblinId": "goblin-three",
  "filename": "307 Jb Hd.mp4",
  "returnToQueue": true
}
```

### 3. Services

#### New: `goblinPlaylistService.js`
```javascript
class GoblinPlaylistService {
  async createPlaylist(playlistData)
  async getPlaylist(id)
  async getAllPlaylists(filters)
  async updatePlaylist(id, updates)
  async deletePlaylist(id)
  async deployPlaylist(id, goblinIds, startImmediately)
  async getPlaylistsForGoblin(goblinId)
}
```

#### New: `goblinVideoService.js`
```javascript
class GoblinVideoService {
  async scanGoblinVideos(goblinId)
  async scanAllGoblinVideos()
  async getGoblinVideos(goblinId)
  async playVideoImmediate(goblinId, filename, options)
  async getPlaybackStatus(goblinId)
}
```

#### Enhanced: `goblinManagerService.js`
```javascript
// Add methods:
async getGoblinVideoLibrary(goblinId)
async deployPlaylistToGoblin(goblinId, playlist)
async playVideoOnGoblin(goblinId, filename, options)
```

### 4. UI Integration

#### Goblin Management Page Enhancements
**Location**: `views/goblin-management/index.ejs`

**New Sections:**
1. **Video Library Tab** - Show all videos across all Goblins
2. **Playlists Tab** - CRUD for playlists
3. **Quick Actions** - Scan videos, deploy playlists

**New Modals:**
- Create/Edit Playlist Modal
- Deploy Playlist Modal
- Video Preview Modal

#### Video Library Page Enhancements
**Location**: `views/video-library/index.ejs`

**New Features:**
- "Deploy to Goblin" button for each video
- "Add to Playlist" dropdown
- Goblin availability indicator (which Goblins have this video)

#### Step Editor Integration
**Location**: `views/scenes/editor.ejs` (or similar)

**New Step Action Type:**
```javascript
{
  "type": "goblin-video",
  "goblinId": "goblin-three",
  "filename": "307 Jb Hd.mp4",
  "returnToQueue": true,
  "waitForCompletion": false
}
```

### 5. Implementation Plan

#### Phase 1: Goblin API Enhancement
- [ ] Add `/api/videos/scan` endpoint
- [ ] Add `/api/video/play-immediate` endpoint
- [ ] Add `/api/status` endpoint
- [ ] Test on Goblin3

#### Phase 2: MonsterBox Services
- [ ] Create `goblinPlaylistService.js`
- [ ] Create `goblinVideoService.js`
- [ ] Enhance `goblinManagerService.js`
- [ ] Create data/playlists.json storage

#### Phase 3: MonsterBox API Routes
- [ ] Add playlist CRUD endpoints
- [ ] Add video scanning endpoints
- [ ] Add deployment endpoints
- [ ] Add Step integration endpoint

#### Phase 4: UI Implementation
- [ ] Enhance Goblin Management page
- [ ] Add playlist management UI
- [ ] Add video library Goblin integration
- [ ] Add Step editor Goblin video action

#### Phase 5: Testing & Documentation
- [ ] End-to-end testing
- [ ] Update README
- [ ] Create user guide

### 6. File Structure

```
MonsterBox/
├── goblin/
│   ├── src/
│   │   ├── mpvController.js (existing)
│   │   ├── queueManager.js (existing)
│   │   └── videoScanner.js (new)
│   ├── server.js (enhanced)
│   └── README.md (new)
├── services/
│   ├── goblinManagerService.js (enhanced)
│   ├── goblinPlaylistService.js (new)
│   └── goblinVideoService.js (new)
├── routes/
│   └── goblinManagement.js (enhanced)
├── views/
│   └── goblin-management/
│       ├── index.ejs (enhanced)
│       └── partials/
│           ├── playlist-modal.ejs (new)
│           └── deploy-modal.ejs (new)
└── data/
    └── playlists.json (new)
```

## Summary

This architecture provides:
- ✅ Seamless video library integration
- ✅ Playlist management with CRUD operations
- ✅ Deploy to one or all Goblins
- ✅ Immediate video playback for Steps
- ✅ Consistent with existing MonsterBox patterns
- ✅ Minimal changes to Goblin (stable)
- ✅ Extensible for future features

