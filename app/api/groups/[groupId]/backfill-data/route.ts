import { NextRequest, NextResponse } from 'next/server';
import { getDb, dbHelpers } from '@/lib/db/client';
import bcrypt from 'bcryptjs';
import { checkRateLimit, getClientIdentifier } from '@/lib/utils/rate-limit';
import { validateEmail } from '@/lib/utils/validation';

/**
 * Get encrypted member data and new members' public keys for client-side backfill
 * This allows the client to decrypt their own data and create reverse pre-encrypted messages
 * WITHOUT the server ever seeing plaintext data
 */
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

    // Check group status - only allow backfill for 'open' or 'closed' groups
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

    // Get members who joined after this member
    const newMembers = dbHelpers.getMembersJoinedAfter(groupId, member.joined_at, member.id);
    
    if (newMembers.length === 0) {
      return NextResponse.json({
        needsBackfill: false,
        newMembers: [],
        memberData: {
          name: member.name,
          addressEncrypted: member.address,
          messageEncrypted: member.message,
          emailEncrypted: member.email,
        }
      });
    }

    // Return encrypted data (NOT decrypted - client will decrypt) and new members' public keys
    return NextResponse.json({
      needsBackfill: true,
      newMembers: newMembers.map(m => ({
        id: m.id,
        publicKey: m.public_key,
      })),
      memberData: {
        name: member.name,
        addressEncrypted: member.address, // Still encrypted - client will decrypt
        messageEncrypted: member.message, // Still encrypted - client will decrypt
        emailEncrypted: member.email, // Still encrypted - client will decrypt
      }
    });
  } catch (error) {
    console.error('Error fetching backfill data:', error);
    return NextResponse.json(
      { error: 'Unable to retrieve backfill data. Please try again.' },
      { status: 500 }
    );
  }
}

