import { NextRequest, NextResponse } from 'next/server';
import { getDb, dbHelpers } from '@/lib/db/client';
import bcrypt from 'bcryptjs';

export async function POST(
  request: NextRequest,
  { params }: { params: { groupId: string } }
) {
  try {
    const { groupId } = params;
    const { creatorEmail, creatorPassword, memberId, excluded } = await request.json();

    if (!creatorEmail || !creatorPassword || !memberId || excluded === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields' },
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

    // Check if cycle already initiated
    if (group.status !== 'pending') {
      return NextResponse.json(
        { error: 'Cannot modify members after cycle initiation' },
        { status: 400 }
      );
    }

    // Update member exclusion status
    const db = getDb();
    const stmt = db.prepare('UPDATE members SET excluded = ? WHERE id = ? AND group_id = ?');
    stmt.run(excluded ? 1 : 0, memberId, groupId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating exclusion:', error);
    return NextResponse.json(
      { error: 'Failed to update exclusion' },
      { status: 500 }
    );
  }
}

