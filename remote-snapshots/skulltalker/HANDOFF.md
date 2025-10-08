# MonsterBox 5.2 - Agent Handoff Document

**Date**: 2025-10-06  
**Current State**: Motor control debugging in progress on Groundbreaker  
**Repository**: https://github.com/arwpc/MonsterBox  
**Branch**: main

---

## 🚨 IMMEDIATE ISSUE - Groundbreaker Motor Not Working

### Problem
Groundbreaker has a **12V DC wiper motor** (Jeep CJ6) connected to a **BTS7960 motor driver**, but it's not moving despite GPIO tests passing.

### Wiring (User-Confirmed)
- **Brown wire** → GPIO 17 (Pin 11) → Should connect to BTS7960 R_EN and L_EN (ganged together)
- **Red wire** → GPIO 27 (Pin 13) → Should connect to BTS7960 RPWM
- **Orange wire** → GPIO 22 (Pin 15) → Should connect to BTS7960 LPWM
- **Power**: 12V PSU → BTS7960 VMOT
- **Logic**: Pi 5V → BTS7960 VCC, Pi GND → BTS7960 GND (common ground)
- **Motor**: Connected to BTS7960 M+ and M-

### Current Status
- GPIO pins are outputting correctly (verified with test scripts)
- Python scripts run without errors
- **Motor does not move** - likely a physical wiring issue

### Next Steps for Motor Debug
1. **Physically verify** the cable is connected to the BTS7960 board (not a stepper driver)
2. **Check BTS7960 connections**:
   - Is GPIO 17 connected to BOTH R_EN and L_EN (ganged)?
   - Is GPIO 27 connected to RPWM?
   - Is GPIO 22 connected to LPWM?
   - Is VCC connected to Pi 5V?
   - Is GND common between Pi and BTS7960?
3. **Measure voltages** with multimeter:
   - BTS7960 VCC should be 5V
   - BTS7960 VMOT should be 12V
   - Motor terminals (M+/M-) should show ~12V when running
4. **Test scripts available**:
   - `python3 python_wrappers/test_groundbreaker_bts7960.py`
   - `python3 python_wrappers/diagnose_groundbreaker.py`
   - `python3 python_wrappers/check_gpio_output.py`

### Configuration Files Updated
- `data/character-5/parts.json` - Motor part configured with BTS7960 pins
- `controllers/partsController.js` - Fixed to support BTS7960 motor validation
- `scripts/test-groundbreaker-motor.sh` - Test script with correct pins

### Reference Documents
- **Motor Control Diagnostic Guide** - User provided comprehensive guide (see conversation history)
- **BTS7960 Wiring**: `docs/hardware/ORLOK_BTS7960_WIRING.md`
- **Working BTS7960 Example**: Orlok's "Bow At The Waist" (Character 3, Part ID 3)

---

## 📋 COMPLETE TASK LIST - MonsterBox 5.2

### 🔴 CRITICAL - Must Complete Before Deployment

#### 1. **Groundbreaker Motor** (IN PROGRESS)
- [ ] Debug physical wiring issue
- [ ] Verify motor movement with test scripts
- [ ] Test through MonsterBox web interface
- [ ] Document final working configuration

#### 2. **Character Selection on First Visit**
- [ ] Create "Choose a Character" modal that appears on first visit to any new instance
- [ ] Modal should show all 5 characters with names and descriptions
- [ ] Store selection in localStorage or session
- [ ] Auto-select character and redirect to dashboard
- [ ] Should appear on:
  - First visit to root `/`
  - First visit to `/setup`
  - Any page if no character is selected
- [ ] **Files to modify**:
  - Create `views/partials/character-selection-modal.ejs`
  - Update `public/js/character-manager.js`
  - Update `views/layout.ejs` to include modal
  - Add API endpoint to set selected character

#### 3. **Character Profile Pictures**
- [ ] Add profile picture field to character schema
- [ ] Create upload interface in Setup → Characters
- [ ] Store images in `public/images/characters/`
- [ ] Display character pictures in:
  - Character selection modal
  - Dashboard header
  - Setup → Characters page
  - Navigation bar
