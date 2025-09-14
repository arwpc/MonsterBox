# Integration Tests

This directory contains integration tests that test the complete MonsterBox system functionality, including server startup, streaming services, and cross-component interactions.

## Files

### `start_server_test.js`
- **Purpose**: Tests basic server startup functionality
- **Tests**: Express app initialization, logger, services, and basic routing
- **Usage**: `node tests/integration/start_server_test.js`

### `test_monsterbox_streaming.js`
- **Purpose**: Tests MonsterBox streaming integration
- **Tests**: Streaming services, webcam integration, character data, and API endpoints
- **Usage**: `node tests/integration/test_monsterbox_streaming.js`

## Running Integration Tests

```bash
# Run all integration tests
npm run test:integration

# Run individual tests
node tests/integration/start_server_test.js
node tests/integration/test_monsterbox_streaming.js
```

## Test Requirements

- MonsterBox application dependencies installed
- Access to character and webcam services
- Network connectivity for streaming tests
- Port 3000 available for test server

## Notes

- Integration tests may require hardware components (cameras, RPI systems)
- Tests are designed to work with the full MonsterBox environment
- Some tests may fail on systems without proper hardware setup
