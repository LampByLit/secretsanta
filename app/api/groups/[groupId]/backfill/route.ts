import { NextRequest, NextResponse } from 'next/server';
import { getDb, dbHelpers } from '@/lib/db/client';
import bcrypt from 'bcryptjs';
import { checkRateLimit, getClientIdentifier } from '@/lib/utils/rate-limit';
import { validateEmail } from '@/lib/utils/validation';
import { randomBytes } from 'crypto';

/**
 * Receive pre-encrypted messages from client-side backfill
 * Client decrypts their own data and encrypts with new members' public keys
 * Server NEVER sees plaintext data - true privacy
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { groupId: string } }
) {
  try {
    const { groupId } = params;
    const { email, password, preEncryptedMessages } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
      return NextResponse.json(
        { error: emailValidation.error || 'Invalid email format' },
        { status: 400 }
      );
    }

    // Rate limiting
    const identifier = getClientIdentifier(request, email);
    const rateLimit = checkRateLimit(identifier, { maxRequests: 20, windowMs: 15 * 60 * 1000 });
    if (rateLimit.rateLimited) {
      return NextResponse.json(
        { error: 'Too many attempts. Please try again later.' },
        { status: 429 }
      );
    }

    // Verify member
    const member = dbHelpers.getMemberByEmail(groupId, email);
    if (!member) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    const isValid = await bcrypt.compare(password, member.password_hash);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Check group status
    const group = dbHelpers.getGroupById(groupId);
    if (!group) {
      return NextResponse.json(
        { error: 'Group not found' },
        { status: 404 }
      );
    }

    if (group.status !== 'open' && group.status !== 'closed') {
      return NextResponse.json(
        { error: 'Backfill not needed - group cycle already initiated' },
        { status: 400 }
      );
    }

    // Validate pre-encrypted messages
    if (!preEncryptedMessages || !Array.isArray(preEncryptedMessages)) {
      return NextResponse.json(
        { error: 'Invalid pre-encrypted messages format' },
        { status: 400 }
      );
    }

    // Store pre-encrypted messages FROM this member TO new members
    const db = getDb();
    const preEncryptedStmt = db.prepare(`
      INSERT INTO pre_encrypted_messages (id, group_id, sender_id, recipient_id, c1, c2, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    let created = 0;
    let skipped = 0;
    const now = Date.now();

    for (const msg of preEncryptedMessages) {
      if (!msg.recipientId || !msg.c1 || !msg.c2) {
        continue;
      }

      // Check if message already exists (idempotent)
      const existing = dbHelpers.getPreEncryptedMessage(groupId, member.id, msg.recipientId);
      if (existing) {
        skipped++;
        continue;
      }

      try {
        // Verify recipient exists and is a valid member
        const recipient = dbHelpers.getMembersByGroup(groupId, false).find(m => m.id === msg.recipientId);
        if (!recipient) {
          console.error(`[Backfill] Invalid recipient ID: ${msg.recipientId}`);
          continue;
        }

        // Store the pre-encrypted message (already encrypted by client)
        const preEncryptedId = randomBytes(16).toString('hex');
        preEncryptedStmt.run(
          preEncryptedId,
          groupId,
          member.id, // sender (this member)
          msg.recipientId, // recipient (new member)
          msg.c1,
          msg.c2,
          now
        );
        created++;
        console.log(`[Backfill] ✓ Stored message from ${member.name} (${member.id}) to recipient ${msg.recipientId}`);
      } catch (error: any) {
        console.error(`[Backfill] Failed to store message from ${member.id} to ${msg.recipientId}:`, error.message || error);
        // Continue with next message even if this one fails
      }
    }

    // Check if group should transition from 'closed' to 'ready'
    if (group.status === 'closed') {
      console.log(`[Backfill] Checking if group ${groupId} should transition to 'ready' after storing ${created} new message(s)...`);
      const statusBefore = group.status;
      dbHelpers.checkAndUpdateGroupStatus(groupId);
      // Re-fetch to check if status changed
      const updatedGroup = dbHelpers.getGroupById(groupId);
      if (updatedGroup && updatedGroup.status !== statusBefore) {
        console.log(`[Backfill] ✓ Group ${groupId} status changed from '${statusBefore}' to '${updatedGroup.status}'`);
      }
    }

    return NextResponse.json({
      success: true,
      created,
      skipped,
    });
  } catch (error) {
    console.error('Error storing backfill messages:', error);
    return NextResponse.json(
      { error: 'Unable to store backfill messages. Please try again.' },
      { status: 500 }
    );
  }
}

