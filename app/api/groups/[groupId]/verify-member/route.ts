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
          { error: 'Invalid password' },
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
      return NextResponse.json(
        { error: 'Member not found' },
        { status: 404 }
      );
    }

    // Verify member password
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
      isCreator: false,
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

