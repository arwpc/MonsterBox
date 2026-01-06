# MonsterBox Characters & Settings Summary

## Executive Overview

The MonsterBox system is a sophisticated animatronic control platform featuring **4 main characters**, each with unique hardware configurations, AI personalities, and interactive capabilities. This document provides a comprehensive overview of all character settings, hardware specifications, and system configurations.

---

## Character Profiles

### 1. Count Orlok (Character ID: 1)
**Classification:** Vampire Nobleman Animatronic  
**Operational Status:** Running  
**Network Address:** 192.168.8.120  
**User Account:** remote

#### Character Background
A mysterious nobleman and vampire who lives alone in his ruined castle, seeking to acquire new property in Germany. Once a Solomonar cursed by the Devil to become a vampire.

#### Hardware Configuration
| Component | Type | Specifications | GPIO/Settings |
|-----------|------|----------------|---------------|
| Right Arm of Satan | Linear Actuator | Max Extension: 15,000ms | Direction Pin: 23, PWM Pin: 12 |
| Left Arm of Manipulation | Linear Actuator | Max Extension: 15,000ms | Direction Pin: 18, PWM Pin: 13 |
| Hand of Azura | Light Control | Standard LED | GPIO Pin: 26 |
| Eye of Orlok | Motion Sensor | PIR Motion Detection | GPIO Pin: 16 |
| Elbow Servo | Servo Motor | Hooyij 40kg DS3240MG | Pin: 18, Channel: 1 |
| Forearm Servo | Servo Motor | Hooyij 40kg DS3240MG | Pin: 18, Channel: 2 |
| Head on a Swivel | Servo Motor | GoBilda Stingray 2 | Pin: 18, Feedback: Yes |
| Primary Webcam | Camera | 640x480 @ 30fps | Device: /dev/video0 |

#### System Services
- MonsterBox Core System
- SSH Remote Access
- GPIO Control Interface
- Servo Control System
- Camera Management
- Head Tracking System

#### Audio Library (5 files)
- **Satanas Lucifer** - Latin incantations and demonic speech
- **Speaking in Tongues** - Mysterious gibberish vocalizations
- **My Head Is Spinning** - Character-specific voice line
- **Scary Latin** - Extended Latin curse with dramatic delivery
- **Welcome to my castle, mortal** - Greeting message for visitors

#### Motion & Tracking Settings
- **Motion Tracking:** Disabled
- **Hardware Monitoring:** Enabled
- **Sensitivity:** 50 (when enabled)
- **Minimum Detection Area:** 500 pixels

---

### 2. Coffin Breaker (Character ID: 2)
**Classification:** Spanish Coffin Dweller  
**Operational Status:** Running  
**Network Address:** 192.168.8.140  
**User Account:** remote

#### Character Background
A Spanish lady trapped in a coffin for a thousand years, now breaking out with dramatic flair and Iowa-themed storytelling.

#### Hardware Configuration
| Component | Type | Specifications | GPIO/Settings |
|-----------|------|----------------|---------------|
| Coffin Door | Linear Actuator | Max Extension: 20,000ms | Direction Pin: 5, PWM Pin: 13 |
| Burning Rose | Light Control | Atmospheric Lighting | GPIO Pin: 16 |
| Coffin Sensor | Motion Detector | PIR Motion Detection | GPIO Pin: 16, Active: Yes |
| Primary Webcam | Camera | 640x480 @ 30fps | Device: /dev/video0 |

#### System Services
- MonsterBox Core System
- SSH Remote Access
- Linear Actuator Control
- Sound System Management
- GPIO Control Interface

#### Audio Library (8 files)
- **Coffin Creaking** - Atmospheric door sounds
- **Coffin Background** - Ambient cemetery audio
- **Coffin Breathing** - Terror breathing effects
- **I'm stuck in this coffin** - Pleading voice for interaction
- **Here in Iowa's fertile ground** - Epic narrative poem about Iowa
- **Welcome to Coralville** - Location-specific greeting
- **In the graveyard** - Halloween story with AI themes
- **Help? Is someone out there?** - Interactive help request

