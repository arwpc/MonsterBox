# Quick Handoff Script for Next Agent

## Context
You're taking over MonsterBox 5.2, a Halloween animatronic control system. Read `HANDOFF.md` for complete details.

## Immediate Priority: Groundbreaker Motor Debug

The Groundbreaker motor (12V DC wiper motor on BTS7960 driver) is not moving despite GPIO tests passing.

### Quick Diagnosis Steps

1. **Ask user to physically verify wiring**:
   ```
   "Can you verify the following on Groundbreaker:
   1. Is the cable plugged into the BTS7960 board (not a stepper driver)?
   2. On the BTS7960, which specific pins are connected:
      - Brown wire (GPIO 17) → Which BTS7960 pin?
      - Red wire (GPIO 27) → Which BTS7960 pin?
      - Orange wire (GPIO 22) → Which BTS7960 pin?
   3. Is there a 5V wire from Pi to BTS7960 VCC?
   4. Is there a GND wire from Pi to BTS7960 GND?
   5. Is 12V connected to BTS7960 B+ terminal?"
   ```

2. **If wiring is correct, test with multimeter**:
   ```bash
   # Run this and ask user to measure voltages
   ssh remote@192.168.8.200
   cd ~/MonsterBox
   python3 python_wrappers/check_gpio_output.py
   ```

3. **If voltages are correct, check BTS7960 enable configuration**:
   - BTS7960 has TWO enable pins: R_EN and L_EN
   - BOTH must be HIGH for motor to work
   - User's GPIO 17 should be connected to BOTH R_EN and L_EN (ganged together)
   - Alternative: R_EN and L_EN can be tied to 5V (always enabled)

4. **Test with proven working script**:
   ```bash
   sudo pigpiod && python3 - <<'PY'
   import time, pigpio
   EN, RPWM, LPWM = 17, 27, 22
   pi=pigpio.pi(); assert pi.connected
   for p in (EN,RPWM,LPWM): pi.set_mode(p,pigpio.OUTPUT)
   pi.write(EN,1)
   pi.write(RPWM,0); pi.write(LPWM,1); time.sleep(3)
   pi.write(LPWM,0); time.sleep(1)
   pi.write(LPWM,0); pi.write(RPWM,1); time.sleep(3)
   pi.write(RPWM,0); pi.write(LPWM,0); pi.write(EN,0)
   pi.stop()
   PY
   ```

5. **If still no movement**:
   - Cable is likely on wrong board (stepper driver instead of BTS7960)
   - Or BTS7960 is not powered (no 12V or no 5V logic)
   - Or motor is disconnected from BTS7960 M+/M- terminals

### Reference
- Working BTS7960 example: Orlok's "Bow At The Waist" (Character 3)
- Config: `data/character-3/parts.json` - Part ID 3
- Pins: RPWM=19, LPWM=21, R_EN=5, L_EN=22

---

## Next Priority: Character Selection Modal

After motor is working, implement the character selection modal.

### Requirements
1. Modal appears on first visit to any MonsterBox instance
2. Shows all 5 characters with names and descriptions
3. User selects a character
4. Selection is stored and character becomes active
5. Modal doesn't appear again unless user clears selection

### Implementation Steps

1. **Create modal component**:
   ```bash
   # Create new file
   touch views/partials/character-selection-modal.ejs
   ```

2. **Add modal HTML** (in `views/partials/character-selection-modal.ejs`):
   - Bootstrap modal with character cards
   - Each card shows character name, description, and placeholder image
   - Click card to select character

3. **Update layout** (in `views/layout.ejs`):
   - Include the modal partial
   - Add JavaScript to show modal on first visit
   - Check localStorage for existing selection

4. **Add client-side logic** (in `public/js/character-manager.js`):
   ```javascript
   // Check if character is selected
   if (!localStorage.getItem('selectedCharacterId')) {
     // Show modal
     $('#characterSelectionModal').modal('show');
   }
   
   // On character selection
   function selectCharacter(characterId) {
     localStorage.setItem('selectedCharacterId', characterId);
     // Call API to set active character
     fetch('/setup/characters/api/select', {
       method: 'POST',
       headers: {'Content-Type': 'application/json'},
       body: JSON.stringify({id: characterId})
     }).then(() => {
       window.location.reload();
     });
   }
   ```

