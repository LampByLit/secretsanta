import { NextRequest, NextResponse } from 'next/server';
import { getDb, dbHelpers } from '@/lib/db/client';
import { randomBytes } from 'crypto';
import { generateKeyPair, encrypt, decrypt, encodeMessage, P, G } from '@/lib/crypto/elgamal';

export async function POST(
  request: NextRequest,
  { params }: { params: { groupId: string } }
) {
  try {
    const { groupId } = params;
    const { creatorEmail, creatorPassword } = await request.json();

    console.log(`[Initiate Cycle] Starting cycle initiation for group ${groupId} by ${creatorEmail}`);

    const db = getDb();
    
    // Verify creator
    const group = dbHelpers.getGroupById(groupId);
    if (!group) {
      console.error(`[Initiate Cycle] Group ${groupId} not found`);
      return NextResponse.json(
        { error: 'Group not found' },
        { status: 404 }
      );
    }

    if (group.creator_email !== creatorEmail) {
      console.error(`[Initiate Cycle] Unauthorized: ${creatorEmail} is not the creator`);
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check if already initiated
    if (group.status !== 'pending') {
      console.log(`[Initiate Cycle] Group ${groupId} already initiated with status: ${group.status}`);
      return NextResponse.json(
        { error: 'Cycle already initiated' },
        { status: 400 }
      );
    }

    // Get all non-excluded members
    const members = dbHelpers.getMembersByGroup(groupId, false);
    console.log(`[Initiate Cycle] Found ${members.length} non-excluded members`);
    
    if (members.length < 4) {
      console.error(`[Initiate Cycle] Insufficient members: ${members.length} < 4`);
      return NextResponse.json(
        { error: 'Need at least 4 members to start Secret Santa' },
        { status: 400 }
      );
    }

    // Randomize order
    const shuffled = [...members].sort(() => Math.random() - 0.5);
    const chair = shuffled[shuffled.length - 1];
    console.log(`[Initiate Cycle] Shuffled ${shuffled.length} members, chair is: ${chair.name}`);

    // Generate session key pair (chair's role)
    console.log(`[Initiate Cycle] Generating session key pair...`);
    const sessionKeyPair = await generateKeyPair();
    console.log(`[Initiate Cycle] Session key pair generated`);

    // Phase 1: Encrypt each member's public key with session public key
    console.log(`[Initiate Cycle] Phase 1: Encrypting ${shuffled.length} public keys...`);
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
    console.log(`[Initiate Cycle] Encrypted ${encryptedKeys.length} keys`);

    // Simulate chain passing (shuffle encrypted keys)
    console.log(`[Initiate Cycle] Simulating chain passing (shuffling encrypted keys)...`);
    encryptedKeys.sort(() => Math.random() - 0.5);

    // Chair decrypts all keys
    console.log(`[Initiate Cycle] Chair decrypting all keys...`);
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
    console.log(`[Initiate Cycle] Decrypted ${decryptedKeys.length} keys`);

    // Sort public keys numerically
    console.log(`[Initiate Cycle] Sorting public keys numerically...`);
    decryptedKeys.sort((a, b) => {
      if (a.publicKey < b.publicKey) return -1;
      if (a.publicKey > b.publicKey) return 1;
      return 0;
    });

    // Create cycle: key before yours = your Santa
    console.log(`[Initiate Cycle] Creating assignments from sorted keys...`);
    const assignments: Array<{ santaId: string; santeeId: string }> = [];
    
    for (let i = 0; i < decryptedKeys.length; i++) {
      const santaId = decryptedKeys[i].memberId;
      const santeeIndex = (i + 1) % decryptedKeys.length;
      const santeeId = decryptedKeys[santeeIndex].memberId;
      assignments.push({ santaId, santeeId });
    }
    console.log(`[Initiate Cycle] Created ${assignments.length} assignments`);

    // Store assignments
    console.log(`[Initiate Cycle] Storing ${assignments.length} assignments in database...`);
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
    console.log(`[Initiate Cycle] Stored ${assignments.length} assignments successfully`);

    // Encrypt each santee's message with their santa's public key
    console.log(`[Initiate Cycle] Encrypting messages for ${assignments.length} assignments...`);
    const encryptedMessageStmt = db.prepare(`
      INSERT INTO encrypted_messages (id, group_id, sender_id, santa_id, c1, c2, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    let encryptionSuccessCount = 0;
    let encryptionFailureCount = 0;

    for (const assignment of assignments) {
      const santa = members.find(m => m.id === assignment.santaId);
      const santee = members.find(m => m.id === assignment.santeeId);
      
      if (santa && santee) {
        try {
          // Encode santee's message (name, address, message) into bigint
          const encodedMessage = encodeMessage(santee.name, santee.address, santee.message);
          
          // Encrypt with santa's public key
          const santaPublicKey = BigInt(santa.public_key);
          const encrypted = await encrypt(santaPublicKey, encodedMessage);
          
          // Store encrypted message
          const encryptedMessageId = randomBytes(16).toString('hex');
          encryptedMessageStmt.run(
            encryptedMessageId,
            groupId,
            santee.id, // sender_id (the santee sending to their santa)
            santa.id,  // santa_id (who can decrypt it)
            encrypted.c1.toString(),
            encrypted.c2.toString(),
            now
          );
          
          encryptionSuccessCount++;
          console.log(`[Initiate Cycle] ✓ Encrypted message for ${santa.name} (from ${santee.name})`);
        } catch (encryptionError: any) {
          encryptionFailureCount++;
          console.error(`[Initiate Cycle] ✗ Failed to encrypt message for ${santa.name}:`, encryptionError.message || encryptionError);
          // Continue with next message even if this one fails
        }
      } else {
        console.error(`[Initiate Cycle] ✗ Could not find santa or santee for assignment:`, { santaId: assignment.santaId, santeeId: assignment.santeeId });
        encryptionFailureCount++;
      }
    }
    
    console.log(`[Initiate Cycle] Message encryption complete: ${encryptionSuccessCount} succeeded, ${encryptionFailureCount} failed`);

    // Update group status to messages_ready
    console.log(`[Initiate Cycle] Updating group status to 'messages_ready'...`);
    const updateStmt = db.prepare(`
      UPDATE groups SET status = ?, updated_at = ? WHERE id = ?
    `);
    updateStmt.run('messages_ready', now, groupId);
    console.log(`[Initiate Cycle] Group status updated successfully`);
    console.log(`[Initiate Cycle] Cycle initiation completed successfully for group ${groupId}`);

    return NextResponse.json({ 
      success: true,
      assignmentsCreated: assignments.length,
      messagesEncrypted: encryptionSuccessCount,
      messagesFailed: encryptionFailureCount
    });
  } catch (error) {
    console.error('Error initiating cycle:', error);
    return NextResponse.json(
      { error: 'Failed to initiate cycle' },
      { status: 500 }
    );
  }
}

