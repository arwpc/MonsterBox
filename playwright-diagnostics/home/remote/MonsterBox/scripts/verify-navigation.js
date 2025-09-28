#!/usr/bin/env node

/**
 * Script to verify that all EJS files use the unified navigation component
 * and that no old navigation code remains
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function findEJSFiles(dir, files = []) {
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
            findEJSFiles(fullPath, files);
        } else if (item.endsWith('.ejs')) {
            files.push(fullPath);
        }
    }
    
    return files;
}

function verifyNavigationInFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const relativePath = path.relative(process.cwd(), filePath);
        
        // Check if file uses unified navigation
        const hasUnifiedNav = content.includes('unified-navigation');
        
        // Check for old navigation patterns
        const hasOldNavbar = content.match(/<nav class="navbar[^>]*>[\s\S]*?<\/nav>/g);
        const hasOldNavbarNotUnified = hasOldNavbar && !hasUnifiedNav;
        
        // Check for character menu includes (should be removed)
        const hasCharacterMenuInclude = content.includes("include('partials/characterMenu')") || 
                                       content.includes('include("partials/characterMenu")') ||
                                       content.includes("include('../partials/characterMenu')") ||
                                       content.includes('include("../partials/characterMenu")');
        
        return {
            file: relativePath,
            hasUnifiedNav,
            hasOldNavbarNotUnified,
            hasCharacterMenuInclude,
            isNavigationFile: relativePath.includes('unified-navigation.ejs') || 
                             relativePath.includes('characterMenu.ejs'),
            status: hasUnifiedNav ? 'UNIFIED' : (hasOldNavbarNotUnified ? 'OLD_NAV' : 'NO_NAV')
        };
        
    } catch (error) {
        return {
            file: path.relative(process.cwd(), filePath),
            error: error.message,
            status: 'ERROR'
        };
    }
}

function main() {
    console.log('🔍 MonsterBox Navigation Verification');
    console.log('=====================================');
    
    const ejsFiles = findEJSFiles('views');
    const results = ejsFiles.map(verifyNavigationInFile);
    
    // Categorize results
    const unified = results.filter(r => r.status === 'UNIFIED');
    const oldNav = results.filter(r => r.status === 'OLD_NAV');
    const noNav = results.filter(r => r.status === 'NO_NAV' && !r.isNavigationFile);
    const errors = results.filter(r => r.status === 'ERROR');
    const characterMenuIssues = results.filter(r => r.hasCharacterMenuInclude);
    
    console.log('\n📊 RESULTS:');
    console.log(`✅ Files using unified navigation: ${unified.length}`);
    console.log(`❌ Files with old navigation: ${oldNav.length}`);
    console.log(`⚪ Files without navigation: ${noNav.length}`);
    console.log(`🔧 Navigation component files: ${results.filter(r => r.isNavigationFile).length}`);
    console.log(`⚠️  Files with character menu includes: ${characterMenuIssues.length}`);
    console.log(`💥 Errors: ${errors.length}`);
    
    if (unified.length > 0) {
        console.log('\n✅ UNIFIED NAVIGATION FILES:');
        unified.forEach(r => console.log(`   ${r.file}`));
    }
    
    if (oldNav.length > 0) {
        console.log('\n❌ FILES WITH OLD NAVIGATION:');
        oldNav.forEach(r => console.log(`   ${r.file}`));
    }
    
    if (characterMenuIssues.length > 0) {
        console.log('\n⚠️  FILES WITH CHARACTER MENU INCLUDES (should be removed):');
        characterMenuIssues.forEach(r => console.log(`   ${r.file}`));
    }
    
    if (noNav.length > 0) {
        console.log('\n⚪ FILES WITHOUT NAVIGATION (may be partials/components):');
        noNav.forEach(r => console.log(`   ${r.file}`));
    }
    
    if (errors.length > 0) {
        console.log('\n💥 ERRORS:');
        errors.forEach(r => console.log(`   ${r.file}: ${r.error}`));
    }
    
    console.log('\n=====================================');
    
    if (oldNav.length === 0 && characterMenuIssues.length === 0 && errors.length === 0) {
        console.log('🎉 SUCCESS: All pages use unified navigation!');
        console.log('🎭 MonsterBox navigation is now completely unified.');
    } else {
        console.log('⚠️  Some issues found that may need attention.');
    }
    
    return {
        success: oldNav.length === 0 && characterMenuIssues.length === 0 && errors.length === 0,
        unified: unified.length,
        issues: oldNav.length + characterMenuIssues.length + errors.length
    };
}

// Run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

export { verifyNavigationInFile, main };
