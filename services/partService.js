const fs = require('fs').promises;
const path = require('path');

const dataPath = path.join(__dirname, '../data/parts.json');

const getAllParts = async () => {
    try {
        const data = await fs.readFile(dataPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return [];
        }
        throw error;
    }
};

const getPartById = async (id) => {
    const parts = await getAllParts();
    return parts.find(part => part.id === parseInt(id));
};

const getNextId = (parts) => {
    return parts.length > 0 ? Math.max(...parts.map(p => p.id)) + 1 : 1;
};

const createPart = async (partData) => {
    const parts = await getAllParts();
    const newPart = {
        id: getNextId(parts),
        ...partData
    };
    parts.push(newPart);
    await fs.writeFile(dataPath, JSON.stringify(parts, null, 2));
    return newPart;
};

const updatePart = async (id, partData) => {
    const parts = await getAllParts();
    const index = parts.findIndex(part => part.id === parseInt(id));
    if (index !== -1) {
        parts[index] = { ...parts[index], ...partData, id: parseInt(id) };
        await fs.writeFile(dataPath, JSON.stringify(parts, null, 2));
        return parts[index];
    }
    throw new Error('Part not found');
};

const deletePart = async (id) => {
    const parts = await getAllParts();
    const filteredParts = parts.filter(part => part.id !== parseInt(id));
    if (filteredParts.length === parts.length) {
        throw new Error('Part not found');
    }
    await fs.writeFile(dataPath, JSON.stringify(filteredParts, null, 2));
};

module.exports = {
    getAllParts,
    getPartById,
    createPart,
    updatePart,
    deletePart
};
