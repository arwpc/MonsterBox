# MonsterBox Secure Remote Access System

## Overview

The MonsterBox Secure Remote Access System provides JWT-based authentication and role-based access control for secure remote command execution across animatronic systems. This system enables authorized users to safely interact with the Orlok, Coffin, and Pumpkinhead animatronic systems through a secure API gateway.

## Architecture

### Core Components

1. **JWT Authentication Service** - Handles user authentication and token management
2. **RBAC (Role-Based Access Control)** - Manages user roles and permissions
3. **SSH Authentication Service** - Secure command execution with validation
4. **API Gateway** - Centralized request routing and security enforcement
5. **Audit Logging** - Comprehensive activity tracking and security monitoring

### Security Features

- JWT-based authentication with refresh tokens
- Role-based access control with granular permissions
- SSH command validation and filtering
- Rate limiting and abuse prevention
- Comprehensive audit logging
- Session management integration

## User Roles and Permissions

### Role Hierarchy

| Role | Priority | Description | Permissions |
|------|----------|-------------|-------------|
| **Admin** | 100 | Full system access | All permissions including user management |
| **Maintenance** | 60 | Technical access with SSH | view, control, configure, ssh, diagnostics, maintenance |
| **Operator** | 50 | Standard operational access | view, control, configure |
| **Viewer** | 10 | Read-only access | view |

### Specialized Roles

- **orlok_operator** - Limited to Orlok animatronic operations
- **coffin_operator** - Limited to Coffin animatronic operations  
- **pumpkinhead_operator** - Limited to Pumpkinhead animatronic operations

### Permission Types

| Permission | Category | Description |
|------------|----------|-------------|
| view | basic | Read-only access to system status |
| control | operational | Control animatronic movements |
| configure | operational | Modify system configurations |
| ssh | technical | Remote shell access |
| admin | administrative | Full administrative privileges |
| user_management | administrative | Manage user accounts |
| system_management | administrative | System-wide settings |
| audit_access | security | Access to audit logs |
| security_management | security | Security settings management |
| diagnostics | technical | System diagnostics |
| maintenance | technical | Maintenance functions |

## API Endpoints

### Authentication Endpoints

#### POST /auth/login
Authenticate user and receive JWT tokens.

**Request:**
```json
{
  "username": "admin",
  "password": "MonsterBox2024!"
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "admin-001",
    "username": "admin",
    "role": "admin",
    "animatronicAccess": ["orlok", "coffin", "pumpkinhead"],
    "permissions": ["view", "control", "configure", "ssh", "admin"]
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": "8h"
}
```

#### POST /auth/logout
Logout user and invalidate session.

**Headers:** `Authorization: Bearer <token>`

#### POST /auth/refresh
Refresh access token using refresh token.

#### GET /auth/me
Get current user information.

**Headers:** `Authorization: Bearer <token>`

#### GET /auth/verify
Verify JWT token validity.

**Headers:** `Authorization: Bearer <token>`

### SSH Command Execution

#### POST /ssh/execute/:animatronicId
Execute SSH command on specific animatronic.

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "command": "uptime",
  "timeout": 30,
  "validateCommand": true
}
```

**Response:**
```json
{
  "success": true,
  "command": "uptime",
  "stdout": "up 5 days, 12:34, load average: 0.15, 0.10, 0.05",
  "stderr": "",
  "exitCode": 0,
  "duration": 245,
  "host": "192.168.8.120"
}
```

#### POST /ssh/test/:animatronicId
Test SSH connectivity to animatronic.

#### GET /ssh/history
Get SSH command history for current user.

#### POST /ssh/batch/:animatronicId
Execute multiple SSH commands in sequence.

#### GET /ssh/status
Get SSH service status and connectivity information.

#### GET /ssh/commands
Get list of allowed SSH commands for current user role.

#### POST /ssh/validate
Validate SSH command without executing it.

## Configuration

### Environment Variables

```env
# JWT Configuration
JWT_SECRET=MonsterBox-JWT-2024-SecureKey-f8e9d7c6b5a4-RemoteAccess-Auth
JWT_EXPIRES_IN=8h
JWT_REFRESH_SECRET=MonsterBox-Refresh-2024-SecureKey-a4b5c6d7e8f9-RemoteAccess-Refresh
JWT_REFRESH_EXPIRES_IN=7d
BCRYPT_ROUNDS=12

