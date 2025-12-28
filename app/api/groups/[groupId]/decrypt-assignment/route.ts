import { NextRequest, NextResponse } from 'next/server';
import { getDb, dbHelpers } from '@/lib/db/client';
import bcrypt from 'bcryptjs';
import { sendAssignmentEmail } from '@/lib/email/mailjet';
import { checkRateLimit, getClientIdentifier } from '@/lib/utils/rate-limit';
import { validateEmail } from '@/lib/utils/validation';

export async function POST(
  request: NextRequest,
  { params }: { params: { groupId: string } }
) {
  try {
    const { groupId } = params;
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
      return NextResponse.json(
        { error: emailValidation.error || 'Invalid email format' },
        { status: 400 }
      );
    }

    // Rate limiting
    const identifier = getClientIdentifier(request, email);
    const rateLimit = checkRateLimit(identifier, { maxRequests: 10, windowMs: 15 * 60 * 1000 });
    if (rateLimit.rateLimited) {
      return NextResponse.json(
        { error: 'Too many attempts. Please try again later.' },
        { status: 429 }
      );
    }

    // Verify member
    const member = dbHelpers.getMemberByEmail(groupId, email);
    if (!member) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    const isValid = await bcrypt.compare(password, member.password_hash);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
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
              // Use plaintext email from request, not encrypted member.email
              await sendAssignmentEmail(
                email, // Use plaintext email from request, not encrypted member.email
                member.name,
                santee.name,
                santee.address,
                santee.message,
                group.unique_url
              );
              console.log(`[Decrypt Assignment] ✓ Email sent to ${email} (${member.name})`);
            } catch (emailError: any) {
              console.error(`[Decrypt Assignment] ✗ Failed to send email to ${email}:`, emailError.message || emailError);
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
      { error: 'Unable to process your request. Please try again.' },
      { status: 500 }
    );
  }
}

