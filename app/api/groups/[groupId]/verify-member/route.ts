import { NextRequest, NextResponse } from 'next/server';
import { getDb, dbHelpers } from '@/lib/db/client';
import bcrypt from 'bcryptjs';
import { checkRateLimit, getClientIdentifier } from '@/lib/utils/rate-limit';
import { validateEmail } from '@/lib/utils/validation';
import { sendGroupClosedEmail } from '@/lib/email/mailjet';

export async function POST(
  request: NextRequest,
  { params }: { params: { groupId: string } }
) {
  try {
    const { groupId } = params;
    const { email, password } = await request.json();

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
        { error: 'Too many login attempts. Please try again later.' },
        { status: 429 }
      );
    }

    // First check if this is the creator
    const group = dbHelpers.getGroupById(groupId);
    if (!group) {
      return NextResponse.json(
        { error: 'Group not found' },
        { status: 404 }
      );
    }

    if (group.creator_email === email) {
      // Verify creator password
      const isValid = await bcrypt.compare(password, group.creator_password_hash);
      if (!isValid) {
        return NextResponse.json(
          { error: 'Invalid email or password' },
          { status: 401 }
        );
      }

      // Check if creator has also joined as a member
      const member = dbHelpers.getMemberByEmail(groupId, email);
      
      return NextResponse.json({ 
        success: true,
        isCreator: true,
        memberId: member?.id,
        name: member?.name || 'Creator'
      });
    }

    // Otherwise check if this is a member
    const member = dbHelpers.getMemberByEmail(groupId, email);
    if (!member) {
      // Don't reveal if member exists or not (security)
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Verify member password
    const isValid = await bcrypt.compare(password, member.password_hash);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Send group closed email to member if group is closed (they need to log in to complete backfill)
    // We can use the plaintext email from the login request
    if (group.status === 'closed') {
      try {
        await sendGroupClosedEmail(
          email, // Plaintext email from login request
          member.name,
          group.unique_url
        );
        console.log(`[Verify Member] Sent group closed email to ${email} (${member.name})`);
      } catch (emailError: any) {
        console.error(`[Verify Member] Failed to send group closed email to ${email}:`, emailError.message || emailError);
        // Don't fail login if email fails - continue
      }
    }

    // Return success - member exists and credentials are valid
    // Backfill is now done CLIENT-SIDE for privacy (password never leaves browser)
    return NextResponse.json({ 
      success: true,
      isCreator: false,
      memberId: member.id,
      name: member.name,
      groupStatus: group.status, // Include status so client knows if backfill is needed
    });
  } catch (error) {
    console.error('Error verifying member:', error);
    return NextResponse.json(
      { error: 'Unable to verify credentials. Please try again.' },
      { status: 500 }
    );
  }
}

