#!/usr/bin/env node
/**
 * CLI tools for API Key management
 * 
 * This script provides command-line utilities for managing API keys.
 * Run with --help to see available commands.
 */
const fs = require('fs');
const path = require('path');
const { 
  generateEncryptionKey, 
  generateApiKey,
  isValidEncryptionKey
} = require('./test-utils');

const {
  readApiKeysFromFile,
  uploadApiKeys,
  generateApiKeys,
  saveApiKeysToFile,
  rotateApiKeys,
  setupWorkerSecret
} = require('./key-management');

// Command definitions with help text
const commands = {
  generate: {
    description: 'Generate new API keys',
    usage: 'generate [options]',
    options: [
      { flag: '--count, -c', description: 'Number of keys to generate (default: 5)' },
      { flag: '--output, -o', description: 'Output file path (default: api-keys.json)' },
      { flag: '--prefix, -p', description: 'Key prefix (default: api-key-)' },
      { flag: '--special, -s', description: 'Include special characters' },
      { flag: '--length, -l', description: 'Key length (default: 32)' }
    ]
  },
  upload: {
    description: 'Upload API keys to KV store',
    usage: 'upload <file> <namespace> [encryption-key]',
    options: [
      { flag: '<file>', description: 'JSON file containing API keys array' },
      { flag: '<namespace>', description: 'KV namespace binding name' },
      { flag: '[encryption-key]', description: 'Optional encryption key (will be generated if not provided)' },
      { flag: '--set-secret, -s', description: 'Set encryption key as Worker Secret' }
    ]
  },
  rotate: {
    description: 'Rotate API keys',
    usage: 'rotate [options]',
    options: [
      { flag: '--namespace, -n', description: 'KV namespace binding name (required)' },
      { flag: '--encryption-key, -e', description: 'Encryption key (required)' },
      { flag: '--count, -c', description: 'Number of new keys to generate (default: 5)' },
      { flag: '--output, -o', description: 'Output file for new keys' }
    ]
  },
  verify: {
    description: 'Verify an API key',
    usage: 'verify <key> <encrypted-keys-file> <encryption-key>',
    options: [
      { flag: '<key>', description: 'API key to verify' },
      { flag: '<encrypted-keys-file>', description: 'File with encrypted keys' },
      { flag: '<encryption-key>', description: 'Encryption key' }
    ]
  },
  encrypt: {
    description: 'Generate an encryption key',
    usage: 'encrypt [options]',
    options: [
      { flag: '--formatted, -f', description: 'Format with dashes (default: true)' },
      { flag: '--output, -o', description: 'Save to file' },
      { flag: '--set-secret, -s', description: 'Set as Worker Secret' }
    ]
  },
  help: {
    description: 'Show help',
    usage: 'help [command]'
  }
};

// Parse command line args
function parseArgs() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';
  
  // Handle help command
  if (command === 'help') {
    const helpCommand = args[1];
    if (helpCommand && commands[helpCommand]) {
      showCommandHelp(helpCommand);
    } else {
      showHelp();
    }
    process.exit(0);
  }
  
  // Execute command
  switch (command) {
    case 'generate':
      executeGenerateCommand(args.slice(1));
      break;
    case 'upload':
      executeUploadCommand(args.slice(1));
      break;
    case 'rotate':
      executeRotateCommand(args.slice(1));
      break;
    case 'verify':
      executeVerifyCommand(args.slice(1));
      break;
    case 'encrypt':
      executeEncryptCommand(args.slice(1));
      break;
    default:
      console.error(`Unknown command: ${command}`);
      showHelp();
      process.exit(1);
  }
}

// Show general help
function showHelp() {
  console.log('API Key Management Tools\n');
  console.log('Usage: api-key-tools <command> [options]\n');
  console.log('Commands:');
  
  Object.keys(commands).forEach(cmd => {
    console.log(`  ${cmd.padEnd(10)} ${commands[cmd].description}`);
  });
  
  console.log('\nRun "api-key-tools help <command>" for help with a specific command');
}

// Show help for a specific command
function showCommandHelp(command) {
  const cmd = commands[command];
  console.log(`${command} - ${cmd.description}\n`);
  console.log(`Usage: api-key-tools ${cmd.usage}\n`);
  
  if (cmd.options && cmd.options.length > 0) {
    console.log('Options:');
    cmd.options.forEach(opt => {
      console.log(`  ${opt.flag.padEnd(20)} ${opt.description}`);
    });
  }
}

