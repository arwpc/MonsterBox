# Configuration

MonsterBox uses JSON configuration files — there is no `.env` file.

## Application Config

**File:** `config/app-config.json`

```json
{
  "port": 3000,
  "theme": "darkly",
  "selectedCharacter": 3,
  "dataPath": "data/character-3"
}
```

| Field | Description |
|-------|-------------|
| `port` | HTTP server port (default: 3000) |
| `theme` | UI theme name — 19 options: `default`, `dark`, plus 17 Bootswatch themes |
| `selectedCharacter` | Active character ID — determines which parts, scenes, and poses are loaded |
| `dataPath` | Path to the active character's data directory |

## Character Data Files

Each character stores its data in `data/character-{id}/`:

| File | Description |
|------|-------------|
| `parts.json` | Hardware part definitions (servos, motors, LEDs, sensors, speakers, etc.) |
| `poses.json` | Named pose configurations (saved positions for multiple parts) |
| `scenes.json` | Animation sequences (ordered steps with timing and concurrent flags) |
| `super-powers.json` | Special abilities config (jaw animation, head tracking, etc.) |

### AI Config (per-character)

Located in `data/character-{id}/ai-config/`:

| File | Description |
|------|-------------|
| `tts-config.json` | Text-to-speech settings — model, voice ID, stability, style |
| `stt-config.json` | Speech-to-text settings — model, language, sample rate, VAD |

## ElevenLabs API Key

Stored at `/etc/monsterbox/elevenlabs.key` with restricted permissions (mode 600). Set during installation or manually:

```bash
sudo mkdir -p /etc/monsterbox
echo -n 'sk_...' | sudo tee /etc/monsterbox/elevenlabs.key >/dev/null
sudo chmod 600 /etc/monsterbox/elevenlabs.key
```

## Super Powers Config

**File:** `data/character-{id}/super-powers.json`

Contains configuration for special character abilities:

- **Jaw Animation** — servo ID, sensitivity, smoothing, bandpass filter, AGC, presets, multi-config support
- **Head Tracking** — tracking servo, speed, bounds

The jaw animation section uses a `configs[]` array with an `activeConfigId` for multi-config support.

## Character Registry

**File:** `data/characters.json`

Array of registered characters with their IDs, names, and ElevenLabs agent IDs.

## Themes

19 themes available — set via System page UI or API:

```bash
curl -X POST http://localhost:3000/api/config/theme \
  -H "Content-Type: application/json" \
  -d '{"theme": "darkly"}'
```

Bootswatch themes include: cerulean, cosmo, cyborg, darkly, flatly, journal, litera, lumen, lux, materia, minty, pulse, sandstone, simplex, sketchy, slate, superhero.
