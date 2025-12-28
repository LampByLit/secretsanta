import { NextRequest, NextResponse } from 'next/server';
import { getDb, dbHelpers } from '@/lib/db/client';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { generateKeyPair, encrypt, decrypt, P, G } from '@/lib/crypto/elgamal';

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

    // Verify creator password
    const isPasswordValid = await bcrypt.compare(creatorPassword, group.creator_password_hash);
    if (!isPasswordValid) {
      console.error(`[Initiate Cycle] Unauthorized: Invalid password for ${creatorEmail}`);
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check if already initiated
    if (group.status === 'messages_ready' || group.status === 'complete') {
      console.log(`[Initiate Cycle] Group ${groupId} already initiated with status: ${group.status}`);
      return NextResponse.json(
        { error: 'Cycle already initiated' },
        { status: 400 }
      );
    }

    // Check if group is ready for cycle initiation
    if (group.status !== 'ready') {
      const backfillStatus = dbHelpers.checkBackfillStatus(groupId);
      const activeMembers = dbHelpers.getMembersByGroup(groupId, false);
      const completedCount = activeMembers.length - backfillStatus.missingMembers.length;
      
      return NextResponse.json(
        { 
          error: `Cannot initiate cycle. Group status is '${group.status}'. ${completedCount}/${activeMembers.length} members have completed setup.`,
          backfillStatus: {
            complete: backfillStatus.complete,
            completedCount,
            totalCount: activeMembers.length,
            missingMembers: backfillStatus.missingMembers.map(m => ({ id: m.id, name: m.name })),
          }
        },
        { status: 400 }
      );
    }

    // Verify all bidirectional messages exist before proceeding
    const backfillStatus = dbHelpers.checkBackfillStatus(groupId);
    if (!backfillStatus.complete) {
      const activeMembers = dbHelpers.getMembersByGroup(groupId, false);
      const completedCount = activeMembers.length - backfillStatus.missingMembers.length;
      console.error(`[Initiate Cycle] Backfill not complete: ${completedCount}/${activeMembers.length} members ready`);
      return NextResponse.json(
        { 
          error: `Cannot initiate cycle: ${backfillStatus.missingMembers.length} member(s) need to log in to complete setup.`,
          backfillStatus: {
            complete: false,
            completedCount,
            totalCount: activeMembers.length,
            missingMembers: backfillStatus.missingMembers.map(m => ({ id: m.id, name: m.name })),
          }
        },
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

    // Randomize order using cryptographically secure random
    const shuffled = secureShuffle([...members]);
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
    const shuffledEncryptedKeys = secureShuffle(encryptedKeys);

    // Chair decrypts all keys
    console.log(`[Initiate Cycle] Chair decrypting all keys...`);
    const decryptedKeys: Array<{ memberId: string; publicKey: BigInt }> = [];
    
    for (const item of shuffledEncryptedKeys) {
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

    // Use pre-encrypted messages instead of encrypting on-the-fly
    // Pre-encrypted messages were created when members joined, encrypting their data with all other members' public keys
    console.log(`[Initiate Cycle] Using pre-encrypted messages for ${assignments.length} assignments...`);
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
          // Look up pre-encrypted message from santee to santa
          const preEncrypted = dbHelpers.getPreEncryptedMessage(groupId, santee.id, santa.id);
          
          if (!preEncrypted) {
            // This shouldn't happen if all members joined before cycle initiation
            // But handle gracefully - could happen if someone joined after cycle started (should be prevented)
            throw new Error(`Pre-encrypted message not found from santee ${santee.id} to santa ${santa.id}`);
          }
          
          // Use the pre-encrypted message (already encrypted with santa's public key)
          const encryptedMessageId = randomBytes(16).toString('hex');
          encryptedMessageStmt.run(
            encryptedMessageId,
            groupId,
            santee.id, // sender_id (the santee sending to their santa)
            santa.id,  // santa_id (who can decrypt it)
            preEncrypted.c1,
            preEncrypted.c2,
            now
          );
          
          encryptionSuccessCount++;
          console.log(`[Initiate Cycle] ✓ Used pre-encrypted message for santa ${santa.id} (from santee ${santee.id})`);
        } catch (encryptionError: any) {
          encryptionFailureCount++;
          console.error(`[Initiate Cycle] ✗ Failed to use pre-encrypted message for santa ${santa.id}:`, encryptionError.message || encryptionError);
          // Continue with next message even if this one fails
        }
      } else {
        console.error(`[Initiate Cycle] ✗ Could not find santa or santee for assignment:`, { santaId: assignment.santaId, santeeId: assignment.santeeId });
        encryptionFailureCount++;
      }
    }
    
    console.log(`[Initiate Cycle] Message assignment complete: ${encryptionSuccessCount} succeeded, ${encryptionFailureCount} failed`);

    // Fail if any messages are missing - this indicates missing bidirectional pre-encrypted messages
    // which happens when members join sequentially (early joiners can't encrypt for later joiners)
    if (encryptionFailureCount > 0) {
      console.error(`[Initiate Cycle] ✗ Failed to initiate cycle: ${encryptionFailureCount} pre-encrypted messages missing`);
      return NextResponse.json(
        { 
          error: `Cannot initiate cycle: ${encryptionFailureCount} pre-encrypted message(s) missing. This happens when members join sequentially. All members must join before initiating the cycle, or create a new group.`,
          messagesEncrypted: encryptionSuccessCount,
          messagesFailed: encryptionFailureCount
        },
        { status: 400 }
      );
    }

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

/**
 * Cryptographically secure shuffle using Fisher-Yates algorithm
 * Uses crypto.getRandomValues() instead of Math.random()
 */
function secureShuffle<T>(array: T[]): T[] {
  const shuffled = [...array];
  const randomValues = new Uint32Array(shuffled.length);
  crypto.getRandomValues(randomValues);
  
  for (let i = shuffled.length - 1; i > 0; i--) {
    // Use modulo to get a random index from 0 to i
    const j = randomValues[i] % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  
  return shuffled;
}

