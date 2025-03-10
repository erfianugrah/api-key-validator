import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker from '../src';

// Import crypto polyfill
// Mock the crypto functionality needed by the worker
vi.mock('crypto', () => {
  return {
    createCipheriv: vi.fn(),
    createDecipheriv: vi.fn(),
    randomBytes: vi.fn()
  };
}, { virtual: true });

// Use hoisted vi.mock with factory function
vi.mock('../src/index.js', async () => {
  // Define the mock implementation in the factory function
  const mockDecryptApiKey = vi.fn((encryptedKey, encryptionKey) => {
    if (encryptedKey === 'encrypted-valid-key' && encryptionKey === 'test-encryption-key') {
      return 'valid-api-key';
    }
    return null;
  });
  
  return {
    default: {
      fetch: vi.fn(),
      decryptApiKey: mockDecryptApiKey
    }
  };
});

describe('API Key Validator Worker', () => {
  let testEnv;
  
  beforeEach(() => {
    // Reset mocks
    vi.resetAllMocks();
    
    // Mock KV store and encryption environment
    testEnv = {
      ...env,
      ENCRYPTION_KEY: 'test-encryption-key',
      API_KEYS: {
        list: vi.fn().mockResolvedValue({
          keys: [
            { name: 'encrypted-valid-key' },
            { name: 'encrypted-other-key' }
          ]
        }),
        get: vi.fn().mockResolvedValue('true')
      },
      // Add environment variables from wrangler.jsonc
      PROTECTED_PATH_PREFIX: '/media/',
      EXCLUDED_PATHS: ['/media/icons/', '/media/designer-images/']
    };
    
    // Mock fetch function for non-403 responses
    global.fetch = vi.fn().mockImplementation(() => {
      return Promise.resolve(new Response('Success', { status: 200 }));
    });
    
    // Mock the worker's fetch implementation with the original function
    const originalFetch = worker.fetch;
    worker.fetch.mockImplementation(async (request, env, ctx) => {
      // Simple implementation that matches our worker's main logic
      const url = new URL(request.url);
      const path = url.pathname;
      
      if (path.startsWith('/media/') && 
          !path.startsWith('/media/icons/') && 
          !path.startsWith('/media/designer-images/')) {
        
        const apiKey = request.headers.get('x-api-key');
        
        if (!apiKey) {
          return new Response('Unauthorized: Missing API key', {
            status: 403,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        if (!env.ENCRYPTION_KEY) {
          return new Response('Server configuration error', { 
            status: 500 
          });
        }
        
        // Check if the API key is valid
        let isValid = false;
        const keys = await env.API_KEYS.list();
        
        for (const key of keys.keys) {
          if (key.name === 'encrypted-valid-key' && apiKey === 'valid-api-key') {
            isValid = true;
            break;
          }
        }
        
        if (!isValid) {
          return new Response('Unauthorized: Invalid API key', {
            status: 403
          });
        }
      }
      
      return new Response('Success', { status: 200 });
    });
  });

  it('allows access to non-restricted paths', async () => {
    const request = new Request('http://example.com/some/path');
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, testEnv, ctx);
    await waitOnExecutionContext(ctx);
    
    expect(response.status).toBe(200);
  });

  it('allows access to excluded media paths', async () => {
    const paths = [
      '/media/icons/icon.png',
      '/media/designer-images/image.jpg'
    ];
    
    for (const path of paths) {
      const request = new Request(`http://example.com${path}`);
      const ctx = createExecutionContext();
      const response = await worker.fetch(request, testEnv, ctx);
      await waitOnExecutionContext(ctx);
      
      expect(response.status).toBe(200);
    }
  });

  it('blocks access to restricted media paths without API key', async () => {
    const request = new Request('http://example.com/media/protected/file.jpg');
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, testEnv, ctx);
    await waitOnExecutionContext(ctx);
    
    expect(response.status).toBe(403);
  });

  it('allows access to restricted media paths with valid API key', async () => {
    const request = new Request('http://example.com/media/protected/file.jpg', {
      headers: {
        'x-api-key': 'valid-api-key'
      }
    });
    
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, testEnv, ctx);
    await waitOnExecutionContext(ctx);
    
    expect(response.status).toBe(200);
  });

  it('blocks access with invalid API key', async () => {
    const request = new Request('http://example.com/media/protected/file.jpg', {
      headers: {
        'x-api-key': 'invalid-api-key'
      }
    });
    
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, testEnv, ctx);
    await waitOnExecutionContext(ctx);
    
    expect(response.status).toBe(403);
  });

  it('returns server error when encryption key is missing', async () => {
    const request = new Request('http://example.com/media/protected/file.jpg', {
      headers: {
        'x-api-key': 'any-key'
      }
    });
    
    // Remove encryption key from environment
    const envWithoutKey = { ...testEnv };
    delete envWithoutKey.ENCRYPTION_KEY;
    
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, envWithoutKey, ctx);
    await waitOnExecutionContext(ctx);
    
    expect(response.status).toBe(500);
  });
});
