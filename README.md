# API Key Validator
## Features

- Path-based validation for media resources
- Advanced AES-256-GCM encryption of all API keys
- Secure storage of encrypted keys in Cloudflare KV
- Encryption key storage using Cloudflare Worker Secrets
- CLI tool for securely uploading and encrypting keys
- Path exclusions for public media resources

## Detailed Setup Guide

### 1. Create a KV Namespace

Create a KV namespace either through the Cloudflare dashboard or using Wrangler CLI:

```bash
# Create a KV namespace using Wrangler
npx wrangler kv:namespace create API_KEYS

# This will output something like:
# 🌀 Creating namespace with title "api-key-validator-API_KEYS"
# ✨ Success! Added KV namespace with ID "12345678abcdef..."
```

### 2. Update your wrangler.jsonc with the KV namespace ID:

```json
"kv_namespaces": [
  {
    "binding": "API_KEYS",
    "id": "12345678abcdef..."
  }
]
```

### 3. Generate and Upload API Keys

1. Generate API keys using the included tools:

```bash
# Generate 5 API keys and save to api-keys.json
npm run generate-keys -- --count 5 --output api-keys.json --prefix "media-api-"
```

Or create a JSON file manually with an array of API keys:

```json
[
  "media-api-key-12345",
  "media-access-67890",
  "custom-api-key-abcde"
]
```

2. Use the CLI tool to encrypt and upload the keys to KV:

```bash
# Upload keys and automatically set the Worker Secret
npm run upload-keys -- api-keys.json API_KEYS --set-secret

# Or upload without setting the secret (you'll do it manually)
npm run upload-keys -- api-keys.json API_KEYS
```

The CLI tool will:
- Generate a cryptographically secure encryption key
- Encrypt each API key using AES-256-GCM
- Upload the encrypted keys to your KV namespace
- Save the encryption key to `keys-metadata.json` temporarily
- Automatically set the Worker Secret (if `--set-secret` is used)
- Otherwise, provide instructions for setting the encryption key as a Worker Secret

You'll see output like:
```
🔑 Generated encryption key: 1a2b3c4d-5e6f7g8h-...

✅ Created keys-metadata.json with encryption key.

⚠️ IMPORTANT: Set the encryption key as a Workers Secret with this command:
npx wrangler secret put ENCRYPTION_KEY --text "1a2b3c4d-5e6f7g8h-..."

🔒 After setting the secret, delete keys-metadata.json for security.

📤 Uploading 3 API keys to API_KEYS...
✅ Uploaded API key: med...
✅ Uploaded API key: med...
✅ Uploaded API key: cus...

✅ API keys uploaded successfully!
```

### 4. Set the Encryption Key as a Worker Secret

Run the command provided by the CLI tool to set the encryption key as a Worker Secret:

```bash
npx wrangler secret put ENCRYPTION_KEY --text "1a2b3c4d-5e6f7g8h-..."
```

This will securely store your encryption key in the Cloudflare Worker Secrets storage.

### 5. Delete the keys-metadata.json file

Once you've set the encryption key as a Worker Secret, delete the `keys-metadata.json` file:

```bash
rm keys-metadata.json
```

### 6. Deploy the Worker

Deploy your worker to Cloudflare:

```bash
npm run deploy
```

### 7. Test Your Implementation

Test that the API key validation is working correctly:

```bash
# This should return 403 Forbidden
curl -v https://your-worker.your-namespace.workers.dev/media/files/test.jpg

# This should succeed
curl -v -H "x-api-key: media-api-key-12345" https://your-worker.your-namespace.workers.dev/media/files/test.jpg

# This path doesn't require API key validation and should succeed
curl -v https://your-worker.your-namespace.workers.dev/media/icons/test.png
```

## Generating Your Own Encryption Key (Optional)

If you want to generate and provide your own encryption key instead of using the auto-generated one:

1. Generate a secure 256-bit (32-byte) key. You can use Node.js:

```javascript
const crypto = require('crypto');
console.log(crypto.randomBytes(32).toString('hex'));
```

2. Format the key for readability (optional):

```javascript
const key = crypto.randomBytes(32).toString('hex');
console.log(key.match(/.{1,8}/g).join('-'));
```

3. Use your custom key when uploading API keys:

```bash
npm run upload-keys api-keys.json API_KEYS your-custom-encryption-key
```

## How the Encryption Works

### 1. Key Generation and Security

- A 256-bit (32-byte) encryption key is generated using Node.js `crypto.randomBytes()`
- The key is formatted with hyphens for readability (e.g., `1a2b3c4d-5e6f7g8h-...`)
- The key is stored as a Worker Secret, which is:
  - Encrypted at rest in Cloudflare's systems
  - Never exposed in your source code or wrangler.jsonc
  - Available only to your deployed Worker

### 2. API Key Encryption Process

1. The CLI tool:
   - Takes each plaintext API key
   - Generates a random initialization vector (IV)
   - Encrypts the API key using AES-256-GCM with the IV and encryption key
   - Adds the authentication tag to verify integrity
   - Combines the IV + authentication tag + encrypted data into a single string
   - Uploads this encrypted string to Cloudflare KV

