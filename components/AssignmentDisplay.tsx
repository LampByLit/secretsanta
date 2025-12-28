'use client';

import { useState, useEffect } from 'react';
import { decryptPrivateKey } from '@/lib/crypto/aes';
import { decrypt, decodeMessage, P, G } from '@/lib/crypto/elgamal';
import { modPow } from 'bigint-crypto-utils';

/**
 * Props for the AssignmentDisplay component
 */
interface AssignmentDisplayProps {
  /** Unique identifier of the Secret Santa group */
  groupId: string;
  /** URL slug of the group for display purposes */
  slug: string;
  /** Current status of the group ('pending', 'messages_ready', etc.) */
  groupStatus?: string;
  /** Whether the user has already confirmed gift shipment */
  initialShipmentConfirmed?: boolean;
}

/**
 * AssignmentDisplay Component
 *
 * Displays a Secret Santa assignment to an authenticated group member.
 * Handles both traditional assignment loading and cryptographic message decryption.
 *
 * Features:
 * - Session cookie-based authentication
 * - Support for both old and new assignment retrieval methods
 * - Client-side cryptographic decryption of assignments
 * - Shipment confirmation tracking
 * - Progressive disclosure of assignment information
 *
 * @param props - Component properties
 * @returns React component
 */
export default function AssignmentDisplay({
  groupId,
  slug,
  groupStatus = 'pending',
  initialShipmentConfirmed = false
}: AssignmentDisplayProps) {
  const [assignment, setAssignment] = useState<any>(null);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showLogin, setShowLogin] = useState(false);
  const [decrypting, setDecrypting] = useState(false);
  const [shipmentConfirmed, setShipmentConfirmed] = useState(initialShipmentConfirmed);

  useEffect(() => {
    // Check for session cookie
    const cookie = document.cookie
      .split('; ')
      .find(row => row.startsWith(`santa_member_${groupId}`));
    
    if (cookie) {
      const emailFromCookie = cookie.split('=')[1];
      setEmail(emailFromCookie);
      // Password is required for API, so we need to show login form
      // The cookie only stores email for convenience, not authentication
      setShowLogin(true);
      setLoading(false);
    } else {
      setShowLogin(true);
      setLoading(false);
    }
    
    // Use initial shipment confirmed status if provided
    if (initialShipmentConfirmed !== undefined) {
      setShipmentConfirmed(initialShipmentConfirmed);
    }
  }, [groupId, initialShipmentConfirmed]);


  const loadAssignment = async (memberEmail: string, memberPassword: string) => {
    const response = await fetch(
      `/api/groups/${groupId}/assignment?email=${encodeURIComponent(memberEmail)}&password=${encodeURIComponent(memberPassword)}`
    );

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to load assignment');
    }

    const data = await response.json();
    setAssignment(data);
    setLoading(false);
  };

  const handleDecryptAssignment = async () => {
    if (!email || !password) {
      setError('Email and password required');
      return;
    }

    setDecrypting(true);
    setError('');

    try {
      // Step 1: Get encrypted messages
      const messagesResponse = await fetch(
        `/api/groups/${groupId}/encrypted-messages?email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`
      );

      if (!messagesResponse.ok) {
        const data = await messagesResponse.json();
        throw new Error(data.error || 'Failed to fetch encrypted messages');
      }

      const messagesData = await messagesResponse.json();
      const encryptedMessages = messagesData.encryptedMessages;

      if (!encryptedMessages || encryptedMessages.length === 0) {
        throw new Error('No encrypted messages found');
      }

      // Step 2: Get encrypted private key and public key (included in response)
      const privateKeyEncrypted = messagesData.privateKeyEncrypted;
      const publicKey = messagesData.publicKey;
      if (!privateKeyEncrypted) {
        throw new Error('Private key not found');
      }
      if (!publicKey) {
        throw new Error('Public key not found');
      }

      // Decrypt the stored private key using the user's password
      const privateKeyString = await decryptPrivateKey(privateKeyEncrypted, password);
      const privateKeyBigInt = BigInt(privateKeyString);

      // Verify that the decrypted private key corresponds to the stored public key
      const computedPublicKey = await modPow(G, privateKeyBigInt, P);
      if (computedPublicKey.toString() !== publicKey) {
        throw new Error('Private key does not match public key. This indicates a key storage/retrieval issue.');
      }

      // Step 4: Try decrypting each encrypted message
      let decryptedAssignment = null;
      for (let i = 0; i < encryptedMessages.length; i++) {
        const encryptedMsg = encryptedMessages[i];
        try {
          const encrypted = {
            c1: BigInt(encryptedMsg.c1),
            c2: BigInt(encryptedMsg.c2),
          };
          
          // Attempt to decrypt this message with our private key
          const decryptedBigInt = await decrypt(privateKeyBigInt, encrypted);
          const decoded = decodeMessage(decryptedBigInt);

          // Validate that we successfully decoded meaningful recipient data
          if (decoded.name && decoded.address && decoded.message) {
            // Successfully decrypted our assignment
            decryptedAssignment = {
              santeeName: decoded.name,
              santeeAddress: decoded.address,
              santeeMessage: decoded.message,
            };
            break;
          }
          // If decoding failed or produced empty data, continue to next message
        } catch (e: any) {
          // This message was not encrypted for us, try the next one
          continue;
        }
      }

      if (!decryptedAssignment) {
        throw new Error('Could not decrypt any message. This should not happen if the protocol worked correctly.');
      }

      // Step 5: Mark as decrypted and send email (first time only)
      // Send decrypted santee data so server can include it in the email
      console.log('[Client] Sending decrypted assignment data:', {
        santeeName: decryptedAssignment.santeeName,
        santeeAddress: decryptedAssignment.santeeAddress.substring(0, 50) + '...',
        santeeMessage: decryptedAssignment.santeeMessage.substring(0, 50) + '...',
      });
      
      const decryptResponse = await fetch(`/api/groups/${groupId}/decrypt-assignment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email, 
          password,
          santeeName: decryptedAssignment.santeeName,
          santeeAddress: decryptedAssignment.santeeAddress,
          santeeMessage: decryptedAssignment.santeeMessage,
        }),
      });

      if (!decryptResponse.ok) {
        // Log error but continue - we successfully decrypted the assignment
        const data = await decryptResponse.json();
        console.error('Failed to mark assignment as decrypted:', data.error);
      }

      // Step 6: Set assignment and show it
      setAssignment(decryptedAssignment);
      setShowLogin(false);
      setRevealed(true);
      document.cookie = `santa_member_${groupId}=${email}; path=/; max-age=31536000`;
    } catch (err: any) {
      setError(err.message);
      setShowLogin(true);
    } finally {
      setDecrypting(false);
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Email and password required');
      return;
    }

    // If messages are ready, use decrypt flow, otherwise use old assignment flow
    if (groupStatus === 'messages_ready') {
      await handleDecryptAssignment();
      return;
    }

    setLoading(true);
    setError('');

    try {
      await loadAssignment(email, password);
      // Assignment loaded successfully - set cookie and hide login form
      document.cookie = `santa_member_${groupId}=${email}; path=/; max-age=31536000`;
      setShowLogin(false);
      setError('');
    } catch (err: any) {
      setError(err.message);
      setShowLogin(true); // Keep login form visible on error
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmShipment = async () => {
    if (!email || !password) {
      setError('Email and password required');
      return;
    }

    try {
      const response = await fetch(`/api/groups/${groupId}/confirm-shipment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to confirm shipment');
      }

      const data = await response.json();
      // Check if already confirmed or newly confirmed
      if (data.success) {
        setShipmentConfirmed(true);
        // Reload page to update shipment count and show COMPLETE if needed
        window.location.reload();
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading) {
    return <div className="text-center py-4">Loading assignment...</div>;
  }

  if (showLogin) {
    return (
      <div className="border-t pt-6 mt-6">
        <h3 className="text-lg font-semibold mb-4">View Your Assignment</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}
          <button
            onClick={handleLogin}
            disabled={decrypting || loading}
            className="w-full bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {groupStatus === 'messages_ready' ? (decrypting ? 'Decrypting...' : 'Decrypt Assignment') : 'Login'}
          </button>
        </div>
      </div>
    );
  }

  if (!assignment) {
    return <div className="text-center py-4">No assignment found</div>;
  }

  return (
    <div className="border-t pt-6 mt-6">
      <h3 className="text-lg font-semibold mb-4">Your Secret Santa Assignment</h3>
      
      {!revealed ? (
        <div className="bg-gray-100 p-4 rounded-lg mb-4">
          <button
            onClick={() => setRevealed(true)}
            className="w-full text-gray-600 hover:text-gray-800 font-semibold"
          >
            Click to Reveal
          </button>
        </div>
      ) : (
        <div className="bg-green-50 border border-green-200 p-4 rounded-lg mb-4">
          <div className="space-y-2">
            <p><strong>Name:</strong> {assignment.santeeName}</p>
            <p><strong>Address:</strong> {assignment.santeeAddress}</p>
            <p><strong>Message:</strong> {assignment.santeeMessage}</p>
          </div>
        </div>
      )}

      {revealed && !shipmentConfirmed && (
        <button
          onClick={handleConfirmShipment}
          className="w-full bg-green-600 text-white py-2 rounded-lg font-semibold hover:bg-green-700 mt-4"
        >
          CONFIRM GIFT SHIPMENT
        </button>
      )}

      {shipmentConfirmed && (
        <div className="bg-green-100 border border-green-300 text-green-800 px-4 py-2 rounded-lg mt-4">
          Shipment confirmed!
        </div>
      )}
    </div>
  );
}

