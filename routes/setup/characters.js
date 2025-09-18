/**
 * Setup Characters Routes
 */

import express from 'express';
import charactersController from '../../controllers/charactersController.js';

const router = express.Router();

// Characters setup page
router.get('/', async function (req, res) {
  try {
    res.render('setup/characters', {
      title: 'Setup Characters - MonsterBox 4.0',
      page: 'setup-characters',
      config: { theme: 'dark' },
      currentCharacter: null
    });
  } catch (err) {
    console.error('Error rendering characters page:', err);
    res.status(500).render('error', {
      title: 'Error',
      error: 'Failed to load characters setup page',
      message: err.message
    });
  }
});

// API
router.get('/api/characters', charactersController.getAll);
router.get('/api/characters/:id', charactersController.getOne);
router.post('/api/characters', charactersController.create);
router.put('/api/characters/:id', charactersController.update);
router.delete('/api/characters/:id', charactersController.remove);
router.get('/api/current', charactersController.getCurrent);
router.post('/api/select', charactersController.setSelected);

// Character-Agent Assignments API
router.get('/api/character-assignments', charactersController.getAssignments);
router.post('/api/character-assignments', charactersController.updateAssignment);

export default router;