#### Motion & Tracking Settings
- **Motion Tracking:** Disabled
- **Hardware Monitoring:** Enabled
- **Log Collection Interval:** 300 seconds
- **Maximum Log Lines:** 1,000

---

### 3. PumpkinHead (Character ID: 3)
**Classification:** Pumpkinhead Demon
**Operational Status:** Running
**Network Address:** 192.168.8.150
**User Account:** remote
**Password:** klrklr89!

#### Character Background
Guardian of the pumpkin patch - a demon with a pumpkin head who minds the little pumpkins with intimidating presence.

#### Hardware Configuration
| Component | Type | Specifications | GPIO/Settings |
|-----------|------|----------------|---------------|
| Punkin Motion Detector | Motion Sensor | PIR Detection | GPIO Pin: 16, Active: Yes |
| Head Light | LED Control | Illumination System | GPIO Pin: 17 |
| Body Move | Motor Control | Movement System | Direction Pin: 6, PWM Pin: 13 |

#### System Services
- MonsterBox Core System
- SSH Remote Access
- GPIO Control Interface
- Basic Motor Functions

#### Audio Library (4 files)
- **Monster Howl** - Intimidating creature vocalizations
- **Monster Snarl** - Aggressive threatening sounds
- **Big Roar** - Powerful intimidation audio
- **Random Growling Sounds** - Various monster sound effects

#### Motion & Tracking Settings
- **Motion Tracking:** Disabled
- **Hardware Monitoring:** Enabled
- **Sensitivity:** 50 (standard setting)
- **Minimum Detection Area:** 500 pixels

---

### 4. Skulltalker (Character ID: 4)
**Classification:** AI-Integrated Talking Skull  
**Operational Status:** Running  
**Network Address:** 192.168.8.130  
**User Account:** remote  
**Password:** test123

#### Character Background
A talking skull with jaw animation, camera, speakers, and attitude. The most advanced character featuring full AI integration with multiple personalities.

#### Hardware Configuration
| Component | Type | Specifications | GPIO/Settings |
|-----------|------|----------------|---------------|
| Jaw Servo | Servo Motor | Miuzei MG90S | Pin: 18, Pulse: 500-2400ms |
| Motion Skulltalker | Motion Sensor | PIR Detection | GPIO Pin: 17, Active: On |
| SkulltalkerCam | HD Webcam | 1280x720 @ 15fps | Device: /dev/video0 |

#### AI Integration System
**Three Distinct AI Personalities:**

**1. Count Orlok AI (ID: orlok)**
- **Model:** GPT-4
- **Temperature:** 0.8 (Creative responses)
- **Max Tokens:** 150
- **Personality:** Gothic vampire nobleman
- **Voice Settings:** Rate 0.8, Pitch 0.7, Volume 0.7

**2. RoboChat AI (ID: robochat)**
- **Model:** GPT-4
- **Temperature:** 0.6 (Balanced responses)
- **Max Tokens:** 200
- **Personality:** Helpful robotic assistant
- **Voice Settings:** Rate 1.1, Pitch 1.2, Volume 0.8

**3. Blackbeard AI (ID: blackbeard)**
- **Model:** GPT-4
- **Temperature:** 0.9 (Highly creative)
- **Max Tokens:** 180
- **Personality:** Gruff pirate captain
- **Voice Settings:** Rate 0.9, Pitch 0.8, Volume 0.9

#### ElevenLabs Conversational AI Configuration
- **Service Port:** 8771 (ElevenLabs conversational AI)
- **Agent Management:** Character-specific AI agents
- **Jaw Calibration:** Closed 50°, Open 30°, Medium speed
- **Speech Synthesis:** Enabled with character-specific settings
- **Compatible GPIO Pins:** 18, 19, 20, 21, 22, 23, 24, 25
- **Auto-Start:** Enabled for websocket services

#### System Services
- MonsterBox Core System
- SSH Remote Access
- GPIO Control Interface
- Servo Control System
- Camera Management
- Audio Processing
- Jaw Animation Engine
- AI Bridge Services

#### Motion & Tracking Settings
- **Motion Tracking:** Enabled (Advanced)
- **Hardware Monitoring:** Enabled
- **Sensitivity:** 50
- **Minimum Detection Area:** 500 pixels
- **Real-time Processing:** Active

