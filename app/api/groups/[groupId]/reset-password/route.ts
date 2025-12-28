import { NextRequest, NextResponse } from 'next/server';
import { getDb, dbHelpers } from '@/lib/db/client';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { sendPasswordResetEmail } from '@/lib/email/mailjet';

export async function POST(
  request: NextRequest,
  { params }: { params: { groupId: string } }
) {
  try {
    const { groupId } = params;
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: 'Email required' },
        { status: 400 }
      );
    }

    const member = dbHelpers.getMemberByEmail(groupId, email);
    if (!member) {
      // Don't reveal if email exists or not (security)
      return NextResponse.json({ success: true });
    }

    const group = dbHelpers.getGroupById(groupId);
    if (!group) {
      return NextResponse.json(
        { error: 'Group not found' },
        { status: 404 }
      );
    }

    // Generate reset token
    const resetToken = randomBytes(32).toString('hex');
    const resetExpires = Date.now() + 3600000; // 1 hour

    // Store token
    const db = getDb();
    const stmt = db.prepare(`
      UPDATE members 
      SET password_reset_token = ?, password_reset_expires = ?
      WHERE id = ?
    `);
    stmt.run(resetToken, resetExpires, member.id);

    // Send email
    await sendPasswordResetEmail(email, resetToken, group.unique_url);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error requesting password reset:', error);
    return NextResponse.json(
      { error: 'Failed to request password reset' },
      { status: 500 }
    );
  }
}

