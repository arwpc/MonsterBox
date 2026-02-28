# Usage Guide

MonsterBox runs as a web application on port 3000. Open `http://<host>:3000` in any browser on the local network.

## Dashboard (`/`)

The Dashboard is the primary operator interface. It features draggable, reorderable panels:

- **Scenes Panel** — drag-reorder scenes, delete, play individual scenes, or loop-all
- **Monster Features Panel** — toggles for Jaw Animation, Head Tracking, and Parrot mode
- **Manual Controls** — custom button layouts for direct hardware control
- **Webcam Feed** — live MJPEG stream from the character's camera
- **Conversation Panel** — AI chat, TTS playback, and audio controls

## Animation Studio (`/scenes`)

The unified three-panel interface for creating and editing scenes and poses.

### Left Panel
- **Scene Library** — search, filter, and select scenes
- **Pose Library** — browse poses by category
- **Queue** — play, loop, pause, and skip through scene queues

### Center Panel — Timeline Editor
- Color-coded step blocks for each step type
- Inline editing of step parameters
- SortableJS drag-reorder of steps
- Drag-and-drop from palettes to timeline

### Right Panel
- **Webcam Preview** — live camera feed
- **Part Palette** — hardware parts grouped by type, drag to timeline
- **Action Palette** — quick-add buttons for common step types

### Toolbar
- Jaw Animation and Head Tracking toggles
- Emergency Stop button
- Ctrl+S keyboard shortcut for save

## Pose Editor (`/poses/editor`)

Visual interface for positioning hardware parts and saving named poses:

- Servo angle sliders with min/max bounds
- Motor and linear actuator controls
- Light on/off toggles
- Optional audio attachment (file or TTS)
- Save as named pose with category

## Calibration (`/setup/calibration`)

Calibration panels are shown only for **movement parts**: servos, motors, linear actuators, and steppers.

- **Nudge Controls** — fine-tune position with +/- buttons
- **Presets** — save Min, Mid, Max positions for quick recall
- **Clear Calibration** — remove calibration data per-part or for all parts
- Non-movement parts (webcam, microphone, speaker, light, sensor) show type-specific controls only

## Jaw Animation (`/setup/jaw-animation`)

Real-time audio-synchronized jaw movement setup:

- Select the jaw servo from the character's parts
- Configure sensitivity, smoothing, and volume threshold
- Choose presets: Speech, Music, or Custom
- Test with TTS and view the jaw timeline visualization
- Bandpass filter (500-2500Hz) isolates speech formants
- Auto Gain Control normalizes audio automatically

## AI Conversation

ElevenLabs-powered real-time voice chat:

- **Conversational AI** runs over WebSocket on port 8795
- Barge-in support — interrupt the AI while it's speaking
- Server-side microphone via PipeWire (not browser-based)
- Per-character voice configuration in AI Settings

## Goblin Management (`/goblin-management`)

Control Goblin video display units (Pi 3B+/4B):

- Real-time status monitoring for all registered Goblins
- Double-click a Goblin card to open the video queue modal
- Browse and search 57+ videos from `/home/remote/media/video`
- Add videos to queue or play immediately
- Queue controls: Start, Stop, Clear, Skip
- Save, load, and distribute playlists across all Goblins

## Scene Step Types

MonsterBox supports 14 scene step types:

| Type | Description |
|------|-------------|
| `servo` | Move a servo to a specific angle |
| `motor` | Run a motor (direction + speed + duration) |
| `linear-actuator` | Extend or retract a linear actuator |
| `light/led` | Turn a light on or off |
| `audio` | Play an audio file from the library |
| `sayThis` | Generate and play TTS speech |
| `askAI` | Send a prompt to the AI and play the response |
| `goblin-video` | Play a video on a Goblin display |
| `wait` | Pause for a specified duration |
| `sensor` | Wait for sensor input (e.g., PIR motion) |
| `pose` | Apply a saved pose (all parts at once) |
| `hardware` | Generic hardware command |
| `jaw-animation` | Enable/disable jaw animation mid-scene |
| `head-tracking` | Enable/disable head tracking mid-scene |

### Concurrent Steps

The `concurrent` flag on a step means **"run THIS step and the NEXT step simultaneously."** This allows synchronized actions like playing audio while moving a servo.

### Queue and Loop Mode

From the Dashboard or Animation Studio, you can:

1. Add scenes to the **Queue**
2. Start the queue in **loop mode** — scenes repeat continuously
3. Pause, skip, or stop the queue at any time

This enables unattended operation for Halloween night displays.

## Character Selection

Switch between characters using the dropdown in the navigation bar. The selected character determines which parts, poses, scenes, and AI config are active.

## Themes

MonsterBox includes 19 UI themes (2 default + 17 Bootswatch). Change the theme from the System page or via the API.
