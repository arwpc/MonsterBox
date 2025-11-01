/**
 * Parts Controller - Minimal implementation for parts.json operations
 * Used by calibration, conversation, and other routes
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { readConfig } from '../services/configService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function getDataDir() {
    const cfg = await readConfig();
    const appRoot = path.resolve(__dirname, '..');
    return path.resolve(appRoot, cfg && cfg.dataPath ? cfg.dataPath : 'data');
}

async function getPartsFilePath() {
    const dataDir = await getDataDir();
    return path.resolve(dataDir, 'parts.json');
}

/**
 * Load all parts from parts.json
 */
export async function loadParts() {
    try {
        const partsFile = await getPartsFilePath();
        const data = await fs.readFile(partsFile, 'utf8');
        const parts = JSON.parse(data);
        return Array.isArray(parts) ? parts : [];
    } catch (error) {
        console.error('Failed to load parts:', error.message);
        return [];
    }
}

/**
 * Save parts to parts.json
 */
export async function saveParts(parts) {
    try {
        const partsFile = await getPartsFilePath();
        await fs.writeFile(partsFile, JSON.stringify(parts, null, 2), 'utf8');
        return { success: true };
    } catch (error) {
        console.error('Failed to save parts:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Get a specific part by character ID and part ID
 */
export async function getPart(characterId, partId) {
    const parts = await loadParts();
    return parts.find(p => 
        Number(p.characterId) === Number(characterId) && 
        (String(p.id) === String(partId) || String(p.name) === String(partId))
    );
}

/**
 * Update a specific part
 */
export async function updatePart(characterId, partId, updates) {
    const parts = await loadParts();
    const index = parts.findIndex(p => 
        Number(p.characterId) === Number(characterId) && 
        (String(p.id) === String(partId) || String(p.name) === String(partId))
    );
    
    if (index === -1) {
        throw new Error(`Part not found: characterId=${characterId}, partId=${partId}`);
    }
    
    parts[index] = { ...parts[index], ...updates };
    await saveParts(parts);
    return parts[index];
}

/**
 * Create a new part
 */
export async function createPart(part) {
    const parts = await loadParts();
    
    // Generate new ID
    const maxId = parts.reduce((max, p) => Math.max(max, parseInt(p.id) || 0), 0);
    const newPart = {
        ...part,
        id: String(maxId + 1)
    };
    
    parts.push(newPart);
    await saveParts(parts);
    return newPart;
}

/**
 * Delete a part
 */
export async function deletePart(characterId, partId) {
    const parts = await loadParts();
    const filtered = parts.filter(p => 
        !(Number(p.characterId) === Number(characterId) && 
          (String(p.id) === String(partId) || String(p.name) === String(partId)))
    );
    
    if (filtered.length === parts.length) {
        throw new Error(`Part not found: characterId=${characterId}, partId=${partId}`);
    }
    
    await saveParts(filtered);
    return { success: true };
}
