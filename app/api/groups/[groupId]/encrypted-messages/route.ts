import { NextRequest, NextResponse } from 'next/server';
import { getDb, dbHelpers } from '@/lib/db/client';
import bcrypt from 'bcryptjs';
import { checkRateLimit, getClientIdentifier } from '@/lib/utils/rate-limit';
import { validateEmail } from '@/lib/utils/validation';

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
    const rateLimit = checkRateLimit(identifier, { maxRequests: 10, windowMs: 15 * 60 * 1000 });
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

    if (group.status === 'pending' || group.status === 'cycle_initiated') {
      return NextResponse.json(
        { error: 'Encrypted messages are not ready yet' },
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
      publicKey: member.public_key, // Return public key for verification
    });
  } catch (error) {
    console.error('Error fetching encrypted messages:', error);
    return NextResponse.json(
      { error: 'Unable to retrieve encrypted messages. Please try again.' },
      { status: 500 }
    );
  }
}

