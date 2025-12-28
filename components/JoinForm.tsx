'use client';

import { useState } from 'react';
import { encryptPrivateKey, encryptMemberData } from '@/lib/crypto/aes';
import { generateKeyPair, encrypt, encodeMessage } from '@/lib/crypto/elgamal';

/**
 * Props for the JoinForm component
 */
interface JoinFormProps {
  /** Unique identifier of the Secret Santa group to join */
  groupId: string;
  /** Callback function to close the join form modal */
  onClose: () => void;
  /** Callback function called when group join is successful */
  onSuccess: () => void;
  /** Optional: Pre-fill email field for group creator */
  creatorEmail?: string;
  /** Optional: Pre-fill name field for group creator */
  creatorName?: string;
}

/**
 * JoinForm Component
 *
 * Modal form for joining a Secret Santa group. Handles client-side key generation,
 * form validation, and submission to join an existing group.
 *
 * Features:
 * - Client-side ElGamal key pair generation
 * - Password-based private key encryption
 * - Form validation and error handling
 * - Session cookie management
 * - Responsive modal design
 *
 * @param props - Component properties
 * @returns React component
 */
export default function JoinForm({ groupId, onClose, onSuccess, creatorEmail, creatorName }: JoinFormProps) {
  // Form state management with pre-filled values for group creator
  const [formData, setFormData] = useState({
    name: creatorName || '',
    email: creatorEmail || '',
    password: '',
    message: '',
    address: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  /**
   * Compute SHA-256 hash of email for database lookups
   */
  const hashEmail = async (email: string): Promise<string> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(email.toLowerCase().trim());
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  /**
   * Handle form submission for joining the Secret Santa group
   *
   * Performs the following steps:
   * 1. Generates ElGamal key pair client-side for cryptographic operations
   * 2. Encrypts the private key with the user's password for secure storage
   * 3. Encrypts all member data (name, email, address, message) with password (for privacy)
   * 4. Fetches existing members' public keys
   * 5. Pre-encrypts member data with each existing member's public key (for assignments)
   * 6. Computes email hash for database lookups
   * 7. Submits encrypted member information and pre-encrypted messages to the server
   * 8. Sets session cookie for authentication
   * 9. Calls success callback on completion
   *
   * @param e - Form submission event
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Generate ElGamal key pair for cryptographic Secret Santa operations
      const keyPair = await generateKeyPair();

      // Encrypt private key with user's password for secure server storage
      const encryptedPrivateKey = await encryptPrivateKey(keyPair.privateKey.toString(), formData.password);

      // Encrypt all member data with password (client-side encryption for privacy)
      const encryptedData = await encryptMemberData(
        formData.name,
        formData.address,
        formData.message,
        formData.email,
        formData.password
      );

      // Compute email hash for database lookups (normalize email first)
      const emailHash = await hashEmail(formData.email);

      // Fetch existing members' public keys to pre-encrypt messages
      const publicKeysResponse = await fetch(`/api/groups/${groupId}/public-keys`);
      if (!publicKeysResponse.ok) {
        throw new Error('Failed to fetch existing members\' public keys');
      }
      const publicKeysData = await publicKeysResponse.json();
      const existingPublicKeys = publicKeysData.publicKeys || [];

      // Pre-encrypt this member's data with each existing member's public key
      // This allows cycle initiation to work without decrypting member data server-side
      const encodedMessage = encodeMessage(formData.name, formData.address, formData.message);
      const preEncryptedMessages: Array<{ recipientId: string; c1: string; c2: string }> = [];

      for (const { memberId, publicKey } of existingPublicKeys) {
        try {
          const encrypted = await encrypt(BigInt(publicKey), encodedMessage);
          preEncryptedMessages.push({
            recipientId: memberId,
            c1: encrypted.c1.toString(),
            c2: encrypted.c2.toString(),
          });
        } catch (encryptError) {
          console.error(`Failed to encrypt for member ${memberId}:`, encryptError);
          // Continue with other members even if one fails
        }
      }

      // Submit join request with encrypted data, public key, encrypted private key, and pre-encrypted messages
      const joinResponse = await fetch(`/api/groups/${groupId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nameEncrypted: encryptedData.nameEncrypted,
          emailEncrypted: encryptedData.emailEncrypted,
          addressEncrypted: encryptedData.addressEncrypted,
          messageEncrypted: encryptedData.messageEncrypted,
          emailHash,
          password: formData.password, // Still needed for password hash on server
          publicKey: keyPair.publicKey.toString(),
          encryptedPrivateKey,
          preEncryptedMessages, // Pre-encrypted messages for existing members
        }),
      });

      const joinData = await joinResponse.json();

      if (!joinResponse.ok) {
        throw new Error(joinData.error || 'Failed to join Secret Santa group');
      }

      // Store authentication cookie with email hash (expires in 1 year)
      document.cookie = `santa_member_${groupId}=${emailHash}; path=/; max-age=31536000`;

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
        <h2 className="text-2xl font-bold mb-4">Join Secret Santa Group</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Your Name
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Your Email
            </label>
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
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
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-red-600 font-medium">
              ⚠️ Important: Your password cannot be recovered or reset. Please save it securely.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Your Address
            </label>
            <textarea
              required
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Message to Your Secret Santa
            </label>
            <textarea
              required
              value={formData.message}
              onChange={(e) => setFormData({ ...formData, message: e.target.value })}
              rows={3}
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
              className="flex-1 bg-green-600 text-white py-2 rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50"
            >
              {loading ? 'Joining...' : 'Join'}
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

