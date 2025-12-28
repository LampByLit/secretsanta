// Run with: node test-crypto-runner.mjs

import { readFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// We need to use the actual crypto functions
// Let's import them from the built files or create a simplified version

console.log('🧪 Testing Crypto Engine Locally...\n');

// Import bigint-crypto-utils
const { modPow, modInv } = await import('bigint-crypto-utils');

// ElGamal parameters (same as in elgamal.ts)
const P = BigInt('179769313486231590772930519078902473361797697894230657273430081157732675805500963132708477322407536021120113879871393357658789768814416622492847430639474124377767893424865485276302219601246094119453082952085005768838150682342462881473913110540827237163350510684586298239947245938479716304835356329624224137859');
const G = BigInt(7);

// Copy the functions from elgamal.ts
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
  offset += addressBytes.length;
  
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
  
  // Try to read the first length. If invalid, pad with leading zeros
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
  
  // Debug: log first few bytes
  if (bytes.length > 0) {
    console.log(`[decodeMessage] First 10 bytes (after padding):`, bytes.slice(0, 10));
  }

  // nameLength is already set from the while loop above
  if (bytes.length < 4 + nameLength) {
    throw new Error(`Invalid encoded message: name truncated (have ${bytes.length} bytes, need ${4 + nameLength})`);
  }
  const nameBytes = bytes.slice(4, 4 + nameLength);
  const decoder = new TextDecoder();
  const name = decoder.decode(new Uint8Array(nameBytes));
  
  let offset = 4 + nameLength;
  if (bytes.length < offset + 4) {
    throw new Error(`Invalid encoded message: address length missing (have ${bytes.length} bytes, need ${offset + 4})`);
  }
  const addressLength = (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
  
  if (addressLength < 0 || addressLength > 1000) {
    throw new Error(`Invalid address length: ${addressLength} (likely wrong key or corrupted data)`);
  }
  
  offset += 4;
  if (bytes.length < offset + addressLength) {
    throw new Error(`Invalid encoded message: address truncated (have ${bytes.length} bytes, need ${offset + addressLength})`);
  }
  const addressBytes = bytes.slice(offset, offset + addressLength);
  const address = decoder.decode(new Uint8Array(addressBytes));
  
  offset += addressLength;
  if (bytes.length < offset + 4) {
    throw new Error(`Invalid encoded message: message length missing (have ${bytes.length} bytes, need ${offset + 4})`);
  }
  const messageLength = (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
  
  if (messageLength < 0 || messageLength > 1000) {
    throw new Error(`Invalid message length: ${messageLength} (likely wrong key or corrupted data)`);
  }
  
  offset += 4;
  if (bytes.length < offset + messageLength) {
    throw new Error(`Invalid encoded message: message truncated (have ${bytes.length} bytes, need ${offset + messageLength})`);
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
  // Use Node.js crypto
  const crypto = await import('crypto');
  crypto.default.getRandomValues(randomBytes);
  
  let randomBigInt = BigInt(0);
  for (let i = 0; i < randomBytes.length; i++) {
    randomBigInt = randomBigInt * BigInt(256) + BigInt(randomBytes[i]);
  }
  
  const privateKey = (randomBigInt % range) + min;
  const privateKeyDoubled = privateKey * BigInt(2);
  
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
  const crypto = await import('crypto');
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

// Run tests
async function runTests() {
  try {
    console.log('Test 1: Generating key pair...');
    const keyPair = await generateKeyPair();
    console.log(`✓ Generated key pair`);
    console.log(`  Public key: ${keyPair.publicKey.toString().substring(0, 50)}...`);
    console.log(`  Private key: ${keyPair.privateKey.toString().substring(0, 50)}...`);
    
    console.log('\nTest 2: Verifying public key matches private key...');
    const computedPublicKey = await modPow(G, keyPair.privateKey, P);
    if (computedPublicKey.toString() === keyPair.publicKey.toString()) {
      console.log('✓ Public key matches g^privateKey mod P');
    } else {
      console.log('❌ Public key does NOT match!');
      console.log(`  Computed: ${computedPublicKey.toString().substring(0, 50)}...`);
      console.log(`  Stored: ${keyPair.publicKey.toString().substring(0, 50)}...`);
      process.exit(1);
    }
    
    console.log('\nTest 3: Testing message encoding/decoding...');
    const testName = 'John Doe';
    const testAddress = '123 Main St, City, State 12345';
    const testMessage = 'I like books and puzzles!';
    
    const encoded = encodeMessage(testName, testAddress, testMessage);
    console.log(`✓ Encoded message to bigint: ${encoded.toString().substring(0, 50)}...`);
    
    const decoded = decodeMessage(encoded);
    console.log(`✓ Decoded message:`);
    console.log(`  Name: ${decoded.name}`);
    console.log(`  Address: ${decoded.address}`);
    console.log(`  Message: ${decoded.message}`);
    
    if (decoded.name === testName && decoded.address === testAddress && decoded.message === testMessage) {
      console.log('✓ Encoding/decoding round-trip successful!');
    } else {
      console.log('❌ Encoding/decoding round-trip FAILED!');
      console.log(`  Expected name: ${testName}, got: ${decoded.name}`);
      console.log(`  Expected address: ${testAddress}, got: ${decoded.address}`);
      console.log(`  Expected message: ${testMessage}, got: ${decoded.message}`);
      process.exit(1);
    }
    
    console.log('\nTest 4: Testing encryption/decryption...');
    const encrypted = await encrypt(keyPair.publicKey, encoded);
    console.log(`✓ Encrypted message`);
    
    const decrypted = await decrypt(keyPair.privateKey, encrypted);
    console.log(`✓ Decrypted to bigint: ${decrypted.toString().substring(0, 50)}...`);
    
    if (decrypted.toString() === encoded.toString()) {
      console.log('✓ Encryption/decryption round-trip successful!');
    } else {
      console.log('❌ Encryption/decryption round-trip FAILED!');
      console.log(`  Expected: ${encoded.toString().substring(0, 50)}...`);
      console.log(`  Got: ${decrypted.toString().substring(0, 50)}...`);
      process.exit(1);
    }
    
    console.log('\nTest 5: Full round-trip test (encode → encrypt → decrypt → decode)...');
    const finalDecoded = decodeMessage(decrypted);
    if (finalDecoded.name === testName && finalDecoded.address === testAddress && finalDecoded.message === testMessage) {
      console.log('✓✓✓ FULL ROUND-TRIP SUCCESSFUL! ✓✓✓');
      console.log('🎉 Crypto engine is working correctly!');
    } else {
      console.log('❌ Full round-trip FAILED!');
      console.log(`  Expected name: ${testName}, got: ${finalDecoded.name}`);
      console.log(`  Expected address: ${testAddress}, got: ${finalDecoded.address}`);
      console.log(`  Expected message: ${testMessage}, got: ${finalDecoded.message}`);
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

runTests();

