import { NextRequest, NextResponse } from 'next/server';
import { getDb, dbHelpers } from '@/lib/db/client';
import bcrypt from 'bcryptjs';

export async function POST(
  request: NextRequest,
  { params }: { params: { groupId: string } }
) {
  try {
    const { groupId } = params;
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password required' },
        { status: 400 }
      );
    }

    // Verify member exists
    const member = dbHelpers.getMemberByEmail(groupId, email);
    if (!member) {
      return NextResponse.json(
        { error: 'Member not found' },
        { status: 404 }
      );
    }

    // Verify password
    const isValid = await bcrypt.compare(password, member.password_hash);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid password' },
        { status: 401 }
      );
    }

    // Return success - member exists and credentials are valid
    return NextResponse.json({ 
      success: true,
      memberId: member.id,
      name: member.name 
    });
  } catch (error) {
    console.error('Error verifying member:', error);
    return NextResponse.json(
      { error: 'Failed to verify member' },
      { status: 500 }
    );
  }
}

