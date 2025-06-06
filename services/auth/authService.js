/**
 * Authentication Service for MonsterBox Secure Remote Access System
 * 
 * Provides JWT-based authentication services for secure access to
 * MonsterBox animatronic systems with role-based access control.
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const fs = require('fs').promises;
const path = require('path');
const { jwtConfig, generatePayload, validatePayload } = require('../../config/auth/jwt-config');

class AuthService {
    constructor() {
        this.usersFile = path.join(__dirname, '../../data/auth/users.json');
        this.sessionsFile = path.join(__dirname, '../../data/auth/sessions.json');
        this.auditFile = path.join(__dirname, '../../data/auth/audit.json');
        this.bcryptRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
        
        // Initialize data files if they don't exist
        this.initializeDataFiles();
    }
    
    /**
     * Initialize authentication data files
     */
    async initializeDataFiles() {
        try {
            // Initialize users file with default admin user
            try {
                await fs.access(this.usersFile);
            } catch {
                const defaultUsers = {
                    users: [
                        {
                            id: 'admin-001',
                            username: 'admin',
                            email: 'admin@monsterbox.local',
                            passwordHash: await bcrypt.hash('MonsterBox2024!', this.bcryptRounds),
                            role: 'admin',
                            animatronicAccess: ['orlok', 'coffin', 'pumpkinhead'],
                            permissions: ['view', 'control', 'configure', 'ssh', 'admin'],
                            createdAt: new Date().toISOString(),
                            lastLogin: null,
                            mfaEnabled: false,
                            mfaSecret: null
                        }
                    ]
                };
                await fs.writeFile(this.usersFile, JSON.stringify(defaultUsers, null, 2));
            }
            
            // Initialize sessions file
            try {
                await fs.access(this.sessionsFile);
            } catch {
                await fs.writeFile(this.sessionsFile, JSON.stringify({ sessions: [] }, null, 2));
            }
            
            // Initialize audit file
            try {
                await fs.access(this.auditFile);
            } catch {
                await fs.writeFile(this.auditFile, JSON.stringify({ events: [] }, null, 2));
            }
        } catch (error) {
            console.error('Error initializing auth data files:', error);
        }
    }
    
    /**
     * Authenticate user with username and password
     * @param {string} username - Username
     * @param {string} password - Password
     * @param {Object} metadata - Request metadata (IP, user agent, etc.)
     * @returns {Object} Authentication result
     */
    async authenticate(username, password, metadata = {}) {
        try {
            const users = await this.loadUsers();
            const user = users.users.find(u => u.username === username);
            
            if (!user) {
                await this.logAuditEvent('AUTH_FAILED', { username, reason: 'User not found', ...metadata });
                return { success: false, error: 'Invalid credentials' };
            }
            
            const passwordValid = await bcrypt.compare(password, user.passwordHash);
            if (!passwordValid) {
                await this.logAuditEvent('AUTH_FAILED', { username, reason: 'Invalid password', ...metadata });
                return { success: false, error: 'Invalid credentials' };
            }
            
            // Check if MFA is required
            if (user.mfaEnabled) {
                await this.logAuditEvent('AUTH_MFA_REQUIRED', { username, ...metadata });
                return { 
                    success: false, 
                    requiresMFA: true, 
                    userId: user.id,
                    message: 'MFA verification required' 
                };
            }
            
            // Generate tokens
            const sessionId = this.generateSessionId();
            const userWithSession = { ...user, sessionId, ...metadata };
            
            const accessToken = this.generateAccessToken(userWithSession);
            const refreshToken = this.generateRefreshToken(userWithSession);
            
            // Store session
            await this.storeSession(sessionId, user.id, metadata);
            
            // Update last login
            await this.updateLastLogin(user.id);
            
            await this.logAuditEvent('AUTH_SUCCESS', { username, sessionId, ...metadata });
            
            return {
                success: true,
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    role: user.role,
                    animatronicAccess: user.animatronicAccess,
                    permissions: user.permissions
                },
                tokens: {
                    accessToken,
                    refreshToken,
                    expiresIn: jwtConfig.expiresIn
                },
                sessionId
            };
        } catch (error) {
            console.error('Authentication error:', error);
            await this.logAuditEvent('AUTH_ERROR', { username, error: error.message, ...metadata });
            return { success: false, error: 'Authentication failed' };
        }
    }
    
    /**
     * Verify JWT access token
     * @param {string} token - JWT access token
     * @returns {Object} Verification result
     */
    async verifyAccessToken(token) {
        try {
            const payload = jwt.verify(token, jwtConfig.secret, {
                issuer: jwtConfig.issuer,
                audience: jwtConfig.audience
            });
            
            if (!validatePayload(payload)) {
                return { success: false, error: 'Invalid token payload' };
            }
            
            // Check if session is still valid
            const sessionValid = await this.validateSession(payload.sessionId);
            if (!sessionValid) {
                return { success: false, error: 'Session expired' };
            }
            
            return { success: true, payload };
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                return { success: false, error: 'Token expired' };
            } else if (error.name === 'JsonWebTokenError') {
                return { success: false, error: 'Invalid token' };
            }
            return { success: false, error: 'Token verification failed' };
        }
    }
    
    /**
     * Refresh access token using refresh token
     * @param {string} refreshToken - JWT refresh token
     * @returns {Object} Refresh result
     */
    async refreshAccessToken(refreshToken) {
        try {
            const payload = jwt.verify(refreshToken, jwtConfig.refreshSecret);
            
            // Load current user data
            const users = await this.loadUsers();
            const user = users.users.find(u => u.id === payload.sub);
            
            if (!user) {
                return { success: false, error: 'User not found' };
            }
            
            // Validate session
            const sessionValid = await this.validateSession(payload.sessionId);
            if (!sessionValid) {
                return { success: false, error: 'Session expired' };
            }
            
            // Generate new access token
            const userWithSession = { ...user, sessionId: payload.sessionId };
            const newAccessToken = this.generateAccessToken(userWithSession);
            
            await this.logAuditEvent('TOKEN_REFRESHED', { 
                userId: user.id, 
                sessionId: payload.sessionId 
            });
            
            return {
                success: true,
                accessToken: newAccessToken,
                expiresIn: jwtConfig.expiresIn
            };
        } catch (error) {
            return { success: false, error: 'Invalid refresh token' };
        }
    }
    
    /**
     * Logout user and invalidate session
     * @param {string} sessionId - Session ID
     * @returns {Object} Logout result
     */
    async logout(sessionId) {
        try {
            await this.invalidateSession(sessionId);
            await this.logAuditEvent('LOGOUT', { sessionId });
            return { success: true };
        } catch (error) {
            return { success: false, error: 'Logout failed' };
        }
    }
    
    /**
     * Generate JWT access token
     * @param {Object} user - User object with session info
     * @returns {string} JWT access token
     */
    generateAccessToken(user) {
        const payload = generatePayload(user, user.animatronicAccess, user.permissions);
        return jwt.sign(payload, jwtConfig.secret, {
            algorithm: jwtConfig.algorithm,
            expiresIn: jwtConfig.expiresIn
        });
    }
    
    /**
     * Generate JWT refresh token
     * @param {Object} user - User object with session info
     * @returns {string} JWT refresh token
     */
    generateRefreshToken(user) {
        const payload = {
            sub: user.id,
            sessionId: user.sessionId,
            type: 'refresh'
        };
        return jwt.sign(payload, jwtConfig.refreshSecret, {
            algorithm: jwtConfig.algorithm,
            expiresIn: jwtConfig.refreshExpiresIn
        });
    }
    
    /**
     * Generate unique session ID
     * @returns {string} Session ID
     */
    generateSessionId() {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    /**
     * Load users from file
     * @returns {Object} Users data
     */
    async loadUsers() {
        const data = await fs.readFile(this.usersFile, 'utf8');
        return JSON.parse(data);
    }
    
    /**
     * Store session information
     * @param {string} sessionId - Session ID
     * @param {string} userId - User ID
     * @param {Object} metadata - Session metadata
     */
    async storeSession(sessionId, userId, metadata) {
        const sessions = JSON.parse(await fs.readFile(this.sessionsFile, 'utf8'));
        sessions.sessions.push({
            sessionId,
            userId,
            createdAt: new Date().toISOString(),
            lastActivity: new Date().toISOString(),
            ipAddress: metadata.ipAddress,
            userAgent: metadata.userAgent,
            active: true
        });
        await fs.writeFile(this.sessionsFile, JSON.stringify(sessions, null, 2));
    }
    
    /**
     * Validate session
     * @param {string} sessionId - Session ID
     * @returns {boolean} True if valid
     */
    async validateSession(sessionId) {
        try {
            const sessions = JSON.parse(await fs.readFile(this.sessionsFile, 'utf8'));
            const session = sessions.sessions.find(s => s.sessionId === sessionId);
            return session && session.active;
        } catch {
            return false;
        }
    }
    
    /**
     * Invalidate session
     * @param {string} sessionId - Session ID
     */
    async invalidateSession(sessionId) {
        const sessions = JSON.parse(await fs.readFile(this.sessionsFile, 'utf8'));
        const session = sessions.sessions.find(s => s.sessionId === sessionId);
        if (session) {
            session.active = false;
            session.endedAt = new Date().toISOString();
        }
        await fs.writeFile(this.sessionsFile, JSON.stringify(sessions, null, 2));
    }
    
    /**
     * Update user's last login time
     * @param {string} userId - User ID
     */
    async updateLastLogin(userId) {
        const users = await this.loadUsers();
        const user = users.users.find(u => u.id === userId);
        if (user) {
            user.lastLogin = new Date().toISOString();
            await fs.writeFile(this.usersFile, JSON.stringify(users, null, 2));
        }
    }
    
    /**
     * Log audit event
     * @param {string} event - Event type
     * @param {Object} data - Event data
     */
    async logAuditEvent(event, data) {
        try {
            const audit = JSON.parse(await fs.readFile(this.auditFile, 'utf8'));
            audit.events.push({
                timestamp: new Date().toISOString(),
                event,
                data
            });
            
            // Keep only last 1000 events
            if (audit.events.length > 1000) {
                audit.events = audit.events.slice(-1000);
            }
            
            await fs.writeFile(this.auditFile, JSON.stringify(audit, null, 2));
        } catch (error) {
            console.error('Error logging audit event:', error);
        }
    }
}

module.exports = new AuthService();
