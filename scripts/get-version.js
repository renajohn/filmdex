#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');

function getVersion() {
  try {
    // Check if we're in a git repository
    execSync('git rev-parse --git-dir', { stdio: 'ignore' });
    
    // Get the latest tag
    let latestTag;
    try {
      latestTag = execSync('git describe --tags --abbrev=0', { 
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'] // Suppress stderr
      }).trim();
    } catch (error) {
      // No tags found, start with v0.0.0
      latestTag = 'v0.0.0';
    }
    
    // Get commit count since last tag
    let commitCount;
    try {
      commitCount = execSync(`git rev-list ${latestTag}..HEAD --count`, { 
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'] // Suppress stderr
      }).trim();
    } catch (error) {
      // If we can't get commit count, try alternative approach
      try {
        commitCount = execSync('git rev-list --count HEAD', { 
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'] // Suppress stderr
        }).trim();
      } catch (error2) {
        commitCount = '0';
      }
    }
    
    // Get current branch
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { 
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'] // Suppress stderr
    }).trim();
    
    // Get short commit hash
    const commitHash = execSync('git rev-parse --short HEAD', { 
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'] // Suppress stderr
    }).trim();
    
    // Parse version from tag (remove 'v' prefix)
    const baseVersion = latestTag.replace(/^v/, '');
    
    if (commitCount === '0' && latestTag !== 'v0.0.0') {
      // We're exactly on a tag
      return baseVersion;
    } else if (branch === 'main' || branch === 'master') {
      // On main branch with commits since last tag - create pre-release
      return `${baseVersion}-${commitCount}.${commitHash}`;
    } else {
      // On feature branch - include branch name
      const cleanBranch = branch.replace(/[^a-zA-Z0-9]/g, '-');
      return `${baseVersion}-${cleanBranch}.${commitCount}.${commitHash}`;
    }
  } catch (error) {
    // Fallback to package.json version if git is not available
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    return packageJson.version;
  }
}

console.log(getVersion());