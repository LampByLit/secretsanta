import { NextRequest, NextResponse } from 'next/server';
import { getDb, dbHelpers } from '@/lib/db/client';
import bcrypt from 'bcryptjs';

export async function GET(
  request: NextRequest,
  { params }: { params: { groupId: string } }
) {
  try {
    const { groupId } = params;
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');
    const password = searchParams.get('password');

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password required' },
        { status: 400 }
      );
    }

    // Verify member
    const member = dbHelpers.getMemberByEmail(groupId, email);
    if (!member) {
      return NextResponse.json(
        { error: 'Member not found' },
        { status: 404 }
      );
    }

    const isValid = await bcrypt.compare(password, member.password_hash);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid password' },
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

    if (group.status === 'pending' || group.status === 'cycle_initiated') {
      return NextResponse.json(
        { error: 'Messages not ready yet' },
        { status: 400 }
      );
    }

    // Get all encrypted messages (no sender info, just c1 and c2)
    const encryptedMessages = dbHelpers.getEncryptedMessages(groupId);

    return NextResponse.json({
      encryptedMessages: encryptedMessages.map(msg => ({
        c1: msg.c1,
        c2: msg.c2,
      })),
      privateKeyEncrypted: member.private_key_encrypted, // Return encrypted private key for client-side decryption
    });
  } catch (error) {
    console.error('Error fetching encrypted messages:', error);
    return NextResponse.json(
      { error: 'Failed to fetch encrypted messages' },
      { status: 500 }
    );
  }
}

