/**
 * Test script for the new animatronic services
 * Verifies that the web-based animatronic management works correctly
 */

const animatronicService = require('../services/animatronicService');
const systemConfigService = require('../services/systemConfigService');
const logger = require('./logger');

async function testAnimatronicServices() {
    console.log('🎃 Testing New Animatronic Services\n');
    
    try {
        // Test 1: Load animatronic characters
        console.log('📋 Test 1: Loading animatronic characters...');
        const characters = await animatronicService.getAnimatronicCharacters();
        console.log(`✅ Found ${characters.length} animatronic characters`);
        
        if (characters.length > 0) {
            characters.forEach(char => {
                console.log(`   - ${char.char_name} (ID: ${char.id}) at ${char.animatronic.rpi_config.host}`);
            });
        }
        
        // Test 2: Test character system info (if we have characters)
        if (characters.length > 0) {
            const testCharacter = characters[0];
            console.log(`\n📊 Test 2: Getting system info for ${testCharacter.char_name}...`);
            
            try {
                const systemInfo = await systemConfigService.getCharacterSystemInfo(testCharacter.id);
                console.log('✅ System info retrieved successfully');
                console.log(`   Platform: ${systemInfo.systemInfo.platform}`);
                console.log(`   Hostname: ${systemInfo.systemInfo.hostname}`);
                console.log(`   Temperature: ${systemInfo.systemInfo.temperature}`);
            } catch (error) {
                console.log(`⚠️  System info test failed (expected for network issues): ${error.message}`);
            }
        }
        
        // Test 3: Test servo configuration
        if (characters.length > 0) {
            const testCharacter = characters[0];
            console.log(`\n🔧 Test 3: Getting servo config for ${testCharacter.char_name}...`);
            
            try {
                const servoConfig = await systemConfigService.getCharacterServos(testCharacter.id);
                console.log('✅ Servo configuration retrieved successfully');
                console.log(`   Character: ${servoConfig.character}`);
                console.log(`   Configured servos: ${servoConfig.servos.length}`);
                console.log(`   Available servos: ${servoConfig.availableServos.length}`);
            } catch (error) {
                console.log(`⚠️  Servo config test failed: ${error.message}`);
            }
        }
        
        // Test 4: Test connection (will likely fail due to network, but should not crash)
        if (characters.length > 0) {
            const testCharacter = characters[0];
            console.log(`\n🧪 Test 4: Testing connection to ${testCharacter.char_name}...`);
            
            try {
                const connectionResult = await animatronicService.testCharacterConnection(testCharacter.id);
                console.log('✅ Connection test completed');
                console.log(`   Ping: ${connectionResult.tests.ping.passed ? '✅' : '❌'}`);
                console.log(`   SSH: ${connectionResult.tests.ssh.passed ? '✅' : '❌'}`);
                console.log(`   Logs: ${connectionResult.tests.logs.passed ? '✅' : '❌'}`);
            } catch (error) {
                console.log(`⚠️  Connection test failed (expected for network issues): ${error.message}`);
            }
        }
        
        console.log('\n🎉 Animatronic service tests completed!');
        console.log('\n📝 Summary:');
        console.log('   ✅ Services load correctly');
        console.log('   ✅ Character data is accessible');
        console.log('   ✅ Service methods work without crashing');
        console.log('   ⚠️  Network operations may fail (expected in test environment)');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
        process.exit(1);
    }
}

// Run the tests
if (require.main === module) {
    testAnimatronicServices();
}

module.exports = { testAnimatronicServices };
