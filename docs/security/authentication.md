# Authentication System

MonsterBox implements a comprehensive JWT-based authentication system for secure access to animatronic controls.

## Overview

The authentication system provides:
- JWT-based token authentication
- Session management
- Multi-factor authentication (MFA) support
- Secure password handling
- Audit logging

## Architecture

### Core Components

1. **AuthService** (`services/auth/authService.js`)
   - User authentication
   - Token generation and validation
   - Session management

2. **JWT Configuration** (`config/auth/jwt-config.js`)
   - JWT settings and utilities
   - Token payload generation
   - Security configuration

3. **Auth Middleware** (`middleware/auth.js`)
   - Request authentication
   - Token validation
   - User context injection

## JWT Implementation

### Token Structure
```javascript
{
  "sub": "user_id",
  "username": "user_name",
  "role": "admin",
  "animatronicAccess": ["orlok", "coffin", "pumpkinhead"],
  "permissions": ["read", "write", "control"],
  "sessionId": "session_uuid",
  "iat": 1234567890,
  "exp": 1234567890,
  "iss": "MonsterBox",
  "aud": "MonsterBox-Animatronics"
}
```

### Token Types
- **Access Token**: Short-lived (24 hours)
- **Refresh Token**: Long-lived (7 days)

## Authentication Flow

### Login Process
1. User submits credentials
2. System validates username/password
3. Generate JWT tokens
4. Create session record
5. Return tokens to client

### Token Validation
1. Extract token from request header
2. Verify JWT signature
3. Check token expiration
4. Validate session
5. Inject user context

## Security Features

### Password Security
- bcrypt hashing with 12 rounds
- Password complexity requirements
- Account lockout after failed attempts

### Rate Limiting
- 5 attempts per 15-minute window
- IP-based rate limiting
- Progressive delays for repeated failures

### Session Management
- Secure session storage
- Session timeout handling
- Concurrent session limits

## API Endpoints

### Authentication Routes
```javascript
POST /auth/login          # User login
POST /auth/logout         # User logout
POST /auth/refresh        # Token refresh
GET  /auth/profile        # User profile
PUT  /auth/profile        # Update profile
POST /auth/change-password # Change password
```

### MFA Routes
```javascript
POST /auth/mfa/setup      # Setup MFA
POST /auth/mfa/verify     # Verify MFA token
POST /auth/mfa/disable    # Disable MFA
GET  /auth/mfa/recovery   # Get recovery codes
```

## Usage Examples

### Login Request
```javascript
const response = await fetch('/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    username: 'admin',
    password: 'secure_password'
  })
});

const { tokens, user } = await response.json();
```

### Authenticated Request
```javascript
const response = await fetch('/api/characters', {
  headers: {
    'Authorization': `Bearer ${accessToken}`
  }
});
```

### Token Refresh
```javascript
const response = await fetch('/auth/refresh', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${refreshToken}`
  }
});
```

## Configuration

### Environment Variables
```bash
JWT_SECRET=your-super-secret-jwt-key-here
JWT_EXPIRES_IN=24h
JWT_REFRESH_SECRET=your-refresh-token-secret
JWT_REFRESH_EXPIRES_IN=7d
BCRYPT_ROUNDS=12
```

### Security Settings
```javascript
{
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per window
    skipSuccessfulRequests: true
  },
  sessionTimeout: 24 * 60 * 60 * 1000, // 24 hours
  maxConcurrentSessions: 3
}
```

## Troubleshooting

### Common Issues

1. **Token Expired**
   - Use refresh token to get new access token
   - Check system clock synchronization

2. **Invalid Signature**
   - Verify JWT_SECRET configuration
   - Check for key rotation issues

3. **Session Not Found**
   - Session may have expired
   - Check session storage configuration

### Debug Mode
```bash
DEBUG=auth:* npm start
```

## Security Best Practices

1. **Token Storage**
   - Store tokens securely (httpOnly cookies recommended)
   - Never store tokens in localStorage for production

2. **HTTPS Only**
   - Always use HTTPS in production
   - Set secure cookie flags

3. **Token Rotation**
   - Implement token rotation for long-lived sessions
   - Revoke tokens on logout

4. **Monitoring**
   - Log authentication events
   - Monitor for suspicious activity
   - Set up alerts for failed login attempts
