#!/usr/bin/env node

/**
 * Email System Test
 *
 * This test validates the email functionality for Secret Santa.
 * It tests both assignment emails and password reset emails.
 *
 * Usage:
 * 1. Set up environment variables in .env.local:
 *    - MAILJET_API_KEY=your_api_key
 *    - MAILJET_SECRET_KEY=your_secret_key
 *    - MAILJET_SENDER_EMAIL=your_verified_sender@domain.com
 *    - NEXT_PUBLIC_BASE_URL=https://yourdomain.com
 *
 * 2. Run: node test-email.js
 *
 * Note: This will send actual emails! Use test email addresses.
 */

const { sendAssignmentEmail, sendPasswordResetEmail } = require('./lib/email/mailjet.ts');

// Test configuration
const TEST_CONFIG = {
  // Replace these with test email addresses you control
  testEmails: [
    'test1@example.com',
    'test2@example.com'
  ],

  // Test data
  santaName: 'Test Santa',
  santeeName: 'Test Santee',
  santeeAddress: '123 Test Street, Test City, TC 12345',
  santeeMessage: 'Happy Holidays! I love board games and chocolate.',
  groupUrl: 'test-group-123',

  resetToken: 'test-reset-token-123456789',
};

/**
 * Test assignment email sending
 */
async function testAssignmentEmail() {
  console.log('\n🧪 Testing Assignment Email...');

  try {
    const result = await sendAssignmentEmail(
      TEST_CONFIG.testEmails[0], // toEmail
      TEST_CONFIG.santaName,
      TEST_CONFIG.santeeName,
      TEST_CONFIG.santeeAddress,
      TEST_CONFIG.santeeMessage,
      TEST_CONFIG.groupUrl
    );

    console.log('✅ Assignment email sent successfully!');
    console.log('📧 Email details:');
    console.log('   To:', TEST_CONFIG.testEmails[0]);
    console.log('   Subject: Your Secret Santa Assignment');
    console.log('   Santa:', TEST_CONFIG.santaName);
    console.log('   Santee:', TEST_CONFIG.santeeName);

    if (result?.body?.Messages?.[0]) {
      console.log('   Mailjet Message ID:', result.body.Messages[0].To[0].MessageID);
    }

    return true;
  } catch (error) {
    console.error('❌ Assignment email failed:', error.message);
    console.error('   Full error:', error);
    return false;
  }
}

/**
 * Test password reset email sending
 */
async function testPasswordResetEmail() {
  console.log('\n🧪 Testing Password Reset Email...');

  try {
    const result = await sendPasswordResetEmail(
      TEST_CONFIG.testEmails[1], // toEmail
      TEST_CONFIG.resetToken,
      TEST_CONFIG.groupUrl
    );

    console.log('✅ Password reset email sent successfully!');
    console.log('📧 Email details:');
    console.log('   To:', TEST_CONFIG.testEmails[1]);
    console.log('   Subject: Reset Your Secret Santa Password');
    console.log('   Reset URL contains token:', TEST_CONFIG.resetToken);

    if (result?.body?.Messages?.[0]) {
      console.log('   Mailjet Message ID:', result.body.Messages[0].To[0].MessageID);
    }

    return true;
  } catch (error) {
    console.error('❌ Password reset email failed:', error.message);
    console.error('   Full error:', error);
    return false;
  }
}

/**
 * Test environment variables validation
 */
function validateEnvironment() {
  console.log('\n🔍 Validating Environment Variables...');

  const requiredEnvVars = [
    'MAILJET_API_KEY',
    'MAILJET_SECRET_KEY',
    'MAILJET_SENDER_EMAIL',
    'NEXT_PUBLIC_BASE_URL'
  ];

  let allValid = true;

  for (const envVar of requiredEnvVars) {
    const value = process.env[envVar];
    if (!value) {
      console.error(`❌ Missing required environment variable: ${envVar}`);
      allValid = false;
    } else if (value.includes('your_') || value.includes('example.com')) {
      console.warn(`⚠️  ${envVar} appears to be a placeholder value: ${value}`);
    } else {
      console.log(`✅ ${envVar}: ${envVar === 'MAILJET_SECRET_KEY' ? '[HIDDEN]' : value}`);
    }
  }

  return allValid;
}

