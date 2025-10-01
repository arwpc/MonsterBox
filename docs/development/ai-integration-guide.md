# Core AI Integration Guide

## Overview

The Core AI Integration system provides a unified interface for interacting with multiple AI service providers (ElevenLabs, Anthropic Claude, Google AI) with comprehensive error handling, rate limiting, fallback mechanisms, and performance monitoring.

## Architecture

### Components

1. **AIClientManager** - Unified interface for multiple AI providers with automatic fallback
2. **Individual AI Clients** - Provider-specific implementations (ElevenLabs, Anthropic, Google)
3. **APIKeyManager** - Secure API key management with validation and rotation
4. **AIPerformanceMonitor** - Real-time performance monitoring and alerting
5. **CoreAIIntegration** - Main orchestration layer

### Data Flow

```
User Request → CoreAIIntegration → AIClientManager → Provider Client → AI Service
                     ↓                    ↓              ↓
              Performance Monitor ← Error Handling ← Response Processing
```

## Quick Start

### Basic Usage

```javascript
const { getInstance } = require('./ai/integrations');

// Initialize the AI integration
const aiIntegration = getInstance({
    defaultProvider: 'elevenlabs',
    fallbackProviders: ['anthropic', 'google'],
    enableMonitoring: true,
    enableKeyManagement: true
});

await aiIntegration.initialize();

// Generate AI response
const response = await aiIntegration.generateResponse(
    'Hello, how are you?',
    {
        maxTokens: 150,
        temperature: 0.7,
        preferredProvider: 'elevenlabs'
    }
);

console.log(response.text);
```

### Advanced Configuration

```javascript
const aiIntegration = getInstance({
    defaultProvider: 'anthropic',
    fallbackProviders: ['openai', 'google'],
    enableMonitoring: true,
    enableKeyManagement: true,
    
    // Client Manager Options
    clientManager: {
        maxRetries: 3,
        retryDelay: 1000,
        timeout: 30000,
        enableFallback: true
    },
    
    // Performance Monitoring Options
    monitoring: {
        metricsRetentionDays: 30,
        alertThresholds: {
            errorRate: 10,
            avgResponseTime: 5000
        }
    },
    
    // Key Management Options
    keyManager: {
        enableRotation: true,
        rotationInterval: 30 * 24 * 60 * 60 * 1000 // 30 days
    }
});
```

## API Reference

### CoreAIIntegration

#### Methods

##### `initialize()`
Initializes all AI integration components.

```javascript
const result = await aiIntegration.initialize();
// Returns: { success: true, providers: ['openai', 'anthropic'], monitoring: true, keyManagement: true }
```

##### `generateResponse(prompt, options)`
Generates AI response with automatic fallback and monitoring.

**Parameters:**
- `prompt` (string) - The input prompt
- `options` (object) - Configuration options
  - `preferredProvider` (string) - Preferred AI provider
  - `model` (string) - Specific model to use
  - `maxTokens` (number) - Maximum response tokens
  - `temperature` (number) - Response creativity (0-1)
  - `systemPrompt` (string) - System instructions
  - `conversationHistory` (array) - Previous conversation

**Returns:**
```javascript
{
    text: "AI response text",
    model: "gpt-3.5-turbo",
    metadata: {
        provider: "openai",
        requestId: "ai_req_123",
        responseTime: 1250,
        fallbackUsed: false,
        usage: { total_tokens: 45 }
    }
}
```

##### `getStatus()`
Returns comprehensive system status.

```javascript
const status = aiIntegration.getStatus();
```

##### `healthCheck()`
Performs comprehensive health check of all components.

```javascript
const health = await aiIntegration.healthCheck();
```

##### `testIntegration(provider)`
Tests integration with a simple prompt.

```javascript
const test = await aiIntegration.testIntegration('elevenlabs');
```

### Individual AI Clients



#### Anthropic Client

```javascript
const AnthropicClient = require('./ai/integrations/AnthropicClient');

const client = new AnthropicClient({
    apiKey: 'your-api-key',
    timeout: 30000
});

const response = await client.generateResponse('Hello', {
    model: 'claude-3-haiku-20240307',
    maxTokens: 150
});
```

#### Google AI Client

```javascript
const GoogleAIClient = require('./ai/integrations/GoogleAIClient');

const client = new GoogleAIClient({
    apiKey: 'your-api-key',
    timeout: 30000
});

const response = await client.generateResponse('Hello', {
    model: 'gemini-pro',
    maxTokens: 150
});
```

## Configuration

### Environment Variables

```bash
# Required API Keys
ELEVENLABS_API_KEY=your-elevenlabs-key
ANTHROPIC_API_KEY=your-anthropic-key
GOOGLE_API_KEY=your-google-key

# Optional: Encryption key for secure key storage
ENCRYPTION_KEY=your-encryption-key
```

### Provider-Specific Settings

#### ElevenLabs
- **Models**: Conversational AI, Speech-to-Text, Text-to-Speech
- **Rate Limits**: Varies by plan and feature
- **Features**: Voice synthesis, speech recognition, conversational AI

#### Anthropic Claude
- **Models**: claude-3-opus, claude-3-sonnet, claude-3-haiku
- **Rate Limits**: 60 requests/minute, 100,000 tokens/minute
- **Features**: Long context, safety filtering

#### Google AI (Gemini)
- **Models**: gemini-pro, gemini-pro-vision, gemini-1.5-pro
- **Rate Limits**: 60 requests/minute, 32,000 tokens/minute
- **Features**: Multimodal capabilities, safety ratings

## Error Handling

### Error Types

1. **Network Errors** - Connection issues, timeouts
2. **Authentication Errors** - Invalid API keys
3. **Rate Limit Errors** - API quota exceeded
4. **Server Errors** - Provider service issues
5. **Validation Errors** - Invalid request parameters

### Retry Logic

The system implements exponential backoff retry for:
- Network errors
- Server errors (5xx)
- Rate limit errors (429)

Non-retryable errors:
- Authentication errors (401, 403)
- Bad request errors (400)

### Fallback Mechanism

When the primary provider fails:
1. System attempts fallback providers in order
2. Each provider is tried with full retry logic
3. If all providers fail, error is returned
4. Fallback usage is tracked in metrics

## Performance Monitoring

### Metrics Tracked

- **Request Metrics**: Total, successful, failed requests
- **Performance**: Response times, throughput
- **Error Metrics**: Error rates, error types
- **Usage Metrics**: Token consumption, estimated costs

### Alerts

Automatic alerts for:
- Error rate > 10%
- Average response time > 5 seconds
- Provider failures

### Monitoring Dashboard

Access real-time metrics:

```javascript
const metrics = aiIntegration.getPerformanceMetrics(24); // Last 24 hours
console.log(metrics.current.summary);
```

## Security

### API Key Management

- **Secure Storage**: Keys encrypted at rest
- **Validation**: Regular key validation
- **Rotation**: Automatic rotation alerts
- **Access Control**: Secure key access patterns

### Best Practices

1. **Environment Variables**: Store keys in environment variables
2. **Encryption**: Use encryption for persistent storage
3. **Rotation**: Regularly rotate API keys
4. **Monitoring**: Monitor for unauthorized usage
5. **Logging**: Avoid logging sensitive data

## Testing

### Unit Tests

```bash
npm test tests/ai-integration-comprehensive.test.js
```

### Integration Tests

```bash
# Test with live APIs (requires valid keys)
npm run test:ai-integration-live
```

### Health Checks

```javascript
const health = await aiIntegration.healthCheck();
console.log(health.overall); // 'healthy', 'degraded', or 'unhealthy'
```

## Troubleshooting

### Common Issues

1. **API Key Errors**
   - Verify keys are set in environment variables
   - Check key validity with validation endpoint
   - Ensure sufficient quota/credits

2. **Rate Limiting**
   - Monitor request rates
   - Implement request queuing
   - Use multiple providers for load distribution

3. **Network Issues**
   - Check internet connectivity
   - Verify firewall settings
   - Monitor provider service status

4. **Performance Issues**
   - Monitor response times
   - Check provider-specific limits
   - Optimize request parameters

### Debug Mode

Enable detailed logging:

```javascript
process.env.DEBUG = 'ai:*';
const aiIntegration = getInstance({ enableMonitoring: true });
```

### Log Analysis

Check logs for:
- Request/response patterns
- Error frequencies
- Performance trends
- Provider health status

## Migration Guide

### From Legacy AI Integration

1. **Update Imports**:
   ```javascript
   // Old
   const openai = require('./scripts/openai-client');
   
   // New
   const { getInstance } = require('./ai/integrations');
   ```

2. **Initialize System**:
   ```javascript
   const aiIntegration = getInstance();
   await aiIntegration.initialize();
   ```

3. **Update API Calls**:
   ```javascript
   // Old
   const response = await openai.createCompletion(prompt);
   
   // New
   const response = await aiIntegration.generateResponse(prompt);
   ```

### Breaking Changes

- Response format includes metadata
- Error handling is more comprehensive
- Initialization is required before use
- Configuration options have changed

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review logs and metrics
3. Run health checks
4. Consult the API documentation
