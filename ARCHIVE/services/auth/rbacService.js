/**
 * Role-Based Access Control (RBAC) Service for MonsterBox
 * 
 * Provides comprehensive role and permission management for the
 * MonsterBox secure remote access system.
 */

const fs = require('fs').promises;
const path = require('path');

class RBACService {
    constructor() {
        this.rolesFile = path.join(__dirname, '../../data/auth/roles.json');
        this.cache = {
            roles: null,
            permissions: null,
            animatronics: null,
            lastLoaded: null
        };
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    }
    
    /**
     * Load RBAC configuration from file
     * @returns {Object} RBAC configuration
     */
    async loadRBACConfig() {
        try {
            // Check cache validity
            if (this.cache.roles && 
                this.cache.lastLoaded && 
                (Date.now() - this.cache.lastLoaded) < this.cacheTimeout) {
                return {
                    roles: this.cache.roles,
                    permissions: this.cache.permissions,
                    animatronics: this.cache.animatronics
                };
            }
            
            const data = await fs.readFile(this.rolesFile, 'utf8');
            const config = JSON.parse(data);
            
            // Update cache
            this.cache.roles = config.roles;
            this.cache.permissions = config.permissions;
            this.cache.animatronics = config.animatronics;
            this.cache.lastLoaded = Date.now();
            
            return config;
        } catch (error) {
            console.error('Error loading RBAC configuration:', error);
            throw new Error('Failed to load RBAC configuration');
        }
    }
    
    /**
     * Get role information by role ID
     * @param {string} roleId - Role identifier
     * @returns {Object|null} Role information
     */
    async getRole(roleId) {
        const config = await this.loadRBACConfig();
        return config.roles[roleId] || null;
    }
    
    /**
     * Get all available roles
     * @returns {Object} All roles
     */
    async getAllRoles() {
        const config = await this.loadRBACConfig();
        return config.roles;
    }
    
    /**
     * Get permission information by permission ID
     * @param {string} permissionId - Permission identifier
     * @returns {Object|null} Permission information
     */
    async getPermission(permissionId) {
        const config = await this.loadRBACConfig();
        return config.permissions[permissionId] || null;
    }
    
    /**
     * Get all available permissions
     * @returns {Object} All permissions
     */
    async getAllPermissions() {
        const config = await this.loadRBACConfig();
        return config.permissions;
    }
    
    /**
     * Check if a role has a specific permission
     * @param {string} roleId - Role identifier
     * @param {string} permissionId - Permission identifier
     * @returns {boolean} True if role has permission
     */
    async hasPermission(roleId, permissionId) {
        const role = await this.getRole(roleId);
        if (!role) {
            return false;
        }
        
        return role.permissions.includes(permissionId);
    }
    
    /**
     * Check if a role has access to a specific animatronic
     * @param {string} roleId - Role identifier
     * @param {string} animatronicId - Animatronic identifier
     * @returns {boolean} True if role has access
     */
    async hasAnimatronicAccess(roleId, animatronicId) {
        const role = await this.getRole(roleId);
        if (!role) {
            return false;
        }
        
        return role.animatronicAccess.includes(animatronicId);
    }
    
    /**
     * Check if a role can perform a specific action on an animatronic
     * @param {string} roleId - Role identifier
     * @param {string} animatronicId - Animatronic identifier
     * @param {string} permissionId - Required permission
     * @returns {boolean} True if authorized
     */
    async canPerformAction(roleId, animatronicId, permissionId) {
        const hasPermission = await this.hasPermission(roleId, permissionId);
        const hasAccess = await this.hasAnimatronicAccess(roleId, animatronicId);
        
        return hasPermission && hasAccess;
    }
    
    /**
     * Get effective permissions for a role (including inherited permissions)
     * @param {string} roleId - Role identifier
     * @returns {Array} Array of permission IDs
     */
    async getEffectivePermissions(roleId) {
        const role = await this.getRole(roleId);
        if (!role) {
            return [];
        }
        
        let permissions = [...role.permissions];
        
        // Process inherited roles (if any)
        if (role.inherits && role.inherits.length > 0) {
            for (const inheritedRoleId of role.inherits) {
                const inheritedPermissions = await this.getEffectivePermissions(inheritedRoleId);
                permissions = [...new Set([...permissions, ...inheritedPermissions])];
            }
        }
        
        return permissions;
    }
    
