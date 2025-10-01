import express from 'express';
console.log('🔧 Loaded setup parts routes');

import partsController from '../../controllers/partsController.js';

const router = express.Router();

// Page
router.get('/', async (req, res) => {
  try {
    res.render('setup/parts', {
      title: 'Setup Parts - MonsterBox 4.0',
      page: 'setup-parts'
    });
  } catch (err) {
    console.error('Error rendering parts page:', err);
    res.status(500).render('error', { title: 'Error', error: 'Failed to load parts page', message: err.message });
  }
});

// API
router.get('/api/parts', partsController.getAllParts);
router.get('/api/parts/:id', partsController.getPartById);
router.post('/api/parts', partsController.createPart);
router.put('/api/parts/:id', partsController.updatePart);
router.delete('/api/parts/:id', partsController.deletePart);
router.post('/api/parts/:id/test', partsController.testPart);

export default router;

