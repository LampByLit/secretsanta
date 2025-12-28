import { NextRequest, NextResponse } from 'next/server';
import { getDb, dbHelpers } from '@/lib/db/client';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { checkRateLimit, getClientIdentifier } from '@/lib/utils/rate-limit';
import { validateEmail } from '@/lib/utils/validation';

/**
 * Join an existing Secret Santa group
 *
 * Allows a new member to join a Secret Santa group by providing their information
 * and cryptographic keys. The group must still be in 'pending' status (not yet started).
 *
 * @param request - The HTTP request containing member join data
 * @param params - Route parameters containing the groupId
 * @returns Promise<NextResponse> - JSON response with memberId on success
 *
 * Request body:
 * - name: string - Member's full name
 * - email: string - Member's email address (must be unique within the group)
 * - password: string - Password for accessing group information
 * - message: string - Personal message to their Secret Santa
 * - address: string - Shipping address for gift delivery
 * - publicKey: string - ElGamal public key (base64 encoded bigint)
 * - encryptedPrivateKey: string - Encrypted ElGamal private key
 *
 * Response:
 * - memberId: string - Unique identifier for the new member
 * - success: boolean - Always true for successful joins
 *
 * Error responses:
 * - 400: Missing required fields, group cycle already started, or member already exists
 * - 404: Group not found
 * - 500: Database or server error
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { groupId: string } }
) {
  try {
    // Parse member information and cryptographic keys from request
    const { name, email, password, message, address, publicKey, encryptedPrivateKey } = await request.json();
    const { groupId } = params;

    // Validate all required fields are provided
    if (!name || !email || !password || !message || !address || !publicKey || !encryptedPrivateKey) {
      return NextResponse.json(
        { error: 'All fields are required: name, email, password, message, address, publicKey, and encryptedPrivateKey' },
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

    // Rate limiting (more lenient for joining)
    const identifier = getClientIdentifier(request, email);
    const rateLimit = checkRateLimit(identifier, { maxRequests: 20, windowMs: 60 * 60 * 1000 });
    if (rateLimit.rateLimited) {
      return NextResponse.json(
        { error: 'Too many join attempts. Please try again later.' },
        { status: 429 }
      );
    }

    const db = getDb();

    // Verify the group exists
    const group = dbHelpers.getGroupById(groupId);
    if (!group) {
      return NextResponse.json(
        { error: 'Group not found' },
        { status: 404 }
      );
    }

    // Ensure the gift exchange hasn't started yet
    if (group.status !== 'pending') {
      return NextResponse.json(
        { error: 'Cannot join: the gift exchange has already started' },
        { status: 400 }
      );
    }

    // Check for duplicate email addresses within the group
    const existingMember = dbHelpers.getMemberByEmail(groupId, email);
    if (existingMember) {
      return NextResponse.json(
        { error: 'This email address has already joined this group' },
        { status: 400 }
      );
    }

    // Hash the password for secure storage
    const passwordHash = await bcrypt.hash(password, 10);

    // Generate cryptographically secure member ID
    const memberId = randomBytes(16).toString('hex');
    const now = Date.now();

    // Insert new member record with cryptographic keys
    const stmt = db.prepare(`
      INSERT INTO members (id, group_id, name, email, password_hash, message, address, public_key, private_key_encrypted, excluded, joined_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      memberId,
      groupId,
      name,
      email,
      passwordHash,
      message,
      address,
      publicKey,
      encryptedPrivateKey,
      0, // excluded = false (SQLite uses 0/1 for booleans)
      now
    );

    // Return success response
    return NextResponse.json({
      memberId,
      success: true,
    });
  } catch (error) {
    console.error('Error joining group:', error);
    return NextResponse.json(
      { error: 'Unable to join the group. Please try again.' },
      { status: 500 }
    );
  }
}

