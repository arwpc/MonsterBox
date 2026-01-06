# MonsterBox Unified Navigation Structure

## Current Navigation Inconsistencies

### Issues Identified:
1. **Multiple Navigation Implementations** - Different pages use different navigation structures
2. **Inconsistent Menu Labels** - "AI Settings" vs "AI Management", varying character management locations
3. **Route Structure Variations** - Legacy vs current routing patterns
4. **Missing Menu Items** - Some pages exclude Audio Library, Character management inconsistent

## Proposed Unified Navigation Structure

### Primary Navigation (Top Level) - UNIFIED FOR ALL PAGES
```
MonsterBox 4.0
├── 🏠 Dashboard (/)
├── ⚙️ Setup (dropdown)
│   ├── Hardware
│   │   ├── 🔧 Parts (/setup/parts)
│   │   ├── 🎯 Calibration (/setup/calibration)
│   │   ├── 📹 Webcam (/setup/webcam)
│   │   └── 🤖 Poses (/setup/poses)
│   ├── Media & AI
│   │   ├── 🔊 Audio Configuration (/setup/audio)
│   │   ├── 🎵 Audio Library (/audio-library)
│   │   └── 🧠 AI Settings (/ai-settings)
│   ├── Character Management
│   │   ├── 👥 Characters (/setup/characters)
│   │   ├── 🎵 Character Audio (/setup/character-audio)
│   │   └── ⚡ Super Powers (/setup/super-powers)
│   └── System
│       ├── 🎛️ Models (/setup/models)
│       └── 💻 System (/setup/system)
├── 🎬 Live Mode (/live)
├── 🎭 Scenes (/scenes)
└── 👤 Character Selector (dropdown)
    ├── Character Selection
    └── [Dynamic Character List]
```

### AI Settings Sub-Navigation
```
AI Settings (/ai-settings)
├── 📊 Overview (/ai-settings/)
├── 🎤 Speech-to-Text (/ai-settings/stt)
├── 🤖 AI Agents (/ai-settings/agents)
├── 🔊 Text-to-Speech (/ai-settings/tts)
└── 🔗 Character Assignment (/ai-settings/character-assignment)
```

### Setup Sub-Navigation Categories
```
Hardware Setup:
- Parts: Hardware component configuration
- Calibration: Servo and actuator calibration
- Poses: Predefined position management

Media & AI Setup:
- Audio: Audio system configuration
- Webcam: Camera and streaming setup
- AI Settings: ElevenLabs integration

Character Management:
- Characters: Character CRUD operations
- Character Audio: Per-character audio settings

System Setup:
- Super Powers: Advanced features
- Models: Hardware model definitions
- System: Global system settings
```

## Implementation Requirements

### 1. Standardized Navigation Component
Create a single, reusable navigation component that all pages use:
- `views/components/unified-navigation.ejs`
- Consistent styling and behavior
- Dynamic active state management
- Character-aware routing

### 2. Route Consolidation
Standardize all routes to follow the unified structure:
- Maintain `/setup/*` pattern for all setup pages
- Consolidate AI management under `/ai-settings/*`
- Ensure consistent character context across all routes

### 3. Navigation State Management
- Global character selection persistence
- Active page/section highlighting
- Breadcrumb generation for deep pages

### 4. Responsive Design
- Mobile-friendly dropdown menus
- Collapsible navigation for smaller screens
- Touch-friendly interface elements

## Benefits of Unified Structure

1. **Consistency**: Same navigation experience across all pages
2. **Maintainability**: Single source of truth for navigation
3. **User Experience**: Predictable navigation patterns
4. **Scalability**: Easy to add new sections or pages
5. **Character Context**: Consistent character selection across system

## Migration Plan

1. Create unified navigation component
2. Update all pages to use the unified component
3. Remove duplicate navigation implementations
4. Test navigation consistency across all pages
5. Update documentation and user guides

## Navigation Styling Guidelines

- Use Bootstrap 5 navbar components
- Consistent icon usage (Bootstrap Icons)
- Dark theme with neon accents for Halloween aesthetic
- Clear visual hierarchy with proper spacing
- Hover effects and active state indicators
