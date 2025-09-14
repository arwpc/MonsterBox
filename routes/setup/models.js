/**
 * Setup Models Routes (generic across part types)
 */

import express from 'express';
import modelsController from '../../controllers/modelsController.js';

const router = express.Router();

// Page
router.get('/', (req, res) => {
    res.render('setup/models', { title: 'Models' });
});

// API
router.get('/api/:type', modelsController.getAllModels);
router.get('/api/:type/:id', modelsController.getModelById);
router.post('/api/:type', express.json(), modelsController.createModel);
router.put('/api/:type/:id', express.json(), modelsController.updateModel);
router.delete('/api/:type/:id', modelsController.deleteModel);

export default router;

