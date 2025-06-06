# Devin AI Implementation Package - Security Agent

## Project Context
MonsterBox is a Node.js/Express animatronic control system managing distributed Raspberry Pi systems (Orlok, Coffin, Pumpkinhead). The codebase uses EJS templating, JSON file storage, and hardware integration via Python scripts.

## Task Assignment: Implement Secure Remote Access System (Task 11)

### Repository Information
- **GitHub**: https://github.com/arwpc/MonsterBox
- **Branch**: main
- **Project Root**: C:\Users\arwpe\CodeBase\MonsterBox-1
- **Technology Stack**: Node.js 18+, Express 4.21.1, EJS 3.1.9

### Current Architecture
- **Main App**: app.js (280 lines)
- **Routes**: /routes/ directory (17 route files)
- **Controllers**: /controllers/ directory (7 controllers)
- **Services**: /services/ directory (5 services)
- **Views**: /views/ directory (EJS templates)
- **Configuration**: JSON files in /data/ directory

### Subtasks to Implement

#### 11.1: Design JWT Authentication Architecture
**Status**: In Progress
**Dependencies**: None
**Requirements**:
- Create comprehensive JWT authentication system design
- Support for MonsterBox's three RPi systems (Orlok 192.168.8.120, Coffin 192.168.8.140)
- Integration with existing express-session middleware
- Consider existing SSH credentials stored in character JSON files
- Architecture document with sequence diagrams

**Deliverables**:
1. `/docs/security/jwt-architecture.md` - Complete architecture document
2. `/docs/security/jwt-sequence-diagrams.md` - Authentication flow diagrams
3. `/middleware/auth.js` - JWT middleware implementation
4. `/config/jwt-config.js` - JWT configuration module

#### 11.2: Implement Role-Based Access Control (RBAC) Framework
**Status**: In Progress
**Dependencies**: 11.1
**Requirements**:
- Create flexible RBAC system for MonsterBox users
- Support roles: admin, operator, viewer, maintenance
- Permission-based access to animatronic systems
- Integration with existing route structure

**Deliverables**:
1. `/middleware/rbac.js` - RBAC middleware
2. `/models/roles.js` - Role definitions and permissions
3. `/services/authorizationService.js` - Authorization logic
4. `/data/roles.json` - Default role configurations
5. Update existing routes with RBAC decorators

#### 11.3: Integrate JWT Authentication with Existing SSH Infrastructure
**Status**: In Progress
**Dependencies**: 11.1
**Requirements**:
- Secure SSH credential management using JWT tokens
- Integration with existing SSH functionality in scripts/
- Support for character-specific SSH credentials
- Maintain compatibility with existing MCP remote capabilities

**Deliverables**:
1. `/services/sshAuthService.js` - SSH authentication service
2. `/middleware/sshAuth.js` - SSH authentication middleware
3. Update `/scripts/deploy-to-orlok.ps1` and related scripts
4. Integration with existing MCP remote command execution

#### 11.5: Implement Multi-Factor Authentication (MFA)
**Status**: In Progress
**Dependencies**: 11.1
**Requirements**:
- Time-based one-time passwords (TOTP) support
- SMS/email verification options
- Recovery mechanisms for lost devices
- User-friendly enrollment and verification flows

**Deliverables**:
1. `/services/mfaService.js` - MFA service implementation
2. `/routes/mfaRoutes.js` - MFA API endpoints
3. `/views/mfa/` - MFA enrollment and verification views
4. `/public/js/mfa.js` - Frontend MFA functionality
5. Database schema for MFA secrets storage

### Implementation Guidelines

#### Code Style
- Follow existing MonsterBox conventions
- Use ES6+ features consistently
- Implement proper error handling with Winston logging
- Include comprehensive JSDoc comments

#### Security Requirements
- Use industry-standard JWT libraries (jsonwebtoken)
- Implement secure password hashing (bcrypt)
- Follow OWASP security guidelines
- Include rate limiting for authentication endpoints

#### Testing Requirements
- Unit tests for all authentication functions
- Integration tests for RBAC middleware
- Security tests for JWT token validation
- End-to-end tests for complete authentication flows

#### Integration Points
- Maintain compatibility with existing express-session
- Integrate with Winston logging system
- Support existing character JSON configuration format
- Work with current MCP log collection system

### File Structure to Create/Modify

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

/docs/security/
  ├── jwt-architecture.md (new)
  ├── jwt-sequence-diagrams.md (new)
  ├── rbac-design.md (new)
  └── mfa-implementation.md (new)

/tests/
  ├── auth/ (new directory)
  │   ├── jwt.test.js
  │   ├── rbac.test.js
  │   └── mfa.test.js
```

### Dependencies to Add
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

### Environment Variables Required
```env
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=24h
JWT_REFRESH_SECRET=your-refresh-token-secret
JWT_REFRESH_EXPIRES_IN=7d
MFA_ISSUER=MonsterBox
BCRYPT_ROUNDS=12
```

### Success Criteria
1. All JWT authentication flows working correctly
2. RBAC system properly restricting access based on roles
3. SSH integration maintains existing functionality while adding security
4. MFA enrollment and verification working smoothly
5. All tests passing with >90% coverage
6. Documentation complete and accurate
7. No breaking changes to existing MonsterBox functionality

### Git Workflow
1. Create feature branch: `feature/security-authentication-system`
2. Implement each subtask in separate commits
3. Include comprehensive commit messages referencing Task Master IDs
4. Create pull request with detailed description
5. Ensure all CI/CD tests pass before merging

### Notes
- Maintain backward compatibility with existing MonsterBox features
- Consider the distributed nature of the RPi systems
- Ensure security measures don't interfere with real-time animatronic control
- Document any changes to existing APIs or configurations
