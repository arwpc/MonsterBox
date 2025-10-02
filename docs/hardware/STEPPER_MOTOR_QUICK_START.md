# Stepper Motor Quick Start Guide
**MonsterBox 5.0 - Groundbreaker Character**

---

## ✅ Your Stepper Motor is Ready!

Your **Head Turning** stepper motor has been configured and is ready to use.

### Current Configuration

**Part Name:** Head Turning  
**Part ID:** 6  
**Type:** Stepper Motor  
**Model:** STEPPERONLINE Nema 17 Stepper (59Ncm, 2A, 48mm, 4-lead)

### Pin Configuration

| Function | GPIO Pin | Physical Pin | Wire Color |
|----------|----------|--------------|------------|
| **STEP** | GPIO 22 | Pin 15 | Brown |
| **DIR** | GPIO 27 | Pin 13 | Red |
| **EN** | GPIO 17 | Pin 11 | Orange |

### Motor Settings

- **Microstepping:** 16
- **Steps/Revolution:** 200 (1.8° per step)
- **Holding Torque:** 59Ncm (84 oz-in)
- **Rated Current:** 2A per phase

---

## How to Test Your Stepper Motor

### Option 1: Web Interface (Recommended)

1. **Open Calibration Page:**
   ```
   http://localhost:3000/setup/calibration
   ```

2. **Find Your Stepper Motor:**
   - Look for "Head Turning" in the parts list
   - Click on it to select it

3. **Use the Control Interface:**
   - **Direction:** Choose CW (clockwise) or CCW (counter-clockwise)
   - **Steps:** Enter number of steps (200 = 1 full rotation)
   - **Delay:** Step delay in microseconds (800 = smooth, 1600 = slower)
   - Click **"Move"** to start
   - Click **"Stop"** to stop immediately

4. **Test Movements:**
   - **1/4 Turn:** 50 steps
   - **1/2 Turn:** 100 steps
   - **Full Turn:** 200 steps
   - **Multiple Turns:** 400, 600, 800 steps

### Option 2: API Testing

```bash
# Test 200 steps clockwise
curl -X POST http://localhost:3000/setup/parts/api/parts/6/test \
  -H "Content-Type: application/json" \
  -d '{"action":"control","params":{"steps":200,"speed":200}}'
```

---

## Troubleshooting

### Motor Doesn't Move

1. **Check Power:**
   - 12V PSU connected to VMOT and GND on driver board
   - Power LED on driver board should be lit

3. **Check Enable Pin:**
   - GPIO17 should be LOW to enable the motor
   - Or jumper EN to GND on the driver board

3. **Check Wiring:**
   - Brown wire: GPIO22 → STEP
   - Red wire: GPIO27 → DIR
   - Orange wire: GPIO17 → EN

4. **Check Driver:**
   - A4988, DRV8825, TMC2208, or TMC2209 recommended
   - Microstepping jumpers set correctly (MS1, MS2, MS3)
   - Current limit adjusted for 2A motor

### Motor Moves Erratically

1. **Reduce Speed:**
   - Increase step delay (try 1600 µs)
   - Lower RPM setting

2. **Check Microstepping:**
   - Verify driver microstepping matches config (16)
   - Check MS1, MS2, MS3 jumpers on driver

3. **Check Current Limit:**
   - Adjust potentiometer on driver
   - Target: 2A × 0.7 = 1.4V (for A4988)

### Motor Gets Hot

1. **Normal:** Stepper motors run warm when holding position
2. **Too Hot:** Reduce current limit on driver
3. **Enable Pin:** Use EN pin to disable motor when not in use

---

## Advanced Configuration

### Edit Stepper Motor Settings

1. Go to http://localhost:3000/setup/calibration
2. Click on "Head Turning" part
3. Edit any of these settings:
   - **Step Pin:** GPIO pin for step signal
   - **Dir Pin:** GPIO pin for direction signal
   - **Enable Pin:** GPIO pin for enable signal (optional)
   - **Microstepping:** 1, 2, 4, 8, or 16
   - **Steps/Rev:** Usually 200 for 1.8° motors
