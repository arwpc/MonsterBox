# MonsterBox ARCHIVE

This directory contains outdated, unused, or backup code that has been removed from production.

**Last Updated:** January 6, 2026  
**Reason:** Comprehensive codebase cleanup and reorganization

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

# Restore a script
mv ARCHIVE/outdated-scripts/script.sh scripts/
```

### `/outdated-scripts/` - Outdated Shell Scripts

Scripts that are no longer needed (one-time scripts, old versions):

| File | Reason Archived |
|------|-----------------|
| `update-all-to-5.4.sh` | Replaced by update-all-to-5.5.sh |
| `check_test_completion.sh` | One-time test utility |
| `check_tests.sh` | One-time test utility |
| `find_processes.sh` | One-time utility |
| `parse_results.js` | One-time parser |
| `deploy-pca9685-fix.sh` | One-time fix deployment |
| `deploy-v5.4-full.sh` | Replaced by 5.5 deployment |
| `deploy-all-scenes.sh` | One-time scene deployment |
| `create-coffin-scene.sh` | One-time scene creation |
| `quick-loop-test.sh` | One-time test |
| `test-extended-loop.sh` | One-time test |
| `test-scene-loop.sh` | One-time test |
| `test-hardware-v5.4.sh` | Replaced by 5.5 testing |
| `start-audio.sh` | Superseded audio script |
| `test-all-parts.py` | One-time Python test |

### `/outdated-prompts/` - Old Prompt Templates

Superseded by `.github/prompts/` directory.

### `/remote-snapshots/` - Historical Remote Machine Snapshots

Snapshots of code from other machines (orlok, skulltalker) - historical reference only.

## Verification

Before archiving, the following was verified:
1. No routes reference the archived JS files
2. No views include the archived JS files
3. No other JS files import the archived files
4. The application runs without these files
5. Scripts moved to ARCHIVE are not referenced in code

## Related

See also: `.cleanup-archive/` for previously archived test files and logs.
