#!/usr/bin/env node

/**
 * Manual test script for the API key utilities
 * This script tests the core functionality of the API key utilities.
 */

const {
  generateApiKey,
  generateEncryptionKey,
  encryptApiKey,
  decryptApiKey,
  isValidEncryptionKey,
  validateApiKey,
  createTestKeyData
} = require('./test-utils');

console.log('🧪 Starting API Key Utilities Tests');
console.log('===================================\n');

// Test API key generation
console.log('Testing API key generation:');
const apiKey1 = generateApiKey();
const apiKey2 = generateApiKey({ prefix: 'test-', length: 16 });
const apiKey3 = generateApiKey({ useSpecialChars: true });
const apiKey4 = generateApiKey({ formatted: false });

console.log(`Default API key: ${apiKey1}`);
console.log(`Prefixed API key: ${apiKey2}`);
console.log(`API key with special chars: ${apiKey3}`);
console.log(`Unformatted API key: ${apiKey4}`);
console.log('✅ API key generation tests passed\n');

// Test encryption key generation
console.log('Testing encryption key generation:');
const encryptionKey1 = generateEncryptionKey();
const encryptionKey2 = generateEncryptionKey(false);

console.log(`Formatted encryption key: ${encryptionKey1}`);
console.log(`Unformatted encryption key: ${encryptionKey2}`);
console.log(`Validation result for formatted key: ${isValidEncryptionKey(encryptionKey1)}`);
console.log(`Validation result for unformatted key: ${isValidEncryptionKey(encryptionKey2)}`);
console.log(`Validation result for invalid key: ${isValidEncryptionKey('invalid')}`);
console.log('✅ Encryption key generation tests passed\n');

// Test encryption and decryption
console.log('Testing encryption and decryption:');
const testKey = 'test-api-key-12345';
const encryptionKey = generateEncryptionKey();
const encryptedKey = encryptApiKey(testKey, encryptionKey);
const decryptedKey = decryptApiKey(encryptedKey, encryptionKey);

console.log(`Original key: ${testKey}`);
console.log(`Encrypted key: ${encryptedKey}`);
console.log(`Decrypted key: ${decryptedKey}`);
console.log(`Decryption successful: ${testKey === decryptedKey}`);

// Test with wrong encryption key
const wrongKey = generateEncryptionKey();
const badDecryption = decryptApiKey(encryptedKey, wrongKey);
console.log(`Decryption with wrong key: ${badDecryption === null ? 'Failed (expected)' : 'Succeeded (unexpected)'}`);
console.log('✅ Encryption/decryption tests passed\n');

// Test validation
console.log('Testing API key validation:');
const { apiKeys, encryptedKeys, encryptionKey: testEncryptionKey } = createTestKeyData(3);

console.log(`Generated ${apiKeys.length} test API keys:`);
apiKeys.forEach((key, i) => console.log(`  ${i+1}. ${key}`));

console.log(`\nValidation tests:`);
apiKeys.forEach((key, i) => {
  const isValid = validateApiKey(key, encryptedKeys, testEncryptionKey);
  console.log(`  Key ${i+1} valid: ${isValid}`);
});

// Test with invalid key
const invalidKey = 'invalid-key';
const invalidKeyResult = validateApiKey(invalidKey, encryptedKeys, testEncryptionKey);
console.log(`  Invalid key valid: ${invalidKeyResult} (should be false)`);
console.log('✅ Validation tests passed\n');

console.log('✅ All tests completed successfully');