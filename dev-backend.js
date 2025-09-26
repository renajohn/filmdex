#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

// Load environment variables from .env file
require('dotenv').config();

console.log('🔄 Starting backend development mode...');

function startBackend() {
  console.log('🚀 Starting backend directly from source...');
  
  const startProcess = spawn('npm', ['run', 'dev'], {
    stdio: 'inherit',
    shell: true,
    cwd: path.join(__dirname, 'backend'),
    env: { ...process.env }
  });

  startProcess.on('close', (code) => {
    console.log(`🔄 Backend stopped with code ${code}, restarting...`);
    setTimeout(startBackend, 1000);
  });

  startProcess.on('error', (err) => {
    console.error('❌ Error starting backend:', err);
    setTimeout(startBackend, 2000);
  });
}

startBackend();
