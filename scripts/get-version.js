#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');

function sanitizeForHomeAssistant(version) {
  // Home Assistant only allows: a-z, 0-9, dots, hyphens, underscores, braces
  // Convert to lowercase and replace invalid characters
  return version
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]/g, '-')  // Replace invalid chars with hyphens
    .replace(/-+/g, '-')              // Replace multiple hyphens with single
    .replace(/^-|-$/g, '');           // Remove leading/trailing hyphens
}

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
    
    let version;
    if (commitCount === '0' && latestTag !== 'v0.0.0') {
      // We're exactly on a tag
      version = baseVersion;
    } else if (branch === 'main' || branch === 'master') {
      // On main branch with commits since last tag - create pre-release
      version = `${baseVersion}-${commitCount}-${commitHash}`;
    } else {
      // On feature branch - include branch name
      const cleanBranch = branch.replace(/[^a-zA-Z0-9]/g, '-');
      version = `${baseVersion}-${cleanBranch}-${commitCount}-${commitHash}`;
    }
    
    // Sanitize for Home Assistant compatibility
    return sanitizeForHomeAssistant(version);
  } catch (error) {
    // Fallback to package.json version if git is not available
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    return sanitizeForHomeAssistant(packageJson.version);
  }
}

console.log(getVersion());