
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { controlPart } from '../services/hardwareService/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, '..');

async function main() {
    console.log("🦾 MonsterBox Hardware Verification Script");
    console.log("==========================================");

    // 1. Load Parts for Orlok
    const partsPath = path.join(APP_ROOT, 'data/character-3/parts.json');
    console.log(`📂 Loading parts from: ${partsPath}`);
    
    let parts;
    try {
        const data = await fs.readFile(partsPath, 'utf8');
        parts = JSON.parse(data);
        console.log(`✅ Loaded ${parts.length} parts.`);
    } catch (e) {
        console.error("❌ Failed to load parts:", e.message);
        process.exit(1);
    }

    // 2. Iterate and Test
    for (const part of parts) {
        console.log(`\n---------------------------------------------------`);
        console.log(`🔩 Testing Part [ID: ${part.id}]: ${part.name} (${part.type})`);

        try {
            if (part.type === 'linear_actuator') {
                // Determine direction
                // Just use generic 'extend' for 500ms
                console.log(`   Action: Extend 500ms`);
                const res = await controlPart(part.id, 'extend', { 
                    speed: 100, 
                    duration: 500 
                });
                logResult(res);

                await sleep(500);

                console.log(`   Action: Retract 500ms`);
                const res2 = await controlPart(part.id, 'retract', { 
                    speed: 100, 
                    duration: 500 
                });
                logResult(res2);

            } else if (part.type === 'servo') {
                // Check if continuous
                const isContinuous = part.config?.servoType === 'continuous' || part.servoType === 'continuous';
                
                if (isContinuous) {
                    console.log(`   Action: Rotate CW 50% for 500ms`);
                    const res = await controlPart(part.id, 'rotateContinuous', { 
                        direction: 'cw', 
                        speed: 50, 
                        duration: 500 
                    });
                    logResult(res);
                } else {
                    console.log(`   Action: Move to 90°`);
                    const res = await controlPart(part.id, 'moveToAngle', { 
                        angleDeg: 90 
                    });
                    logResult(res);
                    
                    await sleep(500);
                    
                    console.log(`   Action: Move to 100°`);
                    const res2 = await controlPart(part.id, 'moveToAngle', { 
                        angleDeg: 100 
                    });
                    logResult(res2);
                }
            } else if (part.type === 'motor') {
                 console.log(`   Action: Forward 50% for 500ms`);
                 const res = await controlPart(part.id, 'control', {
                    direction: 'forward',
                    speed: 50,
                    duration: 500
                 });
                 logResult(res);
            } else {
                console.log(`   Skipping type ${part.type} for physical test.`);
            }

        } catch (error) {
           console.error(`   ❌ EXCEPTION: ${error.message}`);
        }
    }
}

function logResult(res) {
    if (res.success) {
        console.log(`   ✅ SUCCESS: ${res.message}`);
        if(res.rawOutput) console.log(`      Raw: ${res.rawOutput.trim().substring(0, 100)}...`);
    } else {
        console.log(`   ❌ FAILED: ${res.message || res.error}`);
        if (res.rawOutput) console.log(`      Raw: ${res.rawOutput}`);
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(console.error);
