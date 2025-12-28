import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const { name, email, password, groupName } = await request.json();

    if (!name || !email || !password || !groupName) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const db = getDb();
    
    // Generate unique URL slug
    const uniqueUrl = generateUniqueSlug();
    
    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);
    
    // Generate group ID
    const groupId = randomBytes(16).toString('hex');
    const now = Date.now();
    
    // Insert group
    const stmt = db.prepare(`
      INSERT INTO groups (id, name, creator_email, creator_password_hash, unique_url, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(groupId, groupName, email, passwordHash, uniqueUrl, 'pending', now, now);
    
    return NextResponse.json({
      groupId,
      uniqueUrl,
    });
  } catch (error) {
    console.error('Error creating group:', error);
    return NextResponse.json(
      { error: 'Failed to create group' },
      { status: 500 }
    );
  }
}

function generateUniqueSlug(): string {
  // Generate a readable but unique slug
  const adjectives = ['happy', 'merry', 'jolly', 'festive', 'cheerful', 'bright'];
  const nouns = ['santa', 'elf', 'reindeer', 'sleigh', 'gift', 'wreath'];
  const random1 = adjectives[Math.floor(Math.random() * adjectives.length)];
  const random2 = nouns[Math.floor(Math.random() * nouns.length)];
  const randomNum = Math.floor(Math.random() * 10000);
  return `${random1}-${random2}-${randomNum}`;
}