2. The Worker:
   - Gets the incoming API key from the request header
   - Retrieves the encryption key from Worker Secrets
   - Gets all encrypted keys from KV
   - Attempts to decrypt each stored key and compare with the incoming key
   - Grants or denies access based on the comparison result

### 3. Encryption Algorithms

- **Symmetric encryption**: AES-256-GCM
  - AES (Advanced Encryption Standard) with 256-bit key length
  - GCM (Galois/Counter Mode) for authenticated encryption
  - Provides both confidentiality and integrity verification
- **Key derivation**: Direct 256-bit key
- **IV generation**: Cryptographically secure random 16 bytes

## API Key Management

### Test Utilities and Tools

This project includes a comprehensive set of utilities for working with API keys:

### API Key Tools CLI

The project includes a powerful CLI tool for managing API keys:

```bash
# Show help
node utils/cli-tools.js help

# Generate new API keys
npm run generate-keys -- --count 5 --output keys.json --prefix "api-" --length 32

# Generate a new encryption key
npm run generate-encryption-key

# Upload keys to KV
npm run upload-keys -- keys.json API_KEYS

# Rotate API keys (generate new keys and upload them)
npm run rotate-keys -- --namespace API_KEYS --encryption-key your-key --count 5 --output new-keys.json
```

### Using in Your Code

You can also use the utilities in your own code:

```javascript
const {
  generateApiKey,
  encryptApiKey,
  decryptApiKey,
  validateApiKey
} = require('./utils');

// Generate a secure API key
const apiKey = generateApiKey({
  prefix: 'my-api-',
  length: 32,
  formatted: true
});

// Encrypt an API key
const encryptedKey = encryptApiKey(apiKey, encryptionKey);

// Validate an API key
const isValid = validateApiKey(apiKey, encryptedKeys, encryptionKey);
```

## Adding New API Keys

To add new API keys to your system:

1. Generate new keys or create a JSON file with them:

```bash
npm run generate-keys -- --count 3 --output new-keys.json --prefix "api-"
```

2. Upload them using the same encryption key:

```bash
# Use the same encryption key that's stored in your Worker Secret
npm run upload-keys -- new-keys.json API_KEYS your-existing-encryption-key
```

### Rotating API Keys

To rotate API keys regularly (recommended security practice):

```bash
# Generate and upload new keys in one command
npm run rotate-keys -- --namespace API_KEYS --encryption-key your-key --count 5 --output new-keys.json
```

Then:
1. Communicate the new keys to your API consumers
2. Set a deprecation date for old keys

### Revoking API Keys

To revoke specific API keys:

1. Create a new JSON file without the keys you want to revoke
2. Upload the new set of keys

## Accessing Protected Endpoints

Include one of your API keys in the `x-api-key` header when making requests to protected media endpoints:

```bash
curl -X GET https://your-worker.your-namespace.workers.dev/media/protected/file.jpg \
  -H "x-api-key: media-api-key-12345"
```

## Development

```bash
# Install dependencies
npm install

# Run local development server
npm run dev

# Run tests
npm test

# Deploy to Cloudflare
npm run deploy
```

> **Note:** You may see a warning about the compatibility date when running tests. This is normal as the local testing environment might use an older compatibility date than specified in wrangler.jsonc. This won't affect your deployed worker, which will use the latest compatibility date.

## Testing

The project includes automated tests to verify the functionality of the API key validation:

```bash
# Run all tests
npm test

# Run tests in watch mode during development
npm run test:watch

# Test utility functions separately
npm run test:utils
```

The test suite covers:
- Key generation and validation
- API validation logic
- Path-based access control
- Error handling for missing/invalid keys

## Security Best Practices

1. **Regular key rotation**:
   - Rotate your API keys periodically
   - Consider automated rotation for high-security environments

2. **Monitoring and logging**:
   - Implement logging of API key usage
   - Set up alerts for suspicious activity

3. **Rate limiting**:
   - Consider adding rate limiting to prevent brute force attacks
   - Cloudflare has built-in rate limiting features you can use

4. **Key generation**:
   - Use cryptographically secure sources of randomness for key generation
   - Never reuse encryption keys across different environments

5. **Key storage**:
   - Always use Worker Secrets for encryption key storage
   - Never commit encryption keys to source control
   - Delete keys-metadata.json immediately after setting up Worker Secrets

## CLI Tool Options

```
npm run upload-keys <input-file> <kv-namespace> [encryption-key]

Arguments:
  input-file      Path to JSON file containing an array of API keys
  kv-namespace    The KV namespace binding name in your wrangler.jsonc
  encryption-key  Optional: 64-character hex string for your own custom encryption key
                  If not provided, a secure random key will be generated for you

Examples:
  npm run upload-keys api-keys.json API_KEYS
  npm run upload-keys api-keys.json API_KEYS 1a2b3c4d-5e6f7g8h-...
```

## Troubleshooting

1. **403 Forbidden errors for all requests**:
   - Verify the encryption key in Worker Secrets matches the one used during upload
   - Check that the API key in your request exactly matches one of the uploaded keys
   - Ensure the KV namespace is correctly configured

2. **500 Server errors**:
   - Check that the ENCRYPTION_KEY Worker Secret is set correctly
   - Verify that your KV namespace is accessible

3. **Path validation issues**:
   - Review the path patterns in the worker code
   - Test with various paths to ensure proper matching