- [ ] Default placeholder images for characters without photos
- [ ] **Files to modify**:
  - `services/characterService.js` - Add image path field
  - `controllers/charactersController.js` - Add upload handler
  - `views/setup/characters.ejs` - Add upload UI
  - `data/character-{id}/character.json` - Add imagePath field

---

### 🟡 HIGH PRIORITY - Quality of Life

#### 4. **Dashboard Improvements**
- [ ] Add character picture to dashboard header
- [ ] Show current character name prominently
- [ ] Add quick stats: # of parts, # of poses, # of scenes
- [ ] Add "Quick Actions" section:
  - Test all parts
  - Run a scene
  - Emergency stop all
- [ ] Add recent activity log

#### 5. **Part Testing Improvements**
- [ ] Add "Test All Parts" button in Setup → Calibration
- [ ] Show real-time status during bulk testing
- [ ] Add test history/log per part
- [ ] Add "Last Tested" timestamp to parts
- [ ] Color-code parts by test status (green=passed, red=failed, gray=not tested)

#### 6. **Scene Queue Enhancements**
- [ ] Add visual queue builder with drag-and-drop
- [ ] Show currently playing scene in dashboard
- [ ] Add scene preview/dry-run mode
- [ ] Add scene templates library
- [ ] Export/import scene queues

#### 7. **Audio Library Improvements**
- [ ] Add audio preview in file list (play button)
- [ ] Add waveform thumbnails
- [ ] Add audio trimming/editing tools
- [ ] Add volume normalization
- [ ] Add batch upload with progress bar
- [ ] Add audio categories management

---

### 🟢 MEDIUM PRIORITY - Features

#### 8. **Motion Tracking Enhancements**
- [ ] Add motion tracking visualization overlay
- [ ] Add motion recording/playback
- [ ] Add motion-triggered scene activation
- [ ] Add multiple tracking zones
- [ ] Add sensitivity presets

#### 9. **Pose System Improvements**
- [ ] Add pose preview animation
- [ ] Add pose interpolation (smooth transitions)
- [ ] Add pose sequences (mini-scenes)
- [ ] Add pose favorites/quick access
- [ ] Add pose categories/tags

#### 10. **AI Integration Enhancements**
- [ ] Add conversation history viewer
- [ ] Add custom wake words per character
- [ ] Add voice training interface
- [ ] Add emotion detection → pose mapping
- [ ] Add context-aware responses

#### 11. **Hardware Monitoring**
- [ ] Add CPU/memory/temperature monitoring
- [ ] Add power consumption tracking
- [ ] Add part health monitoring
- [ ] Add automatic diagnostics on startup
- [ ] Add hardware alerts/notifications

---

### 🔵 LOW PRIORITY - Nice to Have

#### 12. **Multi-Animatronic Coordination**
- [ ] Add synchronized scene playback across characters
- [ ] Add character-to-character communication
- [ ] Add group poses (multiple characters)
- [ ] Add master control dashboard for all animatronics

#### 13. **Documentation**
- [ ] Add in-app help system
- [ ] Add video tutorials
- [ ] Add troubleshooting wizard
- [ ] Add hardware setup guides per character
- [ ] Add API documentation

#### 14. **Testing & Quality**
- [ ] Add E2E tests for all critical paths
- [ ] Add hardware simulation mode for development
- [ ] Add automated regression testing
- [ ] Add performance benchmarks
- [ ] Add error reporting system

#### 15. **Backup & Recovery**
- [ ] Add automatic configuration backup
- [ ] Add restore from backup UI
- [ ] Add export/import all character data
- [ ] Add cloud backup option
- [ ] Add version control for configurations

---

## 🎯 KNOWN ISSUES

### Bugs to Fix
1. **Groundbreaker Motor** - Not moving (CRITICAL - IN PROGRESS)
2. **Character Selection** - No modal on first visit
3. **Character Pictures** - Not implemented
4. **Stepper Motor Support** - Needs testing and validation
5. **Webcam Controls** - Some V4L2 controls don't persist correctly
6. **Audio Playback** - Occasional stream conflicts on concurrent playback
7. **Motion Tracking** - Bounding box overlay sometimes flickers

### Technical Debt
1. **ES5 Client Code** - Should migrate to modern ES6+ modules
2. **Bootstrap Modals** - Inconsistent initialization patterns
3. **Error Handling** - Need consistent error response format
4. **Logging** - Need structured logging with levels
5. **Configuration** - Some settings scattered across multiple files

