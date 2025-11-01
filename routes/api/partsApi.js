/**
 * Parts API - Unified endpoint for hardware part testing
 * Used by calibration page for servo testing
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import hardwareService from '../../services/hardwareService/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = express.Router();

const PARTS_FILE = path.join(__dirname, '../../data/parts.json');

/**
 * Get all parts
 */
router.get('/parts', (req, res) => {
    try {
        const parts = JSON.parse(fs.readFileSync(PARTS_FILE, 'utf8'));
        res.json(parts);
    } catch (error) {
        console.error('Error reading parts:', error);
        res.status(500).json({ error: 'Failed to read parts' });
    }
});

/**
 * Get single part by ID
 */
router.get('/parts/:id', (req, res) => {
    try {
        const parts = JSON.parse(fs.readFileSync(PARTS_FILE, 'utf8'));
        const part = parts.find(p => p.id === req.params.id);
        
        if (!part) {
            return res.status(404).json({ error: 'Part not found' });
        }
        
        res.json(part);
    } catch (error) {
        console.error('Error reading part:', error);
        res.status(500).json({ error: 'Failed to read part' });
    }
});

/**
 * Test a part (move servo to position)
 */
router.post('/parts/:id/test', async (req, res) => {
    try {
        const parts = JSON.parse(fs.readFileSync(PARTS_FILE, 'utf8'));
        const part = parts.find(p => p.id === req.params.id);
        
        if (!part) {
            return res.status(404).json({ error: 'Part not found' });
        }

        const { position = 50, duration = 1000 } = req.body;

        console.log(`🧪 Testing part ${part.id} (${part.name}): GPIO ${part.gpio}, Position ${position}`);

        // Execute servo movement
        await hardwareService.exec('move_servo', {
            gpio: part.gpio,
            position: parseInt(position),
            duration: parseInt(duration)
        });

        res.json({ 
            success: true, 
            message: `Part ${part.name} tested at position ${position}`,
            part: part
        });
    } catch (error) {
        console.error('Error testing part:', error);
        res.status(500).json({ error: 'Failed to test part', message: error.message });
    }
});

/**
 * Update part configuration
 */
router.put('/parts/:id', (req, res) => {
    try {
        const parts = JSON.parse(fs.readFileSync(PARTS_FILE, 'utf8'));
        const index = parts.findIndex(p => p.id === req.params.id);
        
        if (index === -1) {
            return res.status(404).json({ error: 'Part not found' });
        }

        // Update part with new data
        parts[index] = { ...parts[index], ...req.body, id: req.params.id };
        
        fs.writeFileSync(PARTS_FILE, JSON.stringify(parts, null, 2));
        
        res.json({ success: true, part: parts[index] });
    } catch (error) {
        console.error('Error updating part:', error);
        res.status(500).json({ error: 'Failed to update part' });
    }
});

export default router;
