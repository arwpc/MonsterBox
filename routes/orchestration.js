import express from 'express';
const router = express.Router();

/**
 * Orchestration Management UI
 * GET /orchestration - Main orchestration control interface
 */
router.get('/', function(req, res) {
    res.render('orchestration/index', {
        title: 'Orchestration Control - MonsterBox',
        currentPage: 'orchestration'
    });
});

export default router;

