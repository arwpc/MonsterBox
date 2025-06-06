"use strict";
/**
 * Animatronic API Routes
 */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const animatronicService_1 = require("../services/animatronicService");
const errorHandler_1 = require("../middleware/errorHandler");
const router = (0, express_1.Router)();
/**
 * GET /api/animatronics
 */
router.get('/', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const animatronics = await animatronicService_1.animatronicService.getAnimatronics();
    res.json({
        success: true,
        data: animatronics,
        timestamp: new Date().toISOString()
    });
}));
/**
 * GET /api/animatronics/status
 */
router.get('/status', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const statuses = await animatronicService_1.animatronicService.getAnimatronicStatuses();
    res.json({
        success: true,
        data: statuses,
        timestamp: new Date().toISOString()
    });
}));
/**
 * POST /api/animatronics/:id/command
 */
router.post('/:id/command', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const { command } = req.body;
    if (!command || typeof command !== 'string') {
        res.status(400).json({
            success: false,
            error: 'Command is required and must be a string',
            timestamp: new Date().toISOString()
        });
        return;
    }
    const result = await animatronicService_1.animatronicService.executeCommand(id, command);
    res.json({
        success: true,
        data: result,
        timestamp: new Date().toISOString()
    });
}));
/**
 * GET /api/animatronics/test/all
 */
router.get('/test/all', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const connectivityResults = await animatronicService_1.animatronicService.testConnectivity();
    const results = Array.from(connectivityResults.entries()).map(([id, connected]) => ({
        animatronicId: id,
        connected,
        message: connected ? 'Connection successful' : 'Connection failed'
    }));
    res.json({
        success: true,
        data: results,
        timestamp: new Date().toISOString()
    });
}));
exports.default = router;
//# sourceMappingURL=animatronicRoutes.js.map