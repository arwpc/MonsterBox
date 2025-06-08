// test-jaw-animation-import.js
// Simple test to check if our jaw animation modules can be imported

console.log('Testing jaw animation module imports...');

try {
    console.log('1. Testing logger import...');
    const logger = require('./scripts/logger');
    console.log('✓ Logger imported successfully');

    console.log('2. Testing AudioAnalyzer import...');
    const AudioAnalyzer = require('./scripts/jaw-animation/audio/audioAnalyzer');
    console.log('✓ AudioAnalyzer imported successfully');

    console.log('3. Testing ServoMapper import...');
    const ServoMapper = require('./scripts/jaw-animation/servo/servoMapper');
    console.log('✓ ServoMapper imported successfully');

    console.log('4. Testing ServoController import...');
    const ServoController = require('./scripts/jaw-animation/servo/servoController');
    console.log('✓ ServoController imported successfully');

    console.log('5. Testing JawConfig import...');
    const JawConfig = require('./scripts/jaw-animation/config/jawConfig');
    console.log('✓ JawConfig imported successfully');

    console.log('6. Testing JawWebSocket import...');
    const JawWebSocket = require('./scripts/jaw-animation/websocket/jawWebSocket');
    console.log('✓ JawWebSocket imported successfully');

    console.log('7. Testing JawAnimationSystem import...');
    const JawAnimationSystem = require('./scripts/jaw-animation/jawAnimationSystem');
    console.log('✓ JawAnimationSystem imported successfully');

    console.log('8. Testing jawAnimationRoutes import...');
    const jawAnimationRoutes = require('./routes/jawAnimationRoutes');
    console.log('✓ jawAnimationRoutes imported successfully');

    console.log('\n🎉 All jaw animation modules imported successfully!');
    
    // Test basic instantiation
    console.log('\n9. Testing basic instantiation...');
    const audioAnalyzer = new AudioAnalyzer();
    console.log('✓ AudioAnalyzer instantiated');
    
    const servoMapper = new ServoMapper();
    console.log('✓ ServoMapper instantiated');
    
    const jawAnimationSystem = new JawAnimationSystem();
    console.log('✓ JawAnimationSystem instantiated');
    
    console.log('\n🚀 All tests passed! Jaw animation system is ready.');

} catch (error) {
    console.error('❌ Import test failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
}
