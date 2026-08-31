import express from 'express';
import { readFile } from 'fs/promises';
import path from 'path';
const router = express.Router();

// How many node cards the page should reserve space for before any fetch returns.
// Without this the wall renders a 177px spinner and then jumps to the real grid
// height (measured 2026-08-31: 986px laptop, 1714px tablet, 3434px phone), shoving
// the Goblins row and the bottom rail down and producing a Cumulative Layout Shift
// of 0.18-0.45 -- "poor" by the >0.25 threshold on tablet. Reserving the right number
// of skeleton cards is what removes the jump; a bare min-height would just leave a
// large empty block on narrow screens.
async function countAnimatronics() {
    try {
        const file = path.resolve(process.cwd(), 'config/animatronics.json');
        const parsed = JSON.parse(await readFile(file, 'utf8'));
        const list = parsed.animatronics || [];
        return list.length || 0;
    } catch (err) {
        // Never fail the page over a skeleton count.
        console.warn('orchestration: could not count animatronics for skeleton reserve:', err.message);
        return 0;
    }
}

/**
 * Orchestration Management UI
 * GET /orchestration - Main orchestration control interface
 */
router.get('/', async function (req, res) {
    res.renderWithLayout('orchestration/index', {
        title: 'Orchestration Control - MonsterBox',
        page: 'orchestration',
        nodeCount: await countAnimatronics(),
        styles: ['/css/mb-orchestration.css']
    });
});

export default router;

