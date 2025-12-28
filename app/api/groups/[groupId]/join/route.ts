import { NextRequest, NextResponse } from 'next/server';
import { getDb, dbHelpers } from '@/lib/db/client';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

export async function POST(
  request: NextRequest,
  { params }: { params: { groupId: string } }
) {
  try {
    const { name, email, password, message, address, publicKey, encryptedPrivateKey } = await request.json();
    const { groupId } = params;

    if (!name || !email || !password || !message || !address || !publicKey || !encryptedPrivateKey) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const db = getDb();
    
    // Check if group exists
    const group = dbHelpers.getGroupById(groupId);
    if (!group) {
      return NextResponse.json(
        { error: 'Group not found' },
        { status: 404 }
      );
    }

    // Check if cycle already initiated
    if (group.status !== 'pending') {
      return NextResponse.json(
        { error: 'Group cycle has already been initiated' },
        { status: 400 }
      );
    }

    // Check if email already exists in this group
    const existingMember = dbHelpers.getMemberByEmail(groupId, email);
    if (existingMember) {
      return NextResponse.json(
        { error: 'You have already joined this group' },
        { status: 400 }
      );
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);
    
    // Generate member ID
    const memberId = randomBytes(16).toString('hex');
    const now = Date.now();
    
    // Insert member with client-generated public key and encrypted private key
    const stmt = db.prepare(`
      INSERT INTO members (id, group_id, name, email, password_hash, message, address, public_key, private_key_encrypted, excluded, joined_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      memberId,
      groupId,
      name,
      email,
      passwordHash,
      message,
      address,
      publicKey,
      encryptedPrivateKey,
      0, // excluded = false (SQLite uses 0/1 for booleans)
      now
    );
    
    return NextResponse.json({
      memberId,
      success: true,
    });
  } catch (error) {
    console.error('Error joining group:', error);
    return NextResponse.json(
      { error: 'Failed to join group' },
      { status: 500 }
    );
  }
}