/**
 * Test Mailjet connection
 */
async function testMailjetConnection() {
  console.log('\n🔌 Testing Mailjet Connection...');

  try {
    // Import Mailjet directly to test connection
    const Mailjet = require('node-mailjet');

    const mailjet = new Mailjet({
      apiKey: process.env.MAILJET_API_KEY,
      apiSecret: process.env.MAILJET_SECRET_KEY,
    });

    // Test connection with a simple API call (get account info)
    const result = await mailjet.get('account').request();

    if (result.body && result.body.Data && result.body.Data[0]) {
      const account = result.body.Data[0];
      console.log('✅ Mailjet connection successful!');
      console.log('   Account Email:', account.Email);
      console.log('   Account Status:', account.Status);
      return true;
    } else {
      console.error('❌ Unexpected Mailjet response format');
      return false;
    }
  } catch (error) {
    console.error('❌ Mailjet connection failed:', error.message);
    if (error.statusCode) {
      console.error('   Status Code:', error.statusCode);
    }
    if (error.response && error.response.text) {
      console.error('   Response:', error.response.text);
    }
    return false;
  }
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('🎄 Secret Santa Email System Test');
  console.log('==================================');

  // Validate environment first
  if (!validateEnvironment()) {
    console.error('\n❌ Environment validation failed. Please set up your environment variables.');
    console.log('\n📝 Required environment variables:');
    console.log('   MAILJET_API_KEY=your_mailjet_api_key');
    console.log('   MAILJET_SECRET_KEY=your_mailjet_secret_key');
    console.log('   MAILJET_SENDER_EMAIL=your_verified_sender@domain.com');
    console.log('   NEXT_PUBLIC_BASE_URL=https://yourdomain.com');
    process.exit(1);
  }

  // Test Mailjet connection
  const connectionOk = await testMailjetConnection();
  if (!connectionOk) {
    console.error('\n❌ Mailjet connection test failed. Cannot proceed with email tests.');
    process.exit(1);
  }

  // Run email tests
  console.log('\n📤 Running Email Tests...');
  console.log('⚠️  WARNING: This will send actual emails to the configured addresses!');
  console.log('   Make sure you have updated TEST_CONFIG.testEmails with test addresses you control.');

  const assignmentResult = await testAssignmentEmail();
  const resetResult = await testPasswordResetEmail();

  // Summary
  console.log('\n📊 Test Results Summary');
  console.log('=======================');
  console.log(`Assignment Email: ${assignmentResult ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`Password Reset Email: ${resetResult ? '✅ PASSED' : '❌ FAILED'}`);

  const overallSuccess = assignmentResult && resetResult;
  console.log(`\n${overallSuccess ? '🎉 All tests passed!' : '💥 Some tests failed!'}`);

  if (overallSuccess) {
    console.log('\n📧 Email system is working correctly.');
    console.log('   Check your test email addresses for the sent messages.');
  } else {
    console.log('\n🔧 Check the error messages above and fix any issues.');
    process.exit(1);
  }
}

// Handle command line arguments
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('Secret Santa Email Test');
  console.log('Usage: node test-email.js');
  console.log('');
  console.log('This test will:');
  console.log('1. Validate environment variables');
  console.log('2. Test Mailjet API connection');
  console.log('3. Send test assignment email');
  console.log('4. Send test password reset email');
  console.log('');
  console.log('⚠️  WARNING: Sends actual emails! Update testEmails in TEST_CONFIG first.');
  process.exit(0);
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests().catch(error => {
    console.error('💥 Test runner failed:', error);
    process.exit(1);
  });
}

module.exports = {
  testAssignmentEmail,
  testPasswordResetEmail,
  validateEnvironment,
  testMailjetConnection,
  TEST_CONFIG
};
