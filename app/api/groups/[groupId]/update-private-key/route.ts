import { NextRequest, NextResponse } from 'next/server';
import { getDb, dbHelpers } from '@/lib/db/client';

export async function POST(
  request: NextRequest,
  { params }: { params: { groupId: string } }
) {
  try {
    const { memberId, encryptedPrivateKey } = await request.json();
    const { groupId } = params;

    if (!memberId || !encryptedPrivateKey) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const db = getDb();
    
    // Update encrypted private key
    const stmt = db.prepare(`
      UPDATE members 
      SET private_key_encrypted = ?
      WHERE id = ? AND group_id = ?
    `);
    
    stmt.run(encryptedPrivateKey, memberId, groupId);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating private key:', error);
    return NextResponse.json(
      { error: 'Failed to update private key' },
      { status: 500 }
    );
  }
}

