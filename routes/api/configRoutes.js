/**
 * Configuration API Routes
 * Handles system configuration updates
 */

import express from 'express';
import * as configService from '../../services/configService.js';
import os from 'os';

const router = express.Router();

/**
 * POST /api/config/theme - Update application theme
 */
router.post('/theme', express.json(), async (req, res) => {
    try {
        const { theme } = req.body;
        
        if (!theme || !['dark', 'light'].includes(theme)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid theme. Must be "dark" or "light"'
            });
        }
        
        // Read current config
        const config = await configService.readConfig();
        
        // Update theme
        config.theme = theme;
        
        // Write back to file
        const fs = await import('fs/promises');
        const path = await import('path');
        const { fileURLToPath } = await import('url');
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const CONFIG_FILE = path.resolve(__dirname, '../../config/app-config.json');
        
        await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
        
        // Update app.locals if available
        if (req.app && req.app.locals) {
            req.app.locals.config = config;
        }
        
        res.json({
            success: true,
            theme: theme,
            message: 'Theme updated successfully'
        });
    } catch (error) {
        console.error('Error updating theme:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update theme',
            message: error.message
        });
    }
});

/**
 * GET /api/config - Get current configuration
 */
router.get('/', async (req, res) => {
    try {
        const config = await configService.readConfig();
        res.json({
            success: true,
            config: config
        });
    } catch (error) {
        console.error('Error reading config:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to read configuration',
            message: error.message
        });
    }
});

export default router;

