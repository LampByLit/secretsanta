import { NextRequest, NextResponse } from 'next/server';
import { getDb, dbHelpers } from '@/lib/db/client';
import bcrypt from 'bcryptjs';
import { checkRateLimit, getClientIdentifier } from '@/lib/utils/rate-limit';
import { validateEmail } from '@/lib/utils/validation';

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

    // Verify member exists in the group
    const member = dbHelpers.getMemberByEmail(groupId, email);
    if (!member) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Verify password matches stored hash
    const isValid = await bcrypt.compare(password, member.password_hash);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Retrieve the member's Secret Santa assignment
    const assignment = dbHelpers.getAssignment(groupId, member.id);
    if (!assignment) {
      return NextResponse.json(
        { error: 'No assignment found. The gift exchange may not have started yet.' },
        { status: 404 }
      );
    }

    // Get the assigned recipient's encrypted information
    // Note: The santee's data is encrypted with their password, not the santa's password
    // This route should not be used for decrypted data - use the ElGamal encrypted messages instead
    // However, for backward compatibility, we'll return the encrypted data and let the client handle it
    const db = getDb();
    const santeeStmt = db.prepare('SELECT name, address, message, email FROM members WHERE id = ?');
    const santee = santeeStmt.get(assignment.santee_id) as { name: string; address: string; message: string; email: string };

    // Return assignment details (client should decrypt using ElGamal, not this route)
    // This route is deprecated - assignments should be decrypted via ElGamal encrypted_messages
    // Note: Name is cleartext, but address and message are encrypted
    return NextResponse.json({
      santeeName: santee.name, // Cleartext - visible
      santeeAddress: santee.address, // Encrypted - cannot be decrypted with santa's password
      santeeMessage: santee.message, // Encrypted - cannot be decrypted with santa's password
      encrypted: true, // Flag to indicate address/message are encrypted
    });
  } catch (error) {
    console.error('Error fetching assignment:', error);
    return NextResponse.json(
      { error: 'Unable to retrieve your assignment. Please try again.' },
      { status: 500 }
    );
  }
}

