/**
 * AES encryption/decryption for private keys and member data using password
 * Works in both browser and Node.js environments
 */

// Base64 encoding/decoding helpers that work in both browser and Node.js
function base64Encode(data: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    // Node.js environment
    return Buffer.from(data).toString('base64');
  } else {
    // Browser environment
    return btoa(String.fromCharCode(...data));
  }
}

function base64Decode(encoded: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    // Node.js environment
    return new Uint8Array(Buffer.from(encoded, 'base64'));
  } else {
    // Browser environment
    return Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
  }
}

/**
 * Generic AES-GCM encryption function for any string data
 * Uses PBKDF2 key derivation with 100,000 iterations
 */
async function encryptData(data: string, password: string): Promise<string> {
  const encoder = new TextEncoder();
  const passwordData = encoder.encode(password);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordData,
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );
  
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
  
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const dataBytes = encoder.encode(data);
  
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    dataBytes
  );
  
  // Combine salt + iv + encrypted data as base64
  const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(encrypted), salt.length + iv.length);
  
  return base64Encode(combined);
}

/**
 * Generic AES-GCM decryption function for any encrypted string data
 */
async function decryptData(encrypted: string, password: string): Promise<string> {
  // Decode base64
  const combined = base64Decode(encrypted);
  
  const salt = combined.slice(0, 16);
  const iv = combined.slice(16, 28);
  const encryptedData = combined.slice(28);
  
  // Derive key from password
  const encoder = new TextEncoder();
  const passwordData = encoder.encode(password);
  
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordData,
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );
  
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    encryptedData
  );
  
  return new TextDecoder().decode(decrypted);
}

export async function encryptPrivateKey(privateKey: string, password: string): Promise<string> {
  return encryptData(privateKey, password);
}

export async function decryptPrivateKey(encrypted: string, password: string): Promise<string> {
  return decryptData(encrypted, password);
}

/**
 * Encrypt member data fields (address, message, email) for secure storage
 * Name is NOT encrypted - it needs to be visible in the group
 * Each field is encrypted independently with the user's password
 */
export async function encryptMemberData(
  name: string,
  address: string,
  message: string,
  email: string,
  password: string
): Promise<{
  name: string; // Not encrypted - needs to be visible
  addressEncrypted: string;
  messageEncrypted: string;
  email: string; // Not encrypted - needs to be accessible for notifications
}> {
  const [addressEncrypted, messageEncrypted] = await Promise.all([
    encryptData(address, password),
    encryptData(message, password),
  ]);

  return {
    name, // Return name as-is (not encrypted)
    addressEncrypted,
    messageEncrypted,
    email, // Return email as-is (not encrypted)
  };
}

/**
 * Decrypt member data fields (address, message)
 * Name and email are passed through as-is (not encrypted)
 */
export async function decryptMemberData(
  name: string, // Not encrypted - pass through as-is
  addressEncrypted: string,
  messageEncrypted: string,
  email: string, // Not encrypted - pass through as-is
  password: string
): Promise<{
  name: string;
  address: string;
  message: string;
  email: string;
}> {
  const [address, message] = await Promise.all([
    decryptData(addressEncrypted, password),
    decryptData(messageEncrypted, password),
  ]);

  return { name, address, message, email };
}

/**
 * Encrypt a single field (for selective decryption)
 */
export async function encryptField(data: string, password: string): Promise<string> {
  return encryptData(data, password);
}

/**
 * Decrypt a single field (for selective decryption)
 */
export async function decryptField(encrypted: string, password: string): Promise<string> {
  return decryptData(encrypted, password);
}

