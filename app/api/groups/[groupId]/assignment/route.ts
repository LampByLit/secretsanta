import { NextRequest, NextResponse } from 'next/server';
import { getDb, dbHelpers } from '@/lib/db/client';
import bcrypt from 'bcryptjs';

/**
 * Get the current user's Secret Santa assignment
 *
 * Retrieves the decrypted assignment information for an authenticated group member,
 * including the name, address, and message of the person they should buy a gift for.
 *
 * @param request - The HTTP request with authentication parameters
 * @param params - Route parameters containing the groupId
 * @returns Promise<NextResponse> - JSON response with santee information on success
 *
 * Query parameters:
 * - email: string - Member's email address
 * - password: string - Member's password for authentication
 *
 * Response:
 * - santeeName: string - Name of the person to buy a gift for
 * - santeeAddress: string - Shipping address for the gift
 * - santeeMessage: string - Personal message from the recipient
 *
 * Error responses:
 * - 400: Missing email or password
 * - 404: Member not found or no assignment available
 * - 401: Invalid password
 * - 500: Server error during assignment retrieval
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { groupId: string } }
) {
  try {
    const { groupId } = params;
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');
    const password = searchParams.get('password');

    // Validate required authentication parameters
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required for authentication' },
        { status: 400 }
      );
    }

    // Verify member exists in the group
    const member = dbHelpers.getMemberByEmail(groupId, email);
    if (!member) {
      return NextResponse.json(
        { error: 'Member not found in this group' },
        { status: 404 }
      );
    }

    // Verify password matches stored hash
    const isValid = await bcrypt.compare(password, member.password_hash);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid password' },
        { status: 401 }
      );
    }

    // Retrieve the member's Secret Santa assignment
    const assignment = dbHelpers.getAssignment(groupId, member.id);
    if (!assignment) {
      return NextResponse.json(
        { error: 'No Secret Santa assignment found. The gift exchange may not have started yet.' },
        { status: 404 }
      );
    }

    // Get the assigned recipient's information
    const db = getDb();
    const santeeStmt = db.prepare('SELECT name, address, message FROM members WHERE id = ?');
    const santee = santeeStmt.get(assignment.santee_id) as { name: string; address: string; message: string };

    // Return assignment details
    return NextResponse.json({
      santeeName: santee.name,
      santeeAddress: santee.address,
      santeeMessage: santee.message,
    });
  } catch (error) {
    console.error('Error fetching assignment:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve your Secret Santa assignment. Please try again.' },
      { status: 500 }
    );
  }
}

