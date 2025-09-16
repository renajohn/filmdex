#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

console.log('🔄 Starting backend development mode...');

function startBackend() {
  console.log('📦 Building backend...');
  
  const buildProcess = spawn('npm', ['run', 'build:dev'], {
    stdio: 'inherit',
    shell: true
  });

  buildProcess.on('close', (code) => {
    if (code === 0) {
      console.log('✅ Build completed, starting backend...');
      
      const startProcess = spawn('npm', ['start'], {
        stdio: 'inherit',
        shell: true,
        cwd: process.cwd()
      });

      startProcess.on('close', (code) => {
        console.log(`🔄 Backend stopped with code ${code}, restarting...`);
        setTimeout(startBackend, 1000);
      });

      startProcess.on('error', (err) => {
        console.error('❌ Error starting backend:', err);
        setTimeout(startBackend, 2000);
      });
    } else {
      console.error('❌ Build failed, retrying...');
      setTimeout(startBackend, 2000);
    }
  });

  buildProcess.on('error', (err) => {
    console.error('❌ Error building:', err);
    setTimeout(startBackend, 2000);
  });
}

startBackend();
