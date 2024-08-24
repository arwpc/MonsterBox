const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');

const dataPath = path.join(__dirname, '../data/parts.json');
const charactersPath = path.join(__dirname, '../data/characters.json');

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

const getAllCharacters = async () => {
    try {
        const data = await fs.readFile(charactersPath, 'utf8');
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

const createPart = async (partData) => {
    const parts = await getAllParts();
    const newPart = {
        id: parts.length > 0 ? Math.max(...parts.map(p => p.id)) + 1 : 1,
        name: partData.name,
        type: partData.type,
        characterId: parseInt(partData.characterId)
    };

    if (newPart.type === 'motor') {
        newPart.directionPin = parseInt(partData.directionPin);
        newPart.pwmPin = parseInt(partData.pwmPin);
    } else if (['light', 'led', 'servo'].includes(newPart.type)) {
        newPart.pin = parseInt(partData.pin);
    } else if (newPart.type === 'sensor') {
        newPart.pin = parseInt(partData.pin);
        newPart.sensorType = partData.sensorType;
    }

    parts.push(newPart);
    await fs.writeFile(dataPath, JSON.stringify(parts, null, 2));
    return newPart;
};

const updatePart = async (id, partData) => {
    const parts = await getAllParts();
    const index = parts.findIndex(part => part.id === parseInt(id));
    if (index !== -1) {
        const updatedPart = {
            ...parts[index],
            name: partData.name,
            type: partData.type,
            characterId: parseInt(partData.characterId)
        };

        if (updatedPart.type === 'motor') {
            updatedPart.directionPin = parseInt(partData.directionPin);
            updatedPart.pwmPin = parseInt(partData.pwmPin);
            delete updatedPart.pin;
            delete updatedPart.sensorType;
        } else if (['light', 'led', 'servo'].includes(updatedPart.type)) {
            updatedPart.pin = parseInt(partData.pin);
            delete updatedPart.directionPin;
            delete updatedPart.pwmPin;
            delete updatedPart.sensorType;
        } else if (updatedPart.type === 'sensor') {
            updatedPart.pin = parseInt(partData.pin);
            updatedPart.sensorType = partData.sensorType;
            delete updatedPart.directionPin;
            delete updatedPart.pwmPin;
        }

        parts[index] = updatedPart;
        await fs.writeFile(dataPath, JSON.stringify(parts, null, 2));
        return updatedPart;
    }
    throw new Error('Part not found');
};

const deletePart = async (id) => {
    const parts = await getAllParts();
    const filteredParts = parts.filter(part => part.id !== parseInt(id));
    await fs.writeFile(dataPath, JSON.stringify(filteredParts, null, 2));
};

const testMotor = async (partId, direction, speed, duration) => {
    const part = await getPartById(partId);
    if (!part || part.type !== 'motor') {
        throw new Error('Invalid motor part');
    }
    
    return new Promise((resolve, reject) => {
        const scriptPath = path.join(__dirname, '../scripts/motor_control.py');
        const command = `sudo python3 ${scriptPath} ${part.directionPin} ${part.pwmPin} ${direction} ${speed} ${duration}`;
        
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error executing motor control: ${error}`);
                reject(error);
            } else {
                console.log(`Motor control output: ${stdout}`);
                resolve(stdout);
            }
        });
    });
};

const testLight = async (partId, state, duration) => {
    const part = await getPartById(partId);
    if (!part || part.type !== 'light') {
        throw new Error('Invalid light part');
    }
    
    return new Promise((resolve, reject) => {
        const scriptPath = path.join(__dirname, '../scripts/light_control.py');
        const command = `sudo python3 ${scriptPath} ${part.pin} ${state} ${duration}`;
        
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error executing light control: ${error}`);
                reject(error);
            } else {
                console.log(`Light control output: ${stdout}`);
                resolve(stdout);
            }
        });
    });
};

const testLED = async (partId, brightness, duration) => {
    const part = await getPartById(partId);
    if (!part || part.type !== 'led') {
        throw new Error('Invalid LED part');
    }
    
    return new Promise((resolve, reject) => {
        const scriptPath = path.join(__dirname, '../scripts/led_control.py');
        const command = `sudo python3 ${scriptPath} ${part.pin} ${brightness} ${duration}`;
        
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error executing LED control: ${error}`);
                reject(error);
            } else {
                console.log(`LED control output: ${stdout}`);
                resolve(stdout);
            }
        });
    });
};

const testServo = async (partId, angle, speed, duration) => {
    const part = await getPartById(partId);
    if (!part || part.type !== 'servo') {
        throw new Error('Invalid servo part');
    }
    
    return new Promise((resolve, reject) => {
        const scriptPath = path.join(__dirname, '../scripts/servo_control.py');
        const command = `sudo python3 ${scriptPath} ${part.pin} ${angle} ${speed} ${duration}`;
        
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error executing servo control: ${error}`);
                reject(error);
            } else {
                console.log(`Servo control output: ${stdout}`);
                resolve(stdout);
            }
        });
    });
};

module.exports = {
    getAllParts,
    getAllCharacters,
    getPartById,
    createPart,
    updatePart,
    deletePart,
    testMotor,
    testLight,
    testLED,
    testServo
};