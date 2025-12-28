import { NextRequest, NextResponse } from 'next/server';
import { getDb, dbHelpers } from '@/lib/db/client';
import { randomBytes } from 'crypto';
import { generateKeyPair, encrypt, decrypt, P, G } from '@/lib/crypto/elgamal';
import { sendAssignmentEmail } from '@/lib/email/mailjet';

export async function POST(
  request: NextRequest,
  { params }: { params: { groupId: string } }
) {
  try {
    const { groupId } = params;
    const { creatorEmail, creatorPassword } = await request.json();

    const db = getDb();
    
    // Verify creator
    const group = dbHelpers.getGroupById(groupId);
    if (!group) {
      return NextResponse.json(
        { error: 'Group not found' },
        { status: 404 }
      );
    }

    if (group.creator_email !== creatorEmail) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check if already initiated
    if (group.status !== 'pending') {
      return NextResponse.json(
        { error: 'Cycle already initiated' },
        { status: 400 }
      );
    }

    // Get all non-excluded members
    const members = dbHelpers.getMembersByGroup(groupId, false);
    
    if (members.length < 4) {
      return NextResponse.json(
        { error: 'Need at least 4 members to start Secret Santa' },
        { status: 400 }
      );
    }

    // Randomize order
    const shuffled = [...members].sort(() => Math.random() - 0.5);
    const chair = shuffled[shuffled.length - 1];

    // Generate session key pair (chair's role)
    const sessionKeyPair = await generateKeyPair();

    // Phase 1: Encrypt each member's public key with session public key
    const encryptedKeys: Array<{ memberId: string; encrypted: { c1: string; c2: string } }> = [];
    
    for (const member of shuffled) {
      const publicKey = BigInt(member.public_key);
      const encrypted = await encrypt(sessionKeyPair.publicKey, publicKey);
      encryptedKeys.push({
        memberId: member.id,
        encrypted: {
          c1: encrypted.c1.toString(),
          c2: encrypted.c2.toString(),
        },
      });
    }

    // Simulate chain passing (shuffle encrypted keys)
    encryptedKeys.sort(() => Math.random() - 0.5);

    // Chair decrypts all keys
    const decryptedKeys: Array<{ memberId: string; publicKey: BigInt }> = [];
    
    for (const item of encryptedKeys) {
      const encrypted = {
        c1: BigInt(item.encrypted.c1),
        c2: BigInt(item.encrypted.c2),
      };
      const decrypted = await decrypt(sessionKeyPair.privateKey, encrypted);
      decryptedKeys.push({
        memberId: item.memberId,
        publicKey: decrypted,
      });
    }

    // Sort public keys numerically
    decryptedKeys.sort((a, b) => {
      if (a.publicKey < b.publicKey) return -1;
      if (a.publicKey > b.publicKey) return 1;
      return 0;
    });

    // Create cycle: key before yours = your Santa
    const assignments: Array<{ santaId: string; santeeId: string }> = [];
    
    for (let i = 0; i < decryptedKeys.length; i++) {
      const santaId = decryptedKeys[i].memberId;
      const santeeIndex = (i + 1) % decryptedKeys.length;
      const santeeId = decryptedKeys[santeeIndex].memberId;
      assignments.push({ santaId, santeeId });
    }

    // Store assignments
    const assignmentStmt = db.prepare(`
      INSERT INTO assignments (id, group_id, santa_id, santee_id, revealed, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const now = Date.now();
    for (const assignment of assignments) {
      const assignmentId = randomBytes(16).toString('hex');
      assignmentStmt.run(
        assignmentId,
        groupId,
        assignment.santaId,
        assignment.santeeId,
        0, // revealed = false (SQLite uses 0/1 for booleans)
        now
      );
    }

    // Update group status
    const updateStmt = db.prepare(`
      UPDATE groups SET status = ?, updated_at = ? WHERE id = ?
    `);
    updateStmt.run('cycle_initiated', now, groupId);

    // Send emails to all members
    for (const assignment of assignments) {
      const santa = members.find(m => m.id === assignment.santaId);
      const santee = members.find(m => m.id === assignment.santeeId);
      
      if (santa && santee) {
        await sendAssignmentEmail(santa.email, santa.name, santee.name, santee.address, santee.message, group.unique_url);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error initiating cycle:', error);
    return NextResponse.json(
      { error: 'Failed to initiate cycle' },
      { status: 500 }
    );
  }
}