---

## Scene Programming Library

The system includes **17 pre-programmed interactive scenes** distributed across characters:

### Count Orlok Scenes (6 scenes)
1. **Turn Head Right** - Sequential head movement demonstration
2. **Play One Sound** - Simple audio playback test
3. **Play Three Sounds** - Multi-layered audio with background weather
4. **Full Scene - Raise Arm Light and Lower** - Complex coordination sequence
5. **Sound and Actuator** - Basic interaction demonstration
6. **Test Servos** - Hardware validation routine

### Coffin Breaker Scenes (9 scenes)
1. **Scary Coffin** - Door opening with greeting
2. **Let Me Out** - Interactive help request
3. **Scary Coffin Guy** - Poetry recitation with door movement
4. **Alex Curse** - Character-specific narrative
5. **Jims Lament** - Extended storytelling sequence
6. **AI Scary** - Halloween-themed AI story
7. **Lemme Out** - Light effects with pleading

### PumpkinHead Scenes (1 scene)
1. **Shake Back and Forth** - Movement with roaring audio

### Advanced Scene Features
- **Concurrent Actions:** Multiple components operating simultaneously
- **Timing Control:** Precise duration settings for all movements
- **Voice Synthesis:** Real-time text-to-speech integration
- **Light Coordination:** Synchronized lighting effects
- **Sound Layering:** Background and foreground audio mixing

---

## System Architecture & Network Configuration

### Network Topology
| Character | IP Address | Status | Services |
|-----------|------------|--------|----------|
| Count Orlok | 192.168.8.120 | Running | Full Suite |
| Coffin Breaker | 192.168.8.140 | Running | Actuator/Sound |
| PumpkinHead | 192.168.8.150 | Running | Basic Control |
| Skulltalker | 192.168.8.130 | Running | AI Integration |

### Common System Services
- **SSH Remote Access** - Secure shell connectivity
- **GPIO Control Interface** - Hardware pin management
- **Hardware Monitoring** - Real-time system status
- **Log Collection** - System, auth, kernel, daemon, user logs
- **Real-time Streaming** - Live video/audio capabilities
- **Motion Detection** - PIR sensor integration

### Audio System Specifications
- **Total Audio Files:** 130+ sound files
- **Voice Synthesis:** ElevenLabs Conversational AI integration
- **Concurrent Playback:** Multi-channel audio support
- **Format Support:** MP3, WAV with various bitrates
- **Character-Specific Voices:** Unique voice profiles per character
- **Real-time Generation:** Dynamic text-to-speech capabilities

### Security & Access Control
- **SSH Key Authentication** - ~/.ssh/id_rsa key-based access
- **User Account Management** - Standardized 'remote' user accounts
- **Network Segmentation** - Isolated animatronic network
- **Log Retention** - 30-day log storage policy
- **Collection Intervals** - 300-second monitoring cycles

---

## Technical Specifications Summary

### Hardware Capabilities
- **Linear Actuators:** Precise movement control with variable speed
- **Servo Motors:** High-torque positioning with feedback
- **Motion Sensors:** PIR-based detection systems
- **LED/Light Control:** Atmospheric lighting effects
- **Camera Systems:** HD video streaming capabilities
- **Audio Processing:** Multi-channel sound management

### Software Integration
- **AI Models:** GPT-4 integration for natural conversation
- **Real-time Processing:** WebSocket-based communication
- **Scene Programming:** Visual drag-and-drop interface
- **Voice Synthesis:** Multiple TTS provider support
- **Hardware Abstraction:** Unified control interface
- **Monitoring Systems:** Comprehensive logging and analytics

### Performance Metrics
- **Response Time:** Sub-second hardware activation
- **AI Processing:** Real-time conversation capabilities
- **Video Streaming:** HD quality with minimal latency
- **Audio Quality:** Professional-grade sound reproduction
- **Reliability:** 24/7 operational capability
- **Scalability:** Modular character addition support

---

*Document Generated: June 21, 2025*  
*MonsterBox System Version: Current Production*  
*Total Characters: 4 Active Animatronics*  
*Total Scenes: 17 Programmed Sequences*  
*Total Audio Files: 130+ Sound Library*
