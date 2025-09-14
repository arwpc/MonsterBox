const fs = require('fs').promises;
const path = require('path');
const logger = require('../scripts/logger');
const WebSocket = require('ws');

const dataPath = path.join(__dirname, '../data/parts.json');
const headTrackingDataPath = path.join(__dirname, '../data/head_tracking.json');

// Hardware WebSocket service configuration
// Using hardware port range 8400-8599 to match service management system
const HARDWARE_SERVICES = {
    servo: { port: 8405, host: 'localhost', partTypes: ['servo'] },
    motor: { port: 8404, host: 'localhost', partTypes: ['motor'] },
    light: { port: 8406, host: 'localhost', partTypes: ['light', 'led'] },
    sensor: { port: 8407, host: 'localhost', partTypes: ['sensor'] },
    actuator: { port: 8408, host: 'localhost', partTypes: ['linear-actuator'] },
    microphone: { port: 8409, host: 'localhost', partTypes: ['microphone'] },
    webcam: { port: 8410, host: 'localhost', partTypes: ['webcam'] },
    head_tracking: { port: 8411, host: 'localhost', partTypes: ['head-tracking'] }
};

/**
 * Notify hardware WebSocket service to reload configurations
 */
const notifyHardwareServiceReload = async (serviceName, serviceConfig) => {
    try {
        const ws = new WebSocket(`ws://${serviceConfig.host}:${serviceConfig.port}`);

        ws.on('open', () => {
            logger.info(`🔄 Notifying ${serviceName} service to reload configurations...`);
            const message = {
                type: 'reload_configurations',
                timestamp: new Date().toISOString()
            };
            ws.send(JSON.stringify(message));

            // Close connection after sending message
            setTimeout(() => {
                ws.close();
            }, 1000);
        });

        ws.on('message', (data) => {
            try {
                const response = JSON.parse(data.toString());
                if (response.type === 'reload_complete') {
                    logger.info(`✅ ${serviceName} service configurations reloaded successfully`);
                } else if (response.type === 'error') {
                    logger.error(`❌ ${serviceName} service reload failed:`, response.message);
                }
            } catch (e) {
                logger.debug(`${serviceName} service response:`, data.toString());
            }
        });

        ws.on('error', (error) => {
            logger.warn(`⚠️ Could not notify ${serviceName} service (service may not be running):`, error.message);
        });

        ws.on('close', () => {
            logger.debug(`🔌 ${serviceName} service notification connection closed`);
        });

    } catch (error) {
        logger.warn(`⚠️ Could not notify ${serviceName} service:`, error.message);
    }
};

/**
 * Notify all relevant hardware services when parts are modified
 */
const notifyHardwareServicesReload = async (partType, oldPartType = null) => {
    const affectedServices = new Set();

    // Find services that handle this part type
    for (const [serviceName, serviceConfig] of Object.entries(HARDWARE_SERVICES)) {
        if (serviceConfig.partTypes.includes(partType)) {
            affectedServices.add(serviceName);
        }
        // Also check old part type for updates
        if (oldPartType && serviceConfig.partTypes.includes(oldPartType)) {
            affectedServices.add(serviceName);
        }
    }

    // Notify all affected services
    const notifications = Array.from(affectedServices).map(serviceName =>
        notifyHardwareServiceReload(serviceName, HARDWARE_SERVICES[serviceName])
    );

    if (notifications.length > 0) {
        logger.info(`🔄 Notifying ${notifications.length} hardware service(s) for part type: ${partType}`);
        await Promise.all(notifications);
    }
};

const getAllParts = async () => {
    try {
        // Load regular parts
        let parts = [];
        try {
            const data = await fs.readFile(dataPath, 'utf8');
            logger.debug('Raw parts data:', data);
            parts = JSON.parse(data);
        } catch (error) {
            if (error.code === 'ENOENT') {
                logger.info('Parts file not found, starting with empty array');
                parts = [];
            } else {
                throw error;
            }
        }

        // Load head tracking configurations
        try {
            const headTrackingData = await fs.readFile(headTrackingDataPath, 'utf8');
            const headTrackingParts = JSON.parse(headTrackingData);
            logger.debug('Head tracking parts data:', headTrackingParts);

            // Add head tracking parts to the main parts array
            parts = parts.concat(headTrackingParts);
        } catch (error) {
            if (error.code === 'ENOENT') {
                logger.info('Head tracking file not found, no head tracking parts to load');
            } else {
                logger.warn('Error loading head tracking parts:', error);
            }
        }

        return parts;
    } catch (error) {
        logger.error('Error in getAllParts:', error);
        throw error;
    }
};

const getPartById = async (id) => {
    logger.debug('Getting part by ID:', id, 'Type:', typeof id);
    if (id === undefined || id === null) {
        logger.warn('Part ID is undefined or null');
        return null;
    }
    const parts = await getAllParts();
    // Convert id to number for comparison since parts.json stores IDs as numbers
    const parsedId = parseInt(id, 10);
    if (isNaN(parsedId)) {
        logger.warn(`Invalid part ID (not a number): ${id}`);
        return null;
    }
    const part = parts.find(part => part.id === parsedId);
    if (!part) {
        logger.warn(`Part not found with id: ${id}`);
        return null;
    }
    logger.debug('Found part:', part);
    return part;
};

const getPartsByCharacter = async (characterId) => {
    logger.debug('Getting parts for character ID:', characterId);
    const parts = await getAllParts();
    return parts.filter(part => part.characterId === parseInt(characterId, 10));
};

const getServosByCharacter = async (characterId) => {
    logger.debug('Getting servos for character ID:', characterId);
    const parts = await getAllParts();
    return parts.filter(part =>
        part.type === 'servo' &&
        part.characterId === parseInt(characterId, 10)
    );
};

const getAvailableServosForJawAnimation = async (characterId) => {
    logger.debug('Getting available servos for jaw animation for character ID:', characterId);
    const servos = await getServosByCharacter(characterId);

    // Filter servos that are suitable for jaw animation
    // Prioritize servos with 'jaw' in the name, but include all servos
    const jawServos = servos.filter(servo =>
        servo.name && servo.name.toLowerCase().includes('jaw')
    );

    const otherServos = servos.filter(servo =>
        !servo.name || !servo.name.toLowerCase().includes('jaw')
    );

    // Return jaw servos first, then other servos
    return [...jawServos, ...otherServos];
};

const createPart = async (partData) => {
    logger.info('Creating new part with data:', partData);
    const parts = await getAllParts();
    const newPart = {
        id: parts.length > 0 ? Math.max(...parts.map(p => p.id)) + 1 : 1,
        ...partData,
        characterId: parseInt(partData.characterId, 10)
    };
    parts.push(newPart);
    await fs.writeFile(dataPath, JSON.stringify(parts, null, 2));
    logger.info('Created new part:', newPart);

    // Notify relevant hardware services
    await notifyHardwareServicesReload(newPart.type);

    return newPart;
};

const updatePart = async (id, partData) => {
    logger.debug('Updating part - ID:', id, 'Type:', typeof id);
    logger.debug('Updating part - Data:', partData);
    const parts = await getAllParts();
    logger.debug('All parts:', parts);
    const parsedId = parseInt(id, 10);
    if (isNaN(parsedId)) {
        logger.warn(`Invalid part ID (not a number): ${id}`);
        return null;
    }
    const index = parts.findIndex(part => part.id === parsedId);
    logger.debug('Found part index:', index);
    if (index === -1) {
        logger.warn(`Part not found with id: ${id}`);
        return null;
    }
    const oldPart = parts[index];
    parts[index] = {
        ...parts[index],
        ...partData,
        id: parsedId,
        characterId: parseInt(partData.characterId, 10)
    };
    await fs.writeFile(dataPath, JSON.stringify(parts, null, 2));
    logger.info('Updated part:', parts[index]);

    // Notify relevant hardware services (both old and new part types)
    await notifyHardwareServicesReload(parts[index].type, oldPart.type);

    return parts[index];
};

const deletePart = async (id) => {
    logger.info(`Attempting to delete part with ID: ${id}`);
    const parsedId = parseInt(id, 10);
    if (isNaN(parsedId)) {
        logger.warn(`Invalid part ID (not a number): ${id}`);
        return false;
    }
    logger.debug(`Parsed ID: ${parsedId}`);
    const parts = await getAllParts();
    logger.debug(`All parts before deletion: ${JSON.stringify(parts)}`);
    const index = parts.findIndex(part => part.id === parsedId);
    logger.debug(`Index of part to delete: ${index}`);
    logger.debug(`Part IDs: ${parts.map(part => part.id).join(', ')}`);
    if (index === -1) {
        logger.warn(`Part not found with id: ${id}`);
        return false;
    }
    const deletedPart = parts.splice(index, 1)[0];
    logger.debug(`Deleted part: ${JSON.stringify(deletedPart)}`);
    await fs.writeFile(dataPath, JSON.stringify(parts, null, 2));
    logger.info(`Part with ID ${id} deleted successfully`);
    logger.debug(`All parts after deletion: ${JSON.stringify(parts)}`);

    // Notify relevant hardware services
    await notifyHardwareServicesReload(deletedPart.type);

    return true;
};

module.exports = {
    getAllParts,
    getPartById,
    getPartsByCharacter,
    getServosByCharacter,
    getAvailableServosForJawAnimation,
    createPart,
    updatePart,
    deletePart
};
