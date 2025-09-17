/**
 * Setup Audio Routes
 * Routes for audio configuration interface
 */

import express from 'express';
import { runWrapper } from '../../services/hardwareService/exec.js';

const router = express.Router();

// Setup audio page
router.get('/', async (req, res) => {
    try {
        res.render('setup/audio', {
            title: 'Setup Audio - MonsterBox 4.0',
            page: 'setup-audio'
        });
    } catch (error) {
        console.error('Error rendering audio setup page:', error);
        res.status(500).render('error', {
            title: 'Error',
            error: 'Failed to load audio setup page',
            message: error.message
        });
    }
});

// Enumerate ALSA outputs (fast, read-only)
router.get('/api/outputs', async (req, res) => {
    try {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const pexec = promisify(exec);

        function parseAplayLList(text) {
            // Parse `aplay -l` into [{ id, name, description }]
            const lines = String(text || '').split(/\r?\n/);
            const items = [];
            let currentCard = null;
            lines.forEach((ln) => {
                let m;
                m = ln.match(/^card\s+(\d+)\s*:\s*([^\s,]+)\s*\[(.+?)\]/i);
                if (m) {
                    currentCard = { num: m[1], short: m[2], name: m[3] };
                    return;
                }
                m = ln.match(/^\s*Subdevice\s+/i);
                if (m) return;
                m = ln.match(/^\s*Device\s+(\d+)\s*:\s*(.+)$/i);
                if (m && currentCard) {
                    const devNum = m[1];
                    const desc = m[2].trim();
                    const id = `hw:${currentCard.num},${devNum}`;
                    const label = `${currentCard.name} (plughw:${currentCard.num},${devNum})`;
                    items.push({ id, name: currentCard.name, description: label });
                }
            });
            return items;
        }

        function parseAplayLLogical(text) {
            // Parse `aplay -L` logical devices; prefer sysdefault, plughw, hw entries
            const lines = String(text || '').split(/\r?\n/);
            const items = [];
            let i = 0;
            while (i < lines.length) {
                const id = lines[i].trim();
                if (!id || id.startsWith('###')) { i++; continue; }
                const desc = (i + 1 < lines.length) ? lines[i + 1].trim() : '';
                const isCandidate = /^(sysdefault|plughw|hw|default|dmix|surround)/i.test(id);
                if (isCandidate) {
                    // Friendly label example: "Headphones (plughw:1,0)"
                    const label = `${desc || id} (${id})`;
                    items.push({ id, name: desc || id, description: label });
                }
                i += 2;
            }
            return items;
        }

        // Try aplay -L first
        let logical = [];
        try {
            const { stdout } = await pexec('aplay -L');
            logical = parseAplayLLogical(stdout);
        } catch (_) { /* ignore */ }

        // Fallback to aplay -l
        let physical = [];
        try {
            const { stdout } = await pexec('aplay -l');
            physical = parseAplayLList(stdout);
        } catch (_) { /* ignore */ }

        // De-dup by id, prefer logical
        const map = {};
        logical.concat(physical).forEach((it) => { if (it && it.id && !map[it.id]) map[it.id] = it; });
        const outputs = Object.keys(map).map((k) => map[k]);
        res.json({ success: true, outputs });
    } catch (error) {
        console.error('Error enumerating audio outputs:', error.message || error);
        res.json({ success: true, outputs: [] });
    }
});

// Enumerate ALSA inputs (microphones)
router.get('/api/inputs', async (req, res) => {
    try {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const pexec = promisify(exec);

        function parseArecordLList(text) {
            // Parse `arecord -l` into [{ id, name, description }]
            const lines = String(text || '').split(/\r?\n/);
            const items = [];
            let currentCard = null;
            lines.forEach((ln) => {
                let m;
                m = ln.match(/^card\s+(\d+)\s*:\s*([^\s,]+)\s*\[(.+?)\]/i);
                if (m) { currentCard = { num: m[1], short: m[2], name: m[3] }; return; }
                m = ln.match(/^\s*Subdevice\s+/i); if (m) return;
                m = ln.match(/^\s*Device\s+(\d+)\s*:\s*(.+)$/i);
                if (m && currentCard) {
                    const devNum = m[1];
                    const desc = m[2].trim();
                    const id = `hw:${currentCard.num},${devNum}`;
                    const label = `${currentCard.name} (plughw:${currentCard.num},${devNum})`;
                    items.push({ id, name: currentCard.name, description: label });
                }
            });
            return items;
        }

        function parseArecordLLogical(text) {
            // Parse `arecord -L` logical devices; prefer sysdefault, plughw, hw entries
            const lines = String(text || '').split(/\r?\n/);
            const items = [];
            let i = 0;
            while (i < lines.length) {
                const id = lines[i].trim();
                if (!id || id.startsWith('###')) { i++; continue; }
                const desc = (i + 1 < lines.length) ? lines[i + 1].trim() : '';
                const isCandidate = /^(sysdefault|plughw|hw|default|dsnoop)/i.test(id);
                if (isCandidate) {
                    const label = `${desc || id} (${id})`;
                    items.push({ id, name: desc || id, description: label });
                }
                i += 2;
            }
            return items;
        }

        let logical = [];
        try { const { stdout } = await pexec('arecord -L'); logical = parseArecordLLogical(stdout); } catch (_) { }
        let physical = [];
        try { const { stdout } = await pexec('arecord -l'); physical = parseArecordLList(stdout); } catch (_) { }
        const map = {};
        logical.concat(physical).forEach((it) => { if (it && it.id && !map[it.id]) map[it.id] = it; });
        const inputs = Object.keys(map).map((k) => map[k]);
        res.json({ success: true, inputs });
    } catch (error) {
        console.error('Error enumerating audio inputs:', error.message || error);
        res.json({ success: true, inputs: [] });
    }
});

// Quick input level test without saving a Part
router.get('/api/input-level', async (req, res) => {
    try {
        const device = String(req.query.device || 'default');
        const out = await runWrapper('microphone_cli.py', ['get_level', device, '16000', '1', '0.5']);
        let parsed = null; try { parsed = JSON.parse(out); } catch (_) { }
        if (!parsed || parsed.status !== 'success') return res.json({ success: false, error: parsed && parsed.message });
        res.json({ success: true, device, level: parsed.level, message: parsed.message });
    } catch (error) {
        res.json({ success: false, error: String(error.message || error) });
    }
});


export default router;