4. Click "Save Changes"

### Microstepping Guide

| Microstepping | Steps/Rev | Resolution | Smoothness | Torque |
|---------------|-----------|------------|------------|--------|
| 1 (Full Step) | 200 | 1.8° | Low | High |
| 2 (Half Step) | 400 | 0.9° | Medium | High |
| 4 | 800 | 0.45° | Medium | Medium |
| 8 | 1600 | 0.225° | High | Medium |
| **16** | **3200** | **0.1125°** | **Very High** | **Medium** |

**Recommended:** 16 for smooth, quiet operation

---

## Integration with Scenes

### Add Stepper Motor to Scene

1. Go to **Scenes** page
2. Create or edit a scene
3. Add a **Hardware Control** step
4. Select **"Head Turning"** part
5. Configure movement:
   - **Steps:** Number of steps to move
   - **Speed:** Steps per second (200 = moderate)
   - **Direction:** CW or CCW

### Example Scene: Head Turn Sequence

```json
{
  "name": "Look Around",
  "steps": [
    {
      "type": "hardware",
      "partId": "6",
      "action": "control",
      "params": {
        "steps": 200,
        "speed": 200,
        "direction": "cw"
      }
    },
    {
      "type": "delay",
      "duration": 1000
    },
    {
      "type": "hardware",
      "partId": "6",
      "action": "control",
      "params": {
        "steps": 200,
        "speed": 200,
        "direction": "ccw"
      }
    }
  ]
}
```

---

## Safety Notes

⚠️ **Important Safety Information:**

1. **Never force the motor** - If it's stuck, stop immediately
2. **Check wiring** before powering on
3. **Use proper current limit** - 2A for this motor
4. **Allow cooling time** between long movements
5. **Emergency stop** available in web interface
6. **Enable pin** can be used to disable motor when idle

---

## Technical Specifications

### STEPPERONLINE Nema 17 (59Ncm, 2A, 48mm, 4-lead)

- **Model:** 17HS19-2004S1
- **Step Angle:** 1.8° (200 steps/rev)
- **Holding Torque:** 59Ncm (84 oz-in)
- **Rated Current:** 2A per phase
- **Phase Resistance:** 1.4Ω
- **Phase Inductance:** 3mH
- **Number of Leads:** 4
- **Motor Length:** 48mm
- **Shaft Diameter:** 5mm

### Compatible Drivers

- ✅ **A4988** - Basic, affordable
- ✅ **DRV8825** - Higher current capacity
- ✅ **TMC2208** - Silent operation (StealthChop)
- ✅ **TMC2209** - Silent + sensorless homing

---

## Quick Reference

### Common Commands

```bash
# Get stepper motor info
curl http://localhost:3000/setup/parts/api/parts/6

# Move 200 steps CW
curl -X POST http://localhost:3000/setup/parts/api/parts/6/test \
  -H "Content-Type: application/json" \
  -d '{"action":"control","params":{"steps":200,"speed":200}}'

# Update configuration
curl -X PUT http://localhost:3000/setup/parts/api/parts/6 \
  -H "Content-Type: application/json" \
  -d '{"stepPin":17,"dirPin":27,"enablePin":22,"config":{"microstepping":16}}'
```

### Useful Links

- **Calibration Page:** http://localhost:3000/setup/calibration
- **Parts API:** http://localhost:3000/setup/parts/api/parts
- **Scenes:** http://localhost:3000/scenes
- **Live Dashboard:** http://localhost:3000/live

---

## Support

If you encounter any issues:

1. Check the **STEPPER_MOTOR_FIX_REPORT.md** for detailed technical information
2. Review the **Troubleshooting** section above
3. Check server logs for error messages
4. Verify hardware connections match the pin configuration

---

**Last Updated:** September 29, 2025  
**Character:** Groundbreaker (Character 5)  
**Status:** ✅ Ready to Use

