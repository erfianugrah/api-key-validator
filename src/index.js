/**
 * API Key validator for protected endpoints
 * Validates API keys for requests to protected paths while excluding specified paths
 * Uses environment variables to configure:
 * - PROTECTED_PATH_PREFIX: The path prefix that requires API key validation
 * - EXCLUDED_PATHS: Array of path prefixes that should be excluded from validation
 */

// Function to decrypt an API key
async function decryptApiKey(encryptedKey, encryptionKey) {
  try {
    // Extract IV (first 32 chars) and auth tag (next 32 chars) from the encrypted string
    const iv = new Uint8Array(encryptedKey.slice(0, 32).match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    const authTag = new Uint8Array(encryptedKey.slice(32, 64).match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    const encrypted = encryptedKey.slice(64);
    
    // Convert encryption key from hex to bytes
    const keyBytes = new Uint8Array(encryptionKey.replace(/-/g, '').match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    
    // Use Web Crypto API for decryption (compatible with Cloudflare Workers)
    const key = await crypto.subtle.importKey(
      "raw",
      keyBytes, 
      { name: "AES-GCM" },
      false,
      ["decrypt"]
    );
    
    // Create ciphertext
    const encryptedBytes = new Uint8Array(encrypted.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    
    // Combine auth tag with encrypted bytes for Web Crypto API
    const ciphertext = new Uint8Array(encryptedBytes.length + authTag.length);
    ciphertext.set(encryptedBytes);
    ciphertext.set(authTag, encryptedBytes.length);
    
    // Decrypt
    const decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv,
        additionalData: new Uint8Array(0),
        tagLength: 128
      },
      key,
      ciphertext
    );
    
    // Convert to string
    return new TextDecoder().decode(decrypted);
  } catch (error) {
    console.error('Decryption error:', error);
    return null;
  }
}

// Function to encrypt an API key (needed for validation)
async function encryptApiKey(apiKey, encryptionKey) {
  // Convert encryption key from hex to bytes
  const keyBytes = new Uint8Array(encryptionKey.replace(/-/g, '').match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
  
  // Generate random IV
  const iv = crypto.getRandomValues(new Uint8Array(16));
  
  // Import key using WebCrypto API
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );
  
  // Encrypt
  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: new Uint8Array(0),
      tagLength: 128
    },
    key,
    new TextEncoder().encode(apiKey)
  );
  
  // Convert encrypted data to hex
  const encryptedArray = Array.from(new Uint8Array(encrypted));
  const encryptedHex = encryptedArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  // Convert IV to hex
  const ivHex = Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('');
  
  // Return IV + encrypted data (first 32 chars will be the IV)
  return ivHex + encryptedHex;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // Get path patterns from environment variables
    const protectedPathPrefix = env.PROTECTED_PATH_PREFIX;
    const excludedPaths = env.EXCLUDED_PATHS || [];
    
    // Check if path matches the protected path pattern that requires validation
    // and is not in the excluded paths list
    if (path.startsWith(protectedPathPrefix) && 
        !excludedPaths.some(excludedPath => path.startsWith(excludedPath))) {
      
      // Get API key from request headers
      const apiKey = request.headers.get('x-api-key');
      
      if (!apiKey) {
        return new Response('Unauthorized: Missing API key', {
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      // Get the encryption key from Worker Secret
      const encryptionKey = env.ENCRYPTION_KEY;
      
      if (!encryptionKey) {
        console.error('Missing encryption key in Worker Secrets');
        return new Response('Server configuration error: Missing encryption key. Please set the ENCRYPTION_KEY Worker Secret.', { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      // Encrypt the API key to check against stored encrypted keys
      const encryptedKey = await encryptApiKey(apiKey, encryptionKey);
      
      // List all keys in KV to find a match
      // (This is a simplified approach - in production you would optimize this)
      const keyList = await env.API_KEYS.list();
      let isValidKey = false;
      
      // Check each key
      for (const key of keyList.keys) {
        const storedEncryptedKey = key.name;
        
        // Try to decrypt both and compare
        const decryptedStored = await decryptApiKey(storedEncryptedKey, encryptionKey);
        
        if (decryptedStored === apiKey) {
          isValidKey = true;
          break;
        }
      }
      
      if (!isValidKey) {
        return new Response('Unauthorized: Invalid API key', {
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
    
    // For paths that don't need validation or if validation passes, 
    // continue with the request
    return fetch(request);
  },
};
