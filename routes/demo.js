import express from 'express';
import { readConfig, updateSelectedCharacter } from '../services/configService.js';
import { loadParts as loadPartsFromController, saveParts as savePartsFromController } from '../controllers/partsController.js';

const router = express.Router();

// Simple kid-friendly demo page that reuses Conversation APIs
router.get('/', (req, res) => {
  res.render('demo/index', {
    title: 'Animatronic Demo',
    page: 'demo'
  });
});

// POST /demo/api/apply-preset
// Ensures a Demo character is selected and minimal parts exist: one webcam and one pan servo
router.post('/api/apply-preset', express.json(), async (req, res) => {
  try {
    const cfg = await readConfig();
    let selectedId = cfg.selectedCharacter;

    // If no selected character, default to 1 for simplicity
    if (!selectedId) {
      selectedId = 1;
      await updateSelectedCharacter(selectedId);
    }

    const parts = await loadPartsFromController();
    let changed = false;

    // Ensure at least one webcam assigned to selected character
    const hasWebcam = parts.some(p => String(p.type) === 'webcam' && Number(p.characterId) === Number(selectedId));
    if (!hasWebcam) {
      parts.push({
        id: String(Math.max(0, ...parts.map(p => parseInt(p.id) || 0)) + 1),
        name: 'Demo Webcam',
        type: 'webcam',
        pin: null,
        description: 'video capture devices',
        config: { resolution: '640x480' },
        created: new Date().toISOString(),
        enabled: true,
        characterId: Number(selectedId)
      });
      changed = true;
    }

    // Ensure at least one servo that looks like a head pan
    const hasPan = parts.some(p => String(p.type) === 'servo' && /pan|head|swivel/i.test(String(p.name || '')) && Number(p.characterId) === Number(selectedId));
    if (!hasPan) {
      parts.push({
        id: String(Math.max(0, ...parts.map(p => parseInt(p.id) || 0)) + 1),
        name: 'Head Pan',
        type: 'servo',
        pin: 18,
        description: 'precise angle control: standard, continuous, feedback',
        config: { servoType: 'standard', minPulse: 500, maxPulse: 2500, minAngle: 0, maxAngle: 180 },
        created: new Date().toISOString(),
        enabled: true,
        characterId: Number(selectedId)
      });
      changed = true;
    }

    if (changed) {
      await savePartsFromController(parts);
    }

    res.json({ success: true, selectedCharacter: selectedId, changed });
  } catch (e) {
    console.error('apply-preset error:', e);
    res.status(500).json({ success: false, error: e && e.message });
  }
});

export default router;
