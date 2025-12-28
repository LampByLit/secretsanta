import { NextRequest, NextResponse } from 'next/server';
import { getDb, dbHelpers } from '@/lib/db/client';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

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

    const db = getDb();
    
    // Check if already confirmed
    const checkStmt = db.prepare('SELECT id FROM shipment_confirmations WHERE group_id = ? AND member_id = ?');
    const existing = checkStmt.get(groupId, member.id);
    
    if (existing) {
      return NextResponse.json({ success: true, alreadyConfirmed: true });
    }

    // Insert confirmation
    const confirmationId = randomBytes(16).toString('hex');
    const stmt = db.prepare(`
      INSERT INTO shipment_confirmations (id, group_id, member_id, confirmed_at)
      VALUES (?, ?, ?, ?)
    `);
    
    stmt.run(confirmationId, groupId, member.id, Date.now());

    // Check if all members have confirmed
    const group = dbHelpers.getGroupById(groupId);
    if (group && group.status === 'cycle_initiated') {
      const members = dbHelpers.getMembersByGroup(groupId, false);
      const shipmentCount = dbHelpers.getShipmentCount(groupId);
      
      if (shipmentCount >= members.length) {
        // Mark group as complete
        const updateStmt = db.prepare('UPDATE groups SET status = ?, updated_at = ? WHERE id = ?');
        updateStmt.run('complete', Date.now(), groupId);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error confirming shipment:', error);
    return NextResponse.json(
      { error: 'Failed to confirm shipment' },
      { status: 500 }
    );
  }
}

