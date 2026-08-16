#!/usr/bin/env node
/**
 * Disaster recovery: re-import a character's parts from its per-character parts
 * file into the legacy global data/parts.json, skipping anything already present.
 *
 * Usage:
 *   node scripts/restore_parts.js                  # this node's character
 *   node scripts/restore_parts.js --character 2    # any character in the registry
 */

import fs from 'fs/promises';
import path from 'path';
import { REPO_ROOT, resolveCharacterTarget } from './lib/character-target.mjs';

const DATA_DIR = path.join(REPO_ROOT, 'data');
const PARTS_FILE = path.join(DATA_DIR, 'parts.json');

async function restoreParts() {
    try {
        const target = await resolveCharacterTarget();
        const characterId = target.characterId;
        const sourceFile = path.join(DATA_DIR, `character-${characterId}`, 'parts.json');

        console.log(`Restoring parts for ${target.name} (id ${characterId}, resolved from ${target.source})`);
        console.log('Reading files...');
        const partsRaw = await fs.readFile(PARTS_FILE, 'utf8');
        const sourceRaw = await fs.readFile(sourceFile, 'utf8');

        let currentParts = JSON.parse(partsRaw);
        const sourceParts = JSON.parse(sourceRaw);

        console.log(`Current parts count: ${currentParts.length}`);
        console.log(`${target.name} parts found: ${sourceParts.length}`);

        // Find max ID
        let maxId = currentParts.reduce((max, p) => Math.max(max, parseInt(p.id) || 0), 0);
        console.log(`Max ID: ${maxId}`);

        // Process the character's parts
        let addedCount = 0;
        for (const part of sourceParts) {
            // Check if part already exists (by name and characterId) - preventing dupes
            const exists = currentParts.find(p => String(p.characterId) === String(characterId) && p.name === part.name);
            if (exists) {
                console.log(`Skipping ${part.name} (already exists)`);
                continue;
            }

            maxId++;
            const newPart = {
                ...part,
                id: String(maxId),
                characterId
            };

            // Fix config type mismatches if any
            if (newPart.type === 'linear_actuator') {
                 // Ensure maxRetraction is safe
                 if (!newPart.config) newPart.config = {};
                 // Ensure fields match what we observed in testing
                 // Python script needs integers. The data has 15000.
            }

            currentParts.push(newPart);
            console.log(`Adding ${newPart.name} as ID ${newPart.id}`);
            addedCount++;
        }

        if (addedCount > 0) {
            console.log(`Saving ${currentParts.length} parts to ${PARTS_FILE}`);
            await fs.writeFile(PARTS_FILE, JSON.stringify(currentParts, null, 2));
            console.log('Success!');
        } else {
            console.log('No new parts to add.');
        }

    } catch (err) {
        console.error('Error:', err);
    }
}

restoreParts();