5. **Test**:
   - Clear localStorage
   - Visit root page
   - Modal should appear
   - Select character
   - Modal should not appear on next visit

---

## Third Priority: Character Profile Pictures

### Implementation Steps

1. **Update character schema**:
   - Add `imagePath` field to character data
   - Default to placeholder image if not set

2. **Create upload interface** (in `views/setup/characters.ejs`):
   - Add file upload input
   - Add preview of current image
   - Add "Change Picture" button

3. **Add upload handler** (in `controllers/charactersController.js`):
   ```javascript
   // Use multer for file uploads
   const multer = require('multer');
   const upload = multer({dest: 'public/images/characters/'});
   
   router.post('/api/characters/:id/upload-image', 
     upload.single('image'), 
     async (req, res) => {
       // Save image path to character data
       // Return success
     }
   );
   ```

4. **Display images**:
   - Character selection modal
   - Dashboard header
   - Setup → Characters page
   - Navigation bar

5. **Add placeholder images**:
   - Create default images for each character
   - Store in `public/images/characters/default-{id}.png`

---

## Quick Reference Commands

### SSH to Groundbreaker
```bash
ssh remote@192.168.8.200
# Password: klrklr89!
```

### Start MonsterBox
```bash
cd ~/MonsterBox
npm start  # Port 3000
```

### Run Tests
```bash
npm run test:unit        # Unit tests
npm run test:e2e:live    # E2E tests (headed)
```

### Deploy to Groundbreaker
```bash
./scripts/deploy-to-animatronic.sh 5 192.168.8.200
```

### Test Motor Directly
```bash
# On Groundbreaker
cd ~/MonsterBox
python3 python_wrappers/test_groundbreaker_bts7960.py
```

### Check GPIO Output
```bash
python3 python_wrappers/check_gpio_output.py
```

---

## Important Files to Know

### Configuration
- `HANDOFF.md` - Complete task list and context
- `README.md` - Project documentation
- `config/app-config.json` - App settings
- `data/character-{id}/parts.json` - Parts per character

### Motor Control
- `python_wrappers/linear_actuator_control_v2.py` - BTS7960 control
- `services/hardwareService/index.js` - Hardware service
- `controllers/partsController.js` - Parts API

### Character Management
- `services/characterService.js` - Character service
- `controllers/charactersController.js` - Character API
- `views/setup/characters.ejs` - Character UI

---

## Key Principles

1. **Start with Python for hardware** - Always test at lowest level first
2. **Verify physical connections** - Most issues are wiring/power
3. **Check common ground** - Pi GND must connect to driver GND
4. **BTS7960 needs both enables** - R_EN and L_EN must both be HIGH
5. **Test before committing** - Hardware tests must pass
6. **Don't break existing features** - Preserve working functionality
7. **Ask before destructive ops** - git push, rebase, force pull

---

## Getting Unstuck

If you're stuck on the motor issue:
1. Ask user to take a photo of the wiring
2. Ask user to measure voltages with multimeter
3. Ask user which board the cable is plugged into
4. Check if it's actually a stepper motor (EN/DIR/STEP pins)
5. Verify 12V power supply is on and connected

If you're stuck on implementation:
1. Check existing similar features for patterns
2. Look at working examples (e.g., Orlok's BTS7960 setup)
3. Run tests to verify changes don't break existing features
4. Ask user for clarification on requirements

---

## Success Criteria

### Motor Working
- [ ] Motor moves forward when commanded
- [ ] Motor moves reverse when commanded
- [ ] Motor stops when commanded
- [ ] Can control through MonsterBox web interface
- [ ] Configuration persisted in parts.json

### Character Selection
- [ ] Modal appears on first visit
- [ ] All 5 characters shown with names
- [ ] Selection persists across sessions
- [ ] Selected character becomes active
- [ ] Modal doesn't appear again after selection

### Character Pictures
- [ ] Can upload image per character
- [ ] Images display in modal
- [ ] Images display in dashboard
- [ ] Placeholder images for characters without photos
- [ ] Images persist across restarts

---

**Good luck! Read HANDOFF.md for complete context.**

