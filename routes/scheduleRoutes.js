/**
 * Scheduled Events — page + JSON API.
 *
 * The page exists so the operator never has to hand-edit a crontab over SSH,
 * and — more importantly — so scheduling state stops being invisible. Every
 * response carries a computed, plain-language "next run" because an entry that
 * looks installed and correct but is 76 days away is exactly the failure this
 * feature was built to make impossible to miss.
 *
 * Character scope: only the "play a scene" action is character-scoped, and it
 * resolves through resolveCharacter(req) like everything else in the codebase.
 * The schedule itself is fleet-level — cron is one per node, not per character.
 */

import express from 'express';
import fs from 'node:fs';
import path from 'node:path';

import scheduleService from '../services/scheduleService.js';
import { resolveCharacter } from '../services/characterContext.js';

export const pageRouter = express.Router();
export const apiRouter = express.Router();

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

pageRouter.get('/', (req, res) => {
    res.renderWithLayout('schedule/index', {
        title: 'Scheduled Events - MonsterBox',
        page: 'schedule',
        scripts: ['/js/schedule.js']
    });
});

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */

function fail(res, error, status = 400) {
    console.error('[schedule]', error.message);
    res.status(status).json({ success: false, error: error.message });
}

/** List every managed event with its computed next-fire time. */
apiRouter.get('/', async (req, res) => {
    try {
        const result = await scheduleService.listEvents();
        res.json({ success: true, ...result, now: new Date().toISOString() });
    } catch (error) {
        fail(res, error, 500);
    }
});

/**
 * Everything the form needs to offer real choices instead of a bare shell box:
 * the yard-theater moments, and the current character's scenes.
 */
apiRouter.get('/options', async (req, res) => {
    try {
        const character = await resolveCharacter(req);
        let scenes = [];
        if (character) {
            const scenesFile = path.join(scheduleService.REPO_ROOT, character.dataDir, 'scenes.json');
            try {
                const parsed = JSON.parse(fs.readFileSync(scenesFile, 'utf8'));
                const list = Array.isArray(parsed) ? parsed : (parsed.scenes || []);
                scenes = list.map((scene) => ({ id: scene.id, name: scene.scene_name || scene.name || `Scene ${scene.id}` }));
            } catch (error) {
                // No scenes file for this character is normal, not an error.
                scenes = [];
            }
        }

        res.json({
            success: true,
            moments: scheduleService.listMoments(),
            scenes,
            character: character ? { id: character.id, name: character.name } : null,
            repoRoot: scheduleService.REPO_ROOT,
            logDir: scheduleService.LOG_DIR
        });
    } catch (error) {
        fail(res, error, 500);
    }
});

/** Preview a schedule + command without saving. Powers the live "next run". */
apiRouter.post('/preview', (req, res) => {
    try {
        res.json({ success: true, preview: scheduleService.previewEvent(req.body || {}) });
    } catch (error) {
        fail(res, error);
    }
});

apiRouter.post('/', async (req, res) => {
    try {
        const event = await scheduleService.createEvent(req.body || {});
        res.status(201).json({ success: true, event });
    } catch (error) {
        fail(res, error);
    }
});

apiRouter.put('/:id', async (req, res) => {
    try {
        const event = await scheduleService.updateEvent(req.params.id, req.body || {});
        res.json({ success: true, event });
    } catch (error) {
        fail(res, error);
    }
});

apiRouter.delete('/:id', async (req, res) => {
    try {
        const removed = await scheduleService.deleteEvent(req.params.id);
        res.json({ success: true, removed });
    } catch (error) {
        fail(res, error);
    }
});

/**
 * Enable/disable. Disabling comments the line out and keeps it editable —
 * these events move heavy hardware, so the operator must be able to silence
 * one tonight without losing the schedule he built for the season.
 */
apiRouter.post('/:id/toggle', async (req, res) => {
    try {
        const enabled = req.body && req.body.enabled !== undefined ? Boolean(req.body.enabled) : undefined;
        const event = await scheduleService.toggleEvent(req.params.id, enabled);
        res.json({ success: true, event });
    } catch (error) {
        fail(res, error);
    }
});

/**
 * Fire an event RIGHT NOW, for real. Requires an explicit confirm token so a
 * stray click cannot start a show: this moves servo-driven hardware and plays
 * loud audio outdoors, potentially near people.
 */
apiRouter.post('/:id/run-now', async (req, res) => {
    try {
        if (!req.body || req.body.confirm !== true) {
            return res.status(428).json({
                success: false,
                error: 'Run-now requires an explicit confirmation. This fires the event immediately, for real.'
            });
        }
        const started = await scheduleService.runEventNow(req.params.id);
        res.json({ success: true, started });
    } catch (error) {
        fail(res, error);
    }
});

export default pageRouter;
