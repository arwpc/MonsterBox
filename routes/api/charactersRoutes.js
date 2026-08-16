/**
 * Character API alias — /api/characters
 *
 * The fleet character list has always lived under the setup router at
 * `/setup/characters/api/characters`. `/api/characters` — the path every client
 * author reaches for first — matched nothing, so it fell through to the HTML 404
 * page. A client that did not check `content-type` got a JSON parse error deep in
 * its own code instead of a clear "no such endpoint", which is a materially worse
 * failure than a 404: it points at the wrong file.
 *
 * These handlers are the SAME controller functions the setup router mounts, not a
 * reimplementation, so the two paths cannot drift apart. `/api/characters/:id/images`
 * is unaffected: it is one segment deeper and falls through to characterImagesRoutes.
 *
 * Character context: these endpoints address a character by explicit id (or list
 * them all), so there is nothing here to resolve — no `selectedCharacter` read.
 */

import express from 'express';
import charactersController from '../../controllers/charactersController.js';

const router = express.Router();

router.get('/', charactersController.getAll);
router.post('/', express.json(), charactersController.create);

// `/:id` cannot swallow `/:id/images` — Express matches a single segment — so the
// image routes mounted later at /api still receive their requests.
router.get('/:id', charactersController.getOne);
router.put('/:id', express.json(), charactersController.update);
router.delete('/:id', charactersController.remove);

export default router;