    /**
     * Get effective animatronic access for a role
     * @param {string} roleId - Role identifier
     * @returns {Array} Array of animatronic IDs
     */
    async getEffectiveAnimatronicAccess(roleId) {
        const role = await this.getRole(roleId);
        if (!role) {
            return [];
        }
        
        let access = [...role.animatronicAccess];
        
        // Process inherited roles (if any)
        if (role.inherits && role.inherits.length > 0) {
            for (const inheritedRoleId of role.inherits) {
                const inheritedAccess = await this.getEffectiveAnimatronicAccess(inheritedRoleId);
                access = [...new Set([...access, ...inheritedAccess])];
            }
        }
        
        return access;
    }
    
    /**
     * Validate role assignment for a user
     * @param {string} roleId - Role identifier to validate
     * @returns {Object} Validation result
     */
    async validateRole(roleId) {
        const role = await this.getRole(roleId);
        
        if (!role) {
            return {
                valid: false,
                error: 'Role does not exist',
                code: 'ROLE_NOT_FOUND'
            };
        }
        
        // Check for circular inheritance (if applicable)
        if (role.inherits && role.inherits.length > 0) {
            const visited = new Set();
            const checkCircular = async (currentRoleId) => {
                if (visited.has(currentRoleId)) {
                    return true; // Circular dependency found
                }
                visited.add(currentRoleId);
                
                const currentRole = await this.getRole(currentRoleId);
                if (currentRole && currentRole.inherits) {
                    for (const inheritedId of currentRole.inherits) {
                        if (await checkCircular(inheritedId)) {
                            return true;
                        }
                    }
                }
                return false;
            };
            
            if (await checkCircular(roleId)) {
                return {
                    valid: false,
                    error: 'Circular role inheritance detected',
                    code: 'CIRCULAR_INHERITANCE'
                };
            }
        }
        
        return {
            valid: true,
            role: role
        };
    }
    
    /**
     * Get role hierarchy information
     * @returns {Object} Role hierarchy with priorities
     */
    async getRoleHierarchy() {
        const roles = await this.getAllRoles();
        
        return Object.values(roles)
            .sort((a, b) => b.priority - a.priority)
            .map(role => ({
                id: role.id,
                name: role.name,
                priority: role.priority,
                permissions: role.permissions.length,
                animatronics: role.animatronicAccess.length
            }));
    }
    
    /**
     * Get animatronic information
     * @param {string} animatronicId - Animatronic identifier
     * @returns {Object|null} Animatronic information
     */
    async getAnimatronic(animatronicId) {
        const config = await this.loadRBACConfig();
        return config.animatronics[animatronicId] || null;
    }
    
    /**
     * Get all animatronics
     * @returns {Object} All animatronics
     */
    async getAllAnimatronics() {
        const config = await this.loadRBACConfig();
        return config.animatronics;
    }
    
    /**
     * Check if an animatronic is operational
     * @param {string} animatronicId - Animatronic identifier
     * @returns {boolean} True if operational
     */
    async isAnimatronicOperational(animatronicId) {
        const animatronic = await this.getAnimatronic(animatronicId);
        return !!(animatronic && animatronic.status === 'operational');
    }
    
    /**
     * Generate user authorization summary
     * @param {string} roleId - User's role ID
     * @returns {Object} Authorization summary
     */
    async getUserAuthorizationSummary(roleId) {
        const role = await this.getRole(roleId);
        if (!role) {
            return null;
        }
        
        const effectivePermissions = await this.getEffectivePermissions(roleId);
        const effectiveAccess = await this.getEffectiveAnimatronicAccess(roleId);
        
        const animatronics = await this.getAllAnimatronics();
        const accessibleAnimatronics = effectiveAccess.map(id => ({
            id,
            name: animatronics[id]?.name,
            host: animatronics[id]?.host,
            status: animatronics[id]?.status
        }));
        
        return {
            role: {
                id: role.id,
                name: role.name,
                description: role.description,
                priority: role.priority
            },
            permissions: effectivePermissions,
            animatronics: accessibleAnimatronics,
            summary: {
                canView: effectivePermissions.includes('view'),
                canControl: effectivePermissions.includes('control'),
                canConfigure: effectivePermissions.includes('configure'),
                canSSH: effectivePermissions.includes('ssh'),
                isAdmin: effectivePermissions.includes('admin'),
                animatronicCount: accessibleAnimatronics.length
            }
        };
    }
    
    /**
     * Clear RBAC cache
     */
    clearCache() {
        this.cache = {
            roles: null,
            permissions: null,
            animatronics: null,
            lastLoaded: null
        };
    }
}

module.exports = new RBACService();
