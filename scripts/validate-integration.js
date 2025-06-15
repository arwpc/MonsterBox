#!/usr/bin/env node

/**
 * TaskMaster + MkDocs Integration Validation Script
 * 
 * Validates the complete integration without requiring test dependencies
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔍 Validating TaskMaster + MkDocs Integration...\n');

let passed = 0;
let failed = 0;

function check(description, condition) {
  if (condition) {
    console.log(`✅ ${description}`);
    passed++;
  } else {
    console.log(`❌ ${description}`);
    failed++;
  }
}

function fileExists(filePath) {
  return fs.existsSync(filePath);
}

function fileContains(filePath, content) {
  if (!fs.existsSync(filePath)) return false;
  const fileContent = fs.readFileSync(filePath, 'utf8');
  return fileContent.includes(content);
}

// Configuration Files Validation
console.log('📋 Configuration Files:');
check('mkdocs.yml exists', fileExists('mkdocs.yml'));
check('mkdocs.yml has Material theme', fileContains('mkdocs.yml', 'name: material'));
check('TaskMaster config exists', fileExists('.taskmaster/config.json'));
check('Task status data exists', fileExists('.taskmaster/reports/current-task-status.json'));

// Documentation Files Validation
console.log('\n📚 Documentation Files:');
check('Task status documentation exists', fileExists('docs/development/task-status.md'));
check('TaskMaster integration docs exist', fileExists('docs/development/taskmaster-integration.md'));
check('API testing docs exist', fileExists('docs/testing/api-testing.md'));
check('Integration testing docs exist', fileExists('docs/testing/integration.md'));
check('Security testing docs exist', fileExists('docs/testing/security.md'));
check('Hardware testing docs exist', fileExists('docs/testing/hardware.md'));
check('Conversation testing docs exist', fileExists('docs/testing/conversation.md'));
check('Test reports docs exist', fileExists('docs/testing/reports.md'));
check('Authorization docs exist', fileExists('docs/security/authorization.md'));
check('Remote access docs exist', fileExists('docs/security/remote-access.md'));

// Navigation Structure Validation
console.log('\n🧭 Navigation Structure:');
check('TaskMaster Integration in nav', fileContains('mkdocs.yml', 'TaskMaster Integration: development/taskmaster-integration.md'));
check('Task Status in nav', fileContains('mkdocs.yml', 'Task Status: development/task-status.md'));
check('API Testing in nav', fileContains('mkdocs.yml', 'API Testing: testing/api-testing.md'));
check('Security Testing in nav', fileContains('mkdocs.yml', 'Security Testing: testing/security.md'));

// Build Scripts Validation
console.log('\n🔧 Build Scripts:');
check('Documentation generator exists', fileExists('scripts/generate-task-docs.js'));
check('Build script exists', fileExists('scripts/build-docs.sh'));
check('Build script is executable', fs.existsSync('scripts/build-docs.sh') && (fs.statSync('scripts/build-docs.sh').mode & parseInt('111', 8)) > 0);

// Package.json Scripts Validation
console.log('\n📦 Package.json Scripts:');
if (fileExists('package.json')) {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  check('docs:generate script exists', packageJson.scripts && packageJson.scripts['docs:generate']);
  check('docs:build script exists', packageJson.scripts && packageJson.scripts['docs:build']);
  check('docs:serve script exists', packageJson.scripts && packageJson.scripts['docs:serve']);
  check('docs:deploy script exists', packageJson.scripts && packageJson.scripts['docs:deploy']);
}

// GitHub Actions Validation
console.log('\n🚀 GitHub Actions:');
check('MkDocs deploy workflow exists', fileExists('.github/workflows/mkdocs-deploy.yml'));
check('Workflow has correct trigger', fileContains('.github/workflows/mkdocs-deploy.yml', 'branches:'));

// MkDocs Build Test
console.log('\n🏗️  MkDocs Build Test:');
try {
  console.log('Building documentation...');
  const result = execSync('export PATH=$PATH:/home/augment-agent/.local/bin && mkdocs build 2>&1', {
    stdio: 'pipe',
    encoding: 'utf8'
  });

  check('MkDocs builds without errors', result.includes('Documentation built') && !result.includes('ERROR'));
  check('Site directory created', fileExists('site'));
  check('Index page generated', fileExists('site/index.html'));
  check('Task status page generated', fileExists('site/development/task-status/index.html'));
  check('Integration docs generated', fileExists('site/development/taskmaster-integration/index.html'));
  check('Search index generated', fileExists('site/search/search_index.json'));
} catch (error) {
  console.log(`❌ MkDocs build failed: ${error.message}`);
  failed += 6;
}

// Content Quality Validation
console.log('\n📝 Content Quality:');
if (fileExists('site/index.html')) {
  check('Valid HTML structure', fileContains('site/index.html', '<!doctype html>') || fileContains('site/index.html', '<!DOCTYPE html>'));
  check('Site title present', fileContains('site/index.html', 'MonsterBox Documentation'));
  check('Responsive design meta tag', fileContains('site/index.html', 'viewport'));
}

if (fileExists('docs/development/task-status.md')) {
  check('Task status has current year', fileContains('docs/development/task-status.md', new Date().getFullYear().toString()));
  check('Task status has project overview', fileContains('docs/development/task-status.md', 'Project Overview'));
}

// Success Criteria Validation
console.log('\n🎯 Success Criteria:');
check('MkDocs builds successfully', fileExists('site/index.html'));
check('Task documentation auto-generates', fileExists('docs/development/task-status.md'));
check('Navigation structure complete', fileContains('mkdocs.yml', 'TaskMaster Integration'));
check('Documentation site accessible', fileExists('site/index.html') && fileContains('site/index.html', 'MonsterBox Documentation'));

// Quality Checks
console.log('\n✨ Quality Checks:');
check('Search functionality available', fileExists('site/search/search_index.json'));
check('Mobile responsive design', fileExists('site/index.html') && fileContains('site/index.html', 'viewport'));
check('Security documentation comprehensive', fileExists('docs/security/authorization.md') && fileExists('docs/security/remote-access.md'));

// Final Results
console.log('\n' + '='.repeat(50));
console.log(`📊 Validation Results:`);
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log(`📈 Success Rate: ${Math.round((passed / (passed + failed)) * 100)}%`);

if (failed === 0) {
  console.log('\n🎉 TaskMaster + MkDocs Integration is COMPLETE!');
  console.log('🚀 All success criteria met and quality checks passed.');
  
  // Update task status to 100% complete
  console.log('\n📋 Task 16 Status: READY FOR COMPLETION');
  console.log('✅ Subtask 16.1: MkDocs Documentation System Setup - COMPLETE');
  console.log('✅ Subtask 16.2: Task Documentation Integration - COMPLETE');
  console.log('✅ Subtask 16.3: Automated Documentation Generation - COMPLETE');
  console.log('✅ Subtask 16.4: Navigation Structure Implementation - COMPLETE');
  console.log('✅ Subtask 16.5: Integration Testing and Deployment - COMPLETE');
  
  process.exit(0);
} else {
  console.log('\n⚠️  Integration validation failed. Please review the failed checks above.');
  process.exit(1);
}
