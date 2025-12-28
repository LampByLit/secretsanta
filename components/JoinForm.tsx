'use client';

import { useState, useMemo } from 'react';
import { encryptPrivateKey, encryptMemberData } from '@/lib/crypto/aes';
import { generateKeyPair, encrypt, encodeMessage, calculateMessageSize } from '@/lib/crypto/elgamal';

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
  const [showPassword, setShowPassword] = useState(false);
  const [showByteTooltip, setShowByteTooltip] = useState(false);

  // Calculate message size for validation feedback
  const messageSize = useMemo(() => {
    if (!formData.name && !formData.address && !formData.message) {
      return null;
    }
    try {
      return calculateMessageSize(
        formData.name || '',
        formData.address || '',
        formData.message || ''
      );
    } catch {
      return null;
    }
  }, [formData.name, formData.address, formData.message]);

  // Check if message is approaching or exceeding limit
  const sizeWarning = useMemo(() => {
    if (!messageSize) return null;

    const maxBytes = 100;
    const overheadBytes = 12;
    const maxUsableBytes = maxBytes - overheadBytes;
    const usedBytes = messageSize.nameBytes + messageSize.addressBytes + messageSize.messageBytes;
    const remainingBytes = maxUsableBytes - usedBytes;
    const percentageUsed = (usedBytes / maxUsableBytes) * 100;

    if (usedBytes > maxUsableBytes) {
      return {
        type: 'error' as const,
        message: `Total size exceeds limit by ${usedBytes - maxUsableBytes} bytes. Please shorten your entries.`,
        remainingBytes: 0,
        percentageUsed: 100,
      };
    } else if (percentageUsed >= 90) {
      return {
        type: 'error' as const,
        message: `Very close to limit (${usedBytes}/${maxUsableBytes} bytes used). Please shorten your entries.`,
        remainingBytes,
        percentageUsed,
      };
    } else if (percentageUsed >= 75) {
      return {
        type: 'warning' as const,
        message: `Approaching limit (${usedBytes}/${maxUsableBytes} bytes used, ${remainingBytes} bytes remaining)`,
        remainingBytes,
        percentageUsed,
      };
    } else {
      return {
        type: 'info' as const,
        message: `${usedBytes}/${maxUsableBytes} bytes used (${remainingBytes} bytes remaining)`,
        remainingBytes,
        percentageUsed,
      };
    }
  }, [messageSize]);

  // Show tooltip when any relevant field has content or is focused
  const shouldShowByteTooltip = useMemo(() => {
    return showByteTooltip || !!formData.name || !!formData.address || !!formData.message;
  }, [showByteTooltip, formData.name, formData.address, formData.message]);

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

      // Encrypt sensitive member data with password (client-side encryption for privacy)
      // Name and email are NOT encrypted - they need to be visible/accessible
      // Only address and message are encrypted
      const encryptedData = await encryptMemberData(
        formData.name,
        formData.address,
        formData.message,
        formData.email, // Email is passed but won't be encrypted
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

      // Validate message size before attempting encoding
      const sizeCheck = calculateMessageSize(formData.name, formData.address, formData.message);
      if (sizeCheck.totalBytes > 100) {
        const overBy = sizeCheck.totalBytes - 100;
        const suggestions: string[] = [];
        if (sizeCheck.nameBytes > 30) {
          suggestions.push(`Shorten name (currently ${sizeCheck.nameBytes} bytes)`);
        }
        if (sizeCheck.addressBytes > 50) {
          suggestions.push(`Shorten address (currently ${sizeCheck.addressBytes} bytes) - use abbreviations if needed`);
        }
        if (sizeCheck.messageBytes > 30) {
          suggestions.push(`Shorten message (currently ${sizeCheck.messageBytes} bytes)`);
        }
        throw new Error(
          `Total message size (${sizeCheck.totalBytes} bytes) exceeds the 100 byte limit by ${overBy} bytes. ` +
          `Please shorten your entries. ${suggestions.length > 0 ? suggestions.join('. ') : ''}`
        );
      }

      // Pre-encrypt this member's data with each existing member's public key
      // This allows cycle initiation to work without decrypting member data server-side
      // Note: This only creates messages FROM new member TO existing members.
      // Messages FROM existing members TO new member cannot be created server-side
      // because we can't decrypt existing members' data. Cycle initiation will fail
      // if any bidirectional messages are missing.
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
      // Name and email are sent in cleartext (not encrypted) - they need to be visible/accessible
      const joinResponse = await fetch(`/api/groups/${groupId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: encryptedData.name, // Name is NOT encrypted - needs to be visible
          email: encryptedData.email, // Email is NOT encrypted - needs to be accessible for notifications
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

      // Store authentication cookie with email (expires in 1 year) - automatically log user in
      document.cookie = `santa_member_${groupId}=${formData.email}; path=/; max-age=31536000`;
      
      // If this is the creator, also set creator cookie
      if (creatorEmail && formData.email.toLowerCase().trim() === creatorEmail.toLowerCase().trim()) {
        document.cookie = `santa_creator_${groupId}=${formData.email}; path=/; max-age=31536000`;
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
              onFocus={() => setShowByteTooltip(true)}
              onBlur={() => setShowByteTooltip(false)}
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
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.29 3.29m0 0A9.97 9.97 0 015.12 5.12m3.46 3.46L12 12m-3.42-3.42l3.42 3.42M12 12l3.42 3.42m0 0A9.97 9.97 0 0118.88 18.88m-3.46-3.46L12 12m3.42 3.42L12 12" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
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
              onFocus={() => setShowByteTooltip(true)}
              onBlur={() => setShowByteTooltip(false)}
              rows={3}
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                sizeWarning?.type === 'error' ? 'border-red-500' :
                sizeWarning?.type === 'warning' ? 'border-yellow-500' :
                'border-gray-300'
              }`}
              placeholder="Keep address concise (e.g., '123 Main St, City, State ZIP')"
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
              onFocus={() => setShowByteTooltip(true)}
              onBlur={() => setShowByteTooltip(false)}
              rows={3}
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                sizeWarning?.type === 'error' ? 'border-red-500' :
                sizeWarning?.type === 'warning' ? 'border-yellow-500' :
                'border-gray-300'
              }`}
              placeholder="Keep message brief"
            />
          </div>


          {/* Inline byte counter above buttons */}
          {shouldShowByteTooltip && sizeWarning && messageSize && (
            <div className={`mb-4 px-4 py-3 rounded-lg border ${
              sizeWarning.type === 'error'
                ? 'bg-red-50 border-red-200 text-red-700'
                : sizeWarning.type === 'warning'
                ? 'bg-yellow-50 border-yellow-200 text-yellow-700'
                : 'bg-blue-50 border-blue-200 text-blue-700'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <span className="font-semibold">
                  {sizeWarning.type === 'error' ? '⚠️' : sizeWarning.type === 'warning' ? '⚠️' : 'ℹ️'}
                </span>
                <span className="font-medium text-sm">{sizeWarning.message}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    sizeWarning.type === 'error'
                      ? 'bg-red-600'
                      : sizeWarning.type === 'warning'
                      ? 'bg-yellow-600'
                      : 'bg-blue-600'
                  }`}
                  style={{ width: `${Math.min(sizeWarning.percentageUsed, 100)}%` }}
                />
              </div>
              <div className="text-xs text-gray-600">
                Name: {messageSize.nameBytes} | Address: {messageSize.addressBytes} | Message: {messageSize.messageBytes} | Total: {messageSize.totalBytes}/100 bytes
              </div>
            </div>
          )}

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

