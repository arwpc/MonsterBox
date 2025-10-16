import express from 'express';
const router = express.Router();

/**
 * Orchestration Management UI
 * GET /orchestration - Main orchestration control interface
 */
router.get('/', function(req, res) {
    res.renderWithLayout('orchestration/index', {
        title: 'Orchestration Control - MonsterBox 5.3',
        page: 'orchestration'
    });
});

export default router;

