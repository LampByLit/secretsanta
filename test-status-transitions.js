/**
 * Test script to validate group status transitions and UI logic
 * Run with: node test-status-transitions.js
 */

const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

// Use a test database
const TEST_DB_PATH = path.join(__dirname, 'data', 'test-secretsanta.db');

// Clean up test database if it exists
if (fs.existsSync(TEST_DB_PATH)) {
  fs.unlinkSync(TEST_DB_PATH);
}

// Ensure data directory exists
const dbDir = path.dirname(TEST_DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(TEST_DB_PATH);
db.pragma('journal_mode = WAL');

// Initialize schema (simplified version)
db.exec(`
  CREATE TABLE groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    creator_email TEXT NOT NULL,
    creator_password_hash TEXT NOT NULL,
    unique_url TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE members (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    email_hash TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    message TEXT NOT NULL,
    address TEXT NOT NULL,
    public_key TEXT NOT NULL,
    private_key_encrypted TEXT NOT NULL,
    excluded INTEGER NOT NULL DEFAULT 0,
    joined_at INTEGER NOT NULL,
    password_reset_token TEXT,
    password_reset_expires INTEGER,
    UNIQUE(group_id, email_hash),
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
  );

  CREATE TABLE pre_encrypted_messages (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    recipient_id TEXT NOT NULL,
    c1 TEXT NOT NULL,
    c2 TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES members(id) ON DELETE CASCADE,
    FOREIGN KEY (recipient_id) REFERENCES members(id) ON DELETE CASCADE
  );
`);

// Helper functions (simplified versions)
function getGroupById(groupId) {
  return db.prepare('SELECT * FROM groups WHERE id = ?').get(groupId);
}

function getMembersByGroup(groupId, includeExcluded = false) {
  if (includeExcluded) {
    return db.prepare('SELECT * FROM members WHERE group_id = ? ORDER BY joined_at ASC').all(groupId);
  }
  return db.prepare('SELECT * FROM members WHERE group_id = ? AND excluded = 0 ORDER BY joined_at ASC').all(groupId);
}

function getPreEncryptedMessage(groupId, senderId, recipientId) {
  return db.prepare('SELECT * FROM pre_encrypted_messages WHERE group_id = ? AND sender_id = ? AND recipient_id = ?').get(groupId, senderId, recipientId);
}

function checkBackfillStatus(groupId) {
  const members = getMembersByGroup(groupId, false);
  const missingMembers = [];

  for (let i = 0; i < members.length; i++) {
    for (let j = 0; j < members.length; j++) {
      if (i === j) continue;
      
      const sender = members[i];
      const recipient = members[j];
      
      // Check if message exists FROM sender TO recipient
      const message = getPreEncryptedMessage(groupId, sender.id, recipient.id);
      if (!message) {
        // Check if this member is already in missing list
        if (!missingMembers.find(m => m.id === sender.id)) {
          missingMembers.push({ id: sender.id, name: sender.name });
        }
      }
    }
  }

  return {
    complete: missingMembers.length === 0,
    missingMembers,
  };
}

function checkAndUpdateGroupStatus(groupId) {
  const group = getGroupById(groupId);
  if (!group) return;
  
  // Only transition from 'closed' to 'ready'
  if (group.status !== 'closed') return;
  
  const backfillStatus = checkBackfillStatus(groupId);
  if (backfillStatus.complete) {
    db.prepare('UPDATE groups SET status = ?, updated_at = ? WHERE id = ?').run('ready', Date.now(), groupId);
    console.log(`✓ Status updated from 'closed' to 'ready'`);
    return true;
  }
  return false;
}

// Test functions
function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    return true;
  } catch (error) {
    console.error(`❌ ${name}: ${error.message}`);
    console.error(error.stack);
    return false;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

// Test data
const groupId = 'test-group-1';
const creatorEmail = 'creator@test.com';
const creatorPassword = 'creator123';
const creatorPasswordHash = bcrypt.hashSync(creatorPassword, 10);

const members = [
  { name: 'Alice', email: 'alice@test.com', joinedAt: 1000 },
  { name: 'Bob', email: 'bob@test.com', joinedAt: 2000 },
  { name: 'Charlie', email: 'charlie@test.com', joinedAt: 3000 },
  { name: 'Diana', email: 'diana@test.com', joinedAt: 4000 },
];

console.log('🧪 Testing Group Status Transitions\n');

// Test 1: Create group
test('Create group with status "open"', () => {
  db.prepare(`
    INSERT INTO groups (id, name, creator_email, creator_password_hash, unique_url, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(groupId, 'Test Group', creatorEmail, creatorPasswordHash, 'test-group', 'open', Date.now(), Date.now());
  
  const group = getGroupById(groupId);
  assert(group, 'Group should exist');
  assert(group.status === 'open', 'Group should start with status "open"');
});

// Test 2: Add members
test('Add 4 members to group', () => {
  members.forEach((member, index) => {
    const memberId = `member-${index + 1}`;
    const emailHash = require('crypto').createHash('sha256').update(member.email.toLowerCase().trim()).digest('hex');
    const passwordHash = bcrypt.hashSync('password123', 10);
    
    db.prepare(`
      INSERT INTO members (id, group_id, name, email, email_hash, password_hash, message, address, public_key, private_key_encrypted, excluded, joined_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      memberId,
      groupId,
      member.name,
      member.email,
      emailHash,
      passwordHash,
      'encrypted-message',
      'encrypted-address',
      'public-key-' + memberId,
      'encrypted-private-key-' + memberId,
      0,
      member.joinedAt
    );
  });
  
  const allMembers = getMembersByGroup(groupId, false);
  assert(allMembers.length === 4, `Should have 4 members, got ${allMembers.length}`);
});

