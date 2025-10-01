/**
 * Authentication Routes for MonsterBox Secure Remote Access System
 * 
 * Provides REST API endpoints for JWT-based authentication including
 * login, logout, token refresh, and user management.
 */

const express = require('express');
const router = express.Router();
const authService = require('../../services/auth/authService');
const { 
    authenticateJWT, 
    requireAdmin, 
    authRateLimit,
    integrateWithSession 
} = require('../../middleware/auth');

/**
 * POST /auth/login
 * Authenticate user and return JWT tokens
 */
router.post('/login', authRateLimit, async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                error: 'Username and password are required',
                code: 'MISSING_CREDENTIALS'
            });
        }
        
        const metadata = {
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('User-Agent'),
            timestamp: new Date().toISOString()
        };
        
        const result = await authService.authenticate(username, password, metadata);
        
        if (!result.success) {
            return res.status(401).json(result);
        }
        
        // Set secure HTTP-only cookie for refresh token
        res.cookie('refreshToken', result.tokens.refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });
        
        // Integrate with session
        req.session.jwtUser = result.user;
        req.session.jwtSessionId = result.sessionId;
        req.session.jwtAuthenticated = true;
        
        res.json({
            success: true,
            message: 'Authentication successful',
            user: result.user,
            accessToken: result.tokens.accessToken,
            expiresIn: result.tokens.expiresIn,
            sessionId: result.sessionId
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            error: 'Login failed',
            code: 'LOGIN_ERROR'
        });
    }
});

/**
 * POST /auth/logout
 * Logout user and invalidate session
 */
router.post('/logout', authenticateJWT, async (req, res) => {
    try {
        const result = await authService.logout(req.sessionId);
        
        // Clear refresh token cookie
        res.clearCookie('refreshToken');
        
        // Clear session
        req.session.destroy((err) => {
            if (err) {
                console.error('Session destruction error:', err);
            }
        });
        
        res.json({
            success: true,
            message: 'Logout successful'
        });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({
            success: false,
            error: 'Logout failed',
            code: 'LOGOUT_ERROR'
        });
    }
});

/**
 * POST /auth/refresh
 * Refresh access token using refresh token
 */
router.post('/refresh', async (req, res) => {
    try {
        const refreshToken = req.cookies.refreshToken || req.body.refreshToken;
        
        if (!refreshToken) {
            return res.status(401).json({
                success: false,
                error: 'Refresh token required',
                code: 'NO_REFRESH_TOKEN'
            });
        }
        
        const result = await authService.refreshAccessToken(refreshToken);
        
        if (!result.success) {
            // Clear invalid refresh token cookie
            res.clearCookie('refreshToken');
            return res.status(401).json(result);
        }
        
        res.json({
            success: true,
            accessToken: result.accessToken,
            expiresIn: result.expiresIn
        });
    } catch (error) {
        console.error('Token refresh error:', error);
        res.status(500).json({
            success: false,
            error: 'Token refresh failed',
            code: 'REFRESH_ERROR'
        });
    }
});

/**
 * GET /auth/me
 * Get current user information
 */
router.get('/me', authenticateJWT, (req, res) => {
    res.json({
        success: true,
        user: req.user,
        animatronics: req.jwt.animatronics,
        sessionId: req.sessionId
    });
});

/**
 * GET /auth/verify
 * Verify JWT token validity
 */
router.get('/verify', authenticateJWT, (req, res) => {
    res.json({
        success: true,
        valid: true,
        user: req.user,
        expiresAt: new Date(req.jwt.exp * 1000).toISOString()
    });
});

/**
 * GET /auth/sessions
 * Get active sessions (admin only)
 */
router.get('/sessions', authenticateJWT, requireAdmin, async (req, res) => {
    try {
        const fs = require('fs').promises;
        const path = require('path');
        const sessionsFile = path.join(__dirname, '../../data/auth/sessions.json');
        
        const sessions = JSON.parse(await fs.readFile(sessionsFile, 'utf8'));
        
        // Filter active sessions and remove sensitive data
        const activeSessions = sessions.sessions
            .filter(session => session.active)
            .map(session => ({
                sessionId: session.sessionId,
                userId: session.userId,
                createdAt: session.createdAt,
                lastActivity: session.lastActivity,
                ipAddress: session.ipAddress,
                userAgent: session.userAgent
            }));
        
        res.json({
            success: true,
            sessions: activeSessions,
            count: activeSessions.length
        });
    } catch (error) {
        console.error('Sessions retrieval error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve sessions',
            code: 'SESSIONS_ERROR'
        });
    }
});

/**
 * DELETE /auth/sessions/:sessionId
 * Invalidate specific session (admin only)
 */
router.delete('/sessions/:sessionId', authenticateJWT, requireAdmin, async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        const result = await authService.logout(sessionId);
        
        if (result.success) {
            res.json({
                success: true,
                message: 'Session invalidated successfully'
            });
        } else {
            res.status(400).json(result);
        }
    } catch (error) {
        console.error('Session invalidation error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to invalidate session',
            code: 'SESSION_INVALIDATION_ERROR'
        });
    }
});

/**
 * GET /auth/audit
 * Get authentication audit log (admin only)
 */
router.get('/audit', authenticateJWT, requireAdmin, async (req, res) => {
    try {
        const fs = require('fs').promises;
        const path = require('path');
        const auditFile = path.join(__dirname, '../../data/auth/audit.json');
        
        const audit = JSON.parse(await fs.readFile(auditFile, 'utf8'));
        
        // Apply pagination
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        
        const events = audit.events
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(startIndex, endIndex);
        
        res.json({
            success: true,
            events,
            pagination: {
                page,
                limit,
                total: audit.events.length,
                pages: Math.ceil(audit.events.length / limit)
            }
        });
    } catch (error) {
        console.error('Audit retrieval error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve audit log',
            code: 'AUDIT_ERROR'
        });
    }
});

/**
 * GET /auth/status
 * Get authentication system status
 */
router.get('/status', (req, res) => {
    res.json({
        success: true,
        status: 'operational',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        features: {
            jwt: true,
            mfa: true,
            rbac: true,
            audit: true,
            sessionIntegration: true
        }
    });
});

module.exports = router;
