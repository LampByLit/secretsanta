'use client';

import { useState } from 'react';
import { generateKeyPair, encrypt, decrypt, encodeMessage, decodeMessage, P, G } from '@/lib/crypto/elgamal';
import { modPow } from 'bigint-crypto-utils';

export default function TestCryptoPage() {
  const [results, setResults] = useState<string[]>([]);
  const [running, setRunning] = useState(false);

  const log = (msg: string, isError = false) => {
    setResults(prev => [...prev, msg]);
    console.log(msg);
  };

  const runTests = async () => {
    setResults([]);
    setRunning(true);
    
    try {
      log('🧪 Starting Crypto Engine Tests...\n');
      
      // Test 1: Key pair generation
      log('Test 1: Generating key pair...');
      const keyPair = await generateKeyPair();
      log(`✓ Generated key pair`);
      log(`  Public key: ${keyPair.publicKey.toString().substring(0, 50)}...`);
      log(`  Private key: ${keyPair.privateKey.toString().substring(0, 50)}...`);
      
      // Test 2: Verify public key = g^privateKey mod P
      log('\nTest 2: Verifying public key matches private key...');
      const computedPublicKey = await modPow(G, keyPair.privateKey, P);
      if (computedPublicKey.toString() === keyPair.publicKey.toString()) {
        log('✓ Public key matches g^privateKey mod P');
      } else {
        log('❌ Public key does NOT match!', true);
        log(`  Computed: ${computedPublicKey.toString().substring(0, 50)}...`, true);
        log(`  Stored: ${keyPair.publicKey.toString().substring(0, 50)}...`, true);
      }
      
      // Test 3: Message encoding/decoding
      log('\nTest 3: Testing message encoding/decoding...');
      const testName = 'John Doe';
      const testAddress = '123 Main St, City, State 12345';
      const testMessage = 'I like books and puzzles!';
      
      const encoded = encodeMessage(testName, testAddress, testMessage);
      log(`✓ Encoded message to bigint: ${encoded.toString().substring(0, 50)}...`);
      
      const decoded = decodeMessage(encoded);
      log(`✓ Decoded message:`);
      log(`  Name: ${decoded.name}`);
      log(`  Address: ${decoded.address}`);
      log(`  Message: ${decoded.message}`);
      
      if (decoded.name === testName && decoded.address === testAddress && decoded.message === testMessage) {
        log('✓ Encoding/decoding round-trip successful!');
      } else {
        log('❌ Encoding/decoding round-trip FAILED!', true);
        log(`  Expected name: ${testName}, got: ${decoded.name}`, true);
        log(`  Expected address: ${testAddress}, got: ${decoded.address}`, true);
        log(`  Expected message: ${testMessage}, got: ${decoded.message}`, true);
      }
      
      // Test 4: Encryption/Decryption
      log('\nTest 4: Testing encryption/decryption...');
      const encrypted = await encrypt(keyPair.publicKey, encoded);
      log(`✓ Encrypted message:`);
      log(`  c1: ${encrypted.c1.toString().substring(0, 50)}...`);
      log(`  c2: ${encrypted.c2.toString().substring(0, 50)}...`);
      
      const decrypted = await decrypt(keyPair.privateKey, encrypted);
      log(`✓ Decrypted to bigint: ${decrypted.toString().substring(0, 50)}...`);
      
      if (decrypted.toString() === encoded.toString()) {
        log('✓ Encryption/decryption round-trip successful!');
      } else {
        log('❌ Encryption/decryption round-trip FAILED!', true);
        log(`  Expected: ${encoded.toString().substring(0, 50)}...`, true);
        log(`  Got: ${decrypted.toString().substring(0, 50)}...`, true);
      }
      
      // Test 5: Full round-trip
      log('\nTest 5: Full round-trip test (encode → encrypt → decrypt → decode)...');
      const finalDecoded = decodeMessage(decrypted);
      if (finalDecoded.name === testName && finalDecoded.address === testAddress && finalDecoded.message === testMessage) {
        log('✓✓✓ FULL ROUND-TRIP SUCCESSFUL! ✓✓✓');
        log('🎉 Crypto engine is working correctly!');
      } else {
        log('❌ Full round-trip FAILED!', true);
        log(`  Expected name: ${testName}, got: ${finalDecoded.name}`, true);
        log(`  Expected address: ${testAddress}, got: ${finalDecoded.address}`, true);
        log(`  Expected message: ${testMessage}, got: ${finalDecoded.message}`, true);
      }
      
    } catch (error: any) {
      log(`❌ Test failed with error: ${error.message}`, true);
      console.error(error);
    } finally {
      setRunning(false);
    }
  };

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-4">Crypto Engine Test</h1>
        <button
          onClick={runTests}
          disabled={running}
          className="mb-4 px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
        >
          {running ? 'Running Tests...' : 'Run Tests'}
        </button>
        <div className="bg-gray-100 p-4 rounded-lg font-mono text-sm whitespace-pre-wrap">
          {results.length === 0 ? 'Click "Run Tests" to start...' : results.join('\n')}
        </div>
      </div>
    </main>
  );
}

