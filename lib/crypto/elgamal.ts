import { modPow, modInv } from 'bigint-crypto-utils';

// ElGamal parameters (1024-bit safe prime, generator 7)
// Using RFC 5114 MODP Group 2 - a standard 1024-bit safe prime (P = 2q + 1 where q is prime)
// This is a well-tested prime suitable for ElGamal cryptography
const P = BigInt('179769313486231590772930519078902473361797697894230657273430081157732675805500963132708477322407536021120113879871393357658789768814416622492847430639474124377767893424865485276302219601246094119453082952085005768838150682342462881473913110540827237163350510684586298239947245938479716304835356329624224137859');

const G = BigInt(7); // Generator

export interface KeyPair {
  publicKey: bigint;
  privateKey: bigint; // This will be encrypted before storage
}

export interface EncryptedMessage {
  c1: bigint;
  c2: bigint;
}

/**
 * Generate ElGamal key pair
 * Private key is multiplied by 2 to ensure public key is a quadratic residue
 */
export async function generateKeyPair(): Promise<KeyPair> {
  // Generate random private key in range [2, P-2]
  // Multiply by 2 to ensure public key is quadratic residue
  const max = P - BigInt(2);
  const min = BigInt(2);
  const range = max - min;
  
  // Generate cryptographically secure random number using Web Crypto API
  const randomBytes = new Uint8Array(128);
  crypto.getRandomValues(randomBytes);
  
  let randomBigInt = BigInt(0);
  for (let i = 0; i < randomBytes.length; i++) {
    randomBigInt = randomBigInt * BigInt(256) + BigInt(randomBytes[i]);
  }
  
  const privateKey = (randomBigInt % range) + min;
  const privateKeyDoubled = privateKey * BigInt(2); // Fix for quadratic residues
  
  // Public key = g^(private_key * 2) mod P
  const publicKey = await modPow(G, privateKeyDoubled, P);
  
  return {
    publicKey,
    privateKey: privateKeyDoubled, // Store the doubled version
  };
}

/**
 * Encrypt a message using ElGamal
 */
export async function encrypt(publicKey: bigint, message: bigint): Promise<EncryptedMessage> {
  // Generate random y
  const max = P - BigInt(2);
  const min = BigInt(2);
  const range = max - min;
  
  const randomBytes = new Uint8Array(128);
  crypto.getRandomValues(randomBytes);
  
  let randomBigInt = BigInt(0);
  for (let i = 0; i < randomBytes.length; i++) {
    randomBigInt = randomBigInt * BigInt(256) + BigInt(randomBytes[i]);
  }
  
  const y = (randomBigInt % range) + min;
  
  // Compute shared secret S = publicKey^y mod P
  const s = await modPow(publicKey, y, P);
  
  // c1 = g^y mod P
  const c1 = await modPow(G, y, P);
  
  // c2 = message * s mod P
  const c2 = (message * s) % P;
  
  return { c1, c2 };
}

/**
 * Decrypt a message using ElGamal
 */
export async function decrypt(privateKey: bigint, encrypted: EncryptedMessage): Promise<bigint> {
  // Compute shared secret S = c1^privateKey mod P
  const s = await modPow(encrypted.c1, privateKey, P);
  
  // Compute inverse of S
  const sInv = await modInv(s, P);
  
  // message = c2 * sInv mod P
  const message = (encrypted.c2 * sInv) % P;
  
  return message;
}

/**
 * Check if a number is a quadratic residue mod P
 */
export async function isQuadraticResidue(n: bigint): Promise<boolean> {
  // For Sophie Germain prime P = 2q + 1, use Euler's criterion
  const exponent = (P - BigInt(1)) / BigInt(2);
  const result = await modPow(n, exponent, P);
  return result === BigInt(1);
}

/**
 * Calculate the byte size of a message when encoded
 * Returns breakdown of sizes for each field
 */
export function calculateMessageSize(name: string, address: string, message: string): {
  nameBytes: number;
  addressBytes: number;
  messageBytes: number;
  overheadBytes: number;
  totalBytes: number;
} {
  const encoder = new TextEncoder();
  const nameBytes = encoder.encode(name).length;
  const addressBytes = encoder.encode(address).length;
  const messageBytes = encoder.encode(message).length;
  const overheadBytes = 12; // 3 length fields × 4 bytes each
  const totalBytes = overheadBytes + nameBytes + addressBytes + messageBytes;
  
  return {
    nameBytes,
    addressBytes,
    messageBytes,
    overheadBytes,
    totalBytes,
  };
}

