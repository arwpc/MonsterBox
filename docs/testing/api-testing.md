# API Testing

## Overview

MonsterBox includes comprehensive API testing to ensure all endpoints function correctly across different environments and configurations.

## Test Structure

### API Test Categories

1. **Authentication Tests**
   - JWT token validation
   - Session management
   - Role-based access control

2. **Character API Tests**
   - Character CRUD operations
   - Character configuration validation
   - Character-specific hardware integration

3. **Hardware API Tests**
   - GPIO control endpoints
   - Servo and motor control
   - Sensor data collection

4. **Scene Management Tests**
   - Scene creation and modification
   - Scene playback functionality
   - Multi-character coordination

## Running API Tests

### Basic API Testing
```bash
npm run test:api-keys
npm test
```

### Specific API Test Suites
```bash
# Character API tests
npm run test -- tests/characterRoutes.test.js

# Sound API tests
npm run test:sound

# Voice API tests
npm run test:voice-endpoints
```

## Test Configuration

API tests use the following configuration:
- Test environment variables in `.env.test`
- Mock data in `tests/setupTests.js`
- Test helper functions in `tests/test-helper.js`

## API Endpoints Tested

### Character Management
- `GET /api/characters` - List all characters
- `POST /api/characters` - Create new character
- `PUT /api/characters/:id` - Update character
- `DELETE /api/characters/:id` - Delete character

### Hardware Control
- `POST /api/hardware/servo` - Control servo motors
- `POST /api/hardware/led` - Control LED lights
- `POST /api/hardware/motor` - Control motors
- `GET /api/hardware/sensor` - Read sensor data

### Scene Management
- `GET /api/scenes` - List scenes
- `POST /api/scenes` - Create scene
- `POST /api/scenes/:id/play` - Play scene

## Test Reports

API test results are automatically generated and stored in:
- `tests/reports/` - Detailed test reports
- Console output during test execution
- CI/CD pipeline results

## Troubleshooting

### Common Issues

1. **API Key Errors**
   - Verify API keys in environment variables
   - Check key permissions and quotas

2. **Connection Timeouts**
   - Verify network connectivity
   - Check service availability

3. **Authentication Failures**
   - Verify JWT token configuration
   - Check user permissions

### Debug Mode

Enable debug mode for detailed API testing:
```bash
NODE_ENV=test DEBUG=* npm test
```
