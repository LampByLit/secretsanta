import { NextRequest, NextResponse } from 'next/server';
import { getDb, dbHelpers } from '@/lib/db/client';
import bcrypt from 'bcryptjs';
import { sendAssignmentEmail } from '@/lib/email/mailjet';

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

    // Check if already decrypted
    const alreadyDecrypted = dbHelpers.isAssignmentDecrypted(groupId, member.id);
    
    if (!alreadyDecrypted) {
      // Mark as decrypted
      dbHelpers.markAssignmentDecrypted(groupId, member.id);
      
      // Get assignment to send email
      const assignment = dbHelpers.getAssignment(groupId, member.id);
      if (assignment) {
        const db = getDb();
        const santeeStmt = db.prepare('SELECT name, address, message FROM members WHERE id = ?');
        const santee = santeeStmt.get(assignment.santee_id) as { name: string; address: string; message: string } | undefined;
        
        if (santee) {
          const group = dbHelpers.getGroupById(groupId);
          if (group) {
            try {
              await sendAssignmentEmail(
                member.email,
                member.name,
                santee.name,
                santee.address,
                santee.message,
                group.unique_url
              );
              console.log(`[Decrypt Assignment] ✓ Email sent to ${member.email} (${member.name})`);
            } catch (emailError: any) {
              console.error(`[Decrypt Assignment] ✗ Failed to send email to ${member.email}:`, emailError.message || emailError);
              // Continue even if email fails
            }
          }
        }
      }
    }

    // Get decryption count
    const decryptionCount = dbHelpers.getDecryptionCount(groupId);
    const totalMembers = dbHelpers.getMembersByGroup(groupId, false).length;

    return NextResponse.json({
      success: true,
      alreadyDecrypted,
      decryptionCount,
      totalMembers,
    });
  } catch (error) {
    console.error('Error marking assignment as decrypted:', error);
    return NextResponse.json(
      { error: 'Failed to mark assignment as decrypted' },
      { status: 500 }
    );
  }
}

