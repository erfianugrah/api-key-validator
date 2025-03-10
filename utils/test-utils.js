/**
 * Test utilities for API Key Validator
 * 
 * This module provides utility functions for testing and managing API keys.
 * It includes functions for encryption/decryption, key generation, and validation.
 */
const crypto = require('crypto');

/**
 * Generates a cryptographically secure random API key with configurable options
 * 
 * @param {Object} options Configuration options
 * @param {number} options.length Length of the API key (default: 32)
 * @param {string} options.prefix Optional prefix for the API key (default: '')
 * @param {boolean} options.useSpecialChars Whether to include special characters (default: false)
 * @param {boolean} options.formatted Whether to format the key with dashes (default: true)
 * @returns {string} The generated API key
 */
function generateApiKey(options = {}) {
  const {
    length = 32,
    prefix = '',
    useSpecialChars = false,
    formatted = true
  } = options;
  
  // Generate random bytes
  const randomBytes = crypto.randomBytes(Math.ceil(length * 0.75));
  
  // Use base encoding suited to the character set needed
  let apiKey;
  if (useSpecialChars) {
    apiKey = randomBytes.toString('base64').slice(0, length);
  } else {
    apiKey = randomBytes.toString('hex').slice(0, length);
  }
  
  // Add prefix if provided
  apiKey = prefix + apiKey;
  
  // Format with dashes if requested
  if (formatted && apiKey.length >= 8) {
    apiKey = apiKey.match(/.{1,8}/g).join('-');
  }
  
  return apiKey;
}

/**
 * Encrypts an API key using AES-256-GCM
 * 
 * @param {string} apiKey The API key to encrypt
 * @param {string} encryptionKey The encryption key (hex string)
 * @returns {string} The encrypted API key (IV + authTag + ciphertext)
 */
function encryptApiKey(apiKey, encryptionKey) {
  const normalizedKey = encryptionKey.replace(/-/g, ''); // Remove any dashes
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(
    'aes-256-gcm', 
    Buffer.from(normalizedKey, 'hex'), 
    iv
  );
  
  let encrypted = cipher.update(apiKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag().toString('hex');
  
  return iv.toString('hex') + authTag + encrypted;
}

/**
 * Decrypts an encrypted API key
 * 
 * @param {string} encryptedKey The encrypted API key (IV + authTag + ciphertext)
 * @param {string} encryptionKey The encryption key (hex string)
 * @returns {string|null} The decrypted API key or null if decryption fails
 */
function decryptApiKey(encryptedKey, encryptionKey) {
  try {
    const normalizedKey = encryptionKey.replace(/-/g, ''); // Remove any dashes
    const iv = Buffer.from(encryptedKey.slice(0, 32), 'hex');
    const authTag = Buffer.from(encryptedKey.slice(32, 64), 'hex');
    const encrypted = encryptedKey.slice(64);
    
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm', 
      Buffer.from(normalizedKey, 'hex'), 
      iv
    );
    
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    return null;
  }
}

/**
 * Generates a new encryption key
 * 
 * @param {boolean} formatted Whether to format the key with dashes (default: true)
 * @returns {string} The generated encryption key
 */
function generateEncryptionKey(formatted = true) {
  const key = crypto.randomBytes(32).toString('hex');
  
  if (formatted) {
    return key.match(/.{1,8}/g).join('-');
  }
  
  return key;
}

/**
 * Validates that a string is a valid encryption key
 * 
 * @param {string} key The key to validate
 * @returns {boolean} Whether the key is valid
 */
function isValidEncryptionKey(key) {
  const normalizedKey = key.replace(/-/g, '');
  return /^[0-9a-f]{64}$/i.test(normalizedKey);
}

/**
 * Simulates the API key validation logic used in the Worker
 * This allows testing if a key would be valid without deploying
 * 
 * @param {string} apiKey The API key to validate
 * @param {string[]} encryptedKeys Array of encrypted API keys
 * @param {string} encryptionKey The encryption key
 * @returns {boolean} Whether the API key is valid
 */
function validateApiKey(apiKey, encryptedKeys, encryptionKey) {
  for (const encryptedKey of encryptedKeys) {
    const decrypted = decryptApiKey(encryptedKey, encryptionKey);
    if (decrypted === apiKey) {
      return true;
    }
  }
  return false;
}

/**
 * Creates test data for API key testing
 * 
 * @param {number} keyCount Number of API keys to generate (default: 5)
 * @returns {Object} Object containing apiKeys, encryptedKeys, and encryptionKey
 */
function createTestKeyData(keyCount = 5) {
  const encryptionKey = generateEncryptionKey();
  const apiKeys = [];
  const encryptedKeys = [];
  
  for (let i = 0; i < keyCount; i++) {
    const apiKey = generateApiKey({ prefix: `test-key-${i}-` });
    apiKeys.push(apiKey);
    encryptedKeys.push(encryptApiKey(apiKey, encryptionKey));
  }
  
  return {
    apiKeys,
    encryptedKeys,
    encryptionKey
  };
}

/**
 * Creates mock environment for testing the Worker
 * 
 * @param {Object} options Configuration options
 * @param {string[]} options.validApiKeys Array of valid API keys
 * @param {string} options.encryptionKey Encryption key
 * @returns {Object} The mock environment
 */
function createMockEnvironment(options = {}) {
  const {
    validApiKeys = ['test-api-key'],
    encryptionKey = generateEncryptionKey()
  } = options;
  
  // Encrypt the valid API keys
  const encryptedKeys = validApiKeys.map(key => 
    encryptApiKey(key, encryptionKey)
  );
  
  // Create a mock environment that can be used in tests
  return {
    ENCRYPTION_KEY: encryptionKey,
    API_KEYS: {
      list: async () => ({
        keys: encryptedKeys.map(key => ({ name: key }))
      }),
      get: async (key) => {
        // This mimics the behavior in the actual implementation
        return 'true';
      }
    }
  };
}

module.exports = {
  generateApiKey,
  encryptApiKey,
  decryptApiKey,
  generateEncryptionKey,
  isValidEncryptionKey,
  validateApiKey,
  createTestKeyData,
  createMockEnvironment
};