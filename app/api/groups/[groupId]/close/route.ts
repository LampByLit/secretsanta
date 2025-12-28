import { NextRequest, NextResponse } from 'next/server';
import { getDb, dbHelpers } from '@/lib/db/client';
import bcrypt from 'bcryptjs';
import { sendGroupClosedEmail } from '@/lib/email/mailjet';

/**
 * Close a Secret Santa group (disallow new members)
 * Sends notification emails to creator and all members
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { groupId: string } }
) {
  try {
    const { groupId } = params;
    const { creatorEmail, creatorPassword } = await request.json();

    if (!creatorEmail || !creatorPassword) {
      return NextResponse.json(
        { error: 'Creator email and password are required' },
        { status: 400 }
      );
    }

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

    const isValid = await bcrypt.compare(creatorPassword, group.creator_password_hash);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid password' },
        { status: 401 }
      );
    }

    // Check if group is in 'open' status
    if (group.status !== 'open') {
      return NextResponse.json(
        { error: `Group cannot be closed. Current status: ${group.status}` },
        { status: 400 }
      );
    }

    // Check if there are at least 4 members before allowing closure
    const activeMembers = dbHelpers.getMembersByGroup(groupId, false);
    if (activeMembers.length < 4) {
      return NextResponse.json(
        { error: `Cannot close group: Need at least 4 members. Currently have ${activeMembers.length} member(s).` },
        { status: 400 }
      );
    }

    // Update group status to 'closed'
    const db = getDb();
    const updateStmt = db.prepare('UPDATE groups SET status = ?, updated_at = ? WHERE id = ?');
    updateStmt.run('closed', Date.now(), groupId);

    // Get backfill status (activeMembers already fetched above)
    const backfillStatus = dbHelpers.checkBackfillStatus(groupId);
    const completedCount = activeMembers.length - backfillStatus.missingMembers.length;

    // Send email to creator
    try {
      await sendGroupClosedEmail(
        creatorEmail,
        'Creator',
        group.unique_url
      );
    } catch (emailError: any) {
      console.error(`[Close Group] Failed to send email to creator:`, emailError.message || emailError);
      // Continue even if email fails
    }

    // Send email to all members
    for (const member of activeMembers) {
      try {
        await sendGroupClosedEmail(
          member.email, // Plaintext email
          member.name,
          group.unique_url
        );
        console.log(`[Close Group] ✓ Email sent to ${member.email} (${member.name})`);
      } catch (emailError: any) {
        console.error(`[Close Group] ✗ Failed to send email to ${member.email} (${member.name}):`, emailError.message || emailError);
        // Continue sending to other members even if one fails
      }
    }

    return NextResponse.json({
      success: true,
      status: 'closed',
      backfillStatus: {
        complete: backfillStatus.complete,
        completedCount,
        totalCount: activeMembers.length,
        missingMembers: backfillStatus.missingMembers,
      },
    });
  } catch (error) {
    console.error('Error closing group:', error);
    return NextResponse.json(
      { error: 'Failed to close group' },
      { status: 500 }
    );
  }
}

