# MonsterBox Secure Remote Access System - Automated Testing

This directory contains comprehensive automated tests for the MonsterBox Secure Remote Access System, ensuring the JWT authentication, RBAC, and SSH integration components remain functional and secure.

## 🧪 Test Suites

### Core Test Files

| Test Suite | File | Description |
|------------|------|-------------|
| **Authentication Tests** | `secure-remote-access.test.js` | JWT authentication, token management, API endpoints |
| **RBAC Tests** | `rbac-system.test.js` | Role-based access control, permissions, authorization |
| **SSH Integration Tests** | `ssh-integration.test.js` | SSH command execution, security validation, connectivity |

### Test Runners

| Script | File | Purpose |
|--------|------|---------|
| **Security Test Runner** | `run-security-tests.js` | Comprehensive test execution with detailed reporting |
| **CI Security Tests** | `ci-security-tests.js` | Automated testing for CI/CD pipelines |
| **System Validator** | `../scripts/validate-security-system.js` | Complete system validation and health check |

## 🚀 Running Tests

### Quick Test Commands

```bash
# Run all security tests
npm run test:security

# Run individual test suites
npm run test:auth      # Authentication tests only
npm run test:ssh       # SSH integration tests only
npm run test:rbac      # RBAC system tests only

# Run comprehensive validation
npm run validate:security

# Run CI tests
npm run ci:security
```

### Manual Test Execution

```bash
# Run specific test file
npx mocha tests/secure-remote-access.test.js

# Run with custom reporter
npx mocha --reporter spec tests/rbac-system.test.js

# Run with coverage (if nyc is installed)
npx nyc mocha tests/**/*.test.js
```

## 📋 Test Coverage

### Authentication System Tests

- ✅ User authentication with valid/invalid credentials
- ✅ JWT token generation and validation
- ✅ Token refresh mechanism
- ✅ Session management integration
- ✅ Rate limiting enforcement
- ✅ Audit logging verification

### RBAC System Tests

- ✅ Role configuration loading
- ✅ Permission validation for all roles
- ✅ Animatronic access control
- ✅ Action authorization checks
- ✅ Role hierarchy validation
- ✅ Authorization summary generation

### SSH Integration Tests

- ✅ SSH command execution with authentication
- ✅ Command security validation
- ✅ Dangerous command blocking
- ✅ Role-based command restrictions
- ✅ SSH connectivity testing
- ✅ Batch command execution
- ✅ Command history tracking

### API Endpoint Tests

- ✅ Authentication endpoints (`/auth/*`)
- ✅ SSH command endpoints (`/ssh/*`)
- ✅ Authorization enforcement
- ✅ Error handling and responses
- ✅ Rate limiting validation

## 🔐 Security Test Categories

### Critical Security Tests

These tests validate core security functionality:

1. **Authentication Bypass Prevention**
   - Invalid token rejection
   - Expired token handling
   - Missing authentication detection

2. **Authorization Enforcement**
   - Role-based access control
   - Permission validation
   - Privilege escalation prevention

3. **Command Injection Prevention**
   - SSH command validation
   - Dangerous command blocking
   - Input sanitization

4. **Rate Limiting**
   - Authentication attempt limiting
   - SSH command rate limiting
   - Abuse prevention

### Vulnerability Tests

Tests that check for common security vulnerabilities:

- SQL Injection (N/A - no SQL database)
- Command Injection (SSH commands)
- Cross-Site Scripting (XSS)
- Cross-Site Request Forgery (CSRF)
- Session Hijacking
- Privilege Escalation

## 📊 Test Reporting

### Test Output Formats

1. **Console Output** - Real-time test results
2. **JSON Reports** - Machine-readable test data
3. **Security Assessment** - High-level security status
4. **CI Reports** - Continuous integration compatible

### Report Locations

```
reports/
├── security-test-report.json      # Detailed test results
├── ci-security-report.json        # CI-specific report
└── security-validation-report.json # System validation results
```

## 🔧 Test Configuration

### Environment Variables

```env
NODE_ENV=test                    # Test environment
JWT_SECRET=test-secret          # Test JWT secret
JWT_REFRESH_SECRET=test-refresh # Test refresh secret
```

### Test Dependencies

```json
{
  "chai": "^4.5.0",           # Assertion library
  "chai-http": "^4.3.0",     # HTTP testing
  "mocha": "^10.7.3",        # Test framework
  "sinon": "^17.0.1"         # Mocking library
}
```

## 🚨 Continuous Integration

### CI Pipeline Integration

The test suite is designed for CI/CD integration:

```yaml
# Example GitHub Actions workflow
- name: Run Security Tests
  run: npm run ci:security

- name: Validate Security System
  run: npm run validate:security
```

### Exit Codes

- `0` - All tests passed, system secure
- `1` - Tests failed or vulnerabilities detected

### CI Environment Variables

The CI tests set these variables for automation:

```bash
SECURITY_STATUS=SECURE|VULNERABLE
TESTS_PASSED=<number>
TESTS_TOTAL=<number>
VULNERABILITIES=<number>
```

## 🛠️ Troubleshooting

### Common Test Issues

1. **Authentication Service Not Found**
   ```bash
   Error: Cannot find module '../services/auth/authService'
   ```
   **Solution:** Ensure all authentication services are properly installed

2. **JWT Secret Not Set**
   ```bash
   Error: JWT_SECRET environment variable not set
   ```
   **Solution:** Check `.env` file or set environment variables

3. **RBAC Configuration Missing**
   ```bash
   Error: ENOENT: no such file or directory 'data/auth/roles.json'
   ```
   **Solution:** Ensure RBAC configuration files exist

4. **SSH Credentials Missing**
   ```bash
   Error: SSH credentials not available
   ```
   **Solution:** Configure SSH credentials in environment variables

### Test Debugging

Enable verbose output:

```bash
# Debug mode
DEBUG=* npm run test:security

# Mocha debug
npx mocha --inspect tests/secure-remote-access.test.js
```

## 📈 Performance Benchmarks

### Expected Test Performance

| Test Suite | Expected Duration | Test Count |
|------------|------------------|------------|
| Authentication | < 5 seconds | ~15 tests |
| RBAC | < 3 seconds | ~20 tests |
| SSH Integration | < 10 seconds | ~25 tests |
| **Total** | **< 20 seconds** | **~60 tests** |

### Performance Monitoring

Tests include performance assertions:

- Authentication response time < 1000ms
- RBAC permission checks < 100ms
- SSH command validation < 50ms

## 🔄 Maintenance

### Regular Test Maintenance

1. **Weekly:** Run full test suite
2. **Monthly:** Review test coverage
3. **Quarterly:** Update test scenarios
4. **Annually:** Security audit and test review

### Adding New Tests

1. Create test file in appropriate category
2. Follow existing test patterns
3. Include both positive and negative test cases
4. Add security-focused test scenarios
5. Update this README with new test information

### Test Data Management

- Use mock data for testing
- Avoid real credentials in tests
- Clean up test data after execution
- Isolate tests from production data

## 📚 Additional Resources

- [Mocha Documentation](https://mochajs.org/)
- [Chai Assertion Library](https://www.chaijs.com/)
- [Sinon Mocking Library](https://sinonjs.org/)
- [JWT Security Best Practices](https://auth0.com/blog/a-look-at-the-latest-draft-for-jwt-bcp/)
- [OWASP Testing Guide](https://owasp.org/www-project-web-security-testing-guide/)

---

**Note:** These tests are designed to ensure the MonsterBox Secure Remote Access System remains secure and functional. Run them regularly and especially before deploying any changes to the authentication, RBAC, or SSH systems.
