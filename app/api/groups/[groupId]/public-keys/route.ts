import { NextRequest, NextResponse } from 'next/server';
import { dbHelpers } from '@/lib/db/client';

/**
 * Get public keys of all existing members in a group
 * Used by new members to pre-encrypt their data
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { groupId: string } }
) {
  try {
    const { groupId } = params;

    // Verify group exists
    const group = dbHelpers.getGroupById(groupId);
    if (!group) {
      return NextResponse.json(
        { error: 'Group not found' },
        { status: 404 }
      );
    }

    // Ensure group is still open (can't join after cycle starts)
    if (group.status !== 'open') {
      return NextResponse.json(
        { error: 'Cannot get public keys: the group is no longer accepting new members' },
        { status: 400 }
      );
    }

    // Get all non-excluded members
    const members = dbHelpers.getMembersByGroup(groupId, false);

    // Return only public keys and member IDs (no sensitive data)
    return NextResponse.json({
      publicKeys: members.map(m => ({
        memberId: m.id,
        publicKey: m.public_key,
      })),
    });
  } catch (error) {
    console.error('Error fetching public keys:', error);
    return NextResponse.json(
      { error: 'Failed to fetch public keys' },
      { status: 500 }
    );
  }
}

