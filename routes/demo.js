import express from 'express';

const router = express.Router();

// Simple kid-friendly demo page that reuses Conversation APIs
router.get('/', (req, res) => {
  res.render('demo/index', {
    title: 'Animatronic Demo',
    page: 'demo'
  });
});

export default router;

