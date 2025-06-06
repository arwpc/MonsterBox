# 🎃 MonsterBox Technical Overview & Setup Guide

## Executive Summary

MonsterBox is a sophisticated animatronic control system built with Node.js/Express, designed for managing distributed Raspberry Pi-based animatronic systems in haunted attraction environments. The platform features enterprise-level architecture, comprehensive testing, and professional development practices.

## 1. Codebase Statistics

- **Total Files**: 19,127 files (including node_modules)
- **Source Code Files**: ~350 files (excluding node_modules, .git, site)
- **Estimated Total Lines of Code**: ~25,000-30,000 lines
- **Project Structure Depth**: 4-5 levels deep
- **Main Directories**: 15 primary directories

## 2. Programming Languages & Lines of Code Distribution

### Primary Languages (~22,000 lines, 85%):

| Language | Lines of Code | Percentage | Files |
|----------|---------------|------------|-------|
| **JavaScript (Node.js)** | ~15,000 | 60% | ~80 |
| **Python** | ~4,000 | 15% | ~25 |
| **EJS Templates** | ~1,500 | 5% | ~20 |
| **JSON** | ~1,500 | 5% | ~15 |

### Secondary Languages (~4,000 lines, 15%):

| Language | Lines of Code | Percentage | Files |
|----------|---------------|------------|-------|
| **Markdown** | ~2,000 | 7% | ~50 |
| **CSS** | ~800 | 3% | ~5 |
| **Shell Scripts** | ~800 | 3% | ~10 |
| **PowerShell** | ~400 | 2% | ~5 |

**Total: ~25,000 lines across ~210 source files**

## 3. Technology Stack

### Backend Framework
- **Node.js**: v18.0.0+ (Runtime Environment)
- **Express.js**: v4.21.1 (Web Application Framework)
- **EJS**: v3.1.9 (Embedded JavaScript Templating)

### Frontend Technologies
- **EJS Templating**: Server-side rendering with dynamic content
- **CSS3**: Custom styling with Google Fonts (Creepster theme)
- **JavaScript (Client-side)**: jQuery 3.6.0, Axios for AJAX
- **WebSocket**: Real-time audio/video streaming (ws v8.14.2)

### Database/Storage Solutions
- **JSON File-based Storage**: Character, scene, part, and sound configurations
- **Session Storage**: Express-session v1.17.3 for user sessions
- **File System**: Direct file operations for media and logs

### Hardware Integration Libraries
- **GPIO Control**: `onoff` v6.0.3 (Raspberry Pi GPIO)
- **I2C Communication**: `i2c-bus` v5.2.3 (Sensor and device communication)
- **Audio Playback**: `mpg123` v0.2.3 (Sound system integration)
- **System Information**: `node-disk-info` v1.3.0 (Hardware monitoring)

## 4. Key Dependencies

### Core Framework Dependencies
```json
{
  "express": "^4.21.1",           // Web framework
  "ejs": "^3.1.9",                // Templating engine
  "express-session": "^1.17.3",   // Session management
  "dotenv": "^16.4.5",            // Environment configuration
  "winston": "^3.11.0",           // Logging framework
  "ws": "^8.14.2"                 // WebSocket support
}
```

### Hardware Control Libraries
```json
{
  "i2c-bus": "^5.2.3",            // I2C device communication
  "onoff": "^6.0.3",              // GPIO control for RPi
  "mpg123": "^0.2.3",             // Audio playback
  "node-disk-info": "^1.3.0"      // System monitoring
}
```

### AI/ML Integrations
```json
{
  "task-master-ai": "^0.16.1",    // AI-powered task management
  "@ai-sdk/openai": "1.3.22",     // OpenAI integration
  "@anthropic-ai/sdk": "0.39.0",  // Claude AI integration
  "openai": "^4.104.0"            // OpenAI API client
}
```

### Testing Frameworks
```json
{
  "mocha": "^10.7.3",             // Test runner
  "chai": "^4.5.0",               // Assertion library
  "chai-http": "^4.3.0",          // HTTP testing
  "cross-env": "^7.0.3"           // Environment management
}
```

