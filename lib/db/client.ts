import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { Group, Member, Assignment, ShipmentConfirmation } from './schema';

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
      status TEXT NOT NULL DEFAULT 'pending',
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
      password_hash TEXT NOT NULL,
      message TEXT NOT NULL,
      address TEXT NOT NULL,
      public_key TEXT NOT NULL,
      private_key_encrypted TEXT NOT NULL,
      excluded INTEGER NOT NULL DEFAULT 0,
      joined_at INTEGER NOT NULL,
      password_reset_token TEXT,
      password_reset_expires INTEGER,
      UNIQUE(group_id, email),
      FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
    )
  `);

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

  // Indexes
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_members_group ON members(group_id);
    CREATE INDEX IF NOT EXISTS idx_assignments_group ON assignments(group_id);
    CREATE INDEX IF NOT EXISTS idx_assignments_santa ON assignments(santa_id);
    CREATE INDEX IF NOT EXISTS idx_shipments_group ON shipment_confirmations(group_id);
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

  getMemberByEmail: (groupId: string, email: string): Member | undefined => {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM members WHERE group_id = ? AND email = ?');
    return stmt.get(groupId, email) as Member | undefined;
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
};

