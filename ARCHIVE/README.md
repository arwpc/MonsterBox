# MonsterBox ARCHIVE

This directory contains outdated, unused, or backup code that has been removed from production.

**Archived on:** January 6, 2026  
**Reason:** Cleanup based on comprehensive UI testing that identified orphaned code

## Contents

### `/unused-js/` - Unused JavaScript Files (16 files)

These JavaScript files were found in `public/js/` but are not referenced by any views, routes, or other production code.

| File | Lines | Purpose (if known) |
|------|-------|-------------------|
| `AudioPlaybackService.js` | 162 | Audio playback utility class |
| `EnhancedMicrophoneComponent.js` | - | Microphone component (superseded) |
| `MediaCaptureService.js` | - | Media capture utility |
| `StreamClient.js` | - | Streaming client (only used by unused VideoPlayerComponent) |
| `VideoPlayerComponent.js` | - | Video player component |
| `console-error-monitor.js` | 389 | Console error monitoring |
| `enhanced-test-chat.js` | 3689 | Test chat interface (development only) |
| `enhanced-webcam-component.js` | - | Webcam component (superseded) |
| `key-management.js` | 429 | Key management UI |
| `log-collection-dashboard.js` | 502 | Log collection dashboard |
| `port-management.js` | 909 | Port management UI |
| `protocol-utils.js` | - | Protocol utilities |
| `servo-calibration.js` | 477 | Servo calibration (superseded by unified-calibration) |
| `shared-streaming-service.js` | - | Shared streaming service |
| `unified-calibration.js` | - | JS for unified calibration (superseded) |
| `video-configuration.js` | 428 | Video configuration UI |

### `/backup-views/` - Backup View Files

| File | Original Location |
|------|------------------|
| `index.ejs.backup2` | `views/conversation/` |
| `index.ejs.backup3` | `views/conversation/` |

### `/unused-views/` - Unused View Files

| File | Original Location | Notes |
|------|------------------|-------|
| `index-old.ejs` | `views/conversation/` | Old conversation view |
| `index-rebuilt.ejs` | `views/conversation/` | Rebuilt version (unused) |
| `index-new.ejs` | `views/conversation/` | New version attempt (unused) |

## Restoration

If any of these files are needed:

```bash
# Restore a single JS file
mv ARCHIVE/unused-js/filename.js public/js/

# Restore a view file
mv ARCHIVE/unused-views/filename.ejs views/conversation/
```

## Verification

Before archiving, the following was verified:
1. No routes reference the archived JS files
2. No views include the archived JS files
3. No other JS files import the archived files
4. The application runs without these files

## Related

See also: `.cleanup-archive/` for previously archived test files and logs.
