import { NextRequest, NextResponse } from 'next/server';
import { getDb, dbHelpers } from '@/lib/db/client';

export async function GET(
  request: NextRequest,
  { params }: { params: { groupId: string } }
) {
  try {
    const { groupId } = params;
    const { searchParams } = new URL(request.url);
    const checkEmail = searchParams.get('checkEmail'); // Optional email to check membership
    
    const group = dbHelpers.getGroupById(groupId);
    if (!group) {
      return NextResponse.json(
        { error: 'Group not found' },
        { status: 404 }
      );
    }

    // Get members (exclude excluded members for non-creators)
    const allMembers = dbHelpers.getMembersByGroup(groupId, true);
    const visibleMembers = dbHelpers.getMembersByGroup(groupId, false);
    
    // Check if the provided email is actually a member (fledged)
    let isMember = false;
    if (checkEmail) {
      const member = dbHelpers.getMemberByEmail(groupId, checkEmail);
      isMember = !!member;
    }
    
    // Get shipment count if cycle initiated
    let shipmentCount = 0;
    if (group.status !== 'pending') {
      shipmentCount = dbHelpers.getShipmentCount(groupId);
    }

    return NextResponse.json({
      group: {
        id: group.id,
        name: group.name,
        status: group.status,
        uniqueUrl: group.unique_url,
      },
      members: visibleMembers.map(m => ({
        id: m.id,
        name: m.name,
        excluded: m.excluded,
      })),
      allMembers: allMembers.map(m => ({
        id: m.id,
        name: m.name,
        excluded: m.excluded,
      })),
      memberCount: visibleMembers.length,
      shipmentCount,
      isMember, // Whether the checked email is actually a member (fledged)
    });
  } catch (error) {
    console.error('Error fetching group:', error);
    return NextResponse.json(
      { error: 'Failed to fetch group' },
      { status: 500 }
    );
  }
}

