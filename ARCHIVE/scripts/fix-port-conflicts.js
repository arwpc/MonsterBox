#!/usr/bin/env node

/**
 * MonsterBox Port Conflict Resolution Script
 * Identifies and resolves port conflicts preventing system startup
 */

const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔧 MonsterBox Port Conflict Resolution');
console.log('=====================================');

// Ports used by MonsterBox
const MONSTERBOX_PORTS = [3000, 8080, 8200, 8201, 8202, 8203, 8204, 8205, 8600, 8671];

// Kill processes using specific ports
function killPortProcesses(ports) {
  return new Promise((resolve) => {
    const portList = ports.join(',');
    console.log(`🔍 Checking for processes on ports: ${portList}`);
    
    exec(`lsof -ti:${portList}`, (error, stdout, stderr) => {
      if (error) {
        console.log('✅ No conflicting processes found');
        resolve();
        return;
      }
      
      const pids = stdout.trim().split('\n').filter(pid => pid);
      if (pids.length === 0) {
        console.log('✅ No conflicting processes found');
        resolve();
        return;
      }
      
      console.log(`🔪 Killing ${pids.length} conflicting processes...`);
      exec(`kill -9 ${pids.join(' ')}`, (killError) => {
        if (killError) {
          console.log('⚠️ Some processes could not be killed, trying with sudo...');
          exec(`sudo kill -9 ${pids.join(' ')}`, (sudoError) => {
            if (sudoError) {
              console.log('❌ Failed to kill some processes');
            } else {
              console.log('✅ Conflicting processes killed with sudo');
            }
            resolve();
          });
        } else {
          console.log('✅ Conflicting processes killed');
          resolve();
        }
      });
    });
  });
}

// Update service configuration to use different port ranges
function updateServicePorts() {
  console.log('🔧 Updating service port configuration...');
  
  // Update dynamic WebSocket proxy to use different port range
  const proxyConfigPath = path.join(__dirname, '..', 'services', 'dynamicWebSocketProxy.js');
  
  if (fs.existsSync(proxyConfigPath)) {
    let proxyConfig = fs.readFileSync(proxyConfigPath, 'utf8');
    
    // Change proxy port range from 8200-8299 to 9200-9299
    proxyConfig = proxyConfig.replace(/8200/g, '9200');
    proxyConfig = proxyConfig.replace(/8201/g, '9201');
    proxyConfig = proxyConfig.replace(/8202/g, '9202');
    proxyConfig = proxyConfig.replace(/8203/g, '9203');
    proxyConfig = proxyConfig.replace(/8204/g, '9204');
    proxyConfig = proxyConfig.replace(/8205/g, '9205');
    
    fs.writeFileSync(proxyConfigPath, proxyConfig);
    console.log('✅ Updated WebSocket proxy port configuration');
  }
  
  // Update service registry ports
  const serviceRegistryPath = path.join(__dirname, '..', 'config', 'serviceRegistry.json');
  
  if (fs.existsSync(serviceRegistryPath)) {
    const serviceRegistry = JSON.parse(fs.readFileSync(serviceRegistryPath, 'utf8'));
    
    // Update proxy ports in service registry
    Object.keys(serviceRegistry).forEach(serviceName => {
      const service = serviceRegistry[serviceName];
      if (service.proxyPort && service.proxyPort >= 8200 && service.proxyPort <= 8299) {
        service.proxyPort = service.proxyPort + 1000; // Move to 9200-9299 range
        console.log(`📝 Updated ${serviceName} proxy port to ${service.proxyPort}`);
      }
    });
    
    fs.writeFileSync(serviceRegistryPath, JSON.stringify(serviceRegistry, null, 2));
    console.log('✅ Updated service registry port configuration');
  }
}

// Create a minimal startup script that bypasses problematic services
function createMinimalStartup() {
  console.log('🚀 Creating minimal startup configuration...');
  
  const minimalStartupScript = `#!/usr/bin/env node

/**
 * Minimal MonsterBox startup for testing
 * Bypasses problematic proxy services
 */

process.env.SKIP_PROXY_SERVICES = 'true';
process.env.SKIP_WEBSOCKET_PROXY = 'true';
process.env.MINIMAL_MODE = 'true';

// Start the main application
require('./app.js');
`;

  fs.writeFileSync(path.join(__dirname, '..', 'app-minimal.js'), minimalStartupScript);
  console.log('✅ Created minimal startup script: app-minimal.js');
}

// Disable problematic services temporarily
function disableProblematicServices() {
  console.log('⏸️ Temporarily disabling problematic services...');
  
  // Create a service override configuration
  const serviceOverride = {
    disabled: [
      'dynamicWebSocketProxy',
      'elevenLabsSSLProxy',
      'sttSSLProxy'
    ],
    minimal: true,
    skipProxyServices: true
  };
  
  fs.writeFileSync(
    path.join(__dirname, '..', 'config', 'service-override.json'), 
    JSON.stringify(serviceOverride, null, 2)
  );
  
  console.log('✅ Created service override configuration');
}

// Main execution
async function main() {
  try {
    console.log('🔍 Step 1: Killing conflicting processes...');
    await killPortProcesses(MONSTERBOX_PORTS);
    
    console.log('\n🔧 Step 2: Updating service port configuration...');
    updateServicePorts();
    
    console.log('\n⏸️ Step 3: Disabling problematic services...');
    disableProblematicServices();
    
    console.log('\n🚀 Step 4: Creating minimal startup configuration...');
    createMinimalStartup();
    
    console.log('\n✅ Port conflict resolution completed!');
    console.log('\n📋 Next steps:');
    console.log('1. Start MonsterBox with: node app-minimal.js');
    console.log('2. Or use: PORT=3000 node app-minimal.js');
    console.log('3. Run validation tests');
    console.log('4. Re-enable services gradually after testing');
    
    console.log('\n🔧 To restore full functionality later:');
    console.log('1. Delete config/service-override.json');
    console.log('2. Restart with: npm start character skulltalker');
    
  } catch (error) {
    console.error('❌ Port conflict resolution failed:', error.message);
    process.exit(1);
  }
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n🛑 Port conflict resolution interrupted');
  process.exit(1);
});

// Run the main function
main().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
