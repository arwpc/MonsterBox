/**
 * Dashboard paint-cost pins.
 *
 * A Chrome performance trace of the dashboard (2026-08-23) showed the page
 * repainting an ~8000×8000px region 50×/second, forever — enough to drag the
 * operator's whole viewing computer. Two ingredients composed:
 *
 *   1. an infinite CSS animation of box-shadow (the PANIC button's glow
 *      pulse) forcing a main-thread style+paint pass every frame, and
 *   2. backdrop-filter: blur() on the sticky command bar, which turns any
 *      invalidation behind it into a giant backdrop re-blur.
 *
 * These pins keep both ingredients out of the dashboard permanently:
 *   - keyframes in every stylesheet the dashboard loads may animate ONLY
 *     opacity and transform (compositor-friendly), and
 *   - the dashboard's own stylesheets carry no backdrop-filter at all.
 *
 * If a new effect needs a pulsing glow, put the shadow on a ::after overlay
 * and animate the overlay's opacity (see .mb-btn-panic::after).
 */

import { expect } from 'chai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cssDir = path.join(__dirname, '..', '..', 'public', 'css');

// Every stylesheet loaded by the dashboard: master.ejs layout sheets plus the
// page sheets of conversation/showtime.ejs and conversation/index.ejs.
const DASHBOARD_SHEETS = [
    'tokens.css',
    'components.css',
    'mb-obsidian.css',
    'mb-responsive.css',
    'mb-page-chrome.css',
    'animation.css',
    'monsterbox4.css',
    'body-map.css',
    'lurk-mode.css',
    'dashboard.css',
    'dashboard-v2.css'
];

// Sheets owned by the dashboard pages themselves — these must carry no
// backdrop-filter anywhere (shared component sheets keep theirs for other
// pages; the dashboard simply never uses those classes over live video).
const DASHBOARD_OWNED_SHEETS = [
    'lurk-mode.css',
    'dashboard.css',
    'dashboard-v2.css',
    'body-map.css'
];

// Properties an infinite animation may touch without forcing main-thread
// paint every frame.
const COMPOSITOR_SAFE = new Set(['opacity', 'transform']);

function extractKeyframes(css) {
    const blocks = [];
    const re = /@keyframes\s+([\w-]+)\s*\{/g;
    let m;
    while ((m = re.exec(css)) !== null) {
        let depth = 1;
        let i = re.lastIndex;
        while (depth > 0 && i < css.length) {
            if (css[i] === '{') depth += 1;
            else if (css[i] === '}') depth -= 1;
            i += 1;
        }
        blocks.push({ name: m[1], body: css.slice(re.lastIndex, i) });
    }
    return blocks;
}

describe('Dashboard paint cost pins', function () {
    const sheets = {};
    before(function () {
        for (const f of DASHBOARD_SHEETS) {
            sheets[f] = fs.readFileSync(path.join(cssDir, f), 'utf8');
        }
    });

    it('keyframes in dashboard-loaded stylesheets animate only opacity/transform', function () {
        const offenders = [];
        for (const [file, css] of Object.entries(sheets)) {
            for (const kf of extractKeyframes(css)) {
                const props = [...kf.body.matchAll(/(?:^|[{;])\s*([a-z-]+)\s*:/g)]
                    .map(p => p[1]);
                const bad = props.filter(p => !COMPOSITOR_SAFE.has(p));
                if (bad.length) {
                    offenders.push(`${file} @keyframes ${kf.name} animates: ${bad.join(', ')}`);
                }
            }
        }
        expect(offenders, offenders.join('\n')).to.be.empty;
    });

    it('dashboard-owned stylesheets contain no backdrop-filter', function () {
        const offenders = [];
        for (const f of DASHBOARD_OWNED_SHEETS) {
            // strip comments so the explanatory "no backdrop-filter" notes
            // left at the removal sites don't trip the declaration check
            const css = sheets[f].replace(/\/\*[\s\S]*?\*\//g, '');
            css.split('\n').forEach((line, i) => {
                if (/(?:^|[\s;{])(?:-webkit-)?backdrop-filter\s*:/.test(line)) {
                    offenders.push(`${f}:${i + 1}: ${line.trim()}`);
                }
            });
        }
        expect(offenders, offenders.join('\n')).to.be.empty;
    });

    it('the PANIC glow pulses via a composited ::after overlay, not box-shadow keyframes', function () {
        const css = sheets['components.css'];
        expect(css).to.include('.mb-btn-panic::after');
        // the keyframe used by the panic button must not carry box-shadow
        const kf = extractKeyframes(css).find(k => k.name === 'mb-glow-pulse');
        expect(kf, 'mb-glow-pulse keyframes missing from components.css').to.exist;
        expect(kf.body).to.not.match(/box-shadow/);
    });
});
