// Simple Node.js test - run with: node --experimental-modules test-crypto-simple.mjs
// Or better: create a test that uses the actual Next.js setup

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🧪 Crypto Engine Test');
console.log('=====================\n');

// Since we can't easily import the Next.js modules, let's create a standalone test
// that replicates the logic

console.log('📝 To test the crypto engine:');
console.log('1. Start your Next.js dev server: npm run dev');
console.log('2. Open browser console on any page');
console.log('3. Run the test code below:\n');

const testCode = `
// Copy and paste this into browser console:

(async function() {
  console.log('🧪 Testing Crypto Engine...');
  
  // We need to import from the actual modules
  // This will only work if you're on a page that has the modules loaded
  // Better: create a test page at /test-crypto
  
  console.log('⚠️  Creating test page instead...');
})();
`;

console.log(testCode);