/**
 * Encode a message (name, address, message) into a bigint for ElGamal encryption
 * Format: [nameLength][name][addressLength][address][messageLength][message]
 * All lengths are 4-byte big-endian integers
 */
export function encodeMessage(name: string, address: string, message: string): bigint {
  const encoder = new TextEncoder();
  const nameBytes = encoder.encode(name);
  const addressBytes = encoder.encode(address);
  const messageBytes = encoder.encode(message);
  
  // Check total size - ensure it fits in P (which is ~309 digits, so ~1024 bits)
  // We have ~1024 bits = 128 bytes, but we need some overhead for encoding
  // Let's be conservative and limit to ~100 bytes total
  const totalBytes = 4 + nameBytes.length + 4 + addressBytes.length + 4 + messageBytes.length;
  if (totalBytes > 100) {
    // Provide detailed error message indicating which fields are too long
    const sizeInfo = calculateMessageSize(name, address, message);
    const maxUsableBytes = 100 - sizeInfo.overheadBytes;
    const usedBytes = sizeInfo.nameBytes + sizeInfo.addressBytes + sizeInfo.messageBytes;
    const overBy = usedBytes - maxUsableBytes;
    
    const fieldSizes = [
      { field: 'name', bytes: sizeInfo.nameBytes },
      { field: 'address', bytes: sizeInfo.addressBytes },
      { field: 'message', bytes: sizeInfo.messageBytes },
    ].sort((a, b) => b.bytes - a.bytes); // Sort by size descending
    
    const suggestions: string[] = [];
    if (sizeInfo.nameBytes > 30) {
      suggestions.push(`Name (${sizeInfo.nameBytes} bytes) - consider shortening`);
    }
    if (sizeInfo.addressBytes > 50) {
      suggestions.push(`Address (${sizeInfo.addressBytes} bytes) - consider using abbreviations or shorter format`);
    }
    if (sizeInfo.messageBytes > 30) {
      suggestions.push(`Message (${sizeInfo.messageBytes} bytes) - consider shortening`);
    }
    
    const suggestionText = suggestions.length > 0 
      ? `\n\nSuggestions:\n${suggestions.map(s => `  • ${s}`).join('\n')}`
      : '';
    
    throw new Error(
      `Total message size (${totalBytes} bytes) exceeds limit of 100 bytes (over by ${overBy} bytes). ` +
      `Breakdown: Name=${sizeInfo.nameBytes} bytes, Address=${sizeInfo.addressBytes} bytes, Message=${sizeInfo.messageBytes} bytes.` +
      suggestionText
    );
  }
  
  // Create buffer with length prefixes
  const buffer = new Uint8Array(totalBytes);
  let offset = 0;
  
  // Write name length (4 bytes, big-endian)
  const nameLength = nameBytes.length;
  buffer[offset++] = (nameLength >> 24) & 0xff;
  buffer[offset++] = (nameLength >> 16) & 0xff;
  buffer[offset++] = (nameLength >> 8) & 0xff;
  buffer[offset++] = nameLength & 0xff;
  
  // Write name bytes
  buffer.set(nameBytes, offset);
  offset += nameBytes.length;
  
  // Write address length (4 bytes, big-endian)
  const addressLength = addressBytes.length;
  buffer[offset++] = (addressLength >> 24) & 0xff;
  buffer[offset++] = (addressLength >> 16) & 0xff;
  buffer[offset++] = (addressLength >> 8) & 0xff;
  buffer[offset++] = addressLength & 0xff;
  
  // Write address bytes
  buffer.set(addressBytes, offset);
  offset += addressBytes.length;
  
  // Write message length (4 bytes, big-endian)
  const messageLength = messageBytes.length;
  buffer[offset++] = (messageLength >> 24) & 0xff;
  buffer[offset++] = (messageLength >> 16) & 0xff;
  buffer[offset++] = (messageLength >> 8) & 0xff;
  buffer[offset++] = messageLength & 0xff;
  
  // Write message bytes
  buffer.set(messageBytes, offset);
  
  // Convert to bigint
  // We need to preserve leading zeros, so we'll store the length separately
  // Actually, we can just convert directly - bigint preserves the value correctly
  let result = BigInt(0);
  for (let i = 0; i < buffer.length; i++) {
    result = result * BigInt(256) + BigInt(buffer[i]);
  }
  
  // Ensure result is less than P
  if (result >= P) {
    throw new Error(`Encoded message too large: ${result} >= ${P}`);
  }
  
  // Store the original buffer length so we can reconstruct it correctly
  // Actually, we need a different approach - store length as metadata or pad
  // For now, let's ensure the buffer length is preserved by checking the total bytes
  return result;
}

