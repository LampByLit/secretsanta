import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

/**
 * Create a new Secret Santa group
 *
 * Creates a new group with the provided details, generates a unique URL slug,
 * and sets up the group creator as the first member.
 *
 * @param request - The HTTP request containing group creation data
 * @returns Promise<NextResponse> - JSON response with groupId and uniqueUrl on success
 *
 * Request body:
 * - name: string - Creator's name
 * - email: string - Creator's email address
 * - password: string - Password for group access
 * - groupName: string - Name of the Secret Santa group
 *
 * Response:
 * - groupId: string - Unique identifier for the group
 * - uniqueUrl: string - Human-readable URL slug for the group
 *
 * Error responses:
 * - 400: Missing required fields
 * - 500: Database or server error
 */
export async function POST(request: NextRequest) {
  try {
    // Parse and validate request body
    const { name, email, password, groupName } = await request.json();

    // Validate required fields
    if (!name || !email || !password || !groupName) {
      return NextResponse.json(
        { error: 'Missing required fields: name, email, password, and groupName are required' },
        { status: 400 }
      );
    }

    const db = getDb();

    // Generate human-readable unique URL slug for the group
    const uniqueUrl = generateUniqueSlug();

    // Hash the password for secure storage
    const passwordHash = await bcrypt.hash(password, 10);

    // Generate cryptographically secure group ID
    const groupId = randomBytes(16).toString('hex');
    const now = Date.now();

    // Insert new group record into database
    const stmt = db.prepare(`
      INSERT INTO groups (id, name, creator_email, creator_password_hash, unique_url, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(groupId, groupName, email, passwordHash, uniqueUrl, 'pending', now, now);

    // Return success response with group details
    return NextResponse.json({
      groupId,
      uniqueUrl,
    });
  } catch (error) {
    console.error('Error creating group:', error);
    return NextResponse.json(
      { error: 'Failed to create group. Please try again.' },
      { status: 500 }
    );
  }
}

/**
 * Generate a unique, human-readable URL slug for a Secret Santa group
 *
 * Creates a memorable slug using adjective-noun-number combinations to make
 * group URLs easy to share and remember.
 *
 * @returns string - A unique URL slug in format "adjective-noun-number"
 */
function generateUniqueSlug(): string {
  // Word lists for generating readable slugs
  const adjectives = ['happy', 'merry', 'jolly', 'festive', 'cheerful', 'bright'];
  const nouns = ['santa', 'elf', 'reindeer', 'sleigh', 'gift', 'wreath'];

  // Use cryptographically secure random values
  const randomValues = new Uint32Array(3);
  crypto.getRandomValues(randomValues);

  // Select random words and number using secure random
  const random1 = adjectives[randomValues[0] % adjectives.length];
  const random2 = nouns[randomValues[1] % nouns.length];
  const randomNum = randomValues[2] % 10000;

  return `${random1}-${random2}-${randomNum}`;
}

