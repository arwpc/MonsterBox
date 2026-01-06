/**
 * Role-Based Access Control (RBAC) Middleware for MonsterBox
 * 
 * Provides middleware functions for enforcing role-based access control
 * across the MonsterBox secure remote access system.
 */

const rbacService = require('../services/auth/rbacService');

/**
 * RBAC Authorization Middleware
 * Checks if user's role has required permissions and animatronic access
 * @param {Object} options - Authorization options
 * @param {Array|string} options.permissions - Required permissions
 * @param {Array|string} options.animatronics - Required animatronic access
 * @param {boolean} options.requireAll - Require all permissions/animatronics (default: true)
 */
const authorize = (options = {}) => {
    return async (req, res, next) => {
        try {
            if (!req.user || !req.user.role) {
                return res.status(401).json({
                    success: false,
                    error: 'Authentication required',
                    code: 'AUTH_REQUIRED'
                });
            }
            
            const userRole = req.user.role;
            const { permissions, animatronics, requireAll = true } = options;
            
            // Check permissions if specified
            if (permissions) {
                const requiredPermissions = Array.isArray(permissions) ? permissions : [permissions];
                const permissionChecks = await Promise.all(
                    requiredPermissions.map(permission => 
                        rbacService.hasPermission(userRole, permission)
                    )
                );
                
                const hasPermissions = requireAll 
                    ? permissionChecks.every(check => check)
                    : permissionChecks.some(check => check);
                
                if (!hasPermissions) {
                    return res.status(403).json({
                        success: false,
                        error: 'Insufficient permissions',
                        code: 'INSUFFICIENT_PERMISSIONS',
                        required: requiredPermissions,
                        userRole: userRole
                    });
                }
            }
            
            // Check animatronic access if specified
            if (animatronics) {
                const requiredAnimatronics = Array.isArray(animatronics) ? animatronics : [animatronics];
                const accessChecks = await Promise.all(
                    requiredAnimatronics.map(animatronic => 
                        rbacService.hasAnimatronicAccess(userRole, animatronic)
                    )
                );
                
                const hasAccess = requireAll 
                    ? accessChecks.every(check => check)
                    : accessChecks.some(check => check);
                
                if (!hasAccess) {
                    return res.status(403).json({
                        success: false,
                        error: 'Insufficient animatronic access',
                        code: 'INSUFFICIENT_ANIMATRONIC_ACCESS',
                        required: requiredAnimatronics,
                        userRole: userRole
                    });
                }
            }
            
            next();
        } catch (error) {
            console.error('RBAC authorization error:', error);
            return res.status(500).json({
                success: false,
                error: 'Authorization check failed',
                code: 'RBAC_ERROR'
            });
        }
    };
};

/**
 * Dynamic Animatronic Authorization Middleware
 * Checks access to animatronic specified in request parameters
 * @param {string} permission - Required permission for the animatronic
 * @param {string} paramName - Parameter name containing animatronic ID (default: 'animatronicId')
 */
const authorizeAnimatronic = (permission = 'view', paramName = 'animatronicId') => {
    return async (req, res, next) => {
        try {
            if (!req.user || !req.user.role) {
                return res.status(401).json({
                    success: false,
                    error: 'Authentication required',
                    code: 'AUTH_REQUIRED'
                });
            }
            
            const animatronicId = req.params[paramName] || req.body[paramName];
            
            if (!animatronicId) {
                return res.status(400).json({
                    success: false,
                    error: `${paramName} is required`,
                    code: 'MISSING_ANIMATRONIC_ID'
                });
            }
            
            const userRole = req.user.role;
            
            // Check if user can perform the action on this animatronic
            const canPerform = await rbacService.canPerformAction(userRole, animatronicId, permission);
            
            if (!canPerform) {
                return res.status(403).json({
                    success: false,
                    error: `Access denied to ${animatronicId} with permission ${permission}`,
                    code: 'ANIMATRONIC_ACCESS_DENIED',
                    animatronic: animatronicId,
                    permission: permission,
                    userRole: userRole
                });
            }
            
            // Check if animatronic is operational (for control/configure actions)
            if (['control', 'configure', 'ssh'].includes(permission)) {
                const isOperational = await rbacService.isAnimatronicOperational(animatronicId);
                if (!isOperational) {
                    return res.status(503).json({
                        success: false,
                        error: `${animatronicId} is not operational`,
                        code: 'ANIMATRONIC_NOT_OPERATIONAL',
                        animatronic: animatronicId
                    });
                }
            }
            
            // Attach animatronic info to request
            req.authorizedAnimatronic = {
                id: animatronicId,
                permission: permission
            };
            
            next();
        } catch (error) {
            console.error('Animatronic authorization error:', error);
            return res.status(500).json({
                success: false,
                error: 'Animatronic authorization failed',
                code: 'ANIMATRONIC_AUTH_ERROR'
            });
        }
    };
};

