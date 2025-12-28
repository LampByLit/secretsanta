import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { Group, Member, Assignment, ShipmentConfirmation } from './schema';
// Validate environment variables at startup
import '@/lib/utils/env';

// Handle DB_PATH - if it's a directory, append filename; if it's a file, use as-is
const rawDbPath = process.env.DB_PATH || path.join(process.cwd(), 'data', 'secretsanta.db');
const DB_PATH = fs.existsSync(rawDbPath) && fs.statSync(rawDbPath).isDirectory()
  ? path.join(rawDbPath, 'secretsanta.db')
  : rawDbPath.endsWith('.db')
  ? rawDbPath
  : path.join(rawDbPath, 'secretsanta.db');

// Log database path on module load (for debugging)
if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'test') {
  console.log(`Database path configured as: ${DB_PATH}`);
}

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    // Ensure data directory exists
    const dbDir = path.dirname(DB_PATH);
    try {
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true, mode: 0o755 });
      }
      // Verify directory is writable
      fs.accessSync(dbDir, fs.constants.W_OK);
    } catch (error: any) {
      console.error(`Failed to create/access database directory: ${dbDir}`, error);
      // Don't throw - let Railway logs show the error, but don't crash the app
      // The error will surface when an API route tries to use the DB
      throw new Error(`Database directory error: ${error.message}`);
    }
    
    try {
      db = new Database(DB_PATH);
      db.pragma('journal_mode = WAL');
      initializeSchema(db);
      console.log(`Database initialized at: ${DB_PATH}`);
    } catch (error: any) {
      console.error(`Failed to open database at: ${DB_PATH}`, error);
      throw new Error(`Database initialization error: ${error.message}`);
    }
  }
  return db;
}

function initializeSchema(database: Database.Database) {
  // Groups table
  database.exec(`
    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      creator_email TEXT NOT NULL,
      creator_password_hash TEXT NOT NULL,
      unique_url TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // Members table
  database.exec(`
    CREATE TABLE IF NOT EXISTS members (
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
    )
  `);

  // Add email_hash column if it doesn't exist (migration for existing databases)
  try {
    database.exec(`ALTER TABLE members ADD COLUMN email_hash TEXT`);
    // Create index for email_hash lookups
    database.exec(`CREATE INDEX IF NOT EXISTS idx_members_email_hash ON members(group_id, email_hash)`);
  } catch (e: any) {
    // Column already exists, ignore error
    if (!e.message.includes('duplicate column')) {
      throw e;
    }
  }

  // Ensure index exists for email_hash lookups
  try {
    database.exec(`CREATE INDEX IF NOT EXISTS idx_members_email_hash ON members(group_id, email_hash)`);
  } catch (e: any) {
    // Index might already exist, ignore
  }

  // Assignments table
  database.exec(`
    CREATE TABLE IF NOT EXISTS assignments (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      santa_id TEXT NOT NULL,
      santee_id TEXT NOT NULL,
      revealed INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
      FOREIGN KEY (santa_id) REFERENCES members(id) ON DELETE CASCADE,
      FOREIGN KEY (santee_id) REFERENCES members(id) ON DELETE CASCADE
    )
  `);

  // Shipment confirmations table
  database.exec(`
    CREATE TABLE IF NOT EXISTS shipment_confirmations (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      member_id TEXT NOT NULL,
      confirmed_at INTEGER NOT NULL,
      UNIQUE(group_id, member_id),
      FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
    )
  `);

  // Pre-encrypted messages table (encrypted during join, used during cycle initiation)
  database.exec(`
    CREATE TABLE IF NOT EXISTS pre_encrypted_messages (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      recipient_id TEXT NOT NULL,
      c1 TEXT NOT NULL,
      c2 TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(group_id, sender_id, recipient_id),
      FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
      FOREIGN KEY (sender_id) REFERENCES members(id) ON DELETE CASCADE,
      FOREIGN KEY (recipient_id) REFERENCES members(id) ON DELETE CASCADE
    )
  `);

  // Encrypted messages table (final assignments after cycle initiation)
  database.exec(`
    CREATE TABLE IF NOT EXISTS encrypted_messages (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      santa_id TEXT NOT NULL,
      c1 TEXT NOT NULL,
      c2 TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
      FOREIGN KEY (sender_id) REFERENCES members(id) ON DELETE CASCADE,
      FOREIGN KEY (santa_id) REFERENCES members(id) ON DELETE CASCADE
    )
  `);

  // Add decrypted_at column to assignments if it doesn't exist
  try {
    database.exec(`ALTER TABLE assignments ADD COLUMN decrypted_at INTEGER`);
  } catch (e: any) {
    // Column already exists, ignore error
    if (!e.message.includes('duplicate column')) {
      throw e;
    }
  }

  // Indexes
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_members_group ON members(group_id);
    CREATE INDEX IF NOT EXISTS idx_assignments_group ON assignments(group_id);
    CREATE INDEX IF NOT EXISTS idx_assignments_santa ON assignments(santa_id);
    CREATE INDEX IF NOT EXISTS idx_shipments_group ON shipment_confirmations(group_id);
    CREATE INDEX IF NOT EXISTS idx_pre_encrypted_messages_group ON pre_encrypted_messages(group_id);
    CREATE INDEX IF NOT EXISTS idx_pre_encrypted_messages_recipient ON pre_encrypted_messages(group_id, recipient_id);
    CREATE INDEX IF NOT EXISTS idx_encrypted_messages_group ON encrypted_messages(group_id);
  `);
}