---

## 📚 IMPORTANT FILES & LOCATIONS

### Configuration
- `config/app-config.json` - Main app configuration
- `data/character-{id}/parts.json` - Parts per character
- `data/character-{id}/poses.json` - Poses per character
- `data/character-{id}/scenes.json` - Scenes per character
- `data/character-{id}/ai-config/` - AI settings per character

### Key Services
- `services/hardwareService/index.js` - Main hardware control
- `services/characterService.js` - Character management
- `services/partService.js` - Parts CRUD operations
- `services/audioService.js` - Audio playback and management

### Python Wrappers
- `python_wrappers/linear_actuator_control_v2.py` - BTS7960 & MDD10A control
- `python_wrappers/stepper_cli.py` - Stepper motor control
- `python_wrappers/servo_cli.py` - Servo control (PCA9685)
- `python_wrappers/motor_cli.py` - Legacy motor control

### Web Interface
- `views/dashboard.ejs` - Main dashboard
- `views/setup/calibration.ejs` - Parts calibration interface
- `views/setup/characters.ejs` - Character management
- `public/js/character-manager.js` - Client-side character handling

---

## 🔧 DEVELOPMENT ENVIRONMENT

### Prerequisites
- Node.js 18+
- Python 3.8+
- Raspberry Pi 4B (for hardware)
- PipeWire + WirePlumber (audio)
- mjpg-streamer (webcam)

### Quick Start
```bash
cd ~/MonsterBox
npm ci
npm start  # Production on port 3000
npm run dev  # Development on port 3100
```

### Testing
```bash
npm run test:unit        # Unit tests
npm run test:e2e         # E2E tests (headless)
npm run test:e2e:live    # E2E tests (headed)
npm run test:ui          # UI tests
```

### Deployment
```bash
# Deploy to specific animatronic
./scripts/deploy-to-animatronic.sh <character_id> <ip_address>

# Deploy to Groundbreaker (Character 5)
./scripts/deploy-to-animatronic.sh 5 192.168.8.200
```

---

## 🌐 NETWORK MAP

```
Character 1: PumpkinHead     → 192.168.8.150
Character 2: Coffin          → 192.168.8.140
Character 3: Orlok           → 192.168.8.120 (Primary/Control)
Character 4: Skulltalker     → 192.168.8.130
Character 5: Groundbreaker   → 192.168.8.200
Goblin 1:    Chestwound      → 192.168.8.160:3001
Goblin 2:    Goblin2         → 192.168.8.161:3001
```

**SSH Credentials**: `remote` / `klrklr89!`

---

## 💡 IMPORTANT NOTES FOR NEXT AGENT

1. **Always follow the diagnostic guide** for motor/actuator debugging - start with Python, verify hardware, then integrate
2. **Never use package managers manually** - always use npm/pip commands
3. **Test on hardware** before committing - simulation passing doesn't mean hardware works
4. **Character data is isolated** - each character has its own data directory
5. **BTS7960 requires BOTH enables HIGH** - R_EN and L_EN must be enabled
6. **Stepper motors are NOT DC motors** - don't confuse the two
7. **Always check common ground** - most motor issues are ground problems
8. **Preserve existing functionality** - don't break working features
9. **Follow existing code patterns** - ES5 for client, ES6+ for server
10. **Ask before destructive operations** - git push, rebase, force pull, etc.

---

## 🎃 PROJECT GOALS

MonsterBox 5.2 is the production-ready Halloween 2025 animatronic control system. The goal is to have 5 fully functional animatronic characters with:
- Reliable hardware control
- AI-powered conversations (ElevenLabs)
- Motion tracking and automated responses
- Scene-based choreography
- Audio library integration
- Professional web interface

**Target Deployment**: October 2025 (Halloween season)

---

## 📞 GETTING HELP

- **User**: Aaron Warner (arwpc)
- **Repository**: https://github.com/arwpc/MonsterBox
- **Documentation**: See `README.md` and `docs/` directory
- **Hardware Guides**: See `docs/hardware/` directory
- **Diagnostic Guide**: See conversation history for motor control guide

---

**END OF HANDOFF DOCUMENT**

