# Directory Structure

```
MonsterBox/
├── server.js              # Express app entry point
├── package.json           # Version source of truth
├── CLAUDE.md              # AI assistant instructions
├── install.sh             # Full system installation script
│
├── routes/                # Express route handlers
│   ├── api/               # JSON API endpoints (parts, audio, config, system)
│   ├── scenes/            # Animation Studio routes
│   ├── setup/             # Character setup, calibration, jaw animation routes
│   └── poses/             # Pose routes (editor + API)
│
├── services/              # Business logic layer (35+ files)
│   ├── scenes/            # Scene execution engine
│   ├── poses/             # Pose management
│   └── hardwareService/   # Hardware abstraction layer
│
├── controllers/           # Request handlers
│
├── views/                 # EJS templates
│   ├── layouts/           # master.ejs layout wrapper (provides nav, theme, footer)
│   ├── scenes/            # Animation Studio (studio.ejs)
│   ├── poses/             # Pose Editor (editor.ejs)
│   ├── setup/             # Character setup pages (calibration, jaw animation, etc.)
│   └── partials/          # Shared template fragments
│
├── public/                # Static assets
│   ├── css/               # Stylesheets
│   ├── js/                # Client-side JavaScript (ES5 IIFE pattern)
│   └── images/            # Images and icons
│
├── python_wrappers/       # Hardware control scripts
│   ├── servo_control.py   # PCA9685 servo control
│   ├── jaw_servo_daemon.py # Persistent jaw animation daemon
│   ├── motor_control.py   # DC motor control (MDD10A, BTS7960)
│   ├── led_control.py     # LED/light control
│   └── sensor_read.py     # Sensor reading (PIR, etc.)
│
├── data/                  # Runtime data (JSON files, no database)
│   ├── characters.json    # Character registry
│   ├── character-{id}/    # Per-character data
│   │   ├── parts.json     # Hardware part definitions
│   │   ├── poses.json     # Named poses
│   │   ├── scenes.json    # Animation sequences
│   │   ├── super-powers.json # Jaw animation, head tracking config
│   │   └── ai-config/     # TTS/STT configuration
│   ├── audio-library/     # Shared audio files and metadata
│   ├── video-library/     # Video files for Goblin deployment
│   └── models/            # AI model configurations
│
├── config/                # Application configuration
│   └── app-config.json    # Port, theme, selected character
│
├── tests/                 # Test suites
│   ├── unit/              # Mocha unit tests
│   ├── system/            # Mocha system/integration tests
│   └── browser/           # Playwright E2E tests
│
├── scripts/               # Utility and migration scripts
│
├── ai/                    # AI prompt templates and config
│
├── goblin/                # Goblin video player subsystem
│
└── docs/                  # MkDocs documentation source
    ├── mkdocs.yml         # MkDocs configuration
    ├── index.md           # Documentation home
    └── ...                # Topic pages
```

## Key Files

| File | Purpose |
|------|---------|
| `server.js` | Express app (~825 lines) — route mounting, middleware, startup |
| `package.json` | Single source of truth for version number |
| `config/app-config.json` | Runtime configuration (port, theme, active character) |
| `data/characters.json` | Character registry |
| `install.sh` | Complete RPi4B installation script |

## Code Patterns

- **Server-side:** ES module `import`/`export`, `async`/`await`
- **Client `public/js/*.js`:** ES5 IIFE pattern — `var`, no arrow functions, no template literals
- **Inline EJS `<script>`:** May use ES6+ (match existing file style)
- **Part IDs:** strings in scenes.json, numbers in poses.json — use `String(partId)` for comparison
