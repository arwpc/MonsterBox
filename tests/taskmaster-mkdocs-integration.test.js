/**
 * TaskMaster + MkDocs Integration Test
 * 
 * Tests the complete integration between TaskMaster and MkDocs
 * Validates documentation generation, build process, and content quality
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { expect } = require('chai');

describe('TaskMaster + MkDocs Integration', function() {
  this.timeout(30000); // Allow time for documentation builds

  describe('Configuration Files', function() {
    it('should have valid mkdocs.yml configuration', function() {
      expect(fs.existsSync('mkdocs.yml')).to.be.true;
      
      const content = fs.readFileSync('mkdocs.yml', 'utf8');
      expect(content).to.include('site_name: MonsterBox Documentation');
      expect(content).to.include('theme:');
      expect(content).to.include('name: material');
    });

    it('should have TaskMaster configuration', function() {
      expect(fs.existsSync('.taskmaster/config.json')).to.be.true;
      
      const config = JSON.parse(fs.readFileSync('.taskmaster/config.json', 'utf8'));
      expect(config).to.have.property('models');
      expect(config).to.have.property('global');
    });

    it('should have task status data', function() {
      expect(fs.existsSync('.taskmaster/reports/current-task-status.json')).to.be.true;
      
      const status = JSON.parse(fs.readFileSync('.taskmaster/reports/current-task-status.json', 'utf8'));
      expect(status).to.have.property('meta');
      expect(status).to.have.property('taskStatus');
      expect(status.meta).to.have.property('totalTasks');
    });
  });

  describe('Documentation Generation', function() {
    it('should generate task documentation', function() {
      // Run the documentation generator
      execSync('node scripts/generate-task-docs.js', { stdio: 'pipe' });
      
      // Check that task status documentation was created
      expect(fs.existsSync('docs/development/task-status.md')).to.be.true;
      
      const content = fs.readFileSync('docs/development/task-status.md', 'utf8');
      expect(content).to.include('# Task Status Report');
      expect(content).to.include('## Project Overview');
      expect(content).to.include('## Task Status');
    });

    it('should include TaskMaster integration documentation', function() {
      expect(fs.existsSync('docs/development/taskmaster-integration.md')).to.be.true;
      
      const content = fs.readFileSync('docs/development/taskmaster-integration.md', 'utf8');
      expect(content).to.include('# TaskMaster + MkDocs Integration');
      expect(content).to.include('## Integration Architecture');
    });

    it('should have all required testing documentation', function() {
      const testingDocs = [
        'docs/testing/api-testing.md',
        'docs/testing/integration.md',
        'docs/testing/security.md',
        'docs/testing/hardware.md',
        'docs/testing/conversation.md',
        'docs/testing/reports.md'
      ];

      testingDocs.forEach(docPath => {
        expect(fs.existsSync(docPath)).to.be.true;
      });
    });

    it('should have all required security documentation', function() {
      const securityDocs = [
        'docs/security/authorization.md',
        'docs/security/remote-access.md'
      ];

      securityDocs.forEach(docPath => {
        expect(fs.existsSync(docPath)).to.be.true;
      });
    });
  });

  describe('MkDocs Build Process', function() {
    it('should build documentation without errors', function() {
      // Build the documentation
      const result = execSync('export PATH=$PATH:/home/augment-agent/.local/bin && mkdocs build', { 
        stdio: 'pipe',
        encoding: 'utf8'
      });
      
      expect(result).to.include('Documentation built');
      expect(fs.existsSync('site')).to.be.true;
      expect(fs.existsSync('site/index.html')).to.be.true;
    });

    it('should generate proper navigation structure', function() {
      const mkdocsContent = fs.readFileSync('mkdocs.yml', 'utf8');
      
      // Check for TaskMaster integration in navigation
      expect(mkdocsContent).to.include('TaskMaster Integration: development/taskmaster-integration.md');
      expect(mkdocsContent).to.include('Task Status: development/task-status.md');
      
      // Check for testing documentation
      expect(mkdocsContent).to.include('API Testing: testing/api-testing.md');
      expect(mkdocsContent).to.include('Integration Testing: testing/integration.md');
      expect(mkdocsContent).to.include('Security Testing: testing/security.md');
    });

    it('should generate searchable content', function() {
      expect(fs.existsSync('site/search/search_index.json')).to.be.true;
      
      const searchIndex = JSON.parse(fs.readFileSync('site/search/search_index.json', 'utf8'));
      expect(searchIndex.docs).to.be.an('array');
      expect(searchIndex.docs.length).to.be.greaterThan(0);
    });
  });

  describe('Content Quality', function() {
    it('should have valid HTML output', function() {
      const indexPath = 'site/index.html';
      expect(fs.existsSync(indexPath)).to.be.true;
      
      const content = fs.readFileSync(indexPath, 'utf8');
      expect(content).to.include('<!DOCTYPE html>');
      expect(content).to.include('<title>');
      expect(content).to.include('MonsterBox Documentation');
    });

    it('should include TaskMaster content in generated site', function() {
      const taskStatusPath = 'site/development/task-status/index.html';
      expect(fs.existsSync(taskStatusPath)).to.be.true;
      
      const content = fs.readFileSync(taskStatusPath, 'utf8');
      expect(content).to.include('Task Status Report');
      expect(content).to.include('Project Overview');
    });

    it('should include integration documentation in generated site', function() {
      const integrationPath = 'site/development/taskmaster-integration/index.html';
      expect(fs.existsSync(integrationPath)).to.be.true;
      
      const content = fs.readFileSync(integrationPath, 'utf8');
      expect(content).to.include('TaskMaster + MkDocs Integration');
    });
  });

  describe('Build Scripts', function() {
    it('should have executable build script', function() {
      expect(fs.existsSync('scripts/build-docs.sh')).to.be.true;
      
      const stats = fs.statSync('scripts/build-docs.sh');
      expect(stats.mode & parseInt('111', 8)).to.be.greaterThan(0); // Check executable bit
    });

    it('should have npm scripts for documentation', function() {
      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      
      expect(packageJson.scripts).to.have.property('docs:generate');
      expect(packageJson.scripts).to.have.property('docs:build');
      expect(packageJson.scripts).to.have.property('docs:serve');
      expect(packageJson.scripts).to.have.property('docs:deploy');
    });
  });

  describe('GitHub Actions Integration', function() {
    it('should have GitHub Actions workflow for deployment', function() {
      expect(fs.existsSync('.github/workflows/mkdocs-deploy.yml')).to.be.true;
      
      const workflow = fs.readFileSync('.github/workflows/mkdocs-deploy.yml', 'utf8');
      expect(workflow).to.include('Deploy MkDocs to GitHub Pages');
      expect(workflow).to.include('mkdocs gh-deploy');
    });
  });

  describe('Integration Completeness', function() {
    it('should meet all success criteria', function() {
      // Check all success criteria from the task specification
      const criteria = [
        'MkDocs builds successfully without errors',
        'All task documentation auto-generates correctly',
        'Navigation structure is complete and functional',
        'Documentation site is accessible and responsive'
      ];

      // Verify MkDocs builds successfully
      expect(fs.existsSync('site/index.html')).to.be.true;
      
      // Verify task documentation generates
      expect(fs.existsSync('docs/development/task-status.md')).to.be.true;
      
      // Verify navigation structure
      const mkdocsContent = fs.readFileSync('mkdocs.yml', 'utf8');
      expect(mkdocsContent).to.include('TaskMaster Integration');
      
      // Verify site accessibility (basic check)
      const indexContent = fs.readFileSync('site/index.html', 'utf8');
      expect(indexContent).to.include('<!DOCTYPE html>');
    });

    it('should pass all quality checks', function() {
      // Verify documentation is up-to-date
      const taskStatus = fs.readFileSync('docs/development/task-status.md', 'utf8');
      expect(taskStatus).to.include(new Date().getFullYear().toString());
      
      // Verify search functionality exists
      expect(fs.existsSync('site/search/search_index.json')).to.be.true;
      
      // Verify mobile responsive design (check for viewport meta tag)
      const indexContent = fs.readFileSync('site/index.html', 'utf8');
      expect(indexContent).to.include('viewport');
    });
  });
});

// Helper function to check if a file contains specific content
function fileContains(filePath, content) {
  if (!fs.existsSync(filePath)) return false;
  const fileContent = fs.readFileSync(filePath, 'utf8');
  return fileContent.includes(content);
}
