// File: /services/partService.js

const fs = require('fs').promises;
const path = require('path');

const dataPath = path.join(__dirname, '../data/parts.json');

const getAllParts = async () => {
    try {
        const data = await fs.readFile(dataPath, 'utf8');
        console.log('Raw parts data:', data);
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('Parts file not found, returning empty array');
            return [];
        }
        throw error;
    }
};

const getPartById = async (id) => {
    console.log('Getting part by ID:', id, 'Type:', typeof id);
    if (id === undefined || id === null) {
        throw new Error('Part ID is required');
    }
    const parts = await getAllParts();
    const part = parts.find(part => part.id === parseInt(id, 10));
    if (!part) {
        console.log(`Part not found with id: ${id}`);
        throw new Error(`Part not found with id: ${id}`);
    }
    console.log('Found part:', part);
    return part;
};

const createPart = async (partData) => {
    console.log('Creating new part with data:', partData);
    const parts = await getAllParts();
    const newPart = {
        id: parts.length > 0 ? Math.max(...parts.map(p => p.id)) + 1 : 1,
        ...partData
    };
    parts.push(newPart);
    await fs.writeFile(dataPath, JSON.stringify(parts, null, 2));
    console.log('Created new part:', newPart);
    return newPart;
};

const updatePart = async (id, partData) => {
    console.log('Updating part - ID:', id, 'Type:', typeof id);
    console.log('Updating part - Data:', partData);
    const parts = await getAllParts();
    console.log('All parts:', parts);
    const index = parts.findIndex(part => {
        console.log('Comparing:', part.id, id, part.id === parseInt(id, 10));
        return part.id === parseInt(id, 10);
    });
    console.log('Found part index:', index);
    if (index === -1) {
        console.log(`Part not found with id: ${id}`);
        throw new Error(`Part not found with id: ${id}`);
    }
    parts[index] = { ...parts[index], ...partData, id: parseInt(id, 10) };
    await fs.writeFile(dataPath, JSON.stringify(parts, null, 2));
    console.log('Updated part:', parts[index]);
    return parts[index];
};

const deletePart = async (id) => {
    console.log(`Attempting to delete part with ID: ${id}`);
    const parts = await getAllParts();
    const filteredParts = parts.filter(part => part.id !== parseInt(id, 10));
    if (filteredParts.length === parts.length) {
        console.log(`Part not found with id: ${id}`);
        throw new Error(`Part not found with id: ${id}`);
    }
    await fs.writeFile(dataPath, JSON.stringify(filteredParts, null, 2));
    console.log(`Part with ID ${id} deleted successfully`);
};

module.exports = {
    getAllParts,
    getPartById,
    createPart,
    updatePart,
    deletePart
};