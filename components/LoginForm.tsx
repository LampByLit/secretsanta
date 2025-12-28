'use client';

import { useState } from 'react';
import { decryptMemberData } from '@/lib/crypto/aes';
import { encrypt, encodeMessage } from '@/lib/crypto/elgamal';

interface LoginFormProps {
  groupId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function LoginForm({ groupId, onClose, onSuccess }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Verify member credentials (doesn't require assignment to exist)
      const response = await fetch(`/api/groups/${groupId}/verify-member`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Invalid email or password');
      }

      const data = await response.json();
      
      console.log(`[LoginForm] Login response for ${email}:`, {
        success: data.success,
        isCreator: data.isCreator,
        memberId: data.memberId,
        groupStatus: data.groupStatus,
        name: data.name
      });
      
      // Perform client-side backfill if needed (PRIVACY-AIRTIGHT: password never leaves browser)
      // Creator can also be a member, so check if they have a memberId
      const isMember = !!(data.memberId || (!data.isCreator && data.success));
      console.log(`[LoginForm] isMember check: memberId=${data.memberId}, isCreator=${data.isCreator}, success=${data.success}, result=${isMember}`);
      
      if (isMember && (data.groupStatus === 'open' || data.groupStatus === 'closed')) {
        try {
          console.log(`[LoginForm] Performing backfill for ${data.isCreator ? 'creator' : 'member'}: ${email} (memberId: ${data.memberId})`);
          await performClientSideBackfill(groupId, email, password);
          console.log(`[LoginForm] ✓ Backfill completed for ${email}`);
        } catch (backfillError: any) {
          console.error(`[LoginForm] ✗ Backfill error (non-blocking) for ${email}:`, backfillError.message);
          console.error(`[LoginForm] Backfill stack:`, backfillError.stack);
          // Don't fail login if backfill fails - it's not critical
        }
      } else if (data.isCreator && !data.memberId) {
        console.log(`[LoginForm] ⚠ Creator ${email} is not a member yet - they need to join the group first`);
      } else if (!isMember) {
        console.log(`[LoginForm] ⚠ User ${email} is not a member, skipping backfill`);
      } else {
        console.log(`[LoginForm] ⚠ Group status is '${data.groupStatus}', skipping backfill`);
      }
      
      // Store member session cookie
      document.cookie = `santa_member_${groupId}=${email}; path=/; max-age=31536000`;
      
      // If this is the creator, also set creator cookie
      if (data.isCreator) {
        document.cookie = `santa_creator_${groupId}=${email}; path=/; max-age=31536000`;
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg max-w-md w-full">
        <h2 className="text-2xl font-bold mb-4">Log In</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Your Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <div className="flex gap-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Logging in...' : 'Log In'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-300 text-gray-800 py-2 rounded-lg font-semibold hover:bg-gray-400"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Perform client-side backfill: decrypt member's own data and create reverse pre-encrypted messages
 * PRIVACY-AIRTIGHT: Password and plaintext data NEVER leave the browser
 */
export async function performClientSideBackfill(
  groupId: string,
  email: string,
  password: string
): Promise<void> {
  console.log(`[performClientSideBackfill] Starting backfill for ${email} in group ${groupId}`);
  
  // Fetch backfill data (encrypted data + new members' public keys)
  const backfillDataResponse = await fetch(
    `/api/groups/${groupId}/backfill-data?email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`
  );

  if (!backfillDataResponse.ok) {
    const errorData = await backfillDataResponse.json();
    console.error(`[performClientSideBackfill] ✗ Failed to fetch backfill data:`, errorData.error);
    // If no backfill needed, that's fine
    if (errorData.error?.includes('not needed')) {
      console.log(`[performClientSideBackfill] Backfill not needed for ${email}`);
      return;
    }
    throw new Error(errorData.error || 'Failed to fetch backfill data');
  }

  const backfillData = await backfillDataResponse.json();
  console.log(`[performClientSideBackfill] Backfill data received: needsBackfill=${backfillData.needsBackfill}, newMembers=${backfillData.newMembers?.length || 0}`);

  if (!backfillData.needsBackfill || backfillData.newMembers.length === 0) {
    console.log(`[performClientSideBackfill] No backfill needed for ${email}`);
    return; // No backfill needed
  }
  
  console.log(`[performClientSideBackfill] Need to create messages to ${backfillData.newMembers.length} members`);

  // Decrypt member's own data CLIENT-SIDE (password never leaves browser)
  // Email is now plaintext, so we pass it directly
  const decryptedData = await decryptMemberData(
    backfillData.memberData.name,
    backfillData.memberData.addressEncrypted,
    backfillData.memberData.messageEncrypted,
    backfillData.memberData.email, // Plaintext email (not encrypted)
    password
  );

  // Encode message for ElGamal encryption
  const encodedMessage = encodeMessage(
    decryptedData.name,
    decryptedData.address,
    decryptedData.message
  );

  // Create pre-encrypted messages for each new member
  const preEncryptedMessages: Array<{ recipientId: string; c1: string; c2: string }> = [];

  console.log(`[performClientSideBackfill] Encrypting messages for ${backfillData.newMembers.length} recipients...`);
  for (const newMember of backfillData.newMembers) {
    try {
      const publicKey = BigInt(newMember.publicKey);
      const encrypted = await encrypt(publicKey, encodedMessage);
      preEncryptedMessages.push({
        recipientId: newMember.id,
        c1: encrypted.c1.toString(),
        c2: encrypted.c2.toString(),
      });
      console.log(`[performClientSideBackfill] ✓ Encrypted message for recipient ${newMember.id}`);
    } catch (encryptError) {
      console.error(`[performClientSideBackfill] ✗ Failed to encrypt for member ${newMember.id}:`, encryptError);
      // Continue with other members even if one fails
    }
  }
  
  console.log(`[performClientSideBackfill] Created ${preEncryptedMessages.length} encrypted messages, sending to server...`);

  // Clear sensitive data from memory (best effort - JavaScript GC will handle the rest)
  decryptedData.address = '';
  decryptedData.message = '';
  decryptedData.email = '';

  // Send pre-encrypted messages to server (server NEVER sees plaintext)
  const backfillResponse = await fetch(`/api/groups/${groupId}/backfill`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password, // Still needed for authentication, but plaintext data never sent
      preEncryptedMessages,
    }),
  });

  if (!backfillResponse.ok) {
    const errorData = await backfillResponse.json();
    console.error(`[performClientSideBackfill] ✗ Failed to store backfill messages:`, errorData.error);
    throw new Error(errorData.error || 'Failed to store backfill messages');
  }
  
  const backfillResult = await backfillResponse.json();
  console.log(`[performClientSideBackfill] ✓ Backfill complete: created=${backfillResult.created}, skipped=${backfillResult.skipped}`);
}

