
import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = '/home/remote/MonsterBox/data';
const PARTS_FILE = path.join(DATA_DIR, 'parts.json');
const ORLOK_PARTS_FILE = path.join(DATA_DIR, 'character-3/parts.json');

async function restoreParts() {
    try {
        console.log('Reading files...');
        const partsRaw = await fs.readFile(PARTS_FILE, 'utf8');
        const orlokRaw = await fs.readFile(ORLOK_PARTS_FILE, 'utf8');

        let currentParts = JSON.parse(partsRaw);
        const orlokParts = JSON.parse(orlokRaw);

        console.log(`Current parts count: ${currentParts.length}`);
        console.log(`Orlok parts found: ${orlokParts.length}`);

        // Find max ID
        let maxId = currentParts.reduce((max, p) => Math.max(max, parseInt(p.id) || 0), 0);
        console.log(`Max ID: ${maxId}`);

        // Process Orlok parts
        let addedCount = 0;
        for (const part of orlokParts) {
            // Check if part already exists (by name and characterId) - preventing dupes
            const exists = currentParts.find(p => p.characterId === 3 && p.name === part.name);
            if (exists) {
                console.log(`Skipping ${part.name} (already exists)`);
                continue;
            }

            maxId++;
            const newPart = {
                ...part,
                id: String(maxId),
                characterId: 3
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
