Here's a readme with the original design doc

# MonsterBox Comprehensive Design Document

## 1. Overview

**Application Name**: MonsterBox

**Purpose**: Create a device based on a Raspberry Pi and JavaScript that allows for the creation and control of multiple animatronics. Each animatronic will have a different personality, actions, sounds, and voices, with a unique set of parts to animate using servos, motors, LED lights, and sounds.

**Primary Use Case**: Entertaining people who are trick-or-treating on Halloween.

## 2. System Architecture

### 2.1 Hardware
- **Controller**: Raspberry Pi 4B or Raspberry Pi Zero
- **Power Supply**: 12V power supply providing 12V, 5V, and 110V power
- **Actuators**:
  - Servos: FITec Continuous FS90R servo
  - Motors: 12V motors controlled by MDD10A Rev 2.0 dual-channel DC motor driver
  - Lights: Controlled by Tongling jqc-3ff-s-z 5V Relay
- **Sensors**:
  - Sound Sensor: Microphone for detecting sounds
  - Motion Sensor: For detecting movement
- **Audio**: Speakers attached to the Raspberry Pi

### 2.2 Software
- **Operating System**: Raspberry Pi OS
- **Programming Language**: JavaScript (Node.js)
- **Web Server**: Express.js
- **Template Engine**: EJS
- **Database**: JSON files for data storage
- **Additional Libraries**:
  - rpi-gpio: For GPIO control
  - node-cron: For scheduling
  - play-sound: For audio playback

## 3. Core Components

### 3.1 Characters
Characters represent individual animatronic creations. Each character has:
- char_name: Name of the character
- char_description: Description of the character and its behavior
- parts: List of associated parts (lights, LEDs, servos, motors)
- sounds: List of playable sounds (mp3 format)

### 3.2 Scenes
Scenes are sets of steps that animate a character. Each scene consists of:
- Steps: Individual actions that operate a Part or play a sound
- Trigger: Can be sensor-based or scheduled
- Execution Type: Sequential or concurrent steps

### 3.3 Parts
Parts are the physical components of an animatronic. Types include:
- Motor: Attributes include name, duration, direction, and speed
- Light: Attributes include duration, state, and power level
- Servo: Attributes include duration, angle, and speed
- Sensor: Includes Sound and Motion sensors

## 4. Software Implementation

### 4.1 Web Interface
```javascript
const express = require('express');
const app = express();

app.set('view engine', 'ejs');
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.render('index', { title: 'MonsterBox Control Panel' });
});

// Routes for managing Characters, Scenes, and Parts
app.get('/characters', (req, res) => {
  // Fetch and display characters
});

app.get('/scenes', (req, res) => {
  // Fetch and display scenes
});

app.get('/parts', (req, res) => {
  // Fetch and display parts
});

// API routes for CRUD operations
app.post('/api/characters', (req, res) => {
  // Create a new character
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
```

### 4.2 Data Storage
Data will be stored in JSON format. Example structure for `characters.json`:

```json
[
  {
    "id": "1",
    "char_name": "Spooky Ghost",
    "char_description": "A translucent ghost that moans and floats",
    "parts": ["1", "2", "3"],
    "sounds": ["ghost_moan.mp3", "chains_rattling.mp3"]
  }
]
```

### 4.3 Hardware Interfacing
```javascript
const gpio = require('rpi-gpio');

// Setup pins
gpio.setup(7, gpio.DIR_OUT, write); // Motor
gpio.setup(11, gpio.DIR_OUT, write); // Servo
gpio.setup(13, gpio.DIR_IN, read); // Sensor

// Control functions
function controlMotor(pin, duration, direction, speed) {
  // Implementation
}

function controlServo(pin, duration, angle, speed) {
  // Implementation
}

function readSensor(pin, callback) {
  // Implementation
}
```

### 4.4 Scene Execution
```javascript
function executeScene(scene) {
  let promise = Promise.resolve();
  
  scene.steps.forEach(step => {
    if (step.concurrent) {
      promise = promise.then(() => {
        setTimeout(() => executeStep(step), step.delay);
      });
    } else {
      promise = promise.then(() => executeStep(step));
    }
  });
  
  return promise;
}

function executeStep(step) {
  // Switch based on step type (motor, servo, light, sound)
  // and call appropriate control function
}
```

### 4.5 Error Handling
```javascript
const fs = require('fs');

function logError(error) {
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp}: ${error.message}\n`;
  
  fs.appendFile('error.log', logMessage, (err) => {
    if (err) console.error('Failed to write to log file:', err);
  });
}
```

### 4.6 Scheduling System
```javascript
const cron = require('node-cron');

function scheduleScene(sceneId, cronExpression) {
  cron.schedule(cronExpression, () => {
    const scene = getSceneById(sceneId);
    executeScene(scene);
  });
}

// Usage
scheduleScene('1', '0 18 * * *'); // Run scene 1 at 6 PM every day
```

### 4.7 Sound Playback
```javascript
const player = require('play-sound')(opts = {})

function playSound(soundFile) {
  return new Promise((resolve, reject) => {
    player.play(soundFile, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// Usage in a scene step
function playSoundStep(step) {
  return playSound(step.soundFile);
}
```

## 5. User Interface

The system will be controlled via a web-based interface accessible over WiFi from a computer or phone. This interface will allow for:
- Character management (create, edit, delete)
- Scene creation and editing
- Part configuration
- Manual triggering of scenes
- Scheduling scene execution
- System status monitoring

## 6. Safety Considerations

- All parts should be testable individually through the interface
- Implement emergency stop functionality in both software and hardware
- Ensure proper electrical safety measures are in place, especially for 110V components

## 7. Future Enhancements

- Multi-animatronic synchronization
- More advanced scheduling options
- Integration with smart home systems for enhanced automation
- Expansion of sensor types for more interactive experiences

This design document provides a comprehensive overview of the MonsterBox system, covering both hardware and software aspects. It serves as a blueprint for implementation while allowing for future expansions and modifications as the project evolves.