# SSH Credentials
ORLOK_SSH_USER=remote
ORLOK_SSH_PASSWORD=klrklr89!
COFFIN_SSH_USER=remote
COFFIN_SSH_PASSWORD=klrklr89!
PUMPKINHEAD_SSH_USER=remote
PUMPKINHEAD_SSH_PASSWORD=klrklr89!
```

### Default Admin Account

- **Username:** admin
- **Password:** MonsterBox2024!
- **Role:** admin
- **Access:** All animatronics and permissions

## Security Considerations

### Authentication Security

1. **JWT Tokens** - 8-hour expiration with secure refresh mechanism
2. **Password Hashing** - bcrypt with 12 rounds
3. **Session Integration** - Compatible with existing Express sessions
4. **Rate Limiting** - 5 login attempts per 15 minutes

### SSH Command Security

1. **Command Validation** - Whitelist for non-admin users
2. **Dangerous Command Blocking** - System-destructive commands blocked
3. **Path Traversal Protection** - Prevents unauthorized file access
4. **Timeout Controls** - 30-second default timeout
5. **Rate Limiting** - 10 commands/minute (30 for admin)

### Audit and Monitoring

1. **Comprehensive Logging** - All authentication and SSH events
2. **User Attribution** - Full user tracking with IP addresses
3. **Tamper-Proof Logs** - Immutable audit trail
4. **Admin Access** - Audit logs accessible via /auth/audit

## Usage Examples

### Basic Authentication Flow

```javascript
// 1. Login
const loginResponse = await fetch('/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'admin',
    password: 'MonsterBox2024!'
  })
});

const { accessToken } = await loginResponse.json();

// 2. Execute SSH command
const sshResponse = await fetch('/ssh/execute/orlok', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    command: 'uptime'
  })
});

const result = await sshResponse.json();
console.log(result.stdout);
```

### Role-Based Access Example

```javascript
// Admin user - can execute any safe command
await fetch('/ssh/execute/orlok', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${adminToken}` },
  body: JSON.stringify({ command: 'systemctl status monsterbox' })
});

// Operator user - limited to allowed commands
await fetch('/ssh/execute/orlok', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${operatorToken}` },
  body: JSON.stringify({ command: 'uptime' })
});
```

## Troubleshooting

### Common Issues

1. **Authentication Failures**
   - Check username/password combination
   - Verify user account exists in /data/auth/users.json
   - Check rate limiting status

2. **SSH Command Failures**
   - Verify SSH permissions for user role
   - Check animatronic connectivity
   - Validate command against allowed list

3. **Token Expiration**
   - Use refresh token to get new access token
   - Re-authenticate if refresh token expired

### Error Codes

| Code | Description |
|------|-------------|
| AUTH_REQUIRED | Authentication token required |
| INVALID_TOKEN | JWT token invalid or expired |
| INSUFFICIENT_PERMISSIONS | User lacks required permissions |
| SSH_PERMISSION_DENIED | SSH access denied for user role |
| ANIMATRONIC_ACCESS_DENIED | No access to specified animatronic |
| COMMAND_BLOCKED | SSH command blocked by security policy |
| RATE_LIMIT_EXCEEDED | Too many requests |

## Maintenance

### Log Management

- Audit logs stored in `/data/auth/audit.json`
- Automatic rotation (last 1000 events)
- Admin access via `/auth/audit` endpoint

### User Management

- User accounts in `/data/auth/users.json`
- Role definitions in `/data/auth/roles.json`
- Session tracking in `/data/auth/sessions.json`

### Security Updates

1. Regularly rotate JWT secrets
2. Update SSH credentials as needed
3. Review audit logs for suspicious activity
4. Monitor rate limiting effectiveness
