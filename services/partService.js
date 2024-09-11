// File: services/partService.js

const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');

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
    parts.push(newPart);
    await fs.writeFile(dataPath, JSON.stringify(parts, null, 2));
    return newPart;
};

const updatePart = async (id, partData) => {
    const parts = await getAllParts();
    const index = parts.findIndex(part => part.id === parseInt(id));
    if (index === -1) {
        throw new Error(`Part not found with id: ${id}`);
    }
    parts[index] = { ...parts[index], ...partData, id: parseInt(id) };
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

const testPart = async (partData) => {
    console.log('Testing part with data:', partData);
    const { type, direction, speed, duration, directionPin, pwmPin } = partData;
    let scriptPath;

    switch (type) {
        case 'motor':
            scriptPath = path.join(__dirname, '..', 'scripts', 'motor_control.py');
            break;
        case 'linear-actuator':
            scriptPath = path.join(__dirname, '..', 'scripts', 'linear_actuator_control.py');
            break;
        // Add cases for other part types as needed
        default:
            throw new Error(`Unsupported part type: ${type}`);
    }

    return new Promise((resolve, reject) => {
        const process = spawn('python3', [
            scriptPath,
            direction,
            speed.toString(),
            duration.toString(),
            directionPin.toString(),
            pwmPin.toString()
        ], { stdio: 'pipe' });

        let stdout = '';
        let stderr = '';

        process.stdout.on('data', (data) => {
            stdout += data.toString();
            console.log(`Python script output: ${data}`);
        });

        process.stderr.on('data', (data) => {
            stderr += data.toString();
            console.error(`Python script error: ${data}`);
        });

        process.on('close', (code) => {
            console.log(`Python script exited with code ${code}`);
            if (code === 0) {
                resolve({ success: true, message: `${type} test completed`, output: stdout });
            } else {
                reject(new Error(`${type} test failed with code ${code}: ${stderr}`));
            }
        });
    });
};

module.exports = {
    getAllParts,
    getPartById,
    createPart,
    updatePart,
    deletePart,
    testPart
};
