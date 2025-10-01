# ElevenLabs Conversational AI Integration

## Overview

This document outlines the complete integration of ElevenLabs Conversational AI into MonsterBox, replacing the legacy three-API system (OpenAI Whisper STT + ChatGPT + TopMediai TTS) with a unified ElevenLabs solution.

## Architecture Changes

### Before (Legacy System)
```
User Input → OpenAI Whisper STT → ChatGPT AI → TopMediai TTS → Audio Output
```

### After (ElevenLabs Integration)
```
User Input → ElevenLabs Conversational AI → Audio Output
           ↓
    Real-time WebSocket Connection
           ↓
    Integrated STT + AI + TTS
```

## Updated Components

### 1. AI Management Dashboard (`/ai-management`)
- **Title**: ElevenLabs Conversational AI Dashboard
- **Status Monitoring**: ElevenLabs service status instead of separate STT/AI/TTS
- **Navigation**: Updated links to ElevenLabs-specific pages
- **Test Functions**: Unified ElevenLabs testing instead of separate API tests

### 2. Voice Activity Detection (`/ai-management/stt`)
- **Renamed From**: Speech-to-Text Configuration
- **Purpose**: Configure ElevenLabs voice activity detection
- **Settings**:
  - VAD Type (server_vad/client_vad)
  - VAD Threshold (0.1-1.0)
  - Prefix Padding (0-1000ms)
  - Silence Duration (100-2000ms)

### 3. ElevenLabs Agents (`/ai-management/agents`)
- **Renamed From**: OpenAI Assistants Management
- **Purpose**: Manage ElevenLabs conversational agents
- **Features**:
  - Agent creation and configuration
  - Voice selection from ElevenLabs catalog
  - Conversation starters preservation
  - Character-specific agent assignments

### 4. Voice Configuration (`/ai-management/voices`)
- **Renamed From**: Text-to-Speech Configuration
- **Purpose**: Configure ElevenLabs voice synthesis
- **Settings**:
  - Stability (0.0-1.0)
  - Similarity (0.0-1.0)
  - Style (0.0-1.0)
  - Output Format (MP3/PCM variants)
  - Model Selection (Multilingual v1/v2)

### 5. Enhanced Test Chat (`/test-chat`)
- **Integration**: ElevenLabs WebSocket connections
- **Metrics**: Voice Input, Agent, Voice Output timing
- **Features**: Real-time conversational AI testing

### 6. Conversational AI Interface (`/conversational-ai`)
- **Renamed From**: ChatterPi
- **Purpose**: Main voice chat interface
- **Features**: Character selection, voice controls, conversation starters

## API Changes

### New Endpoints

#### ElevenLabs Status
```
GET /ai-management/api/status
Response: { success: true, status: { elevenlabs: {...} } }
```

#### ElevenLabs Testing
```
POST /ai-management/api/test/elevenlabs
POST /ai-management/api/test/voices  
POST /ai-management/api/test/conversation
```

#### Voice Management
```
GET /ai-management/api/elevenlabs/voices
POST /ai-management/api/elevenlabs/global
POST /ai-management/api/vad/config
```

### Removed Endpoints
- `/ai-management/api/stt/*` (OpenAI Whisper)
- `/ai-management/api/tts/*` (TopMediai)
- Separate AI personality endpoints

## Configuration Changes

### Environment Variables
```bash
# Required
ELEVENLABS_API_KEY=xi_your_api_key_here

# Optional (legacy keys no longer needed)
# OPENAI_API_KEY=sk_...
# TOPMEDIAI_API_KEY=...
```

### Configuration Files
- `data/ai-config/vad-config.json` - Voice Activity Detection settings
- `data/ai-config/elevenlabs-config.json` - Global ElevenLabs settings
- Character configurations updated with ElevenLabs agent IDs

## Terminology Changes

### UI Labels
| Old Term | New Term |
|----------|----------|
| ChatterPi | Conversational AI / Voice Chat |
| Speech-to-Text | Voice Activity Detection |
| AI Personalities | ElevenLabs Agents |
| Text-to-Speech | Voice Configuration |
| STT/AI/TTS Pipeline | ElevenLabs Conversational AI |