/**
 * Role Hierarchy Middleware
 * Checks if user's role has sufficient priority level
 * @param {number} minimumPriority - Minimum role priority required
 */
const requirePriority = (minimumPriority) => {
    return async (req, res, next) => {
        try {
            if (!req.user || !req.user.role) {
                return res.status(401).json({
                    success: false,
                    error: 'Authentication required',
                    code: 'AUTH_REQUIRED'
                });
            }
            
            const role = await rbacService.getRole(req.user.role);
            
            if (!role) {
                return res.status(403).json({
                    success: false,
                    error: 'Invalid user role',
                    code: 'INVALID_ROLE'
                });
            }
            
            if (role.priority < minimumPriority) {
                return res.status(403).json({
                    success: false,
                    error: 'Insufficient role priority',
                    code: 'INSUFFICIENT_PRIORITY',
                    required: minimumPriority,
                    current: role.priority
                });
            }
            
            next();
        } catch (error) {
            console.error('Priority check error:', error);
            return res.status(500).json({
                success: false,
                error: 'Priority check failed',
                code: 'PRIORITY_CHECK_ERROR'
            });
        }
    };
};

/**
 * Permission Check Middleware
 * Simple permission check for a single permission
 * @param {string} permission - Required permission
 */
const requirePermission = (permission) => {
    return authorize({ permissions: [permission] });
};

/**
 * Multiple Permissions Middleware
 * Requires all specified permissions
 * @param {Array} permissions - Array of required permissions
 */
const requireAllPermissions = (permissions) => {
    return authorize({ permissions, requireAll: true });
};

/**
 * Any Permission Middleware
 * Requires at least one of the specified permissions
 * @param {Array} permissions - Array of permissions (any one required)
 */
const requireAnyPermission = (permissions) => {
    return authorize({ permissions, requireAll: false });
};

/**
 * Admin Only Middleware
 * Requires admin permission
 */
const requireAdmin = requirePermission('admin');

/**
 * SSH Access Middleware
 * Requires SSH permission
 */
const requireSSH = requirePermission('ssh');

/**
 * Control Access Middleware
 * Requires control permission
 */
const requireControl = requirePermission('control');

/**
 * Configuration Access Middleware
 * Requires configure permission
 */
const requireConfigure = requirePermission('configure');

/**
 * View Access Middleware
 * Requires view permission (minimum access level)
 */
const requireView = requirePermission('view');

/**
 * User Authorization Summary Middleware
 * Attaches user's authorization summary to request
 */
const attachAuthorizationSummary = async (req, res, next) => {
    try {
        if (req.user && req.user.role) {
            const summary = await rbacService.getUserAuthorizationSummary(req.user.role);
            req.authorizationSummary = summary;
        }
        next();
    } catch (error) {
        console.error('Authorization summary error:', error);
        next(); // Continue without summary
    }
};

module.exports = {
    authorize,
    authorizeAnimatronic,
    requirePriority,
    requirePermission,
    requireAllPermissions,
    requireAnyPermission,
    requireAdmin,
    requireSSH,
    requireControl,
    requireConfigure,
    requireView,
    attachAuthorizationSummary
};
