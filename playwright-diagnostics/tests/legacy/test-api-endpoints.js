const http = require('http');
const querystring = require('querystring');

// Helper function to make HTTP requests
function makeRequest(options, postData = null) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: data
                });
            });
        });
        
        req.on('error', (err) => {
            reject(err);
        });
        
        if (postData) {
            req.write(postData);
        }
        
        req.end();
    });
}

async function testMonsterBoxAPI() {
    console.log('🧪 Testing MonsterBox API Endpoints...\n');
    
    const baseUrl = 'localhost';
    const port = 3000;
    const characterId = 4;
    
    try {
        // Test 1: Characters page loads
        console.log('📋 Testing Characters page...');
        const charactersResponse = await makeRequest({
            hostname: baseUrl,
            port: port,
            path: '/characters',
            method: 'GET'
        });
        
        if (charactersResponse.statusCode === 200) {
            console.log('✅ Characters page loads successfully');
            console.log(`📊 Content-Type: ${charactersResponse.headers['content-type']}`);
        } else {
            console.log(`❌ Characters page failed: ${charactersResponse.statusCode}`);
        }
        
        // Test 2: Parts management page
        console.log('\n🔧 Testing Parts management page...');
        const partsResponse = await makeRequest({
            hostname: baseUrl,
            port: port,
            path: `/characters/${characterId}/parts`,
            method: 'GET'
        });
        
        if (partsResponse.statusCode === 200) {
            console.log('✅ Parts management page loads successfully');
            console.log(`📊 Content-Type: ${partsResponse.headers['content-type']}`);
            
            // Check if it's HTML (not JSON)
            if (partsResponse.headers['content-type'].includes('text/html')) {
                console.log('✅ Returns HTML (not JSON)');
            } else {
                console.log('❌ Still returning JSON instead of HTML');
            }
        } else {
            console.log(`❌ Parts management page failed: ${partsResponse.statusCode}`);
        }
        
        // Test 3: AI management page
        console.log('\n🧠 Testing AI management page...');
        const aiResponse = await makeRequest({
            hostname: baseUrl,
            port: port,
            path: `/characters/${characterId}/ai`,
            method: 'GET'
        });
        
        if (aiResponse.statusCode === 200) {
            console.log('✅ AI management page loads successfully');
            console.log(`📊 Content-Type: ${aiResponse.headers['content-type']}`);
        } else {
            console.log(`❌ AI management page failed: ${aiResponse.statusCode}`);
        }
        
        // Test 4: AI Assignment API
        console.log('\n🧪 Testing AI Assignment API...');
        const assignData = JSON.stringify({ aiInstanceId: 'robochat' });
        const assignResponse = await makeRequest({
            hostname: baseUrl,
            port: port,
            path: `/characters/${characterId}/ai/assign`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(assignData)
            }
        }, assignData);
        
        console.log(`📊 AI Assignment Response: ${assignResponse.statusCode}`);
        console.log(`📄 Response Body: ${assignResponse.body}`);
        
        if (assignResponse.statusCode === 200) {
            console.log('✅ AI Assignment API works');
        } else if (assignResponse.statusCode === 400) {
            console.log('ℹ️ AI Assignment returned 400 (may already be assigned)');
        } else {
            console.log(`❌ AI Assignment failed: ${assignResponse.statusCode}`);
        }
        
        // Test 5: Check character data after assignment
        console.log('\n📊 Checking character data...');
        const characterResponse = await makeRequest({
            hostname: baseUrl,
            port: port,
            path: `/api/characters/${characterId}`,
            method: 'GET'
        });
        
        if (characterResponse.statusCode === 200) {
            const characterData = JSON.parse(characterResponse.body);
            console.log('✅ Character data retrieved');
            console.log(`🧠 AI Instances: ${JSON.stringify(characterData.ai_instances || [])}`);
            console.log(`🎭 ChatterPi AI Characters: ${JSON.stringify(characterData.chatterpi_config?.ai_characters || [])}`);
            console.log(`🎯 Default Character: ${characterData.chatterpi_config?.default_character || 'None'}`);
        } else {
            console.log(`❌ Failed to get character data: ${characterResponse.statusCode}`);
        }
        
        console.log('\n🎯 API Testing Complete!');
        
    } catch (error) {
        console.error('❌ Error during API testing:', error);
    }
}

// Run the tests
testMonsterBoxAPI().catch(console.error);
