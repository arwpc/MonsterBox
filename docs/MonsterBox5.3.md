# MonsterBox 5.3 - Full Release Implementation

**STATUS: ✅ COMPLETED**
**Completion Date:** October 7, 2025 12:00 CDT
**Completion Rate:** 100% (11 of 11 priorities)

---

## Implementation Summary

You are working on MonsterBox 5.3, a Node.js application running on Raspberry Pi that controls animatronic characters for a haunted attraction. This is a FULLY AUTONOMOUS implementation - I will not be available to review, accept changes, or provide encouragement. You must complete all work independently.

**All 11 priorities have been successfully completed and verified operational.**

For detailed completion status, see:
- `docs/MonsterBox5.3-Progress.md` - Detailed progress tracking
- `docs/MonsterBox5.3-CompletionReport.md` - Comprehensive completion report

---

AUTONOMOUS OPERATION REQUIREMENTS
Critical Rules

COMPLETE AUTONOMY: Make all decisions independently. Do not ask for permission, confirmation, or clarification
USE ALL AVAILABLE TOOLS:

Tasks: Break work into discrete tasks, complete each fully before moving to next
MCP Servers: Use all available MCP integrations (filesystem, git, database, etc.)
SSH Access: Use sshpass to connect to remote Raspberry Pi systems (Goblins) for debugging and configuration


TEST EVERYTHING: After each task, run comprehensive tests to verify functionality before proceeding
CLEAN UP: Every test must clean up its own data (models, database entries, temp files)
SEARCH PAST CONTEXT: Use conversation_search to find previous specifications before implementing features
FULL RESOURCE USAGE: MonsterBox is dedicated hardware - use all CPU, memory, and system resources needed for reliability


TASK-BASED IMPLEMENTATION STRUCTURE
For each major issue below, you must:

Create a named Task
Search past conversations for existing specifications
Investigate current implementation
Implement fix/feature
Test thoroughly with actual hardware/services
Verify cleanup (if applicable)
Mark task complete
Move to next task

Do not skip testing between tasks. Each task must be fully validated before proceeding.

PRIORITY 1: WEBCAM RELIABILITY (50% Failure Rate)
Problem
Webcam stream only works ~50% of the time. MonsterBox may be starting mjpeg-streaming itself instead of consuming an OS-level service.
Intended Architecture

