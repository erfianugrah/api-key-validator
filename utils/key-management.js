/**
 * API Key Management Utilities
 * 
 * Command-line utilities for managing API keys outside of the worker environment.
 * This module provides tools for managing, verifying, and testing API keys.
 */
const fs = require('fs');
const { execSync } = require('child_process');
const { 
  generateApiKey, 
  encryptApiKey, 
  decryptApiKey, 
  generateEncryptionKey,
  isValidEncryptionKey 
} = require('./test-utils');

/**
 * Reads API keys from a JSON file
 * 
 * @param {string} filePath Path to JSON file with API keys
 * @returns {string[]} Array of API keys
 */
function readApiKeysFromFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const keys = JSON.parse(content);
    
    if (!Array.isArray(keys)) {
      throw new Error('API keys file must contain a JSON array');
    }
    
    return keys;
  } catch (error) {
    console.error(`Error reading API keys from ${filePath}:`, error.message);
    process.exit(1);
  }
}

/**
 * Uploads API keys to KV store
 * 
 * @param {string[]} apiKeys Array of API keys
 * @param {string} namespace KV namespace name
 * @param {string} encryptionKey Encryption key
 * @returns {Promise<void>}
 */
async function uploadApiKeys(apiKeys, namespace, encryptionKey) {
  for (const apiKey of apiKeys) {
    const encryptedKey = encryptApiKey(apiKey, encryptionKey);
    
    const command = `npx wrangler kv:key put --binding=${namespace} "${encryptedKey}" "true"`;
    
    try {
      execSync(command, { stdio: 'inherit' });
      console.log(`✅ Uploaded API key: ${apiKey.substring(0, 3)}...`);
    } catch (error) {
      console.error(`❌ Failed to upload API key: ${apiKey.substring(0, 3)}...`);
    }
  }
}

/**
 * Generates a new set of API keys
 * 
 * @param {number} count Number of keys to generate
 * @param {Object} options Options for key generation
 * @returns {string[]} Array of generated API keys
 */
function generateApiKeys(count, options = {}) {
  const keys = [];
  for (let i = 0; i < count; i++) {
    keys.push(generateApiKey({
      ...options,
      prefix: options.prefix ? `${options.prefix}${i}-` : `key${i}-`
    }));
  }
  return keys;
}

/**
 * Saves API keys to a JSON file
 * 
 * @param {string[]} apiKeys Array of API keys
 * @param {string} filePath Output file path
 */
function saveApiKeysToFile(apiKeys, filePath) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(apiKeys, null, 2));
    console.log(`✅ Saved ${apiKeys.length} API keys to ${filePath}`);
  } catch (error) {
    console.error(`❌ Failed to save API keys to ${filePath}:`, error.message);
  }
}

/**
 * Verifies that an API key would be valid with the given encryption key
 * 
 * @param {string} apiKey API key to verify
 * @param {string[]} encryptedKeys Array of encrypted keys
 * @param {string} encryptionKey Encryption key
 * @returns {boolean} Whether the API key is valid
 */
function verifyApiKey(apiKey, encryptedKeys, encryptionKey) {
  for (const encryptedKey of encryptedKeys) {
    const decrypted = decryptApiKey(encryptedKey, encryptionKey);
    if (decrypted === apiKey) {
      return true;
    }
  }
  return false;
}

/**
 * Manages API key rotation
 * 
 * @param {Object} options Rotation options
 * @param {string} options.oldKeysFile Path to file with old API keys
 * @param {string} options.namespace KV namespace name
 * @param {string} options.encryptionKey Encryption key
 * @param {number} options.newKeysCount Number of new keys to generate
 * @param {string} options.outputFile Path to save new keys
 * @returns {Promise<void>}
 */
async function rotateApiKeys(options) {
  const {
    oldKeysFile,
    namespace,
    encryptionKey,
    newKeysCount = 5,
    outputFile
  } = options;
  
  // Generate new keys
  const newKeys = generateApiKeys(newKeysCount, { 
    prefix: 'rotated-',
    formatted: true
  });
  
  // Upload new keys
  await uploadApiKeys(newKeys, namespace, encryptionKey);
  
  // Save new keys to file
  if (outputFile) {
    saveApiKeysToFile(newKeys, outputFile);
  }
  
  console.log('\n🔄 API key rotation complete!');
  console.log(`📝 ${newKeysCount} new keys have been generated and uploaded`);
  console.log('⚠️ Remember to notify your users about the new keys and set a deprecation date for old keys');
}

/**
 * Sets up Worker Secret for the encryption key
 * 
 * @param {string} encryptionKey Encryption key
 */
function setupWorkerSecret(encryptionKey) {
  try {
    console.log('🔒 Setting up Worker Secret for encryption key...');
    execSync(`npx wrangler secret put ENCRYPTION_KEY --text "${encryptionKey}"`, { 
      stdio: 'inherit' 
    });
    console.log('✅ Worker Secret set successfully!');
  } catch (error) {
    console.error('❌ Failed to set Worker Secret:', error.message);
  }
}

module.exports = {
  readApiKeysFromFile,
  uploadApiKeys,
  generateApiKeys,
  saveApiKeysToFile,
  verifyApiKey,
  rotateApiKeys,
  setupWorkerSecret
};