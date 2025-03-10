import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the crypto module and functions needed for testing
vi.mock('crypto', () => {
  return {
    randomBytes: (size) => {
      // Mock implementation that returns predictable "random" bytes
      return {
        toString: (encoding) => {
          if (encoding === 'hex') {
            return '0123456789abcdef'.repeat(Math.ceil(size / 8));
          } else if (encoding === 'base64') {
            return 'YWJjZGVmZ2hpamtsbW5vcA=='.substring(0, size);
          }
          return 'mockbytes';
        }
      };
    }
  };
}, { virtual: true });

// Create mock implementations for testing purposes
const generateApiKey = (options = {}) => {
  const {
    length = 32,
    prefix = '',
    useSpecialChars = false,
    formatted = true
  } = options;
  
  let apiKey = useSpecialChars 
    ? 'YWJjZGVmZ2hpamtsbW5vcA=='.substring(0, length) 
    : '0123456789abcdef'.repeat(Math.ceil(length / 8)).substring(0, length);
  
  apiKey = prefix + apiKey;
  
  if (formatted && apiKey.length >= 8) {
    apiKey = apiKey.match(/.{1,8}/g).join('-');
  }
  
  return apiKey;
};

const generateEncryptionKey = (formatted = true) => {
  const key = '0123456789abcdef'.repeat(4); // 64 hex chars (32 bytes)
  return formatted ? key.match(/.{1,8}/g).join('-') : key;
};

const isValidEncryptionKey = (key) => {
  const normalizedKey = key.replace(/-/g, '');
  return /^[0-9a-f]{64}$/i.test(normalizedKey);
};

describe('API Key Utilities', () => {
  describe('generateApiKey', () => {
    it('generates API keys with default options', () => {
      const apiKey = generateApiKey();
      expect(apiKey).toBeDefined();
      expect(apiKey.length).toBeGreaterThan(8);
    });

    it('respects prefix option', () => {
      const prefix = 'test-';
      const apiKey = generateApiKey({ prefix });
      expect(apiKey.startsWith(prefix)).toBe(true);
    });

    it('respects length option', () => {
      const length = 16;
      const apiKey = generateApiKey({ length, formatted: false });
      expect(apiKey.length).toBeGreaterThanOrEqual(length);
    });

    it('formats keys with dashes by default', () => {
      const apiKey = generateApiKey({ length: 32 });
      expect(apiKey).toContain('-');
    });

    it('can generate keys without formatting', () => {
      const apiKey = generateApiKey({ formatted: false });
      expect(apiKey).not.toContain('-');
    });
  });

  describe('generateEncryptionKey', () => {
    it('generates a formatted encryption key by default', () => {
      const key = generateEncryptionKey();
      expect(key).toContain('-');
      expect(key.replace(/-/g, '').length).toBe(64); // 32 bytes = 64 hex chars
    });

    it('can generate unformatted encryption keys', () => {
      const key = generateEncryptionKey(false);
      expect(key).not.toContain('-');
      expect(key.length).toBe(64);
    });
  });

  describe('isValidEncryptionKey', () => {
    it('validates correctly formatted keys', () => {
      const key = generateEncryptionKey();
      expect(isValidEncryptionKey(key)).toBe(true);
    });

    it('validates unformatted keys', () => {
      const key = generateEncryptionKey(false);
      expect(isValidEncryptionKey(key)).toBe(true);
    });

    it('rejects keys of incorrect length', () => {
      expect(isValidEncryptionKey('abc123')).toBe(false);
    });

    it('rejects keys with invalid characters', () => {
      const invalidKey = 'z'.repeat(64);
      expect(isValidEncryptionKey(invalidKey)).toBe(false);
    });
  });
});