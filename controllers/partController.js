// File: controllers/partController.js

const { spawn } = require('child_process');
const path = require('path');
const logger = require('../scripts/logger');

let runningProcesses = [];

function executePartAction(step, sendEvent) {
    return new Promise(async (resolve, reject) => {
        try {
            const part = await getPartById(step.part_id);
            if (!part) {
                logger.error(`Part not found for ID: ${step.part_id}`);
                throw new Error(`Part not found for ID: ${step.part_id}`);
            }

            let scriptPath;
            let args;

            switch (part.type) {
                case 'motor':
                case 'linear-actuator':
                    scriptPath = path.resolve(__dirname, '..', 'scripts', 'motor_control.py');
                    args = [step.direction, step.speed.toString(), step.duration.toString(), part.directionPin.toString(), part.pwmPin.toString()];
                    break;
                case 'led':
                case 'light':
                    scriptPath = path.resolve(__dirname, '..', 'scripts', 'light_control.py');
                    args = [part.gpioPin.toString(), step.state, step.duration.toString()];
                    if (part.type === 'led' && step.brightness) {
                        args.push(step.brightness.toString());
                    }
                    break;
                case 'servo':
                    scriptPath = path.resolve(__dirname, '..', 'scripts', 'servo_control.py');
                    args = [
                        part.gpioPin.toString(),
                        step.angle.toString(),
                        step.speed.toString(),
                        step.duration.toString(),
                        part.pwmFrequency.toString(),
                        part.dutyCycle.toString()
                    ];
                    break;
                default:
                    logger.error(`Unsupported part type: ${part.type}`);
                    throw new Error(`Unsupported part type: ${part.type}`);
            }

            logger.info(`Executing ${part.type} action: ${step.name}`);
            logger.debug(`Script: ${scriptPath}, Args: ${args.join(', ')}`);

            const process = spawn('python3', [scriptPath, ...args]);
            runningProcesses.push(process);

            process.stdout.on('data', (data) => {
                logger.debug(`${part.type} output: ${data}`);
                sendEvent({ message: `${part.type} output: ${data}` });
            });

            process.stderr.on('data', (data) => {
                logger.error(`${part.type} error: ${data}`);
                sendEvent({ error: `${part.type} error: ${data}` });
            });

            process.on('close', (code) => {
                const index = runningProcesses.indexOf(process);
                if (index > -1) {
                    runningProcesses.splice(index, 1);
                }
                if (code === 0) {
                    logger.info(`${part.type} action completed: ${step.name}`);
                    sendEvent({ message: `${part.type} action completed: ${step.name}` });
                    resolve();
                } else {
                    logger.error(`${part.type} process exited with code ${code}`);
                    reject(new Error(`${part.type} process exited with code ${code}`));
                }
            });
        } catch (error) {
            logger.error('Error in executePartAction:', error);
            reject(error);
        }
    });
}

function stopAllParts() {
    logger.info('Stopping all parts');
    runningProcesses.forEach(process => {
        if (process.kill) {
            process.kill('SIGKILL');
        }
    });
    runningProcesses = [];
    spawn('pkill', ['-9', 'python3']);
    logger.info('All parts stopped');
}

async function getPartById(partId) {
    // This is a placeholder. You should implement the actual logic to fetch the part from your data source.
    // For now, we'll return a mock part object.
    logger.debug(`Fetching part with ID: ${partId}`);
    return {
        id: partId,
        type: 'led',
        gpioPin: 17,
        // Add other necessary properties based on your part schema
    };
}

module.exports = {
    executePartAction,
    stopAllParts
};
