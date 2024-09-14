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
    console.log('Getting part by ID:', id);
    if (!id) {
        throw new Error('Part ID is required');
    }
    const parts = await getAllParts();
    const part = parts.find(part => part.id === parseInt(id));
    if (!part) {
        throw new Error(`Part not found with id: ${id}`);
    }
    return part;
};

const createPart = async (partData) => {
    const parts = await getAllParts();
    const newPart = {
        id: parts.length > 0 ? Math.max(...parts.map(p => p.id)) + 1 : 1,
        ...partData
    };
    
    if (newPart.type === 'servo') {
        newPart.servoType = partData.servoType;
        newPart.channel = partData.channel;
        newPart.minPulse = partData.minPulse;
        newPart.maxPulse = partData.maxPulse;
        newPart.defaultAngle = partData.defaultAngle;
    }
    
    parts.push(newPart);
    await fs.writeFile(dataPath, JSON.stringify(parts, null, 2));
    return newPart;
};

const updatePart = async (id, partData) => {
    console.log('Updating part - ID:', id);
    console.log('Updating part - Data:', partData);
    const parts = await getAllParts();
    const index = parts.findIndex(part => part.id === parseInt(id));
    console.log('Found part index:', index);
    if (index === -1) {
        throw new Error(`Part not found with id: ${id}`);
    }
    parts[index] = { ...parts[index], ...partData, id: parseInt(id) };
    
    if (parts[index].type === 'servo') {
        parts[index].servoType = partData.servoType;
        parts[index].channel = partData.channel;
        parts[index].minPulse = partData.minPulse;
        parts[index].maxPulse = partData.maxPulse;
        parts[index].defaultAngle = partData.defaultAngle;
    }
    
    await fs.writeFile(dataPath, JSON.stringify(parts, null, 2));
    return parts[index];
};

const deletePart = async (id) => {
    const parts = await getAllParts();
    const filteredParts = parts.filter(part => part.id !== parseInt(id));
    if (filteredParts.length === parts.length) {
        throw new Error(`Part not found with id: ${id}`);
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