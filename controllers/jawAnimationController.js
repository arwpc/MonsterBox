const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');
const logger = require('../scripts/logger');
const partService = require('../services/partService');

class JawAnimationController {
    constructor() {
        this.partsPath = path.join(process.cwd(), 'data', 'parts.json');
        this.animationStatus = new Map(); // Track animation status per character
    }

    // Get the test page
    async getTestPage(req, res) {
        try {
            const characterId = req.query.characterId || '4';
            res.render('jaw-animation-test', {
                title: 'Jaw Animation Test',
                characterId: characterId
            });
        } catch (error) {
            console.error('Error loading jaw animation test page:', error);
            res.status(500).send('Error loading test page');
        }
    }

    // Get servo configuration for a character
    async getServoConfig(req, res) {
        try {
            const characterId = parseInt(req.params.characterId);
            logger.info(`Getting servo config for character ID: ${characterId}`);

            const parts = await this.loadParts();
            logger.info(`Loaded ${parts.length} parts from parts.json`);

            // Log all servos for debugging
            const allServos = parts.filter(part => part.type === 'servo');
            logger.info(`Found ${allServos.length} servos total:`, allServos.map(s => `ID:${s.id} Name:${s.name} CharID:${s.characterId}`));

            // Try multiple search strategies
            let jawServo = parts.find(part =>
                part.characterId === characterId &&
                part.type === 'servo' &&
                part.name && part.name.toLowerCase().includes('jaw')
            );

            // If not found, try broader search
            if (!jawServo) {
                logger.warn(`No jaw servo found with standard search, trying broader search`);
                jawServo = parts.find(part =>
                    part.characterId === characterId &&
                    part.type === 'servo'
                );
                if (jawServo) {
                    logger.info(`Found servo for character ${characterId}:`, jawServo);
                }
            }

            if (!jawServo) {
                logger.warn(`No jaw servo found for character ${characterId}`);
                return res.status(404).json({
                    error: 'No jaw servo found for this character'
                });
            }

            logger.info(`Found jaw servo:`, jawServo);
            res.json({
                servo: jawServo,
                status: 'success'
            });
        } catch (error) {
            logger.error('Error getting servo config:', error);
            res.status(500).json({ error: 'Failed to get servo configuration' });
        }
    }

    // Test servo movement
    async testServo(req, res) {
        try {
            const characterId = parseInt(req.params.characterId);
            const { angle = 90 } = req.body;
            
            const parts = await this.loadParts();
            const jawServo = parts.find(part => 
                part.characterId === characterId && 
                part.type === 'servo' && 
                part.name.toLowerCase().includes('jaw')
            );

            if (!jawServo) {
                return res.status(404).json({
                    error: 'No jaw servo found for this character'
                });
            }

            // Execute servo control command
            const result = await this.executeServoCommand(jawServo, angle);
            
            res.json({
                status: 'success',
                message: `Servo moved to ${angle} degrees`,
                result: result
            });
        } catch (error) {
            console.error('Error testing servo:', error);
            res.status(500).json({ error: 'Failed to test servo' });
        }
    }

    // Set servo angle
    async setServoAngle(req, res) {
        try {
            const characterId = parseInt(req.params.characterId);
            const { angle } = req.body;
            
            if (angle < 0 || angle > 180) {
                return res.status(400).json({
                    error: 'Angle must be between 0 and 180 degrees'
                });
            }

            const parts = await this.loadParts();
            const jawServo = parts.find(part => 
                part.characterId === characterId && 
                part.type === 'servo' && 
                part.name.toLowerCase().includes('jaw')
            );

            if (!jawServo) {
                return res.status(404).json({
                    error: 'No jaw servo found for this character'
                });
            }

            const result = await this.executeServoCommand(jawServo, angle);
            
            res.json({
                status: 'success',
                angle: angle,
                result: result
            });
        } catch (error) {
            console.error('Error setting servo angle:', error);
            res.status(500).json({ error: 'Failed to set servo angle' });
        }
    }

    // Start jaw animation
    async startAnimation(req, res) {
        try {
            const characterId = parseInt(req.params.characterId);
            
            // Set animation status
            this.animationStatus.set(characterId, {
                active: true,
                startTime: new Date(),
                audioLevel: 0,
                servoPosition: 90
            });

            res.json({
                status: 'success',
                message: 'Jaw animation started',
                characterId: characterId
            });
        } catch (error) {
            console.error('Error starting animation:', error);
            res.status(500).json({ error: 'Failed to start animation' });
        }
    }

    // Stop jaw animation
    async stopAnimation(req, res) {
        try {
            const characterId = parseInt(req.params.characterId);
            
            // Clear animation status
            this.animationStatus.delete(characterId);

            res.json({
                status: 'success',
                message: 'Jaw animation stopped',
                characterId: characterId
            });
        } catch (error) {
            console.error('Error stopping animation:', error);
            res.status(500).json({ error: 'Failed to stop animation' });
        }
    }

    // Get animation status
    async getAnimationStatus(req, res) {
        try {
            const characterId = parseInt(req.params.characterId);
            const status = this.animationStatus.get(characterId) || {
                active: false,
                audioLevel: 0,
                servoPosition: 90
            };

            res.json({
                status: 'success',
                animation: status
            });
        } catch (error) {
            console.error('Error getting animation status:', error);
            res.status(500).json({ error: 'Failed to get animation status' });
        }
    }

    // Helper methods
    async loadParts() {
        try {
            logger.info(`Loading parts from: ${this.partsPath}`);
            const data = await fs.readFile(this.partsPath, 'utf8');
            const parts = JSON.parse(data);
            logger.info(`Successfully loaded ${parts.length} parts`);
            return parts;
        } catch (error) {
            logger.error('Error loading parts from file, trying partService:', {
                path: this.partsPath,
                error: error.message,
                code: error.code
            });

            // Fallback to partService
            try {
                const parts = await partService.getAllParts();
                logger.info(`Fallback: Successfully loaded ${parts.length} parts from partService`);
                return parts;
            } catch (serviceError) {
                logger.error('Error loading parts from partService:', {
                    error: serviceError.message,
                    stack: serviceError.stack
                });
                return [];
            }
        }
    }

    async executeServoCommand(servo, angle) {
        return new Promise((resolve, reject) => {
            const controlType = servo.usePCA9685 ? 'pca9685' : 'gpio';
            const pinOrChannel = servo.usePCA9685 ? servo.channel : servo.pin;
            
            const command = [
                'python3',
                'scripts/servo_control.py',
                'test',
                controlType,
                pinOrChannel.toString(),
                angle.toString(),
                '1',
                servo.servoType || 'Standard'
            ];

            const process = spawn(command[0], command.slice(1), {
                cwd: process.cwd()
            });

            let output = '';
            let error = '';

            process.stdout.on('data', (data) => {
                output += data.toString();
            });

            process.stderr.on('data', (data) => {
                error += data.toString();
            });

            process.on('close', (code) => {
                if (code === 0) {
                    try {
                        const result = JSON.parse(output.trim());
                        resolve(result);
                    } catch (e) {
                        resolve({ status: 'success', message: output.trim() });
                    }
                } else {
                    reject(new Error(error || `Process exited with code ${code}`));
                }
            });

            process.on('error', (err) => {
                reject(err);
            });
        });
    }
}

module.exports = new JawAnimationController();