// Helper functions for database operations
export const dbHelpers = {
  getGroupByUrl: (url: string): Group | undefined => {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM groups WHERE unique_url = ?');
    return stmt.get(url) as Group | undefined;
  },

  getGroupById: (id: string): Group | undefined => {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM groups WHERE id = ?');
    return stmt.get(id) as Group | undefined;
  },

  getMembersByGroup: (groupId: string, includeExcluded: boolean = false): Member[] => {
    const db = getDb();
    const stmt = includeExcluded
      ? db.prepare('SELECT * FROM members WHERE group_id = ? ORDER BY joined_at ASC')
      : db.prepare('SELECT * FROM members WHERE group_id = ? AND excluded = 0 ORDER BY joined_at ASC');
    return stmt.all(groupId) as Member[];
  },

  getMemberByEmailHash: (groupId: string, emailHash: string): Member | undefined => {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM members WHERE group_id = ? AND email_hash = ?');
    return stmt.get(groupId, emailHash) as Member | undefined;
  },

  getMemberByEmail: (groupId: string, email: string): Member | undefined => {
    // Hash email for lookup (normalize to lowercase and trim)
    const crypto = require('crypto');
    const normalizedEmail = email.toLowerCase().trim();
    const emailHash = crypto.createHash('sha256').update(normalizedEmail).digest('hex');
    return dbHelpers.getMemberByEmailHash(groupId, emailHash);
  },

  getAssignment: (groupId: string, santaId: string): Assignment | undefined => {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM assignments WHERE group_id = ? AND santa_id = ?');
    return stmt.get(groupId, santaId) as Assignment | undefined;
  },

  getShipmentCount: (groupId: string): number => {
    const db = getDb();
    const stmt = db.prepare('SELECT COUNT(*) as count FROM shipment_confirmations WHERE group_id = ?');
    const result = stmt.get(groupId) as { count: number };
    return result.count;
  },

  getEncryptedMessages: (groupId: string): Array<{ c1: string; c2: string }> => {
    const db = getDb();
    const stmt = db.prepare('SELECT c1, c2 FROM encrypted_messages WHERE group_id = ?');
    return stmt.all(groupId) as Array<{ c1: string; c2: string }>;
  },

  getDecryptionCount: (groupId: string): number => {
    const db = getDb();
    const stmt = db.prepare('SELECT COUNT(*) as count FROM assignments WHERE group_id = ? AND decrypted_at IS NOT NULL');
    const result = stmt.get(groupId) as { count: number };
    return result.count;
  },

  markAssignmentDecrypted: (groupId: string, santaId: string): void => {
    const db = getDb();
    const stmt = db.prepare('UPDATE assignments SET decrypted_at = ? WHERE group_id = ? AND santa_id = ? AND decrypted_at IS NULL');
    stmt.run(Date.now(), groupId, santaId);
  },

  isAssignmentDecrypted: (groupId: string, santaId: string): boolean => {
    const db = getDb();
    const stmt = db.prepare('SELECT decrypted_at FROM assignments WHERE group_id = ? AND santa_id = ?');
    const result = stmt.get(groupId, santaId) as { decrypted_at: number | null } | undefined;
    return result ? result.decrypted_at !== null : false;
  },

  getPreEncryptedMessage: (groupId: string, senderId: string, recipientId: string): { c1: string; c2: string } | undefined => {
    const db = getDb();
    const stmt = db.prepare('SELECT c1, c2 FROM pre_encrypted_messages WHERE group_id = ? AND sender_id = ? AND recipient_id = ?');
    return stmt.get(groupId, senderId, recipientId) as { c1: string; c2: string } | undefined;
  },

  getMembersJoinedAfter: (groupId: string, joinedAt: number, excludeMemberId?: string): Member[] => {
    const db = getDb();
    let stmt;
    if (excludeMemberId) {
      stmt = db.prepare('SELECT * FROM members WHERE group_id = ? AND joined_at > ? AND excluded = 0 AND id != ? ORDER BY joined_at ASC');
      return stmt.all(groupId, joinedAt, excludeMemberId) as Member[];
    } else {
      stmt = db.prepare('SELECT * FROM members WHERE group_id = ? AND joined_at > ? AND excluded = 0 ORDER BY joined_at ASC');
      return stmt.all(groupId, joinedAt) as Member[];
    }
  },

  checkBackfillStatus: (groupId: string): { complete: boolean; missingMembers: Array<{ id: string; name: string }> } => {
    const db = getDb();
    const activeMembers = dbHelpers.getMembersByGroup(groupId, false);
    
    console.log(`[checkBackfillStatus] Checking ${activeMembers.length} active members for group ${groupId}`);
    activeMembers.forEach(m => console.log(`  - ${m.name} (${m.id}) - email: ${m.email}`));
    
    if (activeMembers.length < 2) {
      // Need at least 2 members for bidirectional messages
      console.log(`[checkBackfillStatus] Less than 2 members, backfill complete`);
      return { complete: true, missingMembers: [] };
    }

    const missingMembers = new Set<string>();
    const missingMessages: Array<{ from: string; to: string }> = [];
    
    // Check all pairs for bidirectional messages
    for (let i = 0; i < activeMembers.length; i++) {
      for (let j = i + 1; j < activeMembers.length; j++) {
        const memberA = activeMembers[i];
        const memberB = activeMembers[j];
        
        // Check A -> B
        const msgAB = dbHelpers.getPreEncryptedMessage(groupId, memberA.id, memberB.id);
        if (!msgAB) {
          missingMembers.add(memberA.id);
          missingMessages.push({ from: `${memberA.name} (${memberA.id})`, to: `${memberB.name} (${memberB.id})` });
          console.log(`[checkBackfillStatus] ✗ Missing message: ${memberA.name} -> ${memberB.name}`);
        }
        
        // Check B -> A
        const msgBA = dbHelpers.getPreEncryptedMessage(groupId, memberB.id, memberA.id);
        if (!msgBA) {
          missingMembers.add(memberB.id);
          missingMessages.push({ from: `${memberB.name} (${memberB.id})`, to: `${memberA.name} (${memberA.id})` });
          console.log(`[checkBackfillStatus] ✗ Missing message: ${memberB.name} -> ${memberA.name}`);
        }
      }
    }

    const missingMembersList = Array.from(missingMembers).map(id => {
      const member = activeMembers.find(m => m.id === id);
      return { id, name: member?.name || 'Unknown' };
    });

    if (missingMessages.length > 0) {
      console.log(`[checkBackfillStatus] Total missing messages: ${missingMessages.length}`);
      console.log(`[checkBackfillStatus] Members needing to complete backfill: ${missingMembersList.map(m => m.name).join(', ')}`);
    }

    return {
      complete: missingMembers.size === 0,
      missingMembers: missingMembersList,
    };
  },

  checkAndUpdateGroupStatus: (groupId: string): void => {
    const group = dbHelpers.getGroupById(groupId);
    if (!group) {
      console.log(`[Status Check] Group ${groupId} not found`);
      return;
    }
    
    // Only transition from 'closed' to 'ready'
    if (group.status !== 'closed') {
      console.log(`[Status Check] Group ${groupId} status is '${group.status}', skipping (only transition from 'closed')`);
      return;
    }
    
    const backfillStatus = dbHelpers.checkBackfillStatus(groupId);
    const activeMembers = dbHelpers.getMembersByGroup(groupId, false);
    const completedCount = activeMembers.length - backfillStatus.missingMembers.length;
    
    console.log(`[Status Check] Group ${groupId}: Backfill status - ${completedCount}/${activeMembers.length} members complete`);
    
    if (backfillStatus.missingMembers.length > 0) {
      console.log(`[Status Check] Group ${groupId}: Missing backfill from ${backfillStatus.missingMembers.length} member(s):`, 
        backfillStatus.missingMembers.map(m => m.name).join(', '));
    }
    
    if (backfillStatus.complete) {
      const db = getDb();
      const stmt = db.prepare('UPDATE groups SET status = ?, updated_at = ? WHERE id = ?');
      stmt.run('ready', Date.now(), groupId);
      console.log(`[Status Check] ✓ Group ${groupId} status transitioned from 'closed' to 'ready'! All ${activeMembers.length} members have completed backfill.`);
    } else {
      console.log(`[Status Check] Group ${groupId} not ready yet: ${completedCount}/${activeMembers.length} members complete`);
    }
  },
};

