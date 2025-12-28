// Comprehensive crypto test including client-side key generation and AES encryption
// Run with: node test-crypto-full.mjs

import { readFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

console.log('🧪 Testing Full Crypto System (Including Client-Side Flow)...\n');

// Import bigint-crypto-utils
const { modPow, modInv } = await import('bigint-crypto-utils');

// ElGamal parameters (same as in elgamal.ts)
const P = BigInt('179769313486231590772930519078902473361797697894230657273430081157732675805500963132708477322407536021120113879871393357658789768814416622492847430639474124377767893424865485276302219601246094119453082952085005768838150682342462881473913110540827237163350510684586298239947245938479716304835356329624224137859');
const G = BigInt(7);

// Import Node.js crypto for random bytes
const crypto = await import('crypto');

// Copy functions from elgamal.ts
function encodeMessage(name, address, message) {
  const encoder = new TextEncoder();
  const nameBytes = encoder.encode(name);
  const addressBytes = encoder.encode(address);
  const messageBytes = encoder.encode(message);
  
  const totalBytes = 4 + nameBytes.length + 4 + addressBytes.length + 4 + messageBytes.length;
  if (totalBytes > 100) {
    throw new Error(`Message too large: ${totalBytes} bytes (max 100)`);
  }
  
  const buffer = new Uint8Array(totalBytes);
  let offset = 0;
  
  const nameLength = nameBytes.length;
  buffer[offset++] = (nameLength >> 24) & 0xff;
  buffer[offset++] = (nameLength >> 16) & 0xff;
  buffer[offset++] = (nameLength >> 8) & 0xff;
  buffer[offset++] = nameLength & 0xff;
  
  buffer.set(nameBytes, offset);
  offset += nameBytes.length;
  
  const addressLength = addressBytes.length;
  buffer[offset++] = (addressLength >> 24) & 0xff;
  buffer[offset++] = (addressLength >> 16) & 0xff;
  buffer[offset++] = (addressLength >> 8) & 0xff;
  buffer[offset++] = addressLength & 0xff;
  
  buffer.set(addressBytes, offset);
  offset += addressLength;
  
  const messageLength = messageBytes.length;
  buffer[offset++] = (messageLength >> 24) & 0xff;
  buffer[offset++] = (messageLength >> 16) & 0xff;
  buffer[offset++] = (messageLength >> 8) & 0xff;
  buffer[offset++] = messageLength & 0xff;
  
  buffer.set(messageBytes, offset);
  
  let result = BigInt(0);
  for (let i = 0; i < buffer.length; i++) {
    result = result * BigInt(256) + BigInt(buffer[i]);
  }
  
  if (result >= P) {
    throw new Error(`Encoded message too large: ${result} >= ${P}`);
  }
  
  return result;
}

function decodeMessage(encoded) {
  let hex = encoded.toString(16);
  if (hex.length % 2 !== 0) {
    hex = '0' + hex;
  }
  
  let bytes = [];
  for (let i = 0; i < hex.length; i += 2) {
    const byteHex = hex.slice(i, i + 2);
    bytes.push(parseInt(byteHex, 16));
  }
  
  let nameLength = 0;
  let attempts = 0;
  const maxAttempts = 10;
  
  while (attempts < maxAttempts) {
    if (bytes.length < 4) {
      bytes.unshift(0);
      attempts++;
      continue;
    }
    
    nameLength = (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3];
    
    if (nameLength >= 0 && nameLength <= 1000 && bytes.length >= 4 + nameLength + 4) {
      break;
    }
    
    bytes.unshift(0);
    attempts++;
  }
  
  if (attempts >= maxAttempts) {
    throw new Error('Could not determine valid message structure');
  }

  if (bytes.length < 4 + nameLength) {
    throw new Error(`Invalid encoded message: name truncated`);
  }
  const nameBytes = bytes.slice(4, 4 + nameLength);
  const decoder = new TextDecoder();
  const name = decoder.decode(new Uint8Array(nameBytes));
  
  let offset = 4 + nameLength;
  if (bytes.length < offset + 4) {
    throw new Error(`Invalid encoded message: address length missing`);
  }
  const addressLength = (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
  
  if (addressLength < 0 || addressLength > 1000) {
    throw new Error(`Invalid address length: ${addressLength}`);
  }
  
  offset += 4;
  if (bytes.length < offset + addressLength) {
    throw new Error(`Invalid encoded message: address truncated`);
  }
  const addressBytes = bytes.slice(offset, offset + addressLength);
  const address = decoder.decode(new Uint8Array(addressBytes));
  
  offset += addressLength;
  if (bytes.length < offset + 4) {
    throw new Error(`Invalid encoded message: message length missing`);
  }
  const messageLength = (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
  
  if (messageLength < 0 || messageLength > 1000) {
    throw new Error(`Invalid message length: ${messageLength}`);
  }
  
  offset += 4;
  if (bytes.length < offset + messageLength) {
    throw new Error(`Invalid encoded message: message truncated`);
  }
  const messageBytes = bytes.slice(offset, offset + messageLength);
  const message = decoder.decode(new Uint8Array(messageBytes));
  
  return { name, address, message };
}

async function generateKeyPair() {
  const max = P - BigInt(2);
  const min = BigInt(2);
  const range = max - min;
  
  const randomBytes = new Uint8Array(128);
  crypto.default.getRandomValues(randomBytes);
  
  let randomBigInt = BigInt(0);
  for (let i = 0; i < randomBytes.length; i++) {
    randomBigInt = randomBigInt * BigInt(256) + BigInt(randomBytes[i]);
  }
  
  const privateKey = (randomBigInt % range) + min;
  const privateKeyDoubled = privateKey * BigInt(2); // Fix for quadratic residues
  
  const publicKey = await modPow(G, privateKeyDoubled, P);
  
  return {
    publicKey,
    privateKey: privateKeyDoubled,
  };
}

async function encrypt(publicKey, message) {
  const max = P - BigInt(2);
  const min = BigInt(2);
  const range = max - min;
  
  const randomBytes = new Uint8Array(128);
  crypto.default.getRandomValues(randomBytes);
  
  let randomBigInt = BigInt(0);
  for (let i = 0; i < randomBytes.length; i++) {
    randomBigInt = randomBigInt * BigInt(256) + BigInt(randomBytes[i]);
  }
  
  const y = (randomBigInt % range) + min;
  
  const s = await modPow(publicKey, y, P);
  const c1 = await modPow(G, y, P);
  const c2 = (message * s) % P;
  
  return { c1, c2 };
}

async function decrypt(privateKey, encrypted) {
  const s = await modPow(encrypted.c1, privateKey, P);
  const sInv = await modInv(s, P);
  const message = (encrypted.c2 * sInv) % P;
  return message;
}

// AES encryption/decryption (simulating browser Web Crypto API with Node.js crypto)
async function encryptPrivateKey(privateKeyString, password) {
  const encoder = new TextEncoder();
  const passwordData = encoder.encode(password);
  const salt = crypto.default.randomBytes(16);
  
  // Derive key using PBKDF2
  const key = crypto.default.pbkdf2Sync(passwordData, salt, 100000, 32, 'sha256');
  
  // Create cipher
  const iv = crypto.default.randomBytes(12);
  const cipher = crypto.default.createCipheriv('aes-256-gcm', key, iv);
  
  const data = encoder.encode(privateKeyString);
  let encrypted = cipher.update(data);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const authTag = cipher.getAuthTag();
  
  // Combine salt + iv + authTag + encrypted data as base64
  const combined = Buffer.concat([salt, iv, authTag, encrypted]);
  return combined.toString('base64');
}

async function decryptPrivateKey(encryptedBase64, password) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  
  const combined = Buffer.from(encryptedBase64, 'base64');
  
  // Extract components
  const salt = combined.slice(0, 16);
  const iv = combined.slice(16, 28);
  const authTag = combined.slice(28, 44);
  const encrypted = combined.slice(44);
  
  // Derive key using PBKDF2
  const passwordData = encoder.encode(password);
  const key = crypto.default.pbkdf2Sync(passwordData, salt, 100000, 32, 'sha256');
  
  // Decrypt
  const decipher = crypto.default.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  
  return decoder.decode(decrypted);
}

// Run comprehensive tests
async function runTests() {
  let passed = 0;
  let failed = 0;
  
  const test = (name, fn) => {
    return async () => {
      try {
        console.log(`\n📋 ${name}...`);
        await fn();
        console.log(`   ✓ PASSED`);
        passed++;
      } catch (error) {
        console.log(`   ❌ FAILED: ${error.message}`);
        console.error(error);
        failed++;
      }
    };
  };
  
  // Test 1: Key generation
  await test('Test 1: Generate ElGamal key pair', async () => {
    const keyPair = await generateKeyPair();
    if (!keyPair.publicKey || !keyPair.privateKey) {
      throw new Error('Key pair missing components');
    }
    if (keyPair.publicKey.toString().length < 300) {
      throw new Error('Public key too short (should be ~309 digits)');
    }
  })();
  
  // Test 2: Public key verification
  await test('Test 2: Verify public key = g^(privateKey) mod P', async () => {
    const keyPair = await generateKeyPair();
    const computedPublicKey = await modPow(G, keyPair.privateKey, P);
    if (computedPublicKey.toString() !== keyPair.publicKey.toString()) {
      throw new Error('Public key does not match g^privateKey mod P');
    }
  })();
  
  // Test 3: Message encoding/decoding
  await test('Test 3: Message encoding/decoding round-trip', async () => {
    const testName = 'Alice Smith';
    const testAddress = '456 Oak Avenue, Springfield, IL 62701';
    const testMessage = 'I love puzzles and board games!';
    
    const encoded = encodeMessage(testName, testAddress, testMessage);
    const decoded = decodeMessage(encoded);
    
    if (decoded.name !== testName || decoded.address !== testAddress || decoded.message !== testMessage) {
      throw new Error(`Round-trip failed: expected "${testName}", "${testAddress}", "${testMessage}" but got "${decoded.name}", "${decoded.address}", "${decoded.message}"`);
    }
  })();
  
  // Test 4: ElGamal encryption/decryption
  await test('Test 4: ElGamal encryption/decryption round-trip', async () => {
    const keyPair = await generateKeyPair();
    const testName = 'Bob Johnson';
    const testAddress = '789 Pine Street, Portland, OR 97201';
    const testMessage = 'Books and coffee are my favorites!';
    
    const encoded = encodeMessage(testName, testAddress, testMessage);
    const encrypted = await encrypt(keyPair.publicKey, encoded);
    const decrypted = await decrypt(keyPair.privateKey, encrypted);
    
    if (decrypted.toString() !== encoded.toString()) {
      throw new Error('Encryption/decryption round-trip failed');
    }
    
    const decoded = decodeMessage(decrypted);
    if (decoded.name !== testName || decoded.address !== testAddress || decoded.message !== testMessage) {
      throw new Error('Full encryption/decryption round-trip failed');
    }
  })();
  
  // Test 5: AES encryption/decryption of private key
  await test('Test 5: AES encryption/decryption of private key', async () => {
    const keyPair = await generateKeyPair();
    const privateKeyString = keyPair.privateKey.toString();
    const password = 'test-password-123';
    
    const encrypted = await encryptPrivateKey(privateKeyString, password);
    if (!encrypted || encrypted.length === 0) {
      throw new Error('Encryption returned empty result');
    }
    
    const decrypted = await decryptPrivateKey(encrypted, password);
    if (decrypted !== privateKeyString) {
      throw new Error('AES decryption did not match original private key');
    }
  })();
  
  // Test 6: Wrong password should fail
  await test('Test 6: Wrong password should fail AES decryption', async () => {
    const keyPair = await generateKeyPair();
    const privateKeyString = keyPair.privateKey.toString();
    const password = 'correct-password';
    const wrongPassword = 'wrong-password';
    
    const encrypted = await encryptPrivateKey(privateKeyString, password);
    
    try {
      await decryptPrivateKey(encrypted, wrongPassword);
      throw new Error('Decryption with wrong password should have failed');
    } catch (error) {
      // Expected - wrong password should fail
      if (!error.message.includes('Unsupported state') && !error.message.includes('bad decrypt')) {
        throw error;
      }
    }
  })();
  
  // Test 7: Full client-side flow simulation
  await test('Test 7: Full client-side flow (generate → encrypt → store → decrypt → use)', async () => {
    // Simulate what happens in JoinForm.tsx
    const password = 'user-password-456';
    
    // Step 1: Generate key pair (client-side)
    const keyPair = await generateKeyPair();
    
    // Step 2: Encrypt private key with password (client-side)
    const encryptedPrivateKey = await encryptPrivateKey(keyPair.privateKey.toString(), password);
    
    // Step 3: Simulate storing in database (server-side)
    // (In real app, this would be stored in DB)
    const storedPublicKey = keyPair.publicKey.toString();
    const storedEncryptedPrivateKey = encryptedPrivateKey;
    
    // Step 4: Later, decrypt private key (client-side)
    const decryptedPrivateKeyString = await decryptPrivateKey(storedEncryptedPrivateKey, password);
    const decryptedPrivateKey = BigInt(decryptedPrivateKeyString);
    
    // Step 5: Verify private key matches public key
    const computedPublicKey = await modPow(G, decryptedPrivateKey, P);
    if (computedPublicKey.toString() !== storedPublicKey) {
      throw new Error('Decrypted private key does not match stored public key');
    }
    
    // Step 6: Use keys for encryption/decryption
    const testName = 'Charlie Brown';
    const testAddress = '321 Elm Drive, Seattle, WA 98101';
    const testMessage = 'I enjoy video games and coding!';
    
    const encoded = encodeMessage(testName, testAddress, testMessage);
    const encrypted = await encrypt(BigInt(storedPublicKey), encoded);
    const decrypted = await decrypt(decryptedPrivateKey, encrypted);
    const decoded = decodeMessage(decrypted);
    
    if (decoded.name !== testName || decoded.address !== testAddress || decoded.message !== testMessage) {
      throw new Error('Full flow encryption/decryption failed');
    }
  })();
  
  // Test 8: Multiple key pairs (simulating multiple users)
  await test('Test 8: Multiple users with different keys', async () => {
    const user1KeyPair = await generateKeyPair();
    const user2KeyPair = await generateKeyPair();
    
    // User1 encrypts message for User2
    const message = encodeMessage('User1', 'Address1', 'Hello User2!');
    const encrypted = await encrypt(user2KeyPair.publicKey, message);
    
    // User2 decrypts (should work)
    const decrypted = await decrypt(user2KeyPair.privateKey, encrypted);
    const decoded = decodeMessage(decrypted);
    
    if (decoded.name !== 'User1') {
      throw new Error('User2 could not decrypt message from User1');
    }
    
    // User1 tries to decrypt (should produce garbage - wrong key)
    const wrongDecrypted = await decrypt(user1KeyPair.privateKey, encrypted);
    
    // Wrong key should produce garbage that can't be decoded properly
    try {
      const wrongDecoded = decodeMessage(wrongDecrypted);
      // If we get here, check if it decoded to something reasonable
      // (it might decode to garbage but still be valid UTF-8)
      // The important thing is it shouldn't match the original message
      if (wrongDecoded.name === 'User1' && wrongDecoded.address === 'Address1' && wrongDecoded.message === 'Hello User2!') {
        throw new Error('User1 incorrectly decrypted message encrypted for User2');
      }
      // Garbage decode is fine - wrong key produces wrong data
    } catch (decodeError) {
      // Expected - wrong key produces garbage that can't be decoded
      // This is correct behavior
    }
  })();
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log(`📊 Test Summary: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(60));
  
  if (failed === 0) {
    console.log('🎉 All tests passed! Crypto system is working correctly!');
    process.exit(0);
  } else {
    console.log('❌ Some tests failed. Please review the errors above.');
    process.exit(1);
  }
}

runTests().catch(error => {
  console.error('❌ Test suite failed:', error);
  process.exit(1);
});

