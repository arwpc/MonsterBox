# 🔐 Augment Code Remote Agent Package - Security System

## Project Context
MonsterBox animatronic control system with distributed Raspberry Pi systems (Orlok, Coffin, Pumpkinhead). Current system uses Express.js with EJS templating and JSON file storage.

## Task Assignment: Implement Secure Remote Access System (Task 11)

### Repository Information
- **GitHub**: https://github.com/arwpc/MonsterBox
- **Branch**: Create `feature/secure-remote-access-system`
- **Project Root**: C:\Users\arwpe\CodeBase\MonsterBox-1
- **Technology Stack**: Node.js 18+, Express 4.21.1, EJS 3.1.9

### Current Architecture Analysis
- **Main App**: app.js (Express server with session middleware)
- **Routes**: 17 route files in /routes/ directory
- **Controllers**: 7 controllers in /controllers/ directory
- **Services**: 5 services in /services/ directory
- **Configuration**: JSON files in /data/ directory
- **Existing Auth**: express-session middleware only

### Implementation Requirements

#### 11.1: JWT Authentication Architecture ⚡ HIGH PRIORITY
**Status**: Ready for implementation
**Dependencies**: None

**Requirements**:
- Implement JWT-based authentication using jsonwebtoken v9.0.0
- Support for MonsterBox's three RPi systems:
  - Orlok (192.168.8.120)
  - Coffin (192.168.8.140) 
  - Pumpkinhead (192.168.1.101)
- Integration with existing express-session middleware
- Secure token storage and rotation mechanisms

**Deliverables**:
1. `/middleware/auth.js` - JWT middleware implementation
2. `/config/jwt-config.js` - JWT configuration module
3. `/services/authService.js` - Authentication service
4. `/routes/authRoutes.js` - Authentication endpoints
5. Update app.js with JWT middleware integration

#### 11.2: Role-Based Access Control (RBAC) Framework
**Status**: Ready for implementation
**Dependencies**: 11.1

**Requirements**:
- Create flexible RBAC system with roles: admin, operator, viewer, maintenance
- Permission-based access to animatronic systems
- Integration with existing route structure
- Granular control over animatronic functions

**Deliverables**:
1. `/middleware/rbac.js` - RBAC middleware
2. `/models/roles.js` - Role definitions and permissions
3. `/services/authorizationService.js` - Authorization logic
4. `/data/roles.json` - Default role configurations
5. Update all existing routes with RBAC decorators

#### 11.3: SSH Integration with JWT Authentication
**Status**: Ready for implementation
**Dependencies**: 11.1

**Requirements**:
- Secure SSH credential management using JWT tokens
- Integration with existing SSH functionality in scripts/
- Support for character-specific SSH credentials from JSON files
- Maintain compatibility with existing MCP remote capabilities

**Deliverables**:
1. `/services/sshAuthService.js` - SSH authentication service
2. `/middleware/sshAuth.js` - SSH authentication middleware
3. Update existing SSH scripts for JWT integration
4. Integration with MCP remote command execution

#### 11.5: Multi-Factor Authentication (MFA)
**Status**: Ready for implementation
**Dependencies**: 11.1

**Requirements**:
- Time-based one-time passwords (TOTP) support using speakeasy
- Email verification options
- Recovery mechanisms for lost devices
- User-friendly enrollment and verification flows

**Deliverables**:
1. `/services/mfaService.js` - MFA service implementation
2. `/routes/mfaRoutes.js` - MFA API endpoints
3. `/views/mfa/` - MFA enrollment and verification views
4. `/public/js/mfa.js` - Frontend MFA functionality

### Technical Implementation Details

#### Dependencies to Add
```json
{
  "jsonwebtoken": "^9.0.0",
  "bcrypt": "^5.1.0",
  "speakeasy": "^2.0.0",
  "qrcode": "^1.5.3",
  "express-rate-limit": "^6.7.0",
  "helmet": "^6.1.5"
}
```

#### Environment Variables Required
```env
JWT_SECRET=your-super-secret-jwt-key-here
JWT_EXPIRES_IN=24h
JWT_REFRESH_SECRET=your-refresh-token-secret
JWT_REFRESH_EXPIRES_IN=7d
MFA_ISSUER=MonsterBox
BCRYPT_ROUNDS=12
```

#### File Structure to Create
```
/middleware/
  ├── auth.js (new)
  ├── rbac.js (new)
  └── sshAuth.js (new)

/services/
  ├── authService.js (new)
  ├── authorizationService.js (new)
  ├── mfaService.js (new)
  └── sshAuthService.js (new)

/routes/
  ├── authRoutes.js (new)
  ├── mfaRoutes.js (new)
  └── [update existing routes with RBAC]

/views/
  ├── auth/ (new directory)
  │   ├── login.ejs
  │   ├── register.ejs
  │   └── profile.ejs
  └── mfa/ (new directory)
      ├── setup.ejs
      ├── verify.ejs
      └── recovery.ejs

/config/
  ├── jwt-config.js (new)
  └── auth-config.js (new)

/data/
  ├── roles.json (new)
  └── permissions.json (new)
```

### Integration Points
- Maintain compatibility with existing express-session
- Integrate with Winston logging system (scripts/logger.js)
- Support existing character JSON configuration format
- Work with current MCP log collection system
- Preserve existing SSH functionality in scripts/

### Security Requirements
- Use RS256 algorithm for JWT signing
- Implement secure password hashing with bcrypt
- Follow OWASP security guidelines
- Include rate limiting for authentication endpoints
- Implement proper CORS policies
- Use helmet for security headers

### Testing Requirements
- Unit tests for all authentication functions
- Integration tests for RBAC middleware
- Security tests for JWT token validation
- End-to-end tests for complete authentication flows
- Test files should be created in /tests/auth/ directory

### Success Criteria
1. ✅ JWT authentication system fully functional
2. ✅ RBAC system properly restricting access based on roles
3. ✅ SSH integration maintains existing functionality while adding security
4. ✅ MFA enrollment and verification working smoothly
5. ✅ All tests passing with >90% coverage
6. ✅ No breaking changes to existing MonsterBox functionality
7. ✅ Comprehensive documentation and user guides

### Git Workflow
1. Create feature branch: `feature/secure-remote-access-system`
2. Implement each subtask in separate commits
3. Include comprehensive commit messages referencing Task Master IDs
4. Create pull request with detailed description
5. Ensure all tests pass before merging

### Notes for Remote Agent
- Maintain backward compatibility with existing MonsterBox features
- Consider the distributed nature of the RPi systems
- Ensure security measures don't interfere with real-time animatronic control
- Document any changes to existing APIs or configurations
- Use existing MonsterBox code style and conventions
- Integrate with existing Winston logging for all security events
