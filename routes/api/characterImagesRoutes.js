import express from 'express';
import multer from 'multer';
import { listImages, saveImage, deleteImage, setActiveImage } from '../../services/characterImageService.js';

const router = express.Router({ mergeParams: true });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function parseId(v) { const n = parseInt(v, 10); return isNaN(n) ? null : n; }

// GET /api/characters/:id/images
router.get('/characters/:id/images', async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ success: false, error: 'Invalid id' });
  try {
    const data = await listImages(id);
    res.json({ success: true, images: data.images, active: data.active });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/characters/:id/images/upload (multipart field: image)
router.post('/characters/:id/images/upload', upload.single('image'), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ success: false, error: 'Invalid id' });
  if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
  try {
    const saved = await saveImage(id, req.file.originalname, req.file.buffer);
    res.status(201).json({ success: true, image: saved });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/characters/:id/images/active { filename }
router.post('/characters/:id/images/active', async (req, res) => {
  const id = parseId(req.params.id);
  const filename = req.body && req.body.filename ? String(req.body.filename) : null;
  if (id === null) return res.status(400).json({ success: false, error: 'Invalid id' });
  if (!filename) return res.status(400).json({ success: false, error: 'filename is required' });
  try {
    const result = await setActiveImage(id, filename);
    res.json({ success: true, active: result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// DELETE /api/characters/:id/images/:filename
router.delete('/characters/:id/images/:filename', async (req, res) => {
  const id = parseId(req.params.id);
  const filename = req.params.filename;
  if (id === null) return res.status(400).json({ success: false, error: 'Invalid id' });
  if (!filename) return res.status(400).json({ success: false, error: 'filename is required' });
  try {
    await deleteImage(id, filename);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;