## 5. Architecture Overview

### MVC Structure
```
MonsterBox/
├── app.js                 # Main application entry point (280 lines)
├── controllers/           # Business logic layer (~2,500 lines)
│   ├── sceneController.js
│   ├── partController.js
│   ├── soundController.js
│   └── ...
├── services/              # Service layer (~1,500 lines)
│   ├── characterService.js
│   ├── sceneService.js
│   └── ...
├── routes/                # API endpoints (~3,500 lines)
│   ├── characterRoutes.js
│   ├── sceneRoutes.js
│   └── ...
└── views/                 # EJS templates (~1,500 lines)
    ├── index.ejs
    ├── scenes.ejs
    └── ...
```

### API Endpoints Structure
- **Character Management**: `/characters` - CRUD operations for animatronic characters
- **Scene Builder**: `/scenes` - Scene creation, editing, and execution
- **Hardware Control**: `/parts/*` - GPIO, servo, LED, sensor control
- **Audio System**: `/sounds` - Sound management and playback
- **Real-time Control**: `/active-mode` - Live performance automation
- **System Monitoring**: `/health`, `/logs` - Health checks and log viewing
- **Configuration**: `/system-config` - System-wide settings

### Hardware Integration Patterns
1. **Python Script Execution**: Node.js spawns Python processes for hardware control
2. **JSON Configuration**: Hardware settings stored in character-specific JSON files
3. **SSH Remote Control**: Secure communication with distributed RPi systems
4. **Real-time WebSocket**: Live streaming for audio/video feeds

### Distributed Architecture
- **Development Workstation**: Windows-based control center
- **Orlok RPi** (192.168.8.120): Vampire animatronic with servo/GPIO control
- **Coffin RPi** (192.168.8.140): Coffin mechanism with linear actuators
- **Pumpkinhead RPi** (192.168.1.101): Currently offline/disabled

## 6. Development Tools

### Build Tools
- **npm scripts**: 20+ predefined scripts for development, testing, and deployment
- **nodemon**: Hot-reload development server
- **cross-env**: Cross-platform environment variable management

### Testing Setup
- **Mocha + Chai**: Unit and integration testing (~2,000 lines)
- **Custom Test Reporter**: Clean output formatting
- **Environment-specific Testing**: Separate test configurations
- **Hardware Test Isolation**: RPI-specific tests excluded on non-RPI environments

### Documentation System (MkDocs)
- **Material Theme**: Modern, responsive documentation
- **57 documentation files** (~2,000 lines) organized in structured navigation
- **Automated GitHub Pages Deployment**
- **Comprehensive Coverage**: Setup guides, API docs, character sheets, security

### Project Management
- **Task Master AI**: v0.16.1 integrated for project management
- **15 main tasks** with 45+ subtasks currently tracked
- **Remote Agent Support**: 3 specialized agents working in parallel
- **Automated Task Generation**: PRD-based task creation and management

### Monitoring & Logging
- **Winston Logging**: Structured application logging (~800 lines)
- **MCP Log Collection**: Distributed log aggregation from RPi systems (~1,200 lines)
- **Sematext Integration**: External monitoring and alerting
- **Health Monitoring**: Real-time system status endpoints

---

# MonsterBox Development Environment Setup Script

The following script provides automated setup for the MonsterBox development environment on Ubuntu/Debian systems:

```bash
#!/bin/bash

# MonsterBox Development Environment Setup Script
# For Ubuntu/Debian systems including Raspberry Pi

echo "🎃 Setting up MonsterBox Development Environment..."

# Update system packages
echo "📦 Updating system packages..."
sudo apt-get update

# Install Node.js and npm if not present
echo "📦 Installing Node.js and npm..."
sudo apt-get install -y curl
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Python and pip
echo "🐍 Installing Python and pip..."
sudo apt-get install -y python3 python3-pip python3-dev python3-venv

# Install system dependencies for MonsterBox
echo "🔧 Installing system dependencies..."
sudo apt-get install -y \
    build-essential \
    git \
    ffmpeg \
    mpg123 \
    libmp3lame0 \
    libmp3lame-dev \
    alsa-utils \
    libasound2 \
    libasound2-dev \
    v4l-utils \
    i2c-tools

# Install hardware-specific packages (for RPI compatibility)
echo "🔌 Installing hardware packages..."
sudo apt-get install -y \
    python3-numpy \
    python3-opencv \
    python3-setuptools \
    python3-wheel \
    libopencv-dev \
    libatlas-base-dev \
    libhdf5-dev \
    libgtk-3-0 \
    libavcodec-dev \
    libavformat-dev \
    libswscale-dev \
    libv4l-dev \
    libxvidcore-dev \
    libx264-dev

# Navigate to project directory
cd /mnt/persist/workspace

# Install Node.js dependencies
echo "📦 Installing Node.js dependencies..."
npm install

# Install Python dependencies
echo "🐍 Installing Python dependencies..."
if [ -f scripts/requirements.txt ]; then
    python3 -m pip install --user -r scripts/requirements.txt
fi

# Create necessary directories
echo "📁 Creating necessary directories..."
mkdir -p log
mkdir -p public/sounds
mkdir -p data

# Set up environment variables for testing
echo "🔧 Setting up test environment..."
export NODE_ENV=test
export PORT=3000
export SESSION_SECRET=test-session-secret-for-setup
export ANTHROPIC_API_KEY=your_anthropic_api_key_here
export OPENAI_API_KEY=your_openai_api_key_here
export GOOGLE_API_KEY=your_google_api_key_here
export REPLICA_API_KEY=your_replica_api_key_here
export PERPLEXITY_API_KEY=your_perplexity_api_key_here
export MISTRAL_API_KEY=your_mistral_key_here
export XAI_API_KEY=YOUR_XAI_KEY_HERE
export AZURE_OPENAI_API_KEY=your_azure_key_here
export OLLAMA_API_KEY=your_ollama_api_key_here
export SKIP_CI_INTEGRATION=true

# Add environment variables to profile
echo "📝 Adding environment variables to profile..."
cat >> $HOME/.profile << 'EOF'

# MonsterBox environment variables
export NODE_ENV=test
export PORT=3000
export SESSION_SECRET=test-session-secret-for-setup
export ANTHROPIC_API_KEY=your_anthropic_api_key_here
export OPENAI_API_KEY=your_openai_api_key_here
export GOOGLE_API_KEY=your_google_api_key_here
export REPLICA_API_KEY=your_replica_api_key_here
export PERPLEXITY_API_KEY=your_perplexity_api_key_here
export MISTRAL_API_KEY=your_mistral_key_here
export XAI_API_KEY=YOUR_XAI_KEY_HERE
export AZURE_OPENAI_API_KEY=your_azure_key_here
export OLLAMA_API_KEY=your_ollama_api_key_here
export SKIP_CI_INTEGRATION=true

# Add npm global bin to PATH
export PATH="$HOME/.local/bin:$PATH"
EOF

# Source the profile to make variables available
source $HOME/.profile

echo "✅ MonsterBox development environment setup complete!"
echo "🧪 Ready to run tests..."
echo ""
echo "Next steps:"
echo "1. Update API keys in .env file"
echo "2. Run 'npm test' to verify installation"
echo "3. Run 'npm start' to launch MonsterBox"
echo "4. Access web interface at http://localhost:3000"
```

## Setup Script Features

### System Dependencies
- **Node.js 20.x**: Latest LTS version for optimal performance
- **Python 3**: Required for hardware control scripts
- **Build Tools**: Essential compilation tools for native modules
- **Audio/Video**: FFmpeg, MPG123 for multimedia processing
- **Hardware**: I2C tools, V4L utilities for RPI integration

### Development Environment
- **Automated Dependency Installation**: Both Node.js and Python packages
- **Directory Structure**: Creates necessary project directories
- **Environment Configuration**: Sets up all required environment variables
- **Profile Integration**: Persists settings across sessions

### Security Considerations
- **Placeholder API Keys**: Requires manual configuration of actual keys
- **Test Environment**: Configured for development/testing by default
- **CI Integration**: Includes flags for continuous integration

---