// Execute the generate command
function executeGenerateCommand(args) {
  // Parse options
  let count = 5;
  let outputFile = 'api-keys.json';
  let prefix = 'api-key-';
  let useSpecialChars = false;
  let length = 32;
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--count' || arg === '-c') {
      count = parseInt(args[++i], 10);
    } else if (arg === '--output' || arg === '-o') {
      outputFile = args[++i];
    } else if (arg === '--prefix' || arg === '-p') {
      prefix = args[++i];
    } else if (arg === '--special' || arg === '-s') {
      useSpecialChars = true;
    } else if (arg === '--length' || arg === '-l') {
      length = parseInt(args[++i], 10);
    }
  }
  
  // Generate keys
  const apiKeys = generateApiKeys(count, { 
    prefix, 
    useSpecialChars, 
    length,
    formatted: true
  });
  
  // Save to file
  saveApiKeysToFile(apiKeys, outputFile);
}

// Execute the upload command
async function executeUploadCommand(args) {
  if (args.length < 2) {
    console.error('Error: Missing required arguments');
    showCommandHelp('upload');
    process.exit(1);
  }
  
  const filePath = args[0];
  const namespace = args[1];
  let encryptionKey = args[2];
  let setSecret = false;
  
  // Check for --set-secret flag
  if (args.includes('--set-secret') || args.includes('-s')) {
    setSecret = true;
  }
  
  // Generate encryption key if not provided
  if (!encryptionKey) {
    encryptionKey = generateEncryptionKey();
    console.log(`\n🔑 Generated encryption key: ${encryptionKey}`);
  } else if (!isValidEncryptionKey(encryptionKey)) {
    console.error('Error: Invalid encryption key format');
    process.exit(1);
  }
  
  // Store encryption key in a JSON file temporarily
  const metadataFile = 'keys-metadata.json';
  fs.writeFileSync(metadataFile, JSON.stringify({ encryptionKey }, null, 2));
  console.log(`\n✅ Created ${metadataFile} with encryption key.`);
  
  // Set as Worker Secret if requested
  if (setSecret) {
    setupWorkerSecret(encryptionKey);
  } else {
    console.log('\n⚠️ IMPORTANT: Set the encryption key as a Workers Secret with:');
    console.log(`npx wrangler secret put ENCRYPTION_KEY --text "${encryptionKey}"`);
    console.log(`\n🔒 After setting the secret, delete ${metadataFile} for security.`);
  }
  
  // Read and upload API keys
  const apiKeys = readApiKeysFromFile(filePath);
  console.log(`\n📤 Uploading ${apiKeys.length} API keys to ${namespace}...`);
  await uploadApiKeys(apiKeys, namespace, encryptionKey);
  
  console.log('\n✅ API keys uploaded successfully!');
}

// Execute the rotate command
async function executeRotateCommand(args) {
  // Parse options
  let namespace = '';
  let encryptionKey = '';
  let count = 5;
  let outputFile = '';
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--namespace' || arg === '-n') {
      namespace = args[++i];
    } else if (arg === '--encryption-key' || arg === '-e') {
      encryptionKey = args[++i];
    } else if (arg === '--count' || arg === '-c') {
      count = parseInt(args[++i], 10);
    } else if (arg === '--output' || arg === '-o') {
      outputFile = args[++i];
    }
  }
  
  // Validate required options
  if (!namespace || !encryptionKey) {
    console.error('Error: Missing required arguments');
    showCommandHelp('rotate');
    process.exit(1);
  }
  
  // Validate encryption key
  if (!isValidEncryptionKey(encryptionKey)) {
    console.error('Error: Invalid encryption key format');
    process.exit(1);
  }
  
  // Rotate keys
  await rotateApiKeys({
    namespace,
    encryptionKey,
    newKeysCount: count,
    outputFile
  });
}

// Execute the verify command
function executeVerifyCommand(args) {
  if (args.length < 3) {
    console.error('Error: Missing required arguments');
    showCommandHelp('verify');
    process.exit(1);
  }
  
  const apiKey = args[0];
  const encryptedKeysFile = args[1];
  const encryptionKey = args[2];
  
  // Verify encryption key
  if (!isValidEncryptionKey(encryptionKey)) {
    console.error('Error: Invalid encryption key format');
    process.exit(1);
  }
  
  // Read encrypted keys
  console.log('Not yet implemented'); // Placeholder
}

// Execute the encrypt command
function executeEncryptCommand(args) {
  let formatted = true;
  let outputFile = '';
  let setSecret = false;
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--formatted' || arg === '-f') {
      formatted = args[++i] !== 'false';
    } else if (arg === '--output' || arg === '-o') {
      outputFile = args[++i];
    } else if (arg === '--set-secret' || arg === '-s') {
      setSecret = true;
    }
  }
  
  // Generate encryption key
  const encryptionKey = generateEncryptionKey(formatted);
  console.log(`\n🔑 Generated encryption key: ${encryptionKey}`);
  
  // Save to file if requested
  if (outputFile) {
    fs.writeFileSync(outputFile, JSON.stringify({ encryptionKey }, null, 2));
    console.log(`\n✅ Saved encryption key to ${outputFile}`);
  }
  
  // Set as Worker Secret if requested
  if (setSecret) {
    setupWorkerSecret(encryptionKey);
  }
}

// Run the CLI
parseArgs();