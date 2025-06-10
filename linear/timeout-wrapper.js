#!/usr/bin/env node

const { spawn } = require('child_process');

// Get timeout from command line args (in seconds)
const timeoutSeconds = parseInt(process.argv[2]) || 120;
const command = process.argv[3];
const args = process.argv.slice(4);

if (!command) {
  console.error('Usage: node timeout-wrapper.js <seconds> <command> [args...]');
  process.exit(1);
}

console.log(`⏱️  Running with ${timeoutSeconds}s timeout: ${command} ${args.join(' ')}`);

// Spawn the child process
const child = spawn(command, args, { 
  stdio: 'inherit',
  env: process.env 
});

// Set up the timeout
const timeout = setTimeout(() => {
  console.log(`\n⏰ Process timed out after ${timeoutSeconds} seconds, killing...`);
  child.kill('SIGTERM');
  
  // Force kill after 5 seconds if it doesn't respond to SIGTERM
  setTimeout(() => {
    child.kill('SIGKILL');
  }, 5000);
}, timeoutSeconds * 1000);

// Handle child process exit
child.on('exit', (code, signal) => {
  clearTimeout(timeout);
  
  if (signal) {
    console.log(`\n🛑 Process was killed with signal: ${signal}`);
    process.exit(124); // Same exit code as timeout command
  } else {
    console.log(`\n✅ Process completed with exit code: ${code}`);
    process.exit(code || 0);
  }
});

// Handle errors
child.on('error', (error) => {
  clearTimeout(timeout);
  console.error(`❌ Failed to start process: ${error.message}`);
  process.exit(1);
});

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('\n🛑 Received Ctrl+C, terminating child process...');
  clearTimeout(timeout);
  child.kill('SIGTERM');
}); 