You have Playwright MCP browser tools available (browser_navigate, browser_click, browser_snapshot, browser_screenshot, browser_fill_form, browser_evaluate, browser_select_option, browser_type, browser_press_key, browser_console_messages, browser_wait_for, browser_tabs, browser_network_requests, browser_hover). Use them to perform a FULL, DEEP, system-wide in-browser test of every page, control, panel, form, and use-case in MonsterBox.

The live server is running at http://localhost:3100 (HTTP) and https://localhost:3000 (HTTPS). Use `http://localhost:3100` for all navigation (the MCP browser handles HTTP fine; HTTPS may have cert issues).

## INSTRUCTIONS

1. Navigate to each page listed below using `browser_navigate`
2. Take a `browser_snapshot` on every page to see all interactive elements
3. Take a `browser_screenshot` of every page for visual verification
4. Click every button, toggle every switch, fill every form, change every setting
5. Verify responses — check for console errors with `browser_console_messages`
6. Test with at least 2 different characters (switch character and re-test key pages)
7. Log all findings: passes, failures, broken UI, console errors, missing elements
8. After all testing, write a detailed report to `tests/mcp-browser-test-report.md`

## TEST SEQUENCE

### Phase 1: Dashboard (/) — Primary Operator Interface
Navigate to `http://localhost:3100/`

**8 Panels to test (all have `data-panel-id` attributes):**

1. **Webcam Panel** (`data-panel-id="webcam"`)
   - Verify `#webcamImg` loads or shows placeholder
   - Check webcam status text

2. **Live Console Panel** (`data-panel-id="console"`)
   - Change `#consoleLines` dropdown to each value (50, 100, 200, 500)
   - Toggle `#consoleLive` checkbox on/off
   - Click `#btnConsoleRefresh`
   - Verify `#consoleOutput` updates

3. **Scenes Panel** (`data-panel-id="scenes"`)
   - Verify `#scenesContainer` has scene items
   - Click `#btnLoopAll` — verify `#scenesQueueStatus` shows
   - Click `#btnStopLoop` — verify it stops
   - Click individual scene play buttons
   - Click the Animation Studio link (`/scenes`)

4. **Poses Panel** (`data-panel-id="poses"`)
   - Verify `#posesContainer` has pose items
   - Click pose play/execute buttons
   - Click the Pose Editor link (`/poses/editor`)

5. **Manual Controls Panel** (`data-panel-id="manual-controls"`)
   - Click `#mcEditToggle` to enter edit mode
   - Test `#mcLayoutSelect` dropdown — switch layouts
   - Click `#mcLayoutNewBtn` — create a layout named "Test Layout"
   - Click `#mcLayoutRenameBtn` — rename it
   - Click `#mcLayoutDeleteBtn` — delete test layout
   - Test directional controls if visible
   - Exit edit mode

6. **Monster Features Panel** (`data-panel-id="monster-features"`)
   - Toggle `#jawToggle` ON then OFF
   - Toggle `#parrotToggle` ON then OFF
   - Toggle `#headTrackToggle` ON then OFF
   - Toggle `#speakerMuteToggle` ON then OFF
   - Toggle `#translateToggle` if present

7. **Chat Panel** (`data-panel-id="chat"`)
   - Type a message in `#chatInput`
   - Click `#chatSendBtn` — verify `#chatLog` updates
   - Toggle `#chatAiOnToggle`
   - Toggle `#chatMuteSpeaker`
   - Toggle `#chatBrowserSpeaker`
   - Toggle `#chatBrowserMic`
   - Change `#chatSpeakerSelect` if options available

8. **Browser Audio Bridge Panel** (`data-panel-id="audio-bridge"`)
   - Change `#bridge-listenin-source` dropdown
   - Adjust `#bridge-listenin-volume` slider
   - Click `#btn-bridge-listenin` start/stop

**Panel Sorting:**
   - Verify panels are draggable (SortableJS container: `.sortable-column[data-column-id="dashboard"]`)

**Character Switching:**
   - Use `#character-select` dropdown to switch character
   - Verify all panels reload with new character data

---

### Phase 2: Animation Studio (/scenes)
Navigate to `http://localhost:3100/scenes`

- Click `#btnNewScene` — verify new scene form appears
- Fill in scene name, add steps
- Test step palette: drag each step type to timeline
  - servo, motor, linear-actuator, light/led, audio, sayThis, askAI, wait, pose, goblin-video, jaw-animation, head-tracking
- Edit a step — expand `.step-edit-form`, change values, save
- Reorder steps via drag-and-drop
- Click `#btnSave` — verify save succeeds
- Click `#btnPlay` — verify playback starts
- Click `#btnStop` — verify playback stops
- Click `#btnEmergencyStop` — verify E-stop
- Toggle `#jawToggle` and `#headTrackToggle`
- Test scene library: click scenes to load, use edit/delete buttons
- Test queue: add scenes, reorder, remove
- Click `#btnNewPose` — verify navigation to `/poses/editor`

---

### Phase 3: Pose Editor (/poses/editor)
Navigate to `http://localhost:3100/poses/editor`

- Fill `#poseName` with "MCP Test Pose"
- Fill `#poseCategory` with "test"
- Fill `#poseDescription` with "Created by MCP browser test"
- Toggle `#poseConcurrent`
- Change `#audioType` to "file" — verify `#audioFileSection` shows
- Change `#audioType` to "tts" — verify `#audioTtsSection` shows
- Change `#audioType` back to "none"
- For each `.part-card`:
  - Check the `.part-include` checkbox
  - Adjust controls (servo angle slider, motor speed, light brightness)
  - Click `.part-test-btn` to test individual part
- Click `#btnTestPose` — test all parts
- Click `#btnSavePose` — save the pose
- Verify pose appears in `#posesList`
- Click the saved pose to reload it
- Click `#btnDeletePose` — delete the test pose

---

### Phase 4: Setup Pages

#### 4a. Setup Index (/setup)
Navigate to `http://localhost:3100/setup`
- Verify all setup cards are present and clickable
- Click each card link and verify navigation

#### 4b. Character Management (/setup/characters)
Navigate to `http://localhost:3100/setup/characters`
- Verify character table loads
- Click `#createCharBtn` — verify `#characterModal` opens
- Fill `#characterName` with "MCP Test Character"
- Select an option in `#characterAgent` if available
- Click `#saveCharacterBtn` — verify save (then cancel if testing only)
- Close modal
- Test Edit button on existing character
- Test Select button to switch characters

#### 4c. Unified Calibration (/setup/calibration)
Navigate to `http://localhost:3100/setup/calibration`
- Verify parts list loads
- Test servo calibration sliders (min/max angle)
- Test center position buttons
- Test individual part test buttons
- Check webcam calibration section if present

#### 4d. Audio Setup (/setup/audio)
Navigate to `http://localhost:3100/setup/audio`
- Test speaker selection dropdown
- Test microphone selection dropdown
- Adjust volume sliders
- Click test audio buttons

#### 4e. Jaw Animation Setup (/setup/jaw-animation)
Navigate to `http://localhost:3100/setup/jaw-animation`
- Toggle enable/disable
- Change servo part selector
- Change preset (Speech, Music, Custom)
- Toggle bandpass filter
- Toggle AGC
- Adjust quantization slider
- Click test button
- Click save config button

#### 4f. Head Animation Setup (/setup/head-animation)
Navigate to `http://localhost:3100/setup/head-animation`
- Toggle enable/disable
- Select pan servo
- Adjust center position slider
- Adjust range slider
- Toggle invert pan
- Adjust smoothing, deadzone, motion threshold sliders
- Change detection mode
- Click test button
- Click save config

#### 4g. System Configuration (/setup/system)
Navigate to `http://localhost:3100/setup/system`
- Check system info display
- Test performance preset selector
- View log sections
- Do NOT click factory reset or restart

---

### Phase 5: Audio Library (/audio-library)
Navigate to `http://localhost:3100/audio-library`

- Type in `#searchInput` — verify filtering
- Change `#categoryFilter` — verify filtering
- Change `#formatFilter` — verify filtering
- Change `#sortBy` — verify sorting
- Toggle `#favoritesOnly` — verify filtering
- Switch views: click `#viewGrid`, `#viewList`
- Click `#bulkSelectBtn` — verify bulk actions appear
- Click play button on an audio item
- Click `#viewAudio` to stop playback
- Change `#speakerSelect` if options available
- Test favorite toggle on individual items

---

### Phase 6: Video Library (/video-library)
Navigate to `http://localhost:3100/video-library`

- Verify video grid/list loads
- Test search and filters
- Play a video
- Check Goblin deployment options if available

---

### Phase 7: AI Settings (/ai-settings)
Navigate to `http://localhost:3100/ai-settings`

- Verify status cards display
- Click `#testConnection` if present
- Navigate to `/ai-settings/stt` — test STT settings
- Navigate to `/ai-settings/tts` — test TTS settings, voice selection, test playback

---

### Phase 8: Other Pages

- `/goblin-management` — verify device list, test add/edit if applicable
- `/orchestration` — verify page loads, test basic controls
- `/live` — verify lightweight dashboard loads
- `/first-run` — verify character cards display

---

### Phase 9: Cross-Character Testing

1. Note current character
2. Switch to a DIFFERENT character (use `#character-select` on dashboard or `/setup/characters`)
3. Re-test these critical pages with the new character:
   - Dashboard `/` — verify panels show different character data
   - Animation Studio `/scenes` — verify different scenes load
   - Pose Editor `/poses/editor` — verify different parts/poses
   - Calibration `/setup/calibration` — verify different parts
4. Switch back to original character

---

### Phase 10: Error & Edge Case Testing

- Navigate to a non-existent URL (e.g., `/nonexistent`) — verify error page
- Check `browser_console_messages` on EVERY page for JavaScript errors
- Check `browser_network_requests` for failed API calls (4xx/5xx)
- Test rapid clicking of buttons (double-click protection)
- Test empty form submissions where applicable

---

## REPORTING

After completing ALL phases, create a detailed report at `tests/mcp-browser-test-report.md` with:

1. **Summary**: Total pages tested, total controls tested, pass/fail counts
2. **Per-Page Results**: Each page with pass/fail for every element tested
3. **Console Errors**: Any JavaScript errors found, grouped by page
4. **Network Errors**: Any failed API calls
5. **Screenshots**: Note which screenshots were taken
6. **Bugs Found**: Detailed description of any issues
7. **Recommendations**: Suggested fixes for any problems

Be thorough. Test EVERYTHING. Do not skip pages or controls. This is a comprehensive system validation.
