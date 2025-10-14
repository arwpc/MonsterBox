# 👋 START HERE - New Agent Onboarding

Welcome to MonsterBox 5.2! This is your quick start guide.

## 📚 Read These Documents In Order

1. **START_HERE.md** ← You are here
2. **HANDOFF_SCRIPT.md** - Quick reference for immediate tasks
3. **HANDOFF.md** - Complete context and task list
4. **SESSION_SUMMARY.md** - What was done in the last session
5. **README.md** - Full project documentation

## 🚨 URGENT: Groundbreaker Motor Not Working

The immediate priority is fixing the Groundbreaker motor. It's configured correctly in software but not moving physically.

### Quick Diagnosis

Ask the user:
```
"Can you verify the Groundbreaker wiring:
1. Is the cable plugged into the BTS7960 board (not a stepper driver)?
2. On the BTS7960, which pins have wires:
   - Brown wire (GPIO 17) → ?
   - Red wire (GPIO 27) → ?
   - Orange wire (GPIO 22) → ?
3. Is 5V connected from Pi to BTS7960 VCC?
4. Is GND connected from Pi to BTS7960 GND?
5. Is 12V connected to BTS7960 B+ terminal?"
```

### The Issue

BTS7960 has TWO enable pins (R_EN and L_EN). BOTH must be HIGH for the motor to work.

**Solution Options**:
1. Connect GPIO 17 to BOTH R_EN and L_EN (gang them together)
2. OR tie both R_EN and L_EN to 5V (always enabled)

### Test Command

```bash
ssh remote@192.168.8.200
cd ~/MonsterBox
python3 python_wrappers/test_groundbreaker_bts7960.py
```

If motor still doesn't move, it's a physical wiring issue.

## 📋 Next Tasks After Motor Works

1. **Character Selection Modal** - Shows on first visit, lets user pick character
2. **Character Profile Pictures** - Upload and display images for each character
3. **Dashboard Improvements** - Add character picture, stats, quick actions

See **HANDOFF.md** for complete task list.

## 🔑 Key Information

### Network
- Groundbreaker: 192.168.8.200
- SSH: `remote` / `klrklr89!`

### Commands
```bash
# SSH to Groundbreaker
ssh remote@192.168.8.200

# Start MonsterBox
cd ~/MonsterBox && npm start

# Run tests
npm run test:unit

# Deploy changes
./scripts/deploy-to-animatronic.sh 5 192.168.8.200
```

### Important Files
- `HANDOFF.md` - Complete task list
- `HANDOFF_SCRIPT.md` - Quick reference
- `data/character-5/parts.json` - Groundbreaker motor config
- `controllers/partsController.js` - Motor validation (fixed)
- `python_wrappers/test_groundbreaker_bts7960.py` - Test script

## 🎯 Success Criteria

### Motor Working
- [ ] Motor moves forward
- [ ] Motor moves reverse
- [ ] Motor stops
- [ ] Works through web interface

### Character Selection
- [ ] Modal appears on first visit
- [ ] Shows all 5 characters
- [ ] Selection persists
- [ ] Doesn't appear again

### Character Pictures
- [ ] Can upload images
- [ ] Images display everywhere
- [ ] Placeholder images work

## 💡 Key Principles

1. **Hardware first** - Test with Python before integrating
2. **Verify wiring** - Most issues are physical
3. **Check ground** - Common ground is critical
4. **BTS7960 needs both enables** - R_EN AND L_EN must be HIGH
5. **Don't break working features** - Test before committing

## 🆘 If You're Stuck

### Motor Won't Move
1. Ask for photo of wiring
2. Ask user to measure voltages
3. Verify cable is on BTS7960 (not stepper driver)
4. Check if 12V power supply is on

### Implementation Questions
1. Look at working examples (Orlok's BTS7960)
2. Check existing patterns in codebase
3. Run tests to verify changes
4. Ask user for clarification

## 📞 Getting Help

- **User**: Aaron Warner (arwpc)
- **Repository**: https://github.com/arwpc/MonsterBox
- **Documentation**: See `docs/` directory
- **Hardware Guides**: See `docs/hardware/`

## ✅ What's Already Done

- ✅ Motor part creation form fixed
- ✅ Groundbreaker motor part created
- ✅ Test scripts created
- ✅ Configuration correct in software
- ✅ All changes committed to git

## ❌ What's NOT Done

- ❌ Motor not moving (physical wiring issue)
- ❌ Character selection modal
- ❌ Character profile pictures
- ❌ Dashboard improvements
- ❌ Many other features (see HANDOFF.md)

## 🚀 Quick Start

1. Read **HANDOFF_SCRIPT.md** for immediate next steps
2. SSH to Groundbreaker and test motor
3. If motor doesn't work, debug wiring with user
4. Once motor works, implement character selection modal
5. Then add character profile pictures

**Good luck! You've got this! 🎃**

---

**Last Updated**: 2025-10-06  
**Previous Agent**: Augment (Claude Sonnet 4.5)  
**Status**: Motor configured but not moving - needs physical wiring verification