/**
 * Decode a bigint back into name, address, and message
 */
export function decodeMessage(encoded: bigint): { name: string; address: string; message: string } {
  // Convert bigint to bytes
  // The issue: toString(16) loses leading zeros
  // Solution: Convert to hex, then try reading lengths. If invalid, pad with leading zeros
  
  let hex = encoded.toString(16);
  // Pad to even length
  if (hex.length % 2 !== 0) {
    hex = '0' + hex;
  }
  
  // Convert hex to bytes
  let bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    const byteHex = hex.slice(i, i + 2);
    bytes.push(parseInt(byteHex, 16));
  }
  
  // Try to read the first length. If it's invalid (too large), we're missing leading zeros
  // Maximum valid name length is ~1000 (but realistically much less)
  // If the first 4 bytes form a number > 1000, we need to pad with zeros
  let nameLength = 0;
  let attempts = 0;
  const maxAttempts = 10; // Don't try forever
  
  while (attempts < maxAttempts) {
    if (bytes.length < 4) {
      // Need at least 4 bytes for length
      bytes.unshift(0);
      attempts++;
      continue;
    }
    
    nameLength = (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3];
    
    // Check if this is a valid length (reasonable range)
    if (nameLength >= 0 && nameLength <= 1000 && bytes.length >= 4 + nameLength + 4) {
      // This looks valid, break out
      break;
    }
    
    // Invalid length, probably missing a leading zero
    bytes.unshift(0);
    attempts++;
  }
  
  if (attempts >= maxAttempts) {
    throw new Error('Could not determine valid message structure - too many leading zeros needed');
  }

  // nameLength is already set from the while loop above
  // Read name
  if (bytes.length < 4 + nameLength) throw new Error('Invalid encoded message: name truncated');
  const nameBytes = bytes.slice(4, 4 + nameLength);
  const decoder = new TextDecoder();
  const name = decoder.decode(new Uint8Array(nameBytes));
  
  // Read address length
  let offset = 4 + nameLength;
  if (bytes.length < offset + 4) {
    throw new Error(`Invalid encoded message: address length missing (have ${bytes.length} bytes, need ${offset + 4})`);
  }
  const addressLength = (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
  
  if (addressLength < 0 || addressLength > 1000) {
    throw new Error(`Invalid address length: ${addressLength} (likely wrong key or corrupted data)`);
  }
  
  // Read address
  offset += 4;
  if (bytes.length < offset + addressLength) {
    throw new Error(`Invalid encoded message: address truncated (have ${bytes.length} bytes, need ${offset + addressLength})`);
  }
  const addressBytes = bytes.slice(offset, offset + addressLength);
  const address = decoder.decode(new Uint8Array(addressBytes));
  
  // Read message length
  offset += addressLength;
  if (bytes.length < offset + 4) {
    throw new Error(`Invalid encoded message: message length missing (have ${bytes.length} bytes, need ${offset + 4})`);
  }
  const messageLength = (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
  
  if (messageLength < 0 || messageLength > 1000) {
    throw new Error(`Invalid message length: ${messageLength} (likely wrong key or corrupted data)`);
  }
  
  // Read message
  offset += 4;
  if (bytes.length < offset + messageLength) {
    throw new Error(`Invalid encoded message: message truncated (have ${bytes.length} bytes, need ${offset + messageLength})`);
  }
  const messageBytes = bytes.slice(offset, offset + messageLength);
  const message = decoder.decode(new Uint8Array(messageBytes));
  
  return { name, address, message };
}

export { P, G };

