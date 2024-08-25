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
    const parts = await getAllParts();
    const part = parts.find(part => part.id === parseInt(id));
    if (!part) {
        throw new Error(`Part not found with id: ${id}`);
    }
    return part;
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
        parts[index] = {
            ...parts[index],
            ...partData,
            id: parseInt(id)
        };
        await fs.writeFile(dataPath, JSON.stringify(parts, null, 2));
        return parts[index];
    }
    throw new Error(`Part not found with id: ${id}`);
};

const deletePart = async (id) => {
    const parts = await getAllParts();
    const filteredParts = parts.filter(part => part.id !== parseInt(id));
    if (filteredParts.length === parts.length) {
        throw new Error(`Part not found with id: ${id}`);
    }
    await fs.writeFile(dataPath, JSON.stringify(filteredParts, null, 2));
};

const testMotor = async (partId, direction, speed, duration) => {
    const part = await getPartById(partId);
    if (part.type !== 'motor') {
        throw new Error('Invalid motor part');
    }

    const scriptPath = path.join(__dirname, '..', 'scripts', 'motor_control.py');
    return new Promise((resolve, reject) => {
        const process = spawn('python3', [
            scriptPath,
            direction,
            speed.toString(),
            duration.toString(),
            part.directionPin.toString(),
            part.pwmPin.toString()
        ]);
        
        let stdout = '';
        let stderr = '';

        process.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        process.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        process.on('close', (code) => {
            if (code === 0) {
                resolve({ success: true, message: 'Motor test completed', output: stdout });
            } else {
                reject(new Error(`Motor test failed with code ${code}: ${stderr}`));
            }
        });
    });
};

const testLight = async (partId, brightness) => {
    const part = await getPartById(partId);
    if (part.type !== 'light' && part.type !== 'led') {
        throw new Error('Invalid light/LED part');
    }

    const scriptPath = path.join(__dirname, '..', 'scripts', 'light_control.py');
    return new Promise((resolve, reject) => {
        const process = spawn('python3', [
            scriptPath,
            part.gpioPin.toString(),
            brightness.toString(),
            '5000'  // 5 seconds total duration
        ]);
        
        let stdout = '';
        let stderr = '';

        process.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        process.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        process.on('close', (code) => {
            if (code === 0) {
                resolve({ success: true, message: 'Light/LED test completed', output: stdout });
            } else {
                reject(new Error(`Light/LED test failed with code ${code}: ${stderr}`));
            }
        });
    });
};

const testServo = async (partId, angle, duration) => {
    const part = await getPartById(partId);
    if (part.type !== 'servo') {
        throw new Error('Invalid servo part');
    }

    const scriptPath = path.join(__dirname, '..', 'scripts', 'servo_control.py');
    return new Promise((resolve, reject) => {
        const process = spawn('python3', [
            scriptPath,
            part.gpioPin.toString(),
            angle.toString(),
            part.pwmFrequency.toString(),
            part.dutyCycle.toString(),
            duration.toString()
        ]);
        
        let stdout = '';
        let stderr = '';

        process.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        process.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        process.on('close', (code) => {
            if (code === 0) {
                resolve({ success: true, message: 'Servo test completed', output: stdout });
            } else {
                reject(new Error(`Servo test failed with code ${code}: ${stderr}`));
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
    testMotor,
    testLight,
    testServo
};
