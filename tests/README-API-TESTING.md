# MonsterBox API Key Testing

This directory contains comprehensive tests for verifying that all API keys in your MonsterBox application are working correctly.

## 🚀 Quick Start

### Test All API Keys
```bash
npm run check-api-keys
```

### Check Configuration Only
```bash
npm run check-config
```

### Run Tests with Mocha Reporter
```bash
npm run test:api-keys
```

### Run Tests with Verbose Output
```bash
npm run test:api-keys-verbose
```

## 📋 What Gets Tested

### ✅ API Services
- **Anthropic Claude** - Tests connection and basic message generation
- **OpenAI GPT** - Tests connection and chat completion
- **Google Gemini** - Tests connection and content generation
- **Replica Studios** - Tests voice API and MonsterBox integration

### ✅ Environment Variables
- **SESSION_SECRET** - Validates session encryption key
- **NODE_ENV** - Checks environment configuration
- **PORT** - Validates server port setting

### ✅ Optional Services Status
- **Perplexity AI** - Reports configuration status
- **Mistral AI** - Reports configuration status
- **xAI** - Reports configuration status
- **Azure OpenAI** - Reports configuration status
- **Ollama** - Reports configuration status

## 🔧 Test Files

### `api-keys.test.js`
Main test suite using Mocha framework with:
- Individual tests for each API service
- Proper error handling and logging
- Integration with Winston logger
- Timeout handling for API calls
- Detailed error reporting

### `test-api-keys.js`
Standalone script that:
- Shows current configuration
- Runs the full test suite
- Provides troubleshooting guidance
- Gives summary reports

## 📊 Test Output

### Successful Test Example
```
🔑 Testing API Key Integrations...

🤖 Anthropic Claude API
   ✅ Anthropic Claude API - Connected

🧠 OpenAI GPT API  
   ✅ OpenAI GPT API - Connected

🔍 Google Gemini API
   ✅ Google Gemini API - Connected

🎤 Replica Studios API
   ✅ Replica Studios API - Connected (150 voices available)
   ✅ MonsterBox Replica Integration - Working (150 voices)

🔧 Environment Variables
   ✅ SESSION_SECRET - Configured
   ✅ PORT - Configured (3000)
   ✅ NODE_ENV - Configured (test)

📋 Optional API Keys Status
   ⚠️  Perplexity AI - Not configured (optional)
   ⚠️  Mistral AI - Not configured (optional)
   ⚠️  xAI - Not configured (optional)
   ⚠️  Azure OpenAI - Not configured (optional)
   ⚠️  Ollama - Not configured (optional)

✅ API Key Integration Tests Complete
```

## 🛠️ Troubleshooting

### Common Issues

#### API Key Not Working
1. Check your `.env` file for typos
2. Verify the API key hasn't expired
3. Check your internet connection
4. Verify the API service is operational

#### Test Timeouts
- Tests have a 30-second timeout
- Network issues can cause timeouts
- Some APIs may be slower during peak times

#### Missing Dependencies
```bash
npm install  # Reinstall dependencies
```

### Error Codes

- **401 Unauthorized** - Invalid API key
- **403 Forbidden** - API key lacks permissions
- **429 Too Many Requests** - Rate limit exceeded
- **500 Server Error** - API service issue

## 📝 Adding New API Tests

To add a new API service test:

1. Add the test to `api-keys.test.js`:
```javascript
describe('🆕 New Service API', function() {
    it('should connect to New Service API with valid key', async function() {
        const apiKey = process.env.NEW_SERVICE_API_KEY;
        
        if (!apiKey || apiKey === 'your_new_service_api_key_here') {
            this.skip('New Service API key not configured');
        }

        // Add your API test here
    });
});
```

2. Add the environment variable to your `.env` file
3. Update the configuration display in `test-api-keys.js`

## 🔐 Security Notes

- Tests only verify connectivity, not full functionality
- API keys are loaded from environment variables
- No API keys are logged or exposed in test output
- Tests use minimal API calls to avoid charges

## 📚 Integration with MonsterBox

These tests integrate with:
- **Winston Logger** - All test results are logged
- **Mocha Framework** - Standard testing framework
- **Chai Assertions** - Assertion library
- **Existing Test Setup** - Uses your current test configuration

Run these tests regularly to ensure your MonsterBox API integrations remain functional!