### Route Changes
| Old Route | New Route |
|-----------|-----------|
| `/chatterpi` | `/conversational-ai` |
| `/ai-management/stt` | `/ai-management/stt` (updated content) |
| `/ai-management/assistants` | `/ai-management/agents` |
| `/ai-management/tts` | `/ai-management/voices` |

### File Renames
| Old File | New File |
|----------|----------|
| `routes/chatterPiRoutes.js` | `routes/conversationalAIRoutes.js` |
| `views/chatterpi.ejs` | `views/conversational-ai.ejs` |
| `public/js/chatterpi.js` | `public/js/conversational-ai.js` |

## Testing

### Comprehensive Test Suite
Run the complete ElevenLabs integration tests:
```bash
./scripts/test-elevenlabs-integration.sh
```

### Test Coverage
- ✅ AI Management Dashboard functionality
- ✅ Voice Activity Detection configuration
- ✅ ElevenLabs Agents management
- ✅ Voice Configuration settings
- ✅ Enhanced Test Chat interface
- ✅ Conversational AI route integration
- ✅ API endpoint functionality
- ✅ Backward compatibility

### Manual Testing Checklist
1. **Dashboard Access**: Navigate to `/ai-management`
2. **Service Status**: Verify ElevenLabs connection status
3. **Agent Creation**: Create new ElevenLabs agent
4. **Voice Selection**: Choose voice from ElevenLabs catalog
5. **Conversation Test**: Test real-time conversation
6. **Character Switching**: Verify character-specific agents
7. **Settings Persistence**: Confirm configuration saves

## Migration Guide

### For Existing Installations

1. **Update Environment Variables**:
   ```bash
   # Add to .env
   ELEVENLABS_API_KEY=xi_your_api_key_here
   ```

2. **Update Navigation Links**:
   - Update any bookmarks from `/chatterpi` to `/conversational-ai`
   - AI management links automatically redirect

3. **Character Configuration**:
   - Existing characters preserved
   - AI personalities migrated to ElevenLabs agents
   - Voice assignments updated to ElevenLabs voices

4. **Test Integration**:
   ```bash
   # Run integration tests
   ./scripts/test-elevenlabs-integration.sh
   ```

### Breaking Changes
- OpenAI Whisper STT configuration no longer used
- TopMediai TTS settings replaced with ElevenLabs voice settings
- ChatterPi terminology replaced throughout UI
- WebSocket connections now use ElevenLabs service

### Backward Compatibility
- Existing character data preserved
- Conversation starters maintained
- Character switching functionality retained
- Jaw animation integration continues to work

## Troubleshooting

### Common Issues

1. **ElevenLabs API Key Not Working**
   - Verify key format: `xi_...`
   - Check API key permissions
   - Confirm account has sufficient credits

2. **Voice Loading Issues**
   - Check internet connection
   - Verify ElevenLabs service status
   - Review browser console for errors

3. **WebSocket Connection Failed**
   - Confirm ElevenLabs service is running
   - Check firewall settings
   - Verify port 8771 is available

4. **Character Switching Not Working**
   - Verify character has assigned ElevenLabs agent
   - Check agent configuration
   - Review character service logs

### Debug Commands
```bash
# Check service status
curl http://localhost:3000/ai-management/api/status

# Test ElevenLabs connection
curl -X POST http://localhost:3000/ai-management/api/test/elevenlabs

# View application logs
tail -f logs/app.log
```

## Future Enhancements

### Planned Features
- [ ] Multi-language conversation support
- [ ] Voice cloning integration
- [ ] Advanced emotion detection
- [ ] Custom voice training
- [ ] Conversation analytics
- [ ] Real-time voice modulation

### Integration Opportunities
- [ ] Character-specific voice profiles
- [ ] Emotion-based animation triggers
- [ ] Advanced conversation flows
- [ ] Multi-character conversations
- [ ] Voice-driven scene changes

## Support

For issues related to ElevenLabs integration:
1. Check the test suite results
2. Review the troubleshooting section
3. Examine application logs
4. Verify ElevenLabs service status
5. Test with minimal configuration

## Conclusion

The ElevenLabs Conversational AI integration provides a unified, streamlined approach to voice-based character interaction in MonsterBox. By replacing the complex three-API system with a single, powerful service, we've improved reliability, reduced latency, and enhanced the overall user experience while maintaining full backward compatibility with existing character configurations.
