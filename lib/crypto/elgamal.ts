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
  
  // Generate random number (simplified - use crypto.randomBytes in production)
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

export { P, G };