systemd service starts mjpeg-streamer on RPi boot
MonsterBox consumes the existing stream (doesn't manage it)
Single reliable stream for all MonsterBox features

Implementation Patterns
Systemd Service Approach:

Create systemd service in /etc/systemd/system/mjpeg-streamer.service
Use Restart=always with RestartSec=3 for auto-recovery
Ensure After=network.target for proper startup ordering
Run as pi user, not root
Stream on dedicated port (typically 8080)
Use standard mjpeg-streamer input/output modules with appropriate resolution (640x480 at 15fps is reliable)

MonsterBox Integration Pattern:

Consume stream via HTTP GET to http://localhost:8080/?action=stream
Implement exponential backoff retry logic (don't fail permanently)
Add stream health check before attempting to use
Never spawn mjpeg_streamer process from Node.js code
Use keep-alive connections to maintain stream stability

Task Requirements

Investigate current video service code in MonsterBox
Check for existing systemd service configuration
Create/fix systemd service for mjpeg-streamer
Remove any MonsterBox code that starts streaming processes
Update MonsterBox to only consume the stream with retry logic
Test stream reliability (restart service 10+ times, verify each time)
Verify stream works after RPi reboot
Test camera disconnect/reconnect scenarios


PRIORITY 2: Recurring Stream Piping Error
Error
Stream piping error: TypeError: terminated
[cause]: BodyTimeoutError: Body Timeout Error
code: 'UND_ERR_BODY_TIMEOUT'
Root Cause
This is an undici (Node.js fetch) timeout error. The stream body is timing out, likely due to:

Default body timeout too short for streaming data
Network instability causing slow/stalled responses
Missing keep-alive configuration
No retry/reconnect logic on failure

Solution Patterns
Timeout Configuration:

Increase body timeout to 30-60 seconds using AbortSignal.timeout()
Use keep-alive connections with appropriate headers
Configure connection timeout separately from body timeout

Retry Logic:

Implement exponential backoff (1s, 2s, 4s, 8s, 16s)
Maximum 5 retry attempts before logging critical error
Don't let single timeout crash entire application

Error Recovery:

Catch UND_ERR_BODY_TIMEOUT specifically
Log error but initiate reconnection automatically
Emit status events so UI can show connection state
Use stream event handlers for 'error', 'end', 'close'

Keep-Alive Best Practices:

Set Connection: keep-alive header
Configure HTTP agent with keepAlive enabled
Set appropriate socket timeout values

Task Requirements

Locate code causing stream piping errors
Identify current timeout configuration
Implement proper timeout handling (30-60 second timeouts)
Add exponential backoff retry logic
Add graceful error recovery (don't crash, reconnect)
Implement keep-alive connections
Add stream health monitoring
Test under various network conditions (disconnect WiFi, slow network)
Monitor logs for 30+ minutes to verify fix


PRIORITY 3: Calibration Page Restoration
Problem
/setup/calibration page still uses old deg/mm/counts/presets approach instead of new keyboard-free specifications.
Task Requirements

Search past conversations for calibration specifications (no keyboard input required)
Review current /setup/calibration implementation
Identify what was specified vs what currently exists
Restore or rebuild according to found specifications
Test all calibration workflows with actual servos/motors
Verify no keyboard input is required for calibration process
Document new calibration flow


PRIORITY 4: Character Picture System (CRUD)
Problem
Requested in SEVERAL past threads but not implemented. Need full CRUD for character images.
Current State
Basic functionality exists at: http://orlok:3000/setup/characters/images?charId=2
Implementation Patterns
CRUD Interface:

Upload: File input with drag-and-drop support, image preview before save
Read: Display all character images in grid/list view
Update: Replace existing image, maintain aspect ratio
Delete: Confirmation dialog before removal

Circular Badge Display:

Create reusable component for character avatar
Use CSS border-radius: 50% for circular display
Add to: character list, scene editor, part assignments, system header
Show character name on hover/tooltip
Default placeholder image for characters without pictures

Storage Approach:

Store images in /public/images/characters/ or similar
Save filename reference in database (not base64)
Support common formats: JPG, PNG, WebP
Resize/optimize on upload to reasonable dimensions (200x200px max)

Task Requirements

Search past conversations for character picture specifications
Review existing /setup/characters/images implementation
Build complete CRUD interface for character images
Create circular badge component
Display character pictures throughout MonsterBox UI (header, lists, editors)
Test image upload, update, delete operations
Assign skeleton image to "Skulltalker" character
Verify badges appear on all relevant pages
Test with various image sizes and formats


PRIORITY 5: First-Time Character Selection
Problem
Requested in SEVERAL past threads but not implemented.
Required Behavior

First time user launches MonsterBox -> character selection screen appears
Display ALL available characters with their pictures
User selects one character
Selection becomes "Selected Character" system-wide
All MonsterBox operations point to this character
Selection persists across sessions

Implementation Patterns
First-Time Detection:

Check for config file or database flag (e.g., system_config.first_run_complete)
If false/missing, show character selection modal (non-dismissible)
After selection, set flag to true

Character Selection UI:

Grid layout showing all characters with circular pictures
Character name below each picture
Click to select, highlight selected character
"Continue" button only enabled after selection

System-Wide State:

Store selected character ID in config/database
Load on application startup
Make available globally (e.g., app.locals.selectedCharacter)
All operations (scenes, poses, parts) reference this character

Persistence:

Save to database or JSON config file
Load on every MonsterBox restart
Provide way to change selected character later (in settings)

Task Requirements

Search past conversations for character selection specifications
Create first-time setup detection mechanism
Build character selection UI with character pictures
Implement system-wide "Selected Character" state/context
Ensure all operations use selected character
Test first-time flow (delete config and restart)
Test persistence after restart
Verify all operations reference selected character
Add "Change Character" option in settings


PRIORITY 6: PIR Motion Sensor Toggle & Indicator
Current State
PIR sensors work as simple read operations returning motion detected true/false.
Required Functionality

Toggle sensor on/off from UI
Visual indicator when motion detected
PIR sensors trigger Scenes (important functionality)
Must work reliably with existing Part system

Implementation Patterns
Polling Strategy:

Use polling approach (100-200ms intervals) rather than interrupts
More reliable on RPi and easier to enable/disable
Start/stop polling based on toggle state

Toggle Control:

Add enable/disable button/switch to PIR sensor UI
Store enabled state in database
When enabled: start polling, when disabled: stop polling
Persist state across restarts

Real-Time Indicator:

Use WebSocket to push motion events to browser (no HTTP polling)
Show current state: enabled/disabled, motion/no-motion
Visual feedback: green=enabled, red=disabled, pulse/flash on motion
Display last motion detection timestamp

Scene Integration:

When motion detected, emit event that Scene system can listen to
Support multiple Scenes triggered by single PIR
Add debounce logic (e.g., don't retrigger for 2-5 seconds after detection)
Log all motion events for debugging

Task Requirements

Add toggle control to PIR sensor UI (enable/disable)
Implement polling-based motion detection (100-200ms interval)
Add WebSocket real-time updates for motion events
Create visual indicator showing enable/disable and motion states
Add motion detection animation/flash effect
Test with actual PIR sensor on pin 16
Verify Scene triggering functionality works
Test enable/disable toggle behavior
Add debounce logic to prevent rapid retriggering
Document integration with Scene system


PRIORITY 7: Model Management & Test Cleanup
Problem

http://orlok:3000/setup/models has too many test models
No multi-select delete functionality
Tests don't clean up after themselves

Implementation Patterns
Multi-Select UI:

Add checkbox to each model row
"Select All" checkbox in header
"Delete Selected" button (only enabled when items selected)
Confirmation dialog showing count of models to delete

Bulk Delete:

Accept array of model IDs
Delete in transaction (all or nothing)
Return success/failure for each deletion
Show results to user

Test Cleanup:

Add afterEach or afterAll hooks to all test files
Query for test models (e.g., models with name containing "test" or created in test)
Delete all test-created models
Verify database state is clean after test suite runs
Consider using unique test prefix/suffix for easy identification

Task Requirements

Add multi-select checkboxes to model list page
Implement "Select All" functionality
Create bulk delete endpoint/function
Add confirmation dialog before deletion
Find all test code that creates models
Add cleanup to EVERY test file (afterEach/afterAll hooks)
Delete all existing test models manually
Run full test suite and verify cleanup works
Re-check models page to confirm no test data remains
Document test cleanup pattern for future tests


PRIORITY 8: Goblin RPi Systems (Remote Video Streaming)
Problem
Both Goblin RPis are on network but not working. Need to restore video streaming queue and Goblin server startup.
Implementation Patterns
SSH Automation:

Use sshpass -p 'password' ssh pi@goblin1.local 'command' for remote execution
Store Goblin IPs/hostnames in config
Create helper functions for common SSH operations
Test connectivity before attempting operations

Goblin Server Systemd Service:

Create service file in /etc/systemd/system/goblin-server.service
Set Type=simple, Restart=always, RestartSec=5
Use After=network-online.target and Wants=network-online.target
Set working directory and environment variables
Run as pi user

Video Queue Architecture:

Use simple queue (Redis, file-based, or message queue)
MonsterBox pushes video playback commands to queue
Goblin server polls queue every 500ms
Video playback system is already tuned and working - DO NOT change player or playback mechanism
Report playback status back to MonsterBox (completed, failed, etc.)

Deployment Process:

Copy server code to Goblin via scp
Install dependencies remotely
Create/update systemd service
Enable and start service
Verify service is running

Task Requirements

SSH into both Goblin RPis using sshpass
Verify network connectivity and hardware status
Install/update Goblin server code on both units
Configure video streaming queue mechanism
Create systemd service for Goblin server
Enable service to run on startup
Test video streaming from both units
Verify startup behavior after reboot (test both Goblins)
Test video queue functionality from MonsterBox
Test playback status reporting
Document connection details and configuration


PRIORITY 9: Scene System Implementation
Problem
Scenes are just a shell. Need full Scene-Step-Pose-Part hierarchy.
Required Architecture

Scene: Top-level container (e.g., "Skeleton Awakening")
Step: Sequential actions within Scene (e.g., Step 1: Eyes glow, Step 2: Head turns)
Pose: Position configuration for character parts (e.g., "Head Left", "Arms Raised")
Part: Individual hardware component (servo, LED, motor, sensor)

Implementation Patterns
Hierarchy Structure:

Scene has many Steps (ordered sequence)
Step can have: duration, Pose, Parts to activate, audio file, Goblin video
Pose defines positions for multiple Parts
Parts execute actions (move servo, turn on LED, etc.)

Execution Engine:

Load Scene by ID
Execute Steps in sequence
For each Step: apply Pose, trigger Parts, play audio, send Goblin video
Wait for Step duration before next Step
Support pause/resume/stop Scene execution
Emit events for Scene state changes (started, step_complete, finished)

Scene Editor UI:

Create/edit Scenes with name and description
Add/remove/reorder Steps
For each Step: set duration, select Pose, choose audio, select Goblin video
Preview individual Steps
Test full Scene execution

Audio Integration:

Each Step can have associated audio file
Play audio when Step begins
Audio playback doesn't block Step execution (async)

Goblin Video Integration:

Each Step can send video filename to specific Goblin
Use queue system from Priority 8
Don't wait for video completion (async)

Task Requirements

Search past conversations and archives for Scene system architecture details
Review current Scene implementation (what exists)
Build Step model/table with duration, pose_id, audio_file, goblin_video fields
Build Pose model/table with Part position configurations
Create Scene execution engine following Step sequence
Integrate Part actions (servo movement, LED control, etc.)
Add Goblin video sending capability in Steps
Add sound playback capability in Steps
Build Scene editor UI for creating/editing Scenes and Steps
Create test Scene with 3-5 Steps using various Part types
Execute test Scene and verify all actions occur correctly
Test Scene pause/resume/stop functionality
Document Scene creation workflow


PRIORITY 10: Audio Library Restoration
Problem
Audio library has no files and throws errors on page load.
Task Requirements

Investigate errors on audio library page (check browser console and server logs)
Fix all errors preventing page from loading
Access git repository history (use MCP git server)
Search git history for pre-MonsterBox 4.0 audio files
Locate the basic 10 audio files referenced
Restore audio files to appropriate directory
Verify files are accessible from MonsterBox
Test audio playback from library page
Test file upload functionality (add new audio file)
Test audio deletion
Test audio in Scene context (Priority 9 integration)
Document audio file location and naming conventions


PRIORITY 11: WirePlumber Reliability
Problem
WirePlumber (PipeWire session manager) almost never starts with MonsterBox, requires constant manual fixing.
Required Solution
Bone-reliable audio system, even if started at OS level.
Comprehensive WirePlumber/PipeWire Solution for Raspberry Pi
Background:
WirePlumber is the session manager for PipeWire (modern Linux audio system). On Raspberry Pi, it often fails to start due to timing issues, missing dependencies, or systemd ordering problems.
Root Causes of WirePlumber Failures:

D-Bus timing issues - WirePlumber needs D-Bus but may start before it's ready
User session vs system session confusion - WirePlumber runs in user session but may be configured for system
Missing PipeWire socket - WirePlumber needs PipeWire running first
Permission issues - Audio group membership and /dev/snd access
Conflicting audio systems - PulseAudio may still be running

PROVEN SOLUTION - Multi-Layer Approach:
Step 1: Ensure User is in Correct Groups
sudo usermod -aG audio,video pi
Step 2: Disable Conflicting Audio Systems
systemctl --user stop pulseaudio.socket pulseaudio.service
systemctl --user disable pulseaudio.socket pulseaudio.service
sudo apt remove pulseaudio -y
Step 3: Enable PipeWire User Services
systemctl --user enable pipewire pipewire-pulse wireplumber
systemctl --user start pipewire pipewire-pulse wireplumber
Step 4: Create Systemd User Service for Auto-Start
The key is to start these in user session, not system session.
Enable lingering so user services start at boot (even without login):
sudo loginctl enable-linger pi
This allows user services to run without an active login session.
Step 5: Fix D-Bus and Timing Issues
Create: ~/.config/systemd/user/wireplumber.service.d/override.conf
[Unit]
After=pipewire.service dbus.service
Requires=pipewire.service
ConditionUser=!root
[Service]
Restart=always
RestartSec=2
Create: ~/.config/systemd/user/pipewire.service.d/override.conf
[Unit]
After=dbus.service
ConditionUser=!root
[Service]
Restart=always
RestartSec=2
Step 6: Reload Systemd and Restart Services
systemctl --user daemon-reload
systemctl --user restart pipewire pipewire-pulse wireplumber
Step 7: Verify Everything is Running
systemctl --user status pipewire pipewire-pulse wireplumber
wpctl status
pactl info
aplay /usr/share/sounds/alsa/Front_Center.wav
Step 8: Node.js Integration Best Practices
Don't try to start WirePlumber from Node.js - it should already be running from systemd user services.
Check if audio system is ready before attempting playback using wpctl status command.
Wait for audio system availability during MonsterBox startup before enabling audio features.
Step 9: Startup Script for Reliability
Create /home/pi/start-audio.sh:
#!/bin/bash
sleep 5
systemctl --user start pipewire pipewire-pulse wireplumber
for i in {1..10}; do
if wpctl status &>/dev/null; then
echo "Audio system ready"
exit 0
fi
sleep 2
done
echo "Audio system failed to start"
exit 1
Make executable: chmod +x /home/pi/start-audio.sh
Add to crontab for pi user:
crontab -e
@reboot /home/pi/start-audio.sh >> /home/pi/audio-startup.log 2>&1
Step 10: Monitoring and Health Checks
In MonsterBox, add periodic health check (every 30 seconds) that runs wpctl status to verify audio system is running. If check fails, attempt restart using systemctl --user restart wireplumber.
Troubleshooting Commands:
journalctl --user -u wireplumber -f
journalctl --user -u pipewire -f
ls -la /run/user/1000/pipewire-0
systemctl --user restart pipewire pipewire-pulse wireplumber
wpctl status
aplay -l
Why This Approach Works:

User services not system services - Critical for desktop audio systems
Enable-linger - Allows services to run without login
Proper dependency ordering - Ensures PipeWire starts before WirePlumber
Auto-restart on failure - Systemd automatically restarts crashed services
Remove conflicts - PulseAudio completely disabled
Startup delay - Gives system time to settle before starting audio

Task Requirements

Verify pi user is in audio and video groups
Disable PulseAudio completely (stop, disable, optionally remove)
Enable PipeWire and WirePlumber as user services
Enable loginctl linger for pi user
Create systemd override configurations with proper dependencies
Create startup script with delay and retry logic
Add crontab entry for startup script
Implement health check in MonsterBox with auto-restart capability
Test across multiple system restarts (at least 10 reboots)
Verify audio works immediately after boot every single time
Monitor WirePlumber logs during testing for any errors
Test audio playback from MonsterBox after each reboot
Document final configuration for future reference


SUCCESS CRITERIA
This release is complete when:

All 11 priorities are fully implemented and tested
Webcam stream is 100% reliable across restarts (test 10+ times)
No recurring stream errors in logs for 1+ hour of operation
All tests clean up after themselves (zero test models remain)
Both Goblin RPis are streaming video on boot
Scenes execute with full Step/Pose/Part/Audio/Video functionality
Character selection and pictures work system-wide
PIR sensors have UI controls and reliably trigger Scenes
WirePlumber starts reliably every single time (test 10+ reboots)
Audio library has 10 files and works without errors
Model management has multi-select delete capability


EXECUTION INSTRUCTIONS

Work autonomously - make all decisions yourself, no asking for permission
Use Tasks - create a task for each priority, mark complete only after thorough testing
Use MCP servers - filesystem, git, database access as needed
Use SSH - connect to Goblin RPis with sshpass for remote work
Search past context - use conversation_search for specifications before implementing anything
Test between tasks - never move to next task without fully testing current one
Clean up tests - verify model list is clean after each task involving test data
Document as you go - add code comments explaining fixes and design decisions
Monitor logs - watch for errors during and after implementation
Verify persistence - test that all configurations survive system reboots

This is MonsterBox 5.3 final release. Complete all work autonomously and thoroughly. Test everything multiple times. Make it bulletproof.