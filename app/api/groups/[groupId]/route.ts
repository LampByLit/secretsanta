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
    let loggedInUserName: string | null = null;
    let shipmentConfirmed = false;
    if (checkEmail) {
      const member = dbHelpers.getMemberByEmail(groupId, checkEmail);
      isMember = !!member;
      if (member) {
        // Member name is in cleartext - visible
        loggedInUserName = member.name;
        // Check if shipment is confirmed
        const db = getDb();
        const shipmentCheck = db.prepare('SELECT id FROM shipment_confirmations WHERE group_id = ? AND member_id = ?');
        const shipment = shipmentCheck.get(groupId, member.id);
        shipmentConfirmed = !!shipment;
      } else {
        // Check if it's the creator
        if (group.creator_email === checkEmail) {
          loggedInUserName = 'Creator';
        }
      }
    }
    
    // Get shipment count if cycle initiated
    let shipmentCount = 0;
    if (group.status === 'messages_ready' || group.status === 'complete') {
      shipmentCount = dbHelpers.getShipmentCount(groupId);
    }

    // Get decryption count if messages are ready
    let decryptionCount = 0;
    let totalMembers = visibleMembers.length;
    if (group.status === 'messages_ready' || group.status === 'complete') {
      decryptionCount = dbHelpers.getDecryptionCount(groupId);
    }

    // Check and update group status from 'closed' to 'ready' if all members have completed backfill
    if (group.status === 'closed') {
      dbHelpers.checkAndUpdateGroupStatus(groupId);
      // Re-fetch group to get updated status
      const updatedGroup = dbHelpers.getGroupById(groupId);
      if (updatedGroup) {
        group.status = updatedGroup.status;
      }
    }

    return NextResponse.json({
      group: {
        id: group.id,
        name: group.name,
        status: group.status,
        uniqueUrl: group.unique_url,
      },
      // Member names are in cleartext - visible to all
      members: visibleMembers.map(m => ({
        id: m.id,
        name: m.name, // Cleartext - visible in group
        excluded: m.excluded,
      })),
      allMembers: allMembers.map(m => ({
        id: m.id,
        name: m.name, // Cleartext - visible in group
        excluded: m.excluded,
      })),
      memberCount: visibleMembers.length,
      shipmentCount,
      decryptionCount,
      totalMembers,
      isMember, // Whether the checked email is actually a member (fledged)
      loggedInUserName, // Name of the logged in user (if checkEmail provided)
      shipmentConfirmed, // Whether logged in user has confirmed shipment
    });
  } catch (error) {
    console.error('Error fetching group:', error);
    return NextResponse.json(
      { error: 'Failed to fetch group' },
      { status: 500 }
    );
  }
}

