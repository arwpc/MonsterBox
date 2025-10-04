/**
 * Syntax Validation Tests
 * 
 * These tests prevent JavaScript syntax errors from reaching production.
 * Specifically designed to catch issues like unclosed IIFEs, missing braces, etc.
 * 
 * Created in response to: calibration:3040 Uncaught SyntaxError: Unexpected end of input
 */

const fs = require('fs');
const path = require('path');
const { expect } = require('chai');

describe('JavaScript Syntax Validation', function() {
  
  describe('EJS Files with Inline JavaScript', function() {
    
    it('should have balanced braces in calibration.ejs', function() {
      const filePath = path.join(__dirname, '../views/setup/calibration.ejs');
      const content = fs.readFileSync(filePath, 'utf8');
      
      const openBraces = (content.match(/{/g) || []).length;
      const closeBraces = (content.match(/}/g) || []).length;
      
      expect(openBraces).to.equal(closeBraces, 
        `Unbalanced braces in calibration.ejs: ${openBraces} open, ${closeBraces} close`);
    });
    
    it('should have balanced parentheses in calibration.ejs', function() {
      const filePath = path.join(__dirname, '../views/setup/calibration.ejs');
      const content = fs.readFileSync(filePath, 'utf8');
      
      const openParens = (content.match(/\(/g) || []).length;
      const closeParens = (content.match(/\)/g) || []).length;
      
      expect(openParens).to.equal(closeParens,
        `Unbalanced parentheses in calibration.ejs: ${openParens} open, ${closeParens} close`);
    });
    
    it('should have balanced brackets in calibration.ejs', function() {
      const filePath = path.join(__dirname, '../views/setup/calibration.ejs');
      const content = fs.readFileSync(filePath, 'utf8');
      
      const openBrackets = (content.match(/\[/g) || []).length;
      const closeBrackets = (content.match(/\]/g) || []).length;
      
      expect(openBrackets).to.equal(closeBrackets,
        `Unbalanced brackets in calibration.ejs: ${openBrackets} open, ${closeBrackets} close`);
    });
    
    it('should properly close all IIFEs in calibration.ejs', function() {
      const filePath = path.join(__dirname, '../views/setup/calibration.ejs');
      const content = fs.readFileSync(filePath, 'utf8');
      
      // Find all IIFE patterns: (function () {
      const iifeStarts = content.match(/\(function\s*\(\s*\)\s*{/g) || [];
      
      // Find all IIFE closures: })();
      const iifeEnds = content.match(/}\s*\)\s*\(\s*\)\s*;/g) || [];
      
      expect(iifeStarts.length).to.equal(iifeEnds.length,
        `Unclosed IIFE in calibration.ejs: ${iifeStarts.length} starts, ${iifeEnds.length} ends`);
    });
    
    it('should have all script tags properly closed in calibration.ejs', function() {
      const filePath = path.join(__dirname, '../views/setup/calibration.ejs');
      const content = fs.readFileSync(filePath, 'utf8');
      
      const openScriptTags = (content.match(/<script(?:\s|>)/g) || []).length;
      const closeScriptTags = (content.match(/<\/script>/g) || []).length;
      
      expect(openScriptTags).to.equal(closeScriptTags,
        `Unclosed script tags in calibration.ejs: ${openScriptTags} open, ${closeScriptTags} close`);
    });
    
    it('should not have extra blank lines before closing braces', function() {
      const filePath = path.join(__dirname, '../views/setup/calibration.ejs');
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      
      const problematicLines = [];
      for (let i = 0; i < lines.length - 1; i++) {
        // Check for pattern: blank line followed by blank line followed by closing brace
        if (lines[i].trim() === '' && 
            lines[i + 1].trim() === '' && 
            i + 2 < lines.length &&
            lines[i + 2].trim().match(/^}\s*(\/\/.*)?$/)) {
          problematicLines.push(i + 1); // Line numbers are 1-based
        }
      }
      
      expect(problematicLines).to.be.empty,
        `Extra blank lines before closing braces at lines: ${problematicLines.join(', ')}`);
    });
  });
  
  describe('All EJS Files', function() {
    
    it('should have balanced braces in all EJS files', function() {
      const viewsDir = path.join(__dirname, '../views');
      const ejsFiles = getAllEjsFiles(viewsDir);
      
      const unbalanced = [];
      
      ejsFiles.forEach(file => {
        const content = fs.readFileSync(file, 'utf8');
        const openBraces = (content.match(/{/g) || []).length;
        const closeBraces = (content.match(/}/g) || []).length;
        
        if (openBraces !== closeBraces) {
          unbalanced.push({
            file: path.relative(viewsDir, file),
            open: openBraces,
            close: closeBraces
          });
        }
      });
      
      expect(unbalanced).to.be.empty,
        `Unbalanced braces in files:\n${unbalanced.map(u => 
          `  ${u.file}: ${u.open} open, ${u.close} close`).join('\n')}`);
    });
    
    it('should have all script tags properly closed in all EJS files', function() {
      const viewsDir = path.join(__dirname, '../views');
      const ejsFiles = getAllEjsFiles(viewsDir);
      
      const unclosed = [];
      
      ejsFiles.forEach(file => {
        const content = fs.readFileSync(file, 'utf8');
        const openScriptTags = (content.match(/<script(?:\s|>)/g) || []).length;
        const closeScriptTags = (content.match(/<\/script>/g) || []).length;
        
        if (openScriptTags !== closeScriptTags) {
          unclosed.push({
            file: path.relative(viewsDir, file),
            open: openScriptTags,
            close: closeScriptTags
          });
        }
      });
      
      expect(unclosed).to.be.empty,
        `Unclosed script tags in files:\n${unclosed.map(u => 
          `  ${u.file}: ${u.open} open, ${u.close} close`).join('\n')}`);
    });
  });
  
  describe('Public JavaScript Files', function() {
    
    it('should have balanced braces in all JS files', function() {
      const publicDir = path.join(__dirname, '../public/js');
      if (!fs.existsSync(publicDir)) {
        this.skip();
        return;
      }
      
      const jsFiles = getAllJsFiles(publicDir);
      const unbalanced = [];
      
      jsFiles.forEach(file => {
        const content = fs.readFileSync(file, 'utf8');
        const openBraces = (content.match(/{/g) || []).length;
        const closeBraces = (content.match(/}/g) || []).length;
        
        if (openBraces !== closeBraces) {
          unbalanced.push({
            file: path.relative(publicDir, file),
            open: openBraces,
            close: closeBraces
          });
        }
      });
      
      expect(unbalanced).to.be.empty,
        `Unbalanced braces in files:\n${unbalanced.map(u => 
          `  ${u.file}: ${u.open} open, ${u.close} close`).join('\n')}`);
    });
  });
});

/**
 * Recursively get all .ejs files in a directory
 */
function getAllEjsFiles(dir) {
  const files = [];
  
  function traverse(currentDir) {
    const items = fs.readdirSync(currentDir);
    
    items.forEach(item => {
      const fullPath = path.join(currentDir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        // Skip node_modules and other common directories
        if (!item.startsWith('.') && item !== 'node_modules') {
          traverse(fullPath);
        }
      } else if (item.endsWith('.ejs')) {
        files.push(fullPath);
      }
    });
  }
  
  traverse(dir);
  return files;
}

/**
 * Recursively get all .js files in a directory
 */
function getAllJsFiles(dir) {
  const files = [];
  
  function traverse(currentDir) {
    const items = fs.readdirSync(currentDir);
    
    items.forEach(item => {
      const fullPath = path.join(currentDir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        if (!item.startsWith('.') && item !== 'node_modules') {
          traverse(fullPath);
        }
      } else if (item.endsWith('.js')) {
        files.push(fullPath);
      }
    });
  }
  
  traverse(dir);
  return files;
}

