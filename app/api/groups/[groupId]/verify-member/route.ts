import { NextRequest, NextResponse } from 'next/server';
import { getDb, dbHelpers } from '@/lib/db/client';
import bcrypt from 'bcryptjs';
import { checkRateLimit, getClientIdentifier } from '@/lib/utils/rate-limit';
import { validateEmail } from '@/lib/utils/validation';

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
      
      // Check and update group status from 'closed' to 'ready' if all members have completed backfill
      // Note: This checks after login, but the actual status transition happens after backfill completes
      // This is just a safety check in case backfill was already done
      if (group.status === 'closed') {
        console.log(`[Verify Member] Checking status for group ${groupId} after creator ${email} login...`);
        const statusBefore = group.status;
        dbHelpers.checkAndUpdateGroupStatus(groupId);
        // Re-fetch group to get updated status
        const updatedGroup = dbHelpers.getGroupById(groupId);
        if (updatedGroup) {
          if (updatedGroup.status !== statusBefore) {
            console.log(`[Verify Member] ✓ Group ${groupId} status changed from '${statusBefore}' to '${updatedGroup.status}'`);
          }
          group.status = updatedGroup.status;
        }
      }
      
      return NextResponse.json({ 
        success: true,
        isCreator: true,
        memberId: member?.id,
        name: member?.name || 'Creator',
        groupStatus: group.status // CRITICAL: Include group status so backfill can run
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

    // Check and update group status from 'closed' to 'ready' if all members have completed backfill
    // Note: This checks after login, but the actual status transition happens after backfill completes
    // This is just a safety check in case backfill was already done
    if (group.status === 'closed') {
      console.log(`[Verify Member] Checking status for group ${groupId} after member ${email} login...`);
      const statusBefore = group.status;
      dbHelpers.checkAndUpdateGroupStatus(groupId);
      // Re-fetch group to get updated status
      const updatedGroup = dbHelpers.getGroupById(groupId);
      if (updatedGroup) {
        if (updatedGroup.status !== statusBefore) {
          console.log(`[Verify Member] ✓ Group ${groupId} status changed from '${statusBefore}' to '${updatedGroup.status}'`);
        }
        group.status = updatedGroup.status;
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

