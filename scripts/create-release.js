#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');

function createRelease() {
  try {
    // Get current version from package.json
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const currentVersion = packageJson.version;
    
    // Create a git tag
    const tagName = `v${currentVersion}`;
    
    console.log(`Creating release tag: ${tagName}`);
    
    // Check if tag already exists
    try {
      execSync(`git rev-parse ${tagName}`, { stdio: 'ignore' });
      console.log(`Tag ${tagName} already exists!`);
      return;
    } catch (error) {
      // Tag doesn't exist, create it
    }
    
    // Create and push the tag
    execSync(`git tag ${tagName}`);
    execSync(`git push origin ${tagName}`);
    
    console.log(`✅ Release ${tagName} created and pushed!`);
    console.log(`Next time you run 'npm run docker:publish', it will use version ${currentVersion}`);
    
  } catch (error) {
    console.error('❌ Error creating release:', error.message);
    process.exit(1);
  }
}

createRelease();