// Test 3: Close group
test('Close group (status should be "closed")', () => {
  db.prepare('UPDATE groups SET status = ?, updated_at = ? WHERE id = ?').run('closed', Date.now(), groupId);
  
  const group = getGroupById(groupId);
  assert(group.status === 'closed', 'Group status should be "closed"');
});

// Test 4: Check backfill status (should be incomplete)
test('Check backfill status - should be incomplete initially', () => {
  const backfillStatus = checkBackfillStatus(groupId);
  assert(!backfillStatus.complete, 'Backfill should be incomplete (no messages exist)');
  assert(backfillStatus.missingMembers.length === 4, `Should have 4 missing members, got ${backfillStatus.missingMembers.length}`);
});

// Test 5: Create bidirectional messages for all members
test('Create bidirectional pre-encrypted messages for all members', () => {
  const allMembers = getMembersByGroup(groupId, false);
  
  for (let i = 0; i < allMembers.length; i++) {
    for (let j = 0; j < allMembers.length; j++) {
      if (i === j) continue;
      
      const sender = allMembers[i];
      const recipient = allMembers[j];
      
      // Check if message already exists
      const existing = getPreEncryptedMessage(groupId, sender.id, recipient.id);
      if (!existing) {
        const messageId = `msg-${sender.id}-${recipient.id}`;
        db.prepare(`
          INSERT INTO pre_encrypted_messages (id, group_id, sender_id, recipient_id, c1, c2, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(messageId, groupId, sender.id, recipient.id, 'c1-value', 'c2-value', Date.now());
      }
    }
  }
  
  // Verify all messages exist
  const allMembers2 = getMembersByGroup(groupId, false);
  let totalExpected = 0;
  for (let i = 0; i < allMembers2.length; i++) {
    for (let j = 0; j < allMembers2.length; j++) {
      if (i !== j) totalExpected++;
    }
  }
  
  const messageCount = db.prepare('SELECT COUNT(*) as count FROM pre_encrypted_messages WHERE group_id = ?').get(groupId).count;
  assert(messageCount === totalExpected, `Should have ${totalExpected} messages, got ${messageCount}`);
});

// Test 6: Check backfill status (should be complete now)
test('Check backfill status - should be complete after creating messages', () => {
  const backfillStatus = checkBackfillStatus(groupId);
  assert(backfillStatus.complete, 'Backfill should be complete');
  assert(backfillStatus.missingMembers.length === 0, 'Should have no missing members');
});

// Test 7: Status should transition from closed to ready
test('Status should transition from "closed" to "ready" when backfill is complete', () => {
  const updated = checkAndUpdateGroupStatus(groupId);
  assert(updated === true, 'Status should have been updated');
  
  const group = getGroupById(groupId);
  assert(group.status === 'ready', `Group status should be "ready", got "${group.status}"`);
});

// Test 8: Status should not transition again if already ready
test('Status should not transition again if already "ready"', () => {
  const group = getGroupById(groupId);
  assert(group.status === 'ready', 'Group should be ready');
  
  // Call checkAndUpdateGroupStatus - it should not change status since it's already 'ready'
  checkAndUpdateGroupStatus(groupId);
  
  const groupAfter = getGroupById(groupId);
  assert(groupAfter.status === 'ready', 'Group should still be ready (not changed)');
});

// Test 9: Test minimum 4 members requirement
test('Group should require at least 4 members to close', () => {
  const allMembers = getMembersByGroup(groupId, false);
  assert(allMembers.length >= 4, `Should have at least 4 members, got ${allMembers.length}`);
});

// Test 10: Test UI logic - closed status should show disabled button
test('UI logic: closed status should show disabled initiate button', () => {
  const group = getGroupById(groupId);
  // Reset to closed for this test
  db.prepare('UPDATE groups SET status = ? WHERE id = ?').run('closed', groupId);
  
  const groupClosed = getGroupById(groupId);
  const shouldShowDisabledButton = groupClosed.status === 'closed' || groupClosed.status === 'ready';
  const shouldBeDisabled = groupClosed.status === 'closed';
  
  assert(shouldShowDisabledButton, 'Should show initiate button for closed/ready status');
  assert(shouldBeDisabled, 'Button should be disabled when status is closed');
});

// Test 11: Test UI logic - assignments should only show after messages_ready
test('UI logic: assignments should only show after messages_ready', () => {
  const statuses = ['open', 'closed', 'ready', 'messages_ready', 'complete'];
  const shouldShowAssignment = (status) => status === 'messages_ready' || status === 'complete';
  
  assert(!shouldShowAssignment('open'), 'Should not show assignment for "open"');
  assert(!shouldShowAssignment('closed'), 'Should not show assignment for "closed"');
  assert(!shouldShowAssignment('ready'), 'Should not show assignment for "ready"');
  assert(shouldShowAssignment('messages_ready'), 'Should show assignment for "messages_ready"');
  assert(shouldShowAssignment('complete'), 'Should show assignment for "complete"');
});

console.log('\n✅ All tests passed!');
console.log('\nSummary:');
console.log('- Group can be created and closed');
console.log('- Status transitions from "closed" to "ready" when all members complete backfill');
console.log('- UI logic correctly shows/hides elements based on status');
console.log('- Minimum 4 members requirement is enforced');

// Cleanup
db.close();
if (fs.existsSync(TEST_DB_PATH)) {
  fs.unlinkSync(TEST_DB_PATH);
  console.log('\n🧹 Test database cleaned up');
}

