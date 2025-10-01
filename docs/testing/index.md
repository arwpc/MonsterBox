# Testing Overview

MonsterBox includes a comprehensive testing framework designed to ensure reliability and functionality across all animatronic systems.

## Testing Categories

### 🔧 [Test Organization](organization.md)
- Test file structure and organization
- Test execution workflows
- Test environment setup

### 🌐 [API Testing](api-testing.md)
- API key validation
- Endpoint testing
- Service integration tests

### 🔗 [Integration Testing](integration.md)
- Hardware integration tests
- System component integration
- End-to-end testing

### 🔒 [Security Testing](security.md)
- Authentication testing
- Authorization testing
- Security vulnerability assessment

### ⚡ [Hardware Testing](hardware.md)
- GPIO testing
- Servo control testing
- Sensor validation

### 🤖 [Conversation Testing](conversation.md)
- AI conversation testing
- Character interaction testing
- Response quality assessment

### 📊 [Test Reports](reports.md)
- Test execution reports
- Performance metrics
- Coverage analysis

## Quick Start

### Run All Tests
```bash
npm test
```

### Run Specific Test Categories
```bash
# API Tests
npm run test:api-keys

# Security Tests
npm run test:security

# Integration Tests
npm run test:integration

# Hardware Tests
npm run test:rpi
```

## Test Environment Setup

### Prerequisites
- Node.js 20.x or higher
- Python 3.8 or higher
- Hardware access (for hardware tests)
- Valid API keys (for API tests)

### Configuration
1. Copy `.env.example` to `.env`
2. Configure API keys and credentials
3. Set up hardware connections (if testing hardware)
4. Run `npm install` to install dependencies

## Continuous Integration

MonsterBox uses automated testing in CI/CD pipelines to ensure code quality and system reliability.

### Test Execution Order
1. Unit tests
2. Integration tests
3. Security tests
4. Hardware tests (on target hardware)
5. End-to-end tests

## Best Practices

- Write tests for all new features
- Maintain test coverage above 80%
- Use descriptive test names
- Mock external dependencies
- Test both success and failure scenarios
- Document test requirements and setup
