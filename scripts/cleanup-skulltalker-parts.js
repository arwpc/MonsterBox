#!/usr/bin/env node

/**
 * Clean up Skulltalker parts configuration
 * Remove old parts and add new properly configured servo and microphone
 */

const fs = require('fs').promises;
const path = require('path');

const SKULLTALKER_CHARACTER_ID = 4;

async function cleanupSkulltalkerParts() {
    try {
        console.log('🧹 Starting Skulltalker parts cleanup...');
        
        // Read current parts.json
        const partsPath = path.join(__dirname, '../data/parts.json');
        const partsData = await fs.readFile(partsPath, 'utf8');
        let parts = JSON.parse(partsData);
        
        console.log(`📊 Found ${parts.length} total parts`);
        
        // Find Skulltalker parts
        const skulltalkerParts = parts.filter(part => part.characterId === SKULLTALKER_CHARACTER_ID);
        console.log(`🎭 Found ${skulltalkerParts.length} Skulltalker parts:`);
        skulltalkerParts.forEach(part => {
            console.log(`   - ${part.name} (ID: ${part.id}, Type: ${part.type})`);
        });
        
        // Remove old Skulltalker parts except the ones we want to keep
        const partsToKeep = ['Motion Skulltalker']; // Keep motion sensor
        const oldParts = parts.filter(part => 
            part.characterId === SKULLTALKER_CHARACTER_ID && 
            !partsToKeep.includes(part.name)
        );
        
        console.log(`🗑️ Removing ${oldParts.length} old parts:`);
        oldParts.forEach(part => {
            console.log(`   - ${part.name} (ID: ${part.id})`);
        });
        
        // Filter out old Skulltalker parts
        parts = parts.filter(part => 
            part.characterId !== SKULLTALKER_CHARACTER_ID || 
            partsToKeep.includes(part.name)
        );
        
        // Find next available ID
        const maxId = parts.length > 0 ? Math.max(...parts.map(p => p.id)) : 0;
        let nextId = maxId + 1;
        
        // Add new properly configured servo
        const newServo = {
            id: nextId++,
            name: "Jaw Servo",
            type: "servo",
            characterId: SKULLTALKER_CHARACTER_ID,
            pin: 18,
            usePCA9685: false,
            channel: null,
            servoType: "Miuzei MG90S",
            minPulse: 500,
            maxPulse: 2400,
            defaultAngle: 50,  // ChatterPi closed position
            minAngle: 30,      // ChatterPi open position
            maxAngle: 50,      // ChatterPi closed position
            mode: ["Standard"],
            feedback: false,
            controlType: ["PWM"],
            createdAt: new Date().toISOString(),
            description: "Jaw servo for ChatterPi animation - GPIO 18, 30°=open, 50°=closed"
        };
        
        // Add new properly configured microphone
        const newMicrophone = {
            id: nextId++,
            name: "ChatterPi Microphone",
            type: "microphone",
            characterId: SKULLTALKER_CHARACTER_ID,
            deviceId: "2",
            sampleRate: "16000",
            channels: "1",
            sensitivity: "1.0",
            echoCancellation: "on",
            noiseSuppression: "on",
            autoGainControl: "on",
            voiceActivationThreshold: "0.1",
            createdAt: new Date().toISOString(),
            description: "USB sound card microphone for ChatterPi STT and jaw animation"
        };
        
        // Add new parts
        parts.push(newServo);
        parts.push(newMicrophone);
        
        console.log('✅ Added new parts:');
        console.log(`   - ${newServo.name} (ID: ${newServo.id}) - GPIO ${newServo.pin}`);
        console.log(`   - ${newMicrophone.name} (ID: ${newMicrophone.id}) - Device ${newMicrophone.deviceId}`);
        
        // Write updated parts.json
        await fs.writeFile(partsPath, JSON.stringify(parts, null, 2));
        
        console.log(`💾 Updated parts.json with ${parts.length} total parts`);
        
        // Update jaw animation config to match new servo settings
        await updateJawAnimationConfig(newServo.id);
        
        console.log('🎯 Skulltalker parts cleanup completed successfully!');
        
        return {
            success: true,
            removedParts: oldParts.length,
            addedParts: 2,
            totalParts: parts.length,
            newServoId: newServo.id,
            newMicrophoneId: newMicrophone.id
        };
        
    } catch (error) {
        console.error('❌ Error during Skulltalker parts cleanup:', error);
        throw error;
    }
}

async function updateJawAnimationConfig(servoId) {
    try {
        console.log('🦷 Updating jaw animation configuration...');
        
        const configPath = path.join(__dirname, '../data/jaw-animation-config.json');
        
        let config;
        try {
            const configData = await fs.readFile(configPath, 'utf8');
            config = JSON.parse(configData);
        } catch (error) {
            // Create default config if file doesn't exist
            config = {
                version: "1.0.0",
                global: {
                    enabled: true,
                    audioAnalysis: {
                        sampleRate: 44100,
                        bufferSize: 1024,
                        smoothingFactor: 0.8,
                        volumeThreshold: 0.01,
                        updateInterval: 16,
                        speechFreqMin: 300,
                        speechFreqMax: 3400,
                        enableFrequencyFiltering: true,
                        attackTime: 0.05,
                        releaseTime: 0.15
                    },
                    servoMapping: {
                        responseCurve: "linear",
                        sensitivity: 1,
                        attackTime: 0.05,
                        releaseTime: 0.15,
                        smoothingFactor: 0.7,
                        positionDeadband: 0.5,
                        idleTimeout: 2000
                    }
                },
                characters: {}
            };
        }
        
        // Update Skulltalker character configuration
        config.characters[SKULLTALKER_CHARACTER_ID.toString()] = {
            characterId: SKULLTALKER_CHARACTER_ID,
            characterType: "skeleton",
            servoId: servoId,
            servoMapping: {
                minPosition: 50,    // Closed position
                maxPosition: 30,    // Open position
                responseCurve: "exponential",
                sensitivity: 1.5,
                attackTime: 0.03,
                releaseTime: 0.1,
                smoothingFactor: 0.7,
                stepThreshold: 0.5,
                idleTimeout: 2.0
            },
            audioAnalysis: {
                volumeThreshold: 0.02,
                smoothingFactor: 0.8,
                attackTime: 0.05,
                releaseTime: 0.15
            }
        };
        
        // Write updated config
        await fs.writeFile(configPath, JSON.stringify(config, null, 2));
        
        console.log(`✅ Updated jaw animation config for servo ID ${servoId}`);
        
    } catch (error) {
        console.error('❌ Error updating jaw animation config:', error);
        throw error;
    }
}

// Run cleanup if called directly
if (require.main === module) {
    cleanupSkulltalkerParts()
        .then(result => {
            console.log('\n🎉 Cleanup Summary:');
            console.log(`   - Removed parts: ${result.removedParts}`);
            console.log(`   - Added parts: ${result.addedParts}`);
            console.log(`   - Total parts: ${result.totalParts}`);
            console.log(`   - New servo ID: ${result.newServoId}`);
            console.log(`   - New microphone ID: ${result.newMicrophoneId}`);
            process.exit(0);
        })
        .catch(error => {
            console.error('\n💥 Cleanup failed:', error.message);
            process.exit(1);
        });
}

module.exports = { cleanupSkulltalkerParts };
