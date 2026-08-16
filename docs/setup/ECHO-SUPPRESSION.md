# Echo Suppression

## Overview

When the AI speaks through the character's speaker, the microphone can pick up the AI's own voice, causing a feedback loop where the AI responds to itself. Echo suppression prevents this by muting the microphone during and after audio playback.

## How It Works

Echo suppression uses a time-based approach:

1. **Before playing audio**, the system estimates the playback duration
2. **A suppression window** is set: `duration + tail buffer`
3. **During the window**, all microphone input is discarded (not sent to STT or ConvAI)
4. **After the window expires**, normal microphone capture resumes

### Multi-turn conversations (fixed in v9.0.0)

Suppression used to break after the *first* agent reply: `aiSpeaking` was cleared only on
`conversation_end`, so `speechStartedAt` stayed pinned to the first utterance while accumulated
audio kept growing — the computed deadline then resolved to a time in the past and the mic was
never actually muted. The agent heard its own voice as user speech and conversed with itself.

Two rules now keep it correct across turns:

- **A new utterance is detected from a gap between audio chunks** (>1200 ms), not from
  `aiSpeaking`. Audio for a single utterance arrives back to back, so a gap means a new one.
- **The deadline is monotonic** — a new utterance can only extend the window, never shorten
  it, so audio still draining out of the speaker cannot be let back in as "user" speech.

## Suppression Points

Echo suppression is triggered from multiple playback paths:

| Playback Path | File | Suppression Source |
|---------------|------|--------------------|
| ConvAI audio chunks | `elevenLabsWebSocketService.js` | Accumulated audio duration + 2500ms tail |
| `playAIOnCharacterSpeaker()` | `serverPlaybackService.js` | Buffer size duration estimate + 1000ms |
| `playBufferOnCharacterSpeaker()` | `serverPlaybackService.js` | Buffer size duration estimate + 1000ms |
| `playWithJawSync()` | `jawAnimationSuperPowerService.js` | `analysis.duration` + 1000ms |
| Parrot mode playback | `elevenLabsWebSocketService.js` | Duration + 1500ms |

## Duration Estimation

- **WAV/PCM:** `buffer.length / (sampleRate * 2) * 1000` ms (16-bit mono)
- **MP3:** `buffer.length * 8 / 128` ms (assuming ~128kbps)
- **Fallback:** 3000ms for unknown formats

## Tail Buffer

The tail buffer (2500ms for ConvAI, 1000ms for other paths) accounts for:
- Room reverb and echo
- Speaker-to-mic acoustic delay
- Processing pipeline latency

## Tuning

If the AI still echoes itself, increase the tail buffer:
- In `elevenLabsWebSocketService.js`, find `TAIL_BUFFER_MS` (currently 2500)
- Increase by 500ms increments until echo stops
- Larger values mean the AI takes longer to start listening after speaking

If the AI seems too slow to respond after speaking, decrease the tail buffer.
