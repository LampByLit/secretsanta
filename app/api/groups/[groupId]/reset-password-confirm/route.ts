import { NextRequest, NextResponse } from 'next/server';
import { getDb, dbHelpers } from '@/lib/db/client';
import bcrypt from 'bcryptjs';

export async function POST(
  request: NextRequest,
  { params }: { params: { groupId: string } }
) {
  try {
    const { groupId } = params;
    const { token, newPassword } = await request.json();

    if (!token || !newPassword) {
      return NextResponse.json(
        { error: 'Token and new password required' },
        { status: 400 }
      );
    }

    const db = getDb();
    
    // Find member with valid token
    const stmt = db.prepare(`
      SELECT * FROM members 
      WHERE group_id = ? 
      AND password_reset_token = ?
      AND password_reset_expires > ?
    `);
    
    const member = stmt.get(groupId, token, Date.now()) as any;
    
    if (!member) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 400 }
      );
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Update password and clear token
    const updateStmt = db.prepare(`
      UPDATE members 
      SET password_hash = ?, 
          password_reset_token = NULL, 
          password_reset_expires = NULL
      WHERE id = ?
    `);
    updateStmt.run(passwordHash, member.id);

    // Note: Private key encryption would need to be updated client-side
    // For now, we'll need the user to re-join or handle this separately

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error resetting password:', error);
    return NextResponse.json(
      { error: 'Failed to reset password' },
      { status: 500 }
    );
  }
}

