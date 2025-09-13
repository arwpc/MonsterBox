# MonsterBox 4.0 - Single Node Animatronic Control System

MonsterBox 4.0 is a clean, single-node, single-character application designed to replace the complex hub-and-spoke system. It eliminates all distributed services and WebSocket complexity while preserving 100% of existing Python hardware functionality and introducing the innovative **Poses** feature.

## 🎯 Key Features

### ✨ **Poses System**
- **Reusable, safe, named postures** that can be triggered manually, invoked in Scenes, and used by Active Mode
- **Template-based creation** with prebuilt options (Bend Elbow, Rotate Head, etc.)
- **Safety enforcement** with calibration data and angle clamping
- **Real-time execution** with hardware integration

### 🏗️ **Clean Architecture**
- **Single Raspberry Pi 4B** per animatronic (self-contained)
- **No WebSocket complexity** - direct hardware control
- **Preserves all existing Python hardware scripts** (unchanged)
- **Bootstrap 5 UI** with dark theme support

### 🔧 **Hardware Integration**
- **11 Part types supported**: servo, motor, actuator, light, LED, sensor, microphone, speaker, webcam, head tracking
- **Thin hardware service layer** wrapping existing Python functionality
- **Calibration system** with safety limits
- **Local-only media streaming**

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- Python 3.8+
- Raspberry Pi 4B (for hardware control)

### Installation

```bash
# Navigate to MonsterBox 4.0 directory
cd apps/monsterbox4

# Install dependencies
npm install

# Start the server
npm start
```

The application will be available at:
- **Dashboard**: http://localhost:3000
- **Setup**: http://localhost:3000/setup
- **Live Mode**: http://localhost:3000/live

## 📁 Directory Structure

```
apps/monsterbox4/
├── server.js                 # Express entry point
├── package.json              # Dependencies and scripts
├── config/
│   └── app-config.json       # Application configuration
├── routes/                   # Express routes
│   ├── setup/               # Setup interface routes
│   ├── live/                # Live mode routes
│   ├── scenes/              # Scene management
│   └── poses/               # Pose API routes
├── controllers/             # Business logic
│   ├── posesController.js   # Pose management
│   └── ...
├── services/                # Service layer
│   ├── hardwareService/     # Hardware abstraction
│   │   ├── exec.js         # Python execution helper
│   │   ├── servo.js        # Servo control
│   │   ├── motor.js        # Motor control
│   │   └── ...
│   └── poses/              # Pose system
│       ├── poseEngine.js   # Pose execution engine
│       └── poseRepository.js # Data management
├── views/                   # EJS templates
│   ├── components/         # Shared components
│   ├── setup/              # Setup pages
│   └── live/               # Live mode pages
├── public/                  # Static assets
│   ├── css/                # Custom styles
│   └── js/                 # Client-side JavaScript
├── python_wrappers/         # Python CLI wrappers
│   └── servo_cli.py        # Servo control wrapper
└── tests/                   # Test suite
    └── basic.test.js       # Basic functionality tests
```

## 🎭 Using Poses

### Creating Poses

#### From Templates (Recommended)
1. Go to **Setup → Poses**
2. Click **Create Pose**
3. Select **From Template** tab
4. Choose template (Bend Elbow, Head Movement)
5. Select option (Half Bend, Look Forward, etc.)
6. Choose target part
7. Click **Create Pose**

#### Quick Template Creation
In the Templates panel, click any option button to instantly create a pose with the first available servo part.

### Executing Poses

#### Live Dashboard
- Go to **Live Mode** 
- Click any pose button to execute immediately
- View execution status and results

#### API
```bash
# Execute pose by ID
curl -X POST http://localhost:3000/poses/1/execute \
  -H "Content-Type: application/json" \
  -d "{}"
```

### Pose Templates

#### Elbow Templates
- **Slight Bend** (20°)
- **Half Bend** (45°) 
- **Full Bend** (90°)
- **Extend Fully** (0°)

#### Head Templates
- **Look Forward** (stop/neutral)
- **Random Movement** (subtle wiggle pattern)
- **Full Rotation** (360° continuous)

## 🔧 Hardware Configuration

### Servo Calibration
Poses use calibration data from `data/servo_calibrations.json` to ensure safe operation:

```json
{
  "30": {
    "part_id": 30,
    "part_name": "Orloks Elbow",
    "servo_type": "standard",
    "positions": {
      "min": { "pulse_us": 1000, "angle": -90 },
      "max": { "pulse_us": 2000, "angle": 90 },
      "neutral": { "pulse_us": 1500, "angle": 0 }
    }
  }
}
```

### Safety Features
- **Angle clamping** to calibrated min/max ranges
- **Pulse width validation** 
- **Timeout protection** on hardware commands
- **Graceful fallback** to simulation mode

## 🌐 API Reference

### Poses API

#### Get All Poses
```
GET /poses
```

#### Execute Pose
```
POST /poses/:id/execute
```

#### Create from Template
```
POST /poses/from-template
Body: {
  "templateName": "elbow",
  "option": "Half Bend", 
  "partId": "30"
}
```

#### Get Templates
```
GET /poses/templates
```

## 🧪 Testing

```bash
# Run basic tests
npm test

# Test hardware services
npm run test:hardware

# Test poses specifically  
npm run test:poses
```

## 🔄 Migration from Legacy MonsterBox

MonsterBox 4.0 is designed to run alongside the legacy system initially:

1. **Data Compatibility**: Uses existing `data/` files (parts.json, servo_calibrations.json, etc.)
2. **Hardware Scripts**: Reuses all existing Python hardware scripts without modification
3. **Character Support**: Maintains character-specific configurations
4. **Gradual Migration**: Can be deployed per-character as needed

## 🎯 Design Principles

### Single Node Architecture
- **One RPi per character** - no distributed complexity
- **Local hardware control** - no WebSocket services
- **Self-contained operation** - no external dependencies

### Safety First
- **Calibration enforcement** on all movements
- **Safe angle clamping** prevents hardware damage
- **Timeout protection** prevents runaway commands
- **Graceful degradation** with simulation mode

### Developer Experience
- **Clean code structure** with clear separation of concerns
- **Comprehensive error handling** with meaningful messages
- **Extensive logging** for debugging
- **Simple deployment** with single command startup

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🆘 Support

For issues and questions:
1. Check the logs in the browser console
2. Review hardware connections and calibration
3. Test in simulation mode first
4. Create an issue with detailed error information

---

**MonsterBox 4.0** - Bringing animatronics to life with clean, safe, and powerful control! 🎭🤖