## 7. Remote Agent Task Management System

### Current Active Agents

The MonsterBox project utilizes Task Master AI v0.16.1 with three specialized remote agents working in parallel:

#### 🔐 Remote Agent 1: Security & Authentication Specialist
**Primary Task**: Task 11 - Implement Secure Remote Access System
**Status**: ACTIVE - 4 subtasks in progress
- JWT Authentication Architecture Design
- Role-Based Access Control (RBAC) Framework
- SSH Infrastructure Integration
- Multi-Factor Authentication (MFA)

#### 📊 Remote Agent 2: Monitoring & Logging Specialist
**Primary Task**: Task 4 - Implement MCP Log Collection System
**Status**: ACTIVE - 4 subtasks in progress
- MCP Log Collection Protocol Design
- Server Log Collection Components
- Automated Log Analysis System
- Real-time Monitoring Dashboard

#### 🧪 Remote Agent 3: Testing & Quality Assurance Specialist
**Primary Task**: Task 15 - Implement Comprehensive Testing Suite
**Status**: ACTIVE - 4 subtasks in progress
- Current Test Coverage Analysis
- Unit Test Framework Enhancement
- Integration Test Suite Implementation
- Continuous Integration Pipeline Configuration

### Project Progress Metrics
- **Total Tasks**: 15
- **Completed**: 2 (13.3%)
- **In Progress**: 4 (26.7%)
- **Subtask Completion**: 42.2% (19/45 completed)

## 8. Hardware Configuration

### Target Systems
- **Orlok RPi** (192.168.8.120): Operational - Vampire animatronic
- **Coffin RPi** (192.168.8.140): Operational - Coffin mechanism
- **Pumpkinhead RPi** (192.168.1.101): Offline - Excluded from testing

### Hardware Components
- **GPIO Control**: Direct pin manipulation for basic I/O
- **I2C Communication**: Sensor and advanced device integration
- **Servo Motors**: Precise movement control with PCA9685 support
- **Linear Actuators**: Heavy-duty movement mechanisms
- **Audio System**: Multi-channel sound playback
- **LED Control**: Lighting effects and indicators

## 9. Security Features

### Authentication & Authorization
- **JWT-based Authentication**: Secure token-based access control
- **Role-Based Access Control**: Granular permission management
- **Multi-Factor Authentication**: Enhanced security for remote access
- **SSH Key Management**: Secure inter-system communication

### Network Security
- **Private Network**: MonsterNet WiFi (192.168.8.x range)
- **IP Whitelisting**: Restricted access to authorized devices
- **Encrypted Communication**: TLS/SSL for all web traffic
- **Audit Logging**: Comprehensive activity tracking

## 10. Monitoring & Observability

### Logging Infrastructure
- **Winston Logging**: Structured application logs
- **MCP Log Collection**: Distributed log aggregation
- **Sematext Integration**: External monitoring service
- **Real-time Streaming**: Live log monitoring capabilities

### Health Monitoring
- **System Health Endpoints**: `/health` API for status checks
- **Performance Metrics**: CPU, memory, disk usage tracking
- **Service Monitoring**: Individual component health checks
- **Alert System**: Automated notification for critical issues

## 11. Development Workflow

### Version Control
- **Git Repository**: GitHub-hosted with automated workflows
- **Branch Strategy**: Feature branches with pull request reviews
- **Automated Testing**: CI/CD pipeline with comprehensive test suite
- **Documentation**: Automated MkDocs deployment

### Code Quality
- **ESLint**: JavaScript code linting and formatting
- **Mocha/Chai Testing**: Unit and integration test coverage
- **Custom Test Reporter**: Clean, readable test output
- **Code Coverage**: Tracking and enforcement of test coverage

### Deployment
- **Automated Scripts**: Shell and PowerShell deployment automation
- **Environment Management**: Separate dev/test/production configurations
- **Remote Deployment**: SSH-based deployment to RPi systems
- **Health Checks**: Post-deployment verification

---

*This document provides a comprehensive overview of the MonsterBox animatronic control system, including detailed technical specifications, automated setup procedures, and current development status with active remote agent task management.*
