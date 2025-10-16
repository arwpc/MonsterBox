/**
 * Setup Models Routes (generic across part types)
 */

import express from 'express';
import modelsController from '../../controllers/modelsController.js';

const router = express.Router();

// Page
router.get('/', (req, res) => {
    res.renderWithLayout('setup/models', {
        title: 'Setup Models - MonsterBox 5.3',
        page: 'setup-models'
    });
});

// API
router.get('/api/:type', modelsController.getAllModels);
router.get('/api/:type/:id', modelsController.getModelById);
router.post('/api/:type', express.json(), modelsController.createModel);
router.post('/api/:type/bulk-delete', express.json(), modelsController.bulkDeleteModels);
router.put('/api/:type/:id', express.json(), modelsController.updateModel);
router.delete('/api/:type/:id', modelsController.deleteModel);

export default router;

