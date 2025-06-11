console.log('Testing axios...');
try {
    const axios = require('axios');
    console.log('✅ axios loaded successfully');
} catch (error) {
    console.log('❌ axios failed to load:', error.message);
}
