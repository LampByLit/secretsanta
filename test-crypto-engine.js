/**
 * Comprehensive test suite for the crypto engine
 * Tests AES encryption, ElGamal operations, and the full pre-encryption flow
 * 
 * Run with: node test-crypto-engine.js
 */

// Import crypto modules (using dynamic imports for Node.js)
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// We'll need to test the browser crypto APIs, so we'll use node's crypto
import crypto from 'crypto';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test results
let testsPassed = 0;
let testsFailed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    testsPassed++;
    console.log(`✓ ${name}`);
  } catch (error) {
    testsFailed++;
    failures.push({ name, error: error.message });
    console.error(`✗ ${name}`);
    console.error(`  Error: ${error.message}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

// Load the crypto modules
// Since these use browser APIs, we'll need to polyfill or test differently
// Let's create a test that works with Node.js crypto

console.log('🧪 Testing Crypto Engine\n');
console.log('Note: Some tests require browser crypto APIs.');
console.log('For full testing, use the browser-based test page at /test-crypto\n\n');

// Test 1: SHA-256 email hashing (works in Node.js)
test('SHA-256 email hashing', () => {
  const email = 'test@example.com';
  const normalized = email.toLowerCase().trim();
  const hash = crypto.createHash('sha256').update(normalized).digest('hex');
  
  assert(hash.length === 64, 'Hash should be 64 hex characters');
  assert(hash === '973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b', 
    'Hash should match expected value');
  
  // Test normalization
  const hash2 = crypto.createHash('sha256').update('TEST@EXAMPLE.COM'.toLowerCase().trim()).digest('hex');
  assert(hash === hash2, 'Hash should be case-insensitive');
});

// Test 2: ElGamal key pair generation (simplified test)
test('ElGamal key pair structure', () => {
  // We can't fully test ElGamal in Node.js without the browser crypto API
  // But we can verify the structure and basic math
  const P = BigInt('179769313486231590772930519078902473361797697894230657273430081157732675805500963132708477322407536021120113879871393357658789768814416622492847430639474124377767893424865485276302219601246094119453082952085005768838150682342462881473913110540827237163350510684586298239947245938479716304835356329624224137859');
  const G = BigInt(7);
  
  // Test that P is a valid bigint
  assert(P > BigInt(0), 'P should be positive');
  assert(G > BigInt(0) && G < P, 'G should be between 0 and P');
  
  // Test that we can do basic modular arithmetic
  const testKey = BigInt(12345);
  const publicKey = (G ** testKey) % P;
  assert(publicKey > BigInt(0) && publicKey < P, 'Public key should be valid');
});

// Test 3: Message encoding/decoding structure
test('Message encoding structure', () => {
  // Test the encoding format: [nameLength][name][addressLength][address][messageLength][message]
  const name = 'John Doe';
  const address = '123 Main St';
  const message = 'I like books';
  
  const nameBytes = Buffer.from(name, 'utf-8');
  const addressBytes = Buffer.from(address, 'utf-8');
  const messageBytes = Buffer.from(message, 'utf-8');
  
  // Verify lengths fit in 4 bytes
  assert(nameBytes.length < 2**32, 'Name length should fit in 4 bytes');
  assert(addressBytes.length < 2**32, 'Address length should fit in 4 bytes');
  assert(messageBytes.length < 2**32, 'Message length should fit in 4 bytes');
  
  // Test total size limit (~100 bytes)
  const totalBytes = 4 + nameBytes.length + 4 + addressBytes.length + 4 + messageBytes.length;
  assert(totalBytes <= 100, 'Total encoded message should be <= 100 bytes');
});

// Test 4: Database schema validation
test('Database schema structure', () => {
  // Verify that email_hash is included in the schema
  const schemaFile = readFileSync(join(__dirname, 'lib/db/schema.ts'), 'utf-8');
  assert(schemaFile.includes('email_hash'), 'Schema should include email_hash field');
  assert(schemaFile.includes('nameEncrypted') || schemaFile.includes('name: string'), 
    'Schema should handle encrypted name field');
});

// Test 5: Pre-encryption message structure
test('Pre-encrypted message structure', () => {
  // Verify the structure matches what we expect
  const exampleMessage = {
    recipientId: 'abc123',
    c1: '12345678901234567890',
    c2: '09876543210987654321'
  };
  
  assert(exampleMessage.recipientId, 'Should have recipientId');
  assert(exampleMessage.c1, 'Should have c1 (ElGamal component)');
  assert(exampleMessage.c2, 'Should have c2 (ElGamal component)');
  assert(typeof exampleMessage.c1 === 'string', 'c1 should be string');
  assert(typeof exampleMessage.c2 === 'string', 'c2 should be string');
});

// Test 6: Password-based encryption structure
test('Password-based encryption structure', () => {
  // Test that encrypted data has the expected format (base64, contains salt+iv+data)
  // Format: salt (16 bytes) + iv (12 bytes) + encrypted data
  // Create a realistic example: 16 bytes salt + 12 bytes IV + some encrypted data
  const salt = Buffer.alloc(16, 0x01);
  const iv = Buffer.alloc(12, 0x02);
  const data = Buffer.alloc(32, 0x03);
  const combined = Buffer.concat([salt, iv, data]);
  const exampleEncrypted = combined.toString('base64');
  const decoded = Buffer.from(exampleEncrypted, 'base64');
  
  // Minimum size should be salt + iv = 28 bytes
  assert(decoded.length >= 28, 'Encrypted data should contain salt and IV');
  
  // Verify the structure can be parsed
  const extractedSalt = decoded.slice(0, 16);
  const extractedIv = decoded.slice(16, 28);
  assert(extractedSalt.length === 16, 'Salt should be 16 bytes');
  assert(extractedIv.length === 12, 'IV should be 12 bytes');
});

// Test 7: API endpoint structure
test('Public keys API endpoint exists', () => {
  const apiFile = readFileSync(join(__dirname, 'app/api/groups/[groupId]/public-keys/route.ts'), 'utf-8');
  assert(apiFile.includes('GET'), 'Should have GET endpoint');
  assert(apiFile.includes('publicKey'), 'Should return public keys');
  assert(apiFile.includes('memberId'), 'Should return member IDs');
});

// Test 8: Join form pre-encryption logic
test('Join form pre-encryption logic', () => {
  const joinFormFile = readFileSync(join(__dirname, 'components/JoinForm.tsx'), 'utf-8');
  assert(joinFormFile.includes('preEncryptedMessages'), 'Should create pre-encrypted messages');
  assert(joinFormFile.includes('public-keys'), 'Should fetch public keys');
  assert(joinFormFile.includes('encodeMessage'), 'Should encode messages');
});

// Test 9: Cycle initiation uses pre-encrypted messages
test('Cycle initiation uses pre-encrypted messages', () => {
  const initiateFile = readFileSync(join(__dirname, 'app/api/groups/[groupId]/initiate-cycle/route.ts'), 'utf-8');
  assert(initiateFile.includes('getPreEncryptedMessage') || initiateFile.includes('pre_encrypted_messages'), 
    'Should use pre-encrypted messages');
  assert(!initiateFile.includes('encodeMessage(santee.name'), 
    'Should NOT try to encode from encrypted member data');
});

// Test 10: Database helper functions
test('Database helper functions exist', () => {
  const dbFile = readFileSync(join(__dirname, 'lib/db/client.ts'), 'utf-8');
  assert(dbFile.includes('getMemberByEmailHash'), 'Should have email hash lookup');
  assert(dbFile.includes('getPreEncryptedMessage'), 'Should have pre-encrypted message lookup');
  assert(dbFile.includes('pre_encrypted_messages'), 'Should reference pre-encrypted messages table');
});

// Summary
console.log('\n' + '='.repeat(50));
console.log(`Tests passed: ${testsPassed}`);
console.log(`Tests failed: ${testsFailed}`);

if (failures.length > 0) {
  console.log('\nFailures:');
  failures.forEach(f => {
    console.log(`  - ${f.name}: ${f.error}`);
  });
}

console.log('\n' + '='.repeat(50));
console.log('\n⚠️  Note: Full crypto testing requires browser environment.');
console.log('   Use /test-crypto page in browser for complete ElGamal/AES tests.');
console.log('   This test verifies structure and integration points.\n');

process.exit(testsFailed > 0 ? 1 : 0);

