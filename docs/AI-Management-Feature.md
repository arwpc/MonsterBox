# AI Management Feature - MonsterBox

## Overview

The AI Management Feature provides a comprehensive, centralized interface for configuring and managing all AI systems within MonsterBox. This feature integrates three core AI components to enable complete character interactions:

1. **Speech-to-Text (STT)** - OpenAI Whisper API
2. **AI Personalities** - OpenAI GPT models with character-specific configurations
3. **Text-to-Speech (TTS)** - TopMediaAI voice synthesis with full voice catalog

## Features

### 🎤 Speech-to-Text Configuration
- **OpenAI Whisper Integration**: Configure API keys, model selection, and language preferences
- **Audio Quality Settings**: Adjust confidence thresholds, chunk duration, and timeout configurations
- **Live Testing**: Real-time audio recording and transcription testing with confidence metrics
- **Fallback Support**: System STT fallback when OpenAI services are unavailable

### 🧠 AI Personality Management
- **Multi-Provider Support**: OpenAI, Anthropic, and Google AI integration
- **Per-Character Configuration**: Individual AI settings for each character including:
  - Model selection (GPT-4, GPT-3.5, Claude 3, Gemini Pro)
  - Temperature and creativity controls
  - Maximum token limits
  - Custom system prompts and personality definitions
  - Conversation context length
- **Global Defaults**: Set system-wide AI configuration defaults
- **Real-time Testing**: Test AI responses with different characters and prompts

### 🔊 Text-to-Speech Configuration
- **TopMediaAI Integration**: Full access to 100+ voice catalog
- **Voice Assignment**: Character-specific voice selection with preview functionality
- **Advanced Voice Settings**: Speed, pitch, volume, emotion, and audio format controls
- **Voice Catalog Browser**: Searchable and filterable voice selection with:
  - Gender, language, and accent filters
  - VIP, free, new, and trending voice categories
  - Real-time voice preview with custom text
- **Audio Testing**: Generate and test speech with immediate playback

### 🔄 Unified Pipeline Management
- **Complete Workflow Testing**: End-to-end STT → AI → TTS pipeline testing
- **System Status Monitoring**: Real-time status of all AI components
- **Performance Metrics**: Response times, success rates, and error tracking
- **Configuration Management**: Import/export AI settings for backup and sharing

## Navigation

Access the AI Management Feature through:
- **Main Menu**: "🤖 AI Management" button on the home page
- **Character Pages**: "Configure Voice" button opens TTS configuration for that character
- **Direct URLs**:
  - `/ai-management` - Main dashboard
  - `/ai-management/stt` - Speech-to-Text configuration
  - `/ai-management/personalities` - AI Personality management
  - `/ai-management/tts` - Text-to-Speech configuration

## Integration with Existing Systems

### ChatterPi Compatibility
- Maintains backward compatibility with existing ChatterPi AI configurations
- Existing character voice assignments are preserved and enhanced
- ChatterPi chat interface continues to work with new AI configurations

### Character Management Integration
- Character-specific AI and voice settings are stored with character data
- "Configure Voice" buttons throughout the interface link to the new TTS configuration
- AI instance assignments work seamlessly with the new personality management

### Hardware Integration
- Voice configurations integrate with existing servo animation systems
- Audio output works with existing speaker and hardware configurations
- Real-time jaw animation continues to work with TTS output

## Configuration Files

AI configurations are stored in `/data/ai-config/`:
- `stt-config.json` - Speech-to-Text settings
- `personalities-config.json` - AI personality global settings
- `tts-config.json` - Text-to-Speech global settings

Character-specific AI configurations are stored within character data files.

## API Endpoints

### STT API
- `GET /ai-management/api/stt/status` - Check STT system status
- `POST /ai-management/api/stt/config` - Save STT configuration
- `POST /ai-management/api/stt/test` - Test STT connection
- `POST /ai-management/api/stt/transcribe` - Transcribe audio file

### AI Personalities API
- `POST /ai-management/api/personalities/global` - Save global AI settings
- `GET /ai-management/api/personalities/character/:id` - Get character AI config
- `POST /ai-management/api/personalities/character/:id` - Save character AI config
- `POST /ai-management/api/personalities/test` - Test AI response

### TTS API
- `POST /ai-management/api/tts/global` - Save global TTS settings
- `POST /ai-management/api/tts/save-all` - Save all voice assignments

### Testing API
- `POST /ai-management/api/test/stt` - Test STT system
- `POST /ai-management/api/test/ai` - Test AI system
- `POST /ai-management/api/test/tts` - Test TTS system
- `POST /ai-management/api/test/pipeline` - Test complete pipeline

### Configuration Management
- `GET /ai-management/api/export` - Export all AI configurations
- `POST /ai-management/api/import` - Import AI configurations from file

## Environment Variables

Required environment variables:
```bash
OPENAI_API_KEY=sk-your-openai-api-key-here
TOPMEDIAI_API_KEY=your-topmediai-api-key-here
```

Optional environment variables:
```bash
ANTHROPIC_API_KEY=your-anthropic-api-key-here
GOOGLE_API_KEY=your-google-ai-api-key-here
```

## Usage Examples

### Setting Up a New Character
1. Create character in Characters section
2. Navigate to AI Management → AI Personalities
3. Configure character's AI personality and behavior
4. Navigate to AI Management → TTS
5. Assign voice from TopMediaAI catalog
6. Test complete pipeline with AI Management → Dashboard

### Testing Voice Configuration
1. Go to AI Management → TTS
2. Select character and click "Configure"
3. Browse voice catalog and select voice
4. Adjust speed, pitch, volume settings
5. Preview voice with custom text
6. Assign voice to character

### Exporting Configuration
1. Go to AI Management → Dashboard
2. Click "Export Configuration"
3. Download JSON file with all AI settings
4. Use for backup or sharing between systems

## Troubleshooting

### Common Issues
- **No API Key**: Ensure environment variables are set correctly
- **Voice Not Playing**: Check browser audio permissions and speaker configuration
- **STT Not Working**: Verify microphone permissions and OpenAI API key
- **AI Responses Failing**: Check API key validity and network connectivity

### Error Messages
- "No API key configured": Set required environment variables
- "Voice catalog failed to load": Check TopMediaAI API key and network
- "Character not found": Ensure character exists in Characters section
- "Configuration save failed": Check file permissions in data directory

## Future Enhancements

Planned improvements:
- Real-time voice cloning integration
- Advanced emotion and style controls
- Multi-language conversation support
- Voice training and customization
- Advanced AI model fine-tuning
- Integration with additional TTS providers
- Voice morphing and effects
- Conversation memory and context persistence
