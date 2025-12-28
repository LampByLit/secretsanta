'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import JoinForm from '@/components/JoinForm';
import LoginForm from '@/components/LoginForm';
import AssignmentDisplay from '@/components/AssignmentDisplay';

interface Member {
  id: string;
  name: string;
  excluded: boolean;
}

interface GroupData {
  group: {
    id: string;
    name: string;
    status: string;
    uniqueUrl: string;
  };
  members: Member[];
  allMembers: Member[];
  memberCount: number;
  shipmentCount: number;
  decryptionCount?: number;
  totalMembers?: number;
  isMember?: boolean; // Whether current user is actually a member (fledged)
  loggedInUserName?: string | null; // Name of logged in user
  shipmentConfirmed?: boolean; // Whether logged in user has confirmed shipment
}

export default function GroupPage() {
  const params = useParams();
  const slug = params.slug as string;
  
  const [groupData, setGroupData] = useState<GroupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isCreator, setIsCreator] = useState(false);
  const [isMember, setIsMember] = useState(false);
  const [showJoinForm, setShowJoinForm] = useState(false);
  const [showLoginForm, setShowLoginForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showInitiateConfirm, setShowInitiateConfirm] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [showExcludeConfirm, setShowExcludeConfirm] = useState(false);
  const [excludeMemberId, setExcludeMemberId] = useState<string | null>(null);
  const [excludeMemberExcluded, setExcludeMemberExcluded] = useState(false);
  const [assignment, setAssignment] = useState<any>(null);
  const [error, setError] = useState('');
  const [creatorEmail, setCreatorEmail] = useState<string>('');
  
  // Form state for modals
  const [initiateEmail, setInitiateEmail] = useState('');
  const [initiatePassword, setInitiatePassword] = useState('');
  const [closeEmail, setCloseEmail] = useState('');
  const [closePassword, setClosePassword] = useState('');
  const [deleteEmail, setDeleteEmail] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [excludeEmail, setExcludeEmail] = useState('');
  const [excludePassword, setExcludePassword] = useState('');

  useEffect(() => {
    loadGroupData();
  }, [slug]);

  // Ref to track polling state across re-renders
  const pollingRef = useRef<{ intervalId: NodeJS.Timeout | null; isActive: boolean }>({
    intervalId: null,
    isActive: false,
  });

  // Poll for status updates when group is closed and user is creator
  useEffect(() => {
    // Only poll if group is closed, user is creator, and we have group data
    if (!groupData || groupData.group.status !== 'closed' || !isCreator) {
      // Stop polling if conditions no longer met
      if (pollingRef.current.intervalId) {
        clearInterval(pollingRef.current.intervalId);
        pollingRef.current.intervalId = null;
        pollingRef.current.isActive = false;
      }
      return;
    }

    // If already polling, don't start another interval
    if (pollingRef.current.isActive) {
      return;
    }

    const groupId = groupData.group.id;
    pollingRef.current.isActive = true;
    
    // Poll every 3 seconds to check if status changed to 'ready'
    pollingRef.current.intervalId = setInterval(async () => {
      if (!pollingRef.current.isActive) return; // Stop if we're no longer polling
      
      try {
        // Check for creator cookie for email
        const creatorCookie = document.cookie
          .split('; ')
          .find(row => row.startsWith(`santa_creator_${groupId}`));
        const creatorEmailFromCookie = creatorCookie ? creatorCookie.split('=')[1] : null;
        
        // Build URL with email check if we have an email
        const url = creatorEmailFromCookie 
          ? `/api/groups/${groupId}?checkEmail=${encodeURIComponent(creatorEmailFromCookie)}`
          : `/api/groups/${groupId}`;
        
        const response = await fetch(url);
        if (!response.ok) return; // Silently fail if request fails
        
        const data = await response.json();
        
        // If status changed to 'ready', update state and stop polling
        if (data.group && data.group.status === 'ready') {
          setGroupData(data);
          pollingRef.current.isActive = false;
          if (pollingRef.current.intervalId) {
            clearInterval(pollingRef.current.intervalId);
            pollingRef.current.intervalId = null;
          }
        } else if (data.group && data.group.status === 'closed') {
          // Only update if something meaningful changed (member count, etc.)
          // Use functional update to avoid unnecessary re-renders
          setGroupData(prev => {
            if (!prev) return data;
            // Only update if member count changed or other meaningful data changed
            if (prev.memberCount !== data.memberCount || 
                prev.members.length !== data.members.length) {
              return data;
            }
            return prev; // No change, return previous to avoid re-render
          });
        } else {
          // Status changed to something else, stop polling
          pollingRef.current.isActive = false;
          if (pollingRef.current.intervalId) {
            clearInterval(pollingRef.current.intervalId);
            pollingRef.current.intervalId = null;
          }
        }
      } catch (err) {
        // Silently fail - don't spam console with errors
        console.error('Polling error:', err);
      }
    }, 3000); // Poll every 3 seconds

    // Cleanup interval on unmount or when conditions change
    return () => {
      pollingRef.current.isActive = false;
      if (pollingRef.current.intervalId) {
        clearInterval(pollingRef.current.intervalId);
        pollingRef.current.intervalId = null;
      }
    };
  }, [groupData?.group.status, groupData?.group.id, isCreator]); // Only depend on status and id, not entire groupData object

  const loadGroupData = async () => {
    try {
      // Get group ID from slug
      const response = await fetch(`/api/groups/by-url/${slug}`);
      if (!response.ok) {
        throw new Error('Group not found');
      }
      const data = await response.json();
      if (data.groupId) {
        loadGroupById(data.groupId);
      }
    } catch (err) {
      console.error('Error loading group:', err);
      setError('Failed to load group');
      setLoading(false);
    }
  };

  const loadGroupById = async (groupId: string) => {
    try {
      // Check for member cookie to get email for membership check
      const memberCookie = document.cookie
        .split('; ')
        .find(row => row.startsWith(`santa_member_${groupId}`));
      const memberEmail = memberCookie ? memberCookie.split('=')[1] : null;
      
      // Also check creator cookie for email
      const creatorCookie = document.cookie
        .split('; ')
        .find(row => row.startsWith(`santa_creator_${groupId}`));
      const creatorEmailFromCookie = creatorCookie ? creatorCookie.split('=')[1] : null;
      
      // Use member email if available, otherwise creator email
      const emailToCheck = memberEmail || creatorEmailFromCookie;
      
      // Build URL with email check if we have an email
      const url = emailToCheck 
        ? `/api/groups/${groupId}?checkEmail=${encodeURIComponent(emailToCheck)}`
        : `/api/groups/${groupId}`;
      
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to load group');
      
      const data = await response.json();
      setGroupData(data);
      
      // Check if user is creator (from cookie)
      setIsCreator(!!creatorCookie);
      
      // Extract creator email from cookie if present
      if (creatorCookie) {
        setCreatorEmail(creatorEmailFromCookie || '');
      }
      
      // Check if user is actually a member (fledged) - from API response, not just cookie
      // A user is "fledged" if they're in the members table
      setIsMember(data.isMember || false);
      
      // Assignment loading is handled by the AssignmentDisplay component
      
      setLoading(false);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };


  const handleInitiateCycle = async (email: string, password: string) => {
    if (!groupData || !isCreator) return;
    
    if (!email || !password) {
      setError('Email and password are required');
      return;
    }

    try {
      const response = await fetch(`/api/groups/${groupData.group.id}/initiate-cycle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creatorEmail: email, creatorPassword: password }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to initiate cycle');
      }

      // Reload group data
      loadGroupById(groupData.group.id);
      setShowInitiateConfirm(false);
      setInitiateEmail('');
      setInitiatePassword('');
      setError('');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeleteGroup = async (email: string, password: string) => {
    if (!groupData || !isCreator) return;
    
    if (!email || !password) {
      setError('Email and password are required');
      return;
    }

    try {
      const response = await fetch(`/api/groups/${groupData.group.id}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete group');
      }

      window.location.href = '/';
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleExcludeMember = async (email: string, password: string, memberId: string, excluded: boolean) => {
    if (!groupData || !isCreator) return;
    
    if (!email || !password) {
      setError('Email and password are required');
      return;
    }

    try {
      const response = await fetch(`/api/groups/${groupData.group.id}/exclude`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creatorEmail: email,
          creatorPassword: password,
          memberId,
          excluded,
        }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to toggle exclusion');
      }
      
      loadGroupById(groupData.group.id);
      setShowExcludeConfirm(false);
      setExcludeEmail('');
      setExcludePassword('');
      setExcludeMemberId(null);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to toggle exclusion');
    }
  };

  const handleLogout = () => {
    if (!groupData) return;
    
    // Clear creator cookie
    document.cookie = `santa_creator_${groupData.group.id}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    
    // Clear member cookie
    document.cookie = `santa_member_${groupData.group.id}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    
    // Reload the page to reset state
    window.location.reload();
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="text-lg">Loading...</div>
      </main>
    );
  }

  if (!groupData) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="text-lg text-red-600">Group not found</div>
      </main>
    );
  }

  const canInitiate = groupData.memberCount >= 4 && groupData.group.status === 'ready';

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{groupData.group.name}</h1>
            <p className="text-gray-600">Secret Santa Group</p>
          </div>
          <div className="flex items-center gap-4">
            {groupData.loggedInUserName && (
              <span className="text-sm text-gray-700 font-medium">{groupData.loggedInUserName}</span>
            )}
            {(isCreator || isMember) ? (
              <button
                onClick={handleLogout}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Log Out
              </button>
            ) : (
              <button
                onClick={() => setShowLoginForm(true)}
                className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 border border-blue-600 rounded-lg transition-colors"
              >
                Log In
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          {/* Status information at the top */}
          {(groupData.group.status === 'closed' || groupData.group.status === 'ready' || groupData.group.status === 'messages_ready' || groupData.group.status === 'complete') && (
            <div className="mb-6 pb-6 border-b">
              <div className="flex flex-col gap-2">
                {(groupData.group.status === 'messages_ready' || groupData.group.status === 'complete') && groupData.decryptionCount !== undefined && groupData.totalMembers !== undefined && (
                  <div className="text-lg font-semibold text-blue-600">
                    {groupData.decryptionCount} / {groupData.totalMembers} Members Have Viewed Their Assignment
                  </div>
                )}
                {/* Only show shipment count after cycle initiation */}
                {(groupData.group.status === 'messages_ready' || groupData.group.status === 'complete') && (
                  <div className="flex items-center gap-2">
                    <div className="text-lg font-semibold text-green-600">
                      Gifts Confirmed Shipped: {groupData.shipmentCount} / {groupData.memberCount}
                    </div>
                    {groupData.shipmentCount === groupData.memberCount && groupData.memberCount > 0 && (
                      <span className="px-3 py-1 text-sm font-bold text-red-600 border-2 border-red-600 rounded">
                        COMPLETE
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {groupData.group.status === 'open' && (
            <>
              {!isMember && (
                <button
                  onClick={() => setShowJoinForm(true)}
                  className={`w-full py-3 rounded-lg font-semibold transition-colors mb-4 ${
                    isCreator
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-green-600 text-white hover:bg-green-700'
                  }`}
                >
                  JOIN THIS SECRET SANTA GROUP
                </button>
              )}
              
              {isCreator && (
                <>
                  <button
                    onClick={() => {
                      setCloseEmail(creatorEmail || '');
                      setShowCloseConfirm(true);
                    }}
                    disabled={groupData.memberCount < 4}
                    className={`w-full py-3 rounded-lg font-semibold mb-4 transition-colors ${
                      groupData.memberCount >= 4
                        ? 'bg-yellow-600 text-white hover:bg-yellow-700'
                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    {groupData.memberCount >= 4
                      ? 'CLOSE GROUP (Stop Accepting New Members)'
                      : `Need ${4 - groupData.memberCount} more member(s) to close group`}
                  </button>
                </>
              )}
            </>
          )}

          {(groupData.group.status === 'closed' || groupData.group.status === 'ready') && isCreator && (
            <>
              <button
                onClick={() => {
                  setInitiateEmail(creatorEmail || '');
                  setShowInitiateConfirm(true);
                }}
                disabled={groupData.group.status === 'closed' || !canInitiate}
                className={`w-full py-3 rounded-lg font-semibold mb-4 transition-colors ${
                  groupData.group.status === 'ready' && canInitiate
                    ? 'bg-green-600 text-white hover:bg-green-700'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                {groupData.group.status === 'closed'
                  ? 'Waiting for members to log in to complete setup...'
                  : canInitiate
                    ? 'INITIATE SECRET SANTA CYCLE'
                    : `Need ${4 - groupData.memberCount} more members`}
              </button>

                  {showInitiateConfirm && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                      <div className="bg-white p-6 rounded-lg max-w-md w-full">
                        <h3 className="text-xl font-bold mb-4">Confirm Cycle Initiation</h3>
                        <p className="mb-4">Are you sure you want to initiate the Secret Santa cycle? This cannot be undone.</p>
                        
                        <div className="space-y-4 mb-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Your Email
                            </label>
                            <input
                              type="email"
                              required
                              value={initiateEmail}
                              onChange={(e) => setInitiateEmail(e.target.value)}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                              placeholder="Enter your email"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Your Password
                            </label>
                            <input
                              type="password"
                              required
                              value={initiatePassword}
                              onChange={(e) => setInitiatePassword(e.target.value)}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                              placeholder="Enter your password"
                            />
                          </div>
                        </div>
                        
                        <div className="flex gap-4">
                          <button
                            onClick={() => handleInitiateCycle(initiateEmail, initiatePassword)}
                            className="flex-1 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700"
                          >
                            Confirm Initiate
                          </button>
                          <button
                            onClick={() => {
                              setShowInitiateConfirm(false);
                              setInitiateEmail('');
                              setInitiatePassword('');
                            }}
                            className="flex-1 bg-gray-300 text-gray-800 py-2 rounded-lg hover:bg-gray-400"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
            </>
          )}

          {showCloseConfirm && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                      <div className="bg-white p-6 rounded-lg max-w-md w-full">
                        <h3 className="text-xl font-bold mb-4">Close Group</h3>
                        <p className="mb-4">Closing the group will stop accepting new members. Members will need to log in to complete setup before you can initiate the cycle.</p>
                        
                        <div className="space-y-4 mb-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Your Email
                            </label>
                            <input
                              type="email"
                              required
                              value={closeEmail}
                              onChange={(e) => setCloseEmail(e.target.value)}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500"
                              placeholder="Enter your email"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Your Password
                            </label>
                            <input
                              type="password"
                              required
                              value={closePassword}
                              onChange={(e) => setClosePassword(e.target.value)}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500"
                              placeholder="Enter your password"
                            />
                          </div>
                        </div>
                        
                        <div className="flex gap-4">
                          <button
                            onClick={async () => {
                              if (!groupData) return;
                              try {
                                const response = await fetch(`/api/groups/${groupData.group.id}/close`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    creatorEmail: closeEmail,
                                    creatorPassword: closePassword,
                                  }),
                                });
                                const data = await response.json();
                                if (response.ok) {
                                  setError('');
                                  setShowCloseConfirm(false);
                                  setCloseEmail('');
                                  setClosePassword('');
                                  // Refresh group data
                                  await loadGroupData();
                                } else {
                                  setError(data.error || 'Failed to close group');
                                }
                              } catch (err: any) {
                                setError(err.message || 'Failed to close group');
                              }
                            }}
                            className="flex-1 bg-yellow-600 text-white py-2 rounded-lg hover:bg-yellow-700"
                          >
                            Close Group
                          </button>
                          <button
                            onClick={() => {
                              setShowCloseConfirm(false);
                              setCloseEmail('');
                              setClosePassword('');
                            }}
                            className="flex-1 bg-gray-300 text-gray-800 py-2 rounded-lg hover:bg-gray-400"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

          {isCreator && (
            <button
              onClick={() => {
                setDeleteEmail(creatorEmail || '');
                setShowDeleteConfirm(true);
              }}
              className="w-full bg-red-600 text-white py-2 rounded-lg font-semibold hover:bg-red-700 transition-colors"
            >
              DELETE GROUP
            </button>
          )}

          {showDeleteConfirm && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                      <div className="bg-white p-6 rounded-lg max-w-md w-full">
                        <h3 className="text-xl font-bold mb-4 text-red-600">Confirm Deletion</h3>
                        <p className="mb-4">Are you sure you want to delete this group? This action cannot be undone.</p>
                        
                        <div className="space-y-4 mb-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Your Email
                            </label>
                            <input
                              type="email"
                              required
                              value={deleteEmail}
                              onChange={(e) => setDeleteEmail(e.target.value)}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
                              placeholder="Enter your email"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Your Password
                            </label>
                            <input
                              type="password"
                              required
                              value={deletePassword}
                              onChange={(e) => setDeletePassword(e.target.value)}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
                              placeholder="Enter your password"
                            />
                          </div>
                        </div>
                        
                        <div className="flex gap-4">
                          <button
                            onClick={() => handleDeleteGroup(deleteEmail, deletePassword)}
                            className="flex-1 bg-red-600 text-white py-2 rounded-lg hover:bg-red-700"
                          >
                            Confirm Delete
                          </button>
                          <button
                            onClick={() => {
                              setShowDeleteConfirm(false);
                              setDeleteEmail('');
                              setDeletePassword('');
                            }}
                            className="flex-1 bg-gray-300 text-gray-800 py-2 rounded-lg hover:bg-gray-400"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

          {showExcludeConfirm && excludeMemberId && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                      <div className="bg-white p-6 rounded-lg max-w-md w-full">
                        <h3 className="text-xl font-bold mb-4">
                          {excludeMemberExcluded ? 'Include Member' : 'Exclude Member'}
                        </h3>
                        <p className="mb-4">
                          {excludeMemberExcluded 
                            ? 'Are you sure you want to include this member in the Secret Santa exchange?'
                            : 'Are you sure you want to exclude this member from the Secret Santa exchange?'}
                        </p>
                        
                        <div className="space-y-4 mb-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Your Email
                            </label>
                            <input
                              type="email"
                              required
                              value={excludeEmail}
                              onChange={(e) => setExcludeEmail(e.target.value)}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
                              placeholder="Enter your email"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Your Password
                            </label>
                            <input
                              type="password"
                              required
                              value={excludePassword}
                              onChange={(e) => setExcludePassword(e.target.value)}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
                              placeholder="Enter your password"
                            />
                          </div>
                        </div>
                        
                        <div className="flex gap-4">
                          <button
                            onClick={() => handleExcludeMember(excludeEmail, excludePassword, excludeMemberId, excludeMemberExcluded)}
                            className={`flex-1 py-2 rounded-lg ${
                              excludeMemberExcluded
                                ? 'bg-green-600 text-white hover:bg-green-700'
                                : 'bg-red-600 text-white hover:bg-red-700'
                            }`}
                          >
                            {excludeMemberExcluded ? 'Confirm Include' : 'Confirm Exclude'}
                          </button>
                          <button
                            onClick={() => {
                              setShowExcludeConfirm(false);
                              setExcludeEmail('');
                              setExcludePassword('');
                              setExcludeMemberId(null);
                            }}
                            className="flex-1 bg-gray-300 text-gray-800 py-2 rounded-lg hover:bg-gray-400"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

          {/* Only show assignment/login after cycle initiation */}
          {(groupData.group.status === 'messages_ready' || groupData.group.status === 'complete') && (
            <>
              {!isMember ? (
                <div className="mt-6">
                  <button
                    onClick={() => setShowLoginForm(true)}
                    className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                  >
                    LOG IN TO VIEW YOUR ASSIGNMENT
                  </button>
                </div>
              ) : (
                <AssignmentDisplay 
                  groupId={groupData.group.id} 
                  slug={slug}
                  groupStatus={groupData.group.status}
                  initialShipmentConfirmed={groupData.shipmentConfirmed || false}
                />
              )}
            </>
          )}

          {/* Forgot Password link - always visible */}
          <div className="mt-4 text-center">
            <a
              href={`/group/${slug}/reset`}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Forgot Password?
            </a>
          </div>

          {/* Members list at the bottom */}
          <div className="mt-8 pt-6 border-t">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">
                Members: {groupData.memberCount}
              </h2>
            </div>

            <div className="space-y-2 mb-6">
              {groupData.members.map((member) => (
                <div key={member.id} className="flex items-center justify-between py-2 border-b">
                  <span className="text-gray-800">{member.name}</span>
                  {isCreator && (groupData.group.status === 'open' || groupData.group.status === 'closed') && (
                    <button
                      onClick={() => {
                        setExcludeEmail(creatorEmail || '');
                        setExcludeMemberId(member.id);
                        setExcludeMemberExcluded(!member.excluded);
                        setShowExcludeConfirm(true);
                      }}
                      className="text-sm text-red-600 hover:text-red-800"
                    >
                      {member.excluded ? 'Include' : 'Exclude'}
                    </button>
                  )}
                </div>
              ))}
            </div>

            {isCreator && groupData.allMembers.length > groupData.members.length && (
              <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <h3 className="font-semibold mb-2">Excluded Members (Creator Only)</h3>
                {groupData.allMembers
                  .filter(m => m.excluded)
                  .map((member) => (
                    <div key={member.id} className="text-gray-600">{member.name}</div>
                  ))}
              </div>
            )}
          </div>
        </div>

        {showJoinForm && (
          <JoinForm
            groupId={groupData.group.id}
            creatorEmail={isCreator ? creatorEmail : undefined}
            creatorName={isCreator ? undefined : undefined} // We don't have creator name stored, but email is enough
            onClose={() => setShowJoinForm(false)}
            onSuccess={() => {
              setShowJoinForm(false);
              loadGroupById(groupData.group.id);
            }}
          />
        )}

        {showLoginForm && (
          <LoginForm
            groupId={groupData.group.id}
            onClose={() => setShowLoginForm(false)}
            onSuccess={() => {
              setShowLoginForm(false);
              loadGroupById(groupData.group.id);
            }}
          />
        )}
      </div>
    </main>
  );
}

