# Test Organization

This document outlines the organization and structure of tests in the MonsterBox project.

## Directory Structure

```
tests/
├── integration/           # Integration tests
│   ├── README.md
│   └── *.test.js
├── unit/                 # Unit tests
│   └── *.test.js
├── webcam/              # Webcam-specific tests
│   ├── README.md
│   └── *.test.js
├── reports/             # Test reports and results
│   └── *.json
└── *.test.js           # Main test files

scripts/
├── python/              # Python test scripts
├── javascript/          # JavaScript test utilities
├── deployment/          # Deployment test scripts
└── utilities/           # Test utility scripts
```

## Test Categories

### Unit Tests
- Individual component testing
- Function-level testing
- Isolated functionality testing

### Integration Tests
- Component interaction testing
- System integration testing
- API endpoint testing

### Hardware Tests
- GPIO functionality testing
- Servo control testing
- Sensor validation testing

### Security Tests
- Authentication testing
- Authorization testing
- Security vulnerability testing

## Test Execution

### Running Tests

```bash
# All tests
npm test

# Specific test files
npm test tests/characterRoutes.test.js

# Test categories
npm run test:auth
npm run test:ssh
npm run test:security
```

### Test Reporters

MonsterBox uses a custom clean reporter for better test output:

```bash
# Clean output
npm test

# Verbose output
npm run test:api-keys-verbose
```

## Test Configuration

### Environment Variables
Tests use environment-specific configurations:

```bash
NODE_ENV=test
```

### Test Setup
- `tests/setupTests.js` - Global test setup
- `tests/test-helper.js` - Test utilities
- `tests/cleanReporter.js` - Custom test reporter

## Best Practices

### Test Naming
- Use descriptive test names
- Follow the pattern: `should [expected behavior] when [condition]`
- Group related tests in describe blocks

### Test Structure
```javascript
describe('Component Name', () => {
  beforeEach(() => {
    // Setup
  });

  afterEach(() => {
    // Cleanup
  });

  it('should do something when condition is met', () => {
    // Test implementation
  });
});
```

### Mocking
- Mock external dependencies
- Use sinon for function mocking
- Mock hardware interfaces for unit tests

### Assertions
- Use chai for assertions
- Prefer specific assertions over generic ones
- Test both positive and negative cases

## Test Data Management

### Test Fixtures
- Store test data in `tests/fixtures/`
- Use JSON files for configuration data
- Keep test data minimal and focused

### Database Testing
- Use in-memory databases for testing
- Reset database state between tests
- Use transactions for test isolation

## Continuous Integration

### GitHub Actions
Tests run automatically on:
- Pull requests
- Push to main branch
- Scheduled runs

### Test Coverage
- Maintain coverage above 80%
- Use coverage reports to identify gaps
- Focus on critical path coverage

## Troubleshooting

### Common Issues
1. **Port conflicts**: Ensure test ports are available
2. **Hardware dependencies**: Mock hardware for CI/CD
3. **API rate limits**: Use test API keys with higher limits
4. **Timing issues**: Use proper async/await patterns

### Debug Mode
```bash
# Run tests with debug output
DEBUG=* npm test

# Run specific test with debugging
DEBUG=monsterbox:* npm test tests/specific.test.js
```
