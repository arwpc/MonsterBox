# Documentation Update Summary - Audio/TTS Fix (MonsterBox 5.3)

**Date**: October 17, 2025  
**Status**: ✅ COMPLETE  
**Commit**: cd87edde

---

## 🎯 Objective

Update all MonsterBox documentation to reflect the critical audio/TTS fix that enables conversation TTS to work correctly in production.

---

## ✅ Files Updated

### 1. README.md (Main Documentation)

**Changes:**
- ✅ Added prominent "⚠️ CRITICAL: Audio/TTS Production Requirements" section after Quick Start
- ✅ Documents the three critical fixes:
  1. XDG_RUNTIME_DIR environment variable in systemd service
  2. Required audio dependencies (mpg123, pulseaudio-utils)
  3. Character voice configuration matching ElevenLabs agent
- ✅ Updated Prerequisites section to include pulseaudio-utils
- ✅ Updated PipeWire installation section with verification commands
- ✅ Added verification steps and troubleshooting commands
- ✅ Links to CONVERSATION_TTS_AUDIO_FIX.md for complete details

**Location**: Lines 447-566 (new section), 388-395 (prerequisites), 415-433 (installation)

---

### 2. install.sh (Installation Script)

**Changes:**
- ✅ Added `pulseaudio-utils` to audio dependencies installation
- ✅ Ensures all required audio tools are installed during setup

**Location**: Line 111 (added pulseaudio-utils)

---

### 3. scripts/enable-monsterbox-systemd-all.sh (Deployment Script)

**Changes:**
- ✅ Added `Environment=XDG_RUNTIME_DIR=/run/user/1000` to systemd service template
- ✅ Added comment explaining it's critical for TTS audio
- ✅ Deploys to all animatronics: skulltalker, coffin, pumpkinhead, orlok, groundbreaker

**Location**: Line 5 (SERVICE_CONTENT variable)

---

### 4. scripts/deploy-to-animatronic.sh (Individual Deployment)

**Changes:**
- ✅ Added `Environment=XDG_RUNTIME_DIR=/run/user/1000` to systemd service configuration
- ✅ Ensures individual deployments include the fix

**Location**: Line 149 (added environment variable)

---

### 5. scripts/monsterbox-complete.service (Service Template)

**Changes:**
- ✅ Added `Environment=GAIN=130` (default microphone gain)
- ✅ Added `Environment=XDG_RUNTIME_DIR=/run/user/1000` (critical for audio)
- ✅ Updated service template used by deployment scripts

**Location**: Lines 13-14 (added environment variables)

---

### 6. docs/QUICK_REFERENCE.md (Quick Reference Guide)

**Changes:**
- ✅ Expanded "No Audio Output" troubleshooting section
- ✅ Added critical fix instructions with systemd service update
- ✅ Added verification commands for testing the fix
- ✅ Added log monitoring commands
- ✅ Links to CONVERSATION_TTS_AUDIO_FIX.md

**Location**: Lines 128-164 (expanded troubleshooting section)

---

### 7. docs/AUDIO_FIX_FFMPEG_PAPLAY.md → docs/AUDIO_FIX_FFMPEG_PAPLAY_ARCHIVED.md

**Changes:**
- ✅ Renamed file to indicate it's archived
- ✅ Added prominent "⚠️ ARCHIVED - SUPERSEDED BY MPG123 FIX" header
- ✅ Added section explaining why it was replaced
- ✅ Added links to current documentation
- ✅ Preserved original content for historical reference
- ✅ Added context explaining the real root cause (missing XDG_RUNTIME_DIR)

**Location**: Lines 1-96 (new header and context)

---

## 📋 Summary of Changes by Category

### Documentation Files (3)
1. README.md - Main project documentation
2. docs/QUICK_REFERENCE.md - Quick reference guide
3. docs/AUDIO_FIX_FFMPEG_PAPLAY_ARCHIVED.md - Archived outdated fix

### Deployment Scripts (3)
1. scripts/enable-monsterbox-systemd-all.sh - Multi-animatronic deployment
2. scripts/deploy-to-animatronic.sh - Single animatronic deployment
3. scripts/monsterbox-complete.service - Service template

### Installation Scripts (1)
1. install.sh - System installation script

---

## 🔑 Key Technical Information Documented

### The Problem
- Conversation TTS API returned success but no audio played
- Root cause: mpg123 couldn't access PulseAudio/PipeWire without XDG_RUNTIME_DIR

### The Solution
1. **Environment Variable**: Add `XDG_RUNTIME_DIR=/run/user/1000` to systemd service
2. **Audio Dependencies**: Install mpg123 and pulseaudio-utils
3. **Voice Configuration**: Ensure TTS voice_id matches ElevenLabs agent

### The Pipeline
```
TTS API → ElevenLabs → MP3 Buffer → mpg123 → PulseAudio → PipeWire → Speakers
```

### Why mpg123?
- Direct MP3 streaming from stdin (no conversion needed)
- Native PulseAudio support with `-o pulse`
- Volume control with `-f` flag (0-32768 scale)
- More reliable than ffmpeg + paplay pipeline

---

## 🧪 Verification Commands Documented

### Test Conversation TTS
```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"text":"Hello, I am Groundbreaker"}' \
  http://localhost:3000/conversation/api/say
```

### Monitor Logs
```bash
sudo tail -f /var/log/monsterbox.log | grep -E "(mpg123|🔊|🎵)"
```

### Expected Output
```
🎵 Starting mpg123 audio stream for character 5: device=default, volume=80
🔊 Writing 87398 bytes to mpg123 stream (device: default)
```

---

## 📊 Impact

### Animatronics Affected
- ✅ Groundbreaker (Character 5) - Tested and verified
- ✅ Orlok (Character 3) - Deployment scripts updated
- ✅ Skulltalker (Character 4) - Deployment scripts updated
- ✅ Coffin Breaker (Character 2) - Deployment scripts updated
- ✅ PumpkinHead (Character 1) - Deployment scripts updated

### Deployment Methods Updated
- ✅ Fresh installations (install.sh)
- ✅ Multi-animatronic deployment (enable-monsterbox-systemd-all.sh)
- ✅ Individual deployment (deploy-to-animatronic.sh)
- ✅ Service template (monsterbox-complete.service)

---

## 🎉 Result

**All MonsterBox documentation now reflects the production-ready audio/TTS configuration.**

Users deploying MonsterBox 5.3 will:
1. See the critical audio requirements prominently in README.md
2. Have the correct systemd service configuration deployed automatically
3. Have all required audio dependencies installed
4. Have clear troubleshooting steps if issues arise
5. Understand the technical details of the audio pipeline

---

## 📚 Related Documentation

- [CONVERSATION_TTS_AUDIO_FIX.md](CONVERSATION_TTS_AUDIO_FIX.md) - Complete technical details
- [README.md](README.md) - Main project documentation
- [docs/QUICK_REFERENCE.md](docs/QUICK_REFERENCE.md) - Quick reference guide
- [docs/ORLOK_DEPLOYMENT.md](docs/ORLOK_DEPLOYMENT.md) - Orlok deployment guide

---

**Last Updated**: October 17, 2025  
**Updated By**: Augment Agent  
**Commit**: cd87edde  
**Status**: ✅ PRODUCTION READY

