# Scene Concurrency

## Overview

Scene steps can run concurrently (in parallel) using the `concurrent` flag. This is essential for playing audio while moving servos simultaneously.

## How It Works

The scene executor uses a **fire-and-forget** model:

- Steps with `concurrent: true` are fired off without waiting — execution proceeds immediately to the next step
- Steps without the `concurrent` flag are awaited normally (sequential execution)
- After all steps are processed, the executor waits for all background promises to settle

## Example

```json
{
  "steps": [
    { "type": "audio", "concurrent": true, "file": "roar.mp3" },
    { "type": "servo", "partId": "5", "angle": 90 },
    { "type": "wait", "duration": 1000 },
    { "type": "audio", "concurrent": true, "file": "growl.mp3" },
    { "type": "light", "partId": "7", "brightness": 100 }
  ]
}
```

**Execution flow:**
1. Audio "roar.mp3" starts playing in background (fire-and-forget)
2. Servo immediately moves to 90 degrees (doesn't wait for audio)
3. Wait 1000ms
4. Audio "growl.mp3" starts playing in background
5. Light turns on immediately
6. Executor waits for all background audio to finish before reporting completion

## Key Behaviors

- Multiple consecutive `concurrent: true` steps all fire in parallel
- Audio steps are the most common use case for `concurrent: true`
- Background step errors are logged but don't abort the scene
- The `concurrent` flag means "fire THIS step and proceed" (not "pair with next")

## Creating Concurrent Scenes

In the Animation Studio (`/scenes`):
1. Add an audio step
2. Check the "Concurrent" checkbox on the step
3. Add the next step (servo, light, etc.) — it will start immediately after the audio begins
