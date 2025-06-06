/**
 * Animatronic API Routes
 */

import { Router, Request, Response, NextFunction } from 'express';
import { animatronicService } from '../services/animatronicService';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

/**
 * GET /api/animatronics
 */
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const animatronics = await animatronicService.getAnimatronics();
  res.json({
    success: true,
    data: animatronics,
    timestamp: new Date().toISOString()
  });
}));

/**
 * GET /api/animatronics/status
 */
router.get('/status', asyncHandler(async (req: Request, res: Response) => {
  const statuses = await animatronicService.getAnimatronicStatuses();
  res.json({
    success: true,
    data: statuses,
    timestamp: new Date().toISOString()
  });
}));

/**
 * POST /api/animatronics/:id/command
 */
router.post('/:id/command', asyncHandler(async (req: Request, res: Response) => {
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

  const result = await animatronicService.executeCommand(id, command);
  
  res.json({
    success: true,
    data: result,
    timestamp: new Date().toISOString()
  });
}));

/**
 * GET /api/animatronics/test/all
 */
router.get('/test/all', asyncHandler(async (req: Request, res: Response) => {
  const connectivityResults = await animatronicService.testConnectivity();
  
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

export default router;
