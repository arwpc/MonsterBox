import express from 'express';
import { readFile } from 'fs/promises';
import path from 'path';
import orchestrationService from '../services/orchestrationService.js';
const router = express.Router();

// Start collecting fleet health the moment the PAGE is requested, not when its
// script finally asks. The wall's first fleet-health call used to be the first
// contact with the fleet: six cold TCP+TLS handshakes over dozing Wi-Fi radios,
// 0.4-1.2 s measured, all of it after the HTML, CSS and JS had already loaded.
// Firing here overlaps that fan-out with the page load; the script's request
// then joins the in-flight collection or hits the memo, and even a slow browser
// that misses the memo window finds the sockets already open. Not in test mode:
// a Playwright page load must not reach into the real yard.
function prewarmFleetHealth() {
    if (process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true' || process.env.NODE_ENV === 'test') return;
    Promise.resolve()
        .then(() => orchestrationService.getFleetHealth())
        .catch(err => console.warn('orchestration: fleet-health prewarm failed:', err && err.message));
}

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
    prewarmFleetHealth();
    res.renderWithLayout('orchestration/index', {
        title: 'Orchestration Control - MonsterBox',
        page: 'orchestration',
        nodeCount: await countAnimatronics(),
        styles: ['/css/mb-orchestration.css']
    });
});

export default router;

