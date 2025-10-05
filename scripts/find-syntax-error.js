#!/usr/bin/env node
/**
 * Find Syntax Error in Calibration IIFE
 * 
 * This script extracts the IIFE from calibration.ejs and tries to parse it
 * to find the exact location of the syntax error.
 */

import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function findSyntaxError() {
  console.log('🔍 Extracting IIFE from calibration.ejs...\n');
  
  // Extract the IIFE
  const { stdout } = await execAsync(
    "sed -n '/^      (function () {$/,/^      }) (); \\/\\/ End IIFE/p' views/setup/calibration.ejs"
  );
  
  const iife = stdout;
  const lines = iife.split('\n');
  
  console.log(`📊 IIFE has ${lines.length} lines\n`);
  
  // Try to find unbalanced braces by tracking them line by line
  let braceStack = [];
  let parenStack = [];
  let inString = false;
  let inTemplate = false;
  let stringChar = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      const prevChar = j > 0 ? line[j - 1] : '';
      
      // Handle strings
      if ((char === '"' || char === "'") && prevChar !== '\\') {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
        }
      }
      
      // Handle template literals
      if (char === '`' && prevChar !== '\\' && !inString) {
        inTemplate = !inTemplate;
      }
      
      // Skip if in string or template
      if (inString || inTemplate) continue;
      
      // Track braces
      if (char === '{') {
        braceStack.push({ line: lineNum, col: j + 1 });
      } else if (char === '}') {
        if (braceStack.length === 0) {
          console.log(`❌ FOUND IT! Extra closing brace at line ${lineNum}, column ${j + 1}`);
          console.log(`   Line content: ${line.trim()}`);
          return;
        }
        braceStack.pop();
      }
      
      // Track parentheses
      if (char === '(') {
        parenStack.push({ line: lineNum, col: j + 1 });
      } else if (char === ')') {
        if (parenStack.length === 0) {
          console.log(`❌ FOUND IT! Extra closing paren at line ${lineNum}, column ${j + 1}`);
          console.log(`   Line content: ${line.trim()}`);
          return;
        }
        parenStack.pop();
      }
    }
  }
  
  if (braceStack.length > 0) {
    console.log(`❌ FOUND IT! Unclosed opening braces:`);
    braceStack.forEach(b => {
      console.log(`   Line ${b.line}, column ${b.col}: ${lines[b.line - 1].trim()}`);
    });
  } else if (parenStack.length > 0) {
    console.log(`❌ FOUND IT! Unclosed opening parens:`);
    parenStack.forEach(p => {
      console.log(`   Line ${p.line}, column ${p.col}: ${lines[p.line - 1].trim()}`);
    });
  } else {
    console.log(`✅ All braces and parentheses are balanced!`);
    console.log(`\n🤔 The syntax error must be something else...`);
    
    // Try to parse with Node
    console.log(`\n📝 Trying to parse with Node.js...\n`);
    try {
      new Function(iife);
      console.log(`✅ Node.js can parse the IIFE successfully!`);
    } catch (e) {
      console.log(`❌ Node.js parse error: ${e.message}`);
      console.log(`   ${e.stack}`);
    }
  }
}

findSyntaxError().catch(console.error);

