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

    // Get assignment
    const assignment = dbHelpers.getAssignment(groupId, member.id);
    if (!assignment) {
      return NextResponse.json(
        { error: 'No assignment found' },
        { status: 404 }
      );
    }

    // Get santee info
    const db = getDb();
    const santeeStmt = db.prepare('SELECT name, address, message FROM members WHERE id = ?');
    const santee = santeeStmt.get(assignment.santee_id) as { name: string; address: string; message: string };

    return NextResponse.json({
      santeeName: santee.name,
      santeeAddress: santee.address,
      santeeMessage: santee.message,
    });
  } catch (error) {
    console.error('Error fetching assignment:', error);
    return NextResponse.json(
      { error: 'Failed to fetch assignment' },
      { status: 500 }
    );
  }
}

