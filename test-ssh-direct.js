// Direct test of SSH endpoint without axios timeout issues
const http = require('http');

const postData = JSON.stringify({
    host: '192.168.8.120',
    user: 'remote',
    password: 'test123'
});

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/characters/test-ssh',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
    },
    timeout: 10000  // 10 second timeout
};

console.log('Testing SSH endpoint directly...');

const req = http.request(options, (res) => {
    console.log(`Status: ${res.statusCode}`);
    console.log(`Headers: ${JSON.stringify(res.headers)}`);
    
    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });
    
    res.on('end', () => {
        console.log('Response:', data);
        try {
            const jsonResponse = JSON.parse(data);
            console.log('Parsed response:', JSON.stringify(jsonResponse, null, 2));
        } catch (e) {
            console.log('Response is not JSON:', data);
        }
    });
});

req.on('error', (e) => {
    console.error(`Request error: ${e.message}`);
});

req.on('timeout', () => {
    console.error('Request timed out');
    req.destroy();
});

req.write(postData);
req.end();
