# Authorization System

## Overview

MonsterBox implements a comprehensive Role-Based Access Control (RBAC) system to manage user permissions and secure access to system resources.

## Authorization Architecture

### Role-Based Access Control (RBAC)
The authorization system uses three primary roles:

1. **Admin**: Full system access and management capabilities
2. **User**: Standard access to character and scene management
3. **Guest**: Read-only access to public information

### Permission Structure
```javascript
{
  "admin": {
    "characters": ["create", "read", "update", "delete"],
    "scenes": ["create", "read", "update", "delete", "execute"],
    "hardware": ["control", "monitor", "configure"],
    "system": ["configure", "monitor", "backup", "restore"],
    "users": ["create", "read", "update", "delete"]
  },
  "user": {
    "characters": ["read", "update"],
    "scenes": ["create", "read", "update", "execute"],
    "hardware": ["monitor"],
    "system": ["monitor"]
  },
  "guest": {
    "characters": ["read"],
    "scenes": ["read"],
    "hardware": ["monitor"],
    "system": ["monitor"]
  }
}
```

## Authorization Implementation

### Middleware Integration
Authorization is enforced through Express.js middleware:

<augment_code_snippet path="middleware/rbac.js" mode="EXCERPT">
````javascript
const rbac = require('./rbac');

function authorize(resource, action) {
  return (req, res, next) => {
    const userRole = req.user.role;
    if (rbac.can(userRole, resource, action)) {
      next();
    } else {
      res.status(403).json({ error: 'Insufficient permissions' });
    }
  };
}
````
</augment_code_snippet>

### Route Protection
API endpoints are protected with appropriate authorization checks:

```javascript
// Character management routes
router.get('/characters', authenticate, authorize('characters', 'read'), getCharacters);
router.post('/characters', authenticate, authorize('characters', 'create'), createCharacter);
router.put('/characters/:id', authenticate, authorize('characters', 'update'), updateCharacter);
router.delete('/characters/:id', authenticate, authorize('characters', 'delete'), deleteCharacter);

// Hardware control routes
router.post('/hardware/servo', authenticate, authorize('hardware', 'control'), controlServo);
router.get('/hardware/status', authenticate, authorize('hardware', 'monitor'), getHardwareStatus);
```

## Resource-Based Permissions

### Character Access Control
- **Character Ownership**: Users can only modify characters they own
- **Character Sharing**: Admins can share characters between users
- **Character Templates**: Public templates available to all users

### Hardware Access Control
- **Hardware Assignment**: Characters assigned to specific hardware
- **Safety Restrictions**: Critical hardware operations require admin privileges
- **Monitoring Access**: All authenticated users can monitor hardware status

### Scene Management
- **Scene Ownership**: Users own scenes they create
- **Scene Execution**: Users can execute scenes they have access to
- **Scene Sharing**: Scenes can be shared between users with appropriate permissions

## Dynamic Authorization

### Context-Aware Permissions
Authorization decisions consider:
- **User Role**: Base permission level
- **Resource Ownership**: User's relationship to the resource
- **System State**: Current system conditions
- **Time-Based Access**: Scheduled access restrictions

### Permission Inheritance
- **Role Hierarchy**: Higher roles inherit lower role permissions
- **Group Permissions**: Users inherit group-based permissions
- **Temporary Permissions**: Time-limited elevated access

## Authorization Testing

### RBAC Testing
```bash
# Run RBAC system tests
npm run test:rbac

# Test specific authorization scenarios
mocha tests/rbac-system.test.js
```

### Test Scenarios
1. **Role-Based Access**: Verify role-specific permissions
2. **Resource Protection**: Test unauthorized access prevention
3. **Permission Inheritance**: Validate permission hierarchy
4. **Dynamic Authorization**: Test context-aware decisions

## Security Considerations

### Permission Validation
- **Input Validation**: Validate all authorization requests
- **Permission Caching**: Efficient permission lookup
- **Audit Logging**: Log all authorization decisions
- **Fail-Safe Defaults**: Deny access by default

### Attack Prevention
- **Privilege Escalation**: Prevent unauthorized privilege elevation
- **Permission Bypass**: Block attempts to circumvent authorization
- **Session Hijacking**: Protect against session-based attacks
- **CSRF Protection**: Cross-site request forgery prevention

## Configuration Management

### Role Configuration
Roles and permissions are configured in:
- **Database**: User role assignments
- **Configuration Files**: Permission definitions
- **Environment Variables**: Security settings
- **Runtime Configuration**: Dynamic permission updates

### Permission Updates
- **Hot Reloading**: Update permissions without restart
- **Version Control**: Track permission changes
- **Rollback Capability**: Revert permission changes
- **Audit Trail**: Log all configuration changes

## Monitoring and Auditing

### Access Monitoring
- **Real-time Monitoring**: Live authorization decision tracking
- **Failed Access Attempts**: Unauthorized access logging
- **Permission Usage**: Track permission utilization
- **Anomaly Detection**: Identify unusual access patterns

### Audit Reporting
- **Access Reports**: Detailed access history
- **Permission Reports**: Current permission assignments
- **Security Reports**: Authorization security status
- **Compliance Reports**: Regulatory compliance validation

## Troubleshooting Authorization

### Common Issues
1. **Access Denied**: User lacks required permissions
2. **Permission Conflicts**: Conflicting permission assignments
3. **Role Assignment**: Incorrect user role configuration
4. **Resource Access**: Resource ownership or sharing issues

### Debug Tools
- **Permission Checker**: Validate user permissions
- **Role Inspector**: Review role assignments
- **Access Logger**: Detailed authorization logging
- **Permission Tester**: Test authorization scenarios
