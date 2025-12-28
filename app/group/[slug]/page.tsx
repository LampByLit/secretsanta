'use client';

import { useEffect, useState } from 'react';
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
  isMember?: boolean; // Whether current user is actually a member (fledged)
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
  const [assignment, setAssignment] = useState<any>(null);
  const [error, setError] = useState('');
  const [creatorEmail, setCreatorEmail] = useState<string>('');

  useEffect(() => {
    loadGroupData();
  }, [slug]);

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
      
      // Load assignment if cycle initiated
      if (data.group.status !== 'pending') {
        loadAssignment(data.group.id);
      }
      
      setLoading(false);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const loadAssignment = async (groupId: string) => {
    // Assignment loading will be handled by AssignmentDisplay component
    // This is a placeholder
  };

  const handleInitiateCycle = async () => {
    if (!groupData || !isCreator) return;
    
    const creatorEmail = prompt('Enter your email:');
    const creatorPassword = prompt('Enter your password:');
    
    if (!creatorEmail || !creatorPassword) return;

    try {
      const response = await fetch(`/api/groups/${groupData.group.id}/initiate-cycle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creatorEmail, creatorPassword }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to initiate cycle');
      }

      // Reload group data
      loadGroupById(groupData.group.id);
      setShowInitiateConfirm(false);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeleteGroup = async () => {
    if (!groupData || !isCreator) return;
    
    const creatorEmail = prompt('Enter your email:');
    const creatorPassword = prompt('Enter your password:');
    
    if (!creatorEmail || !creatorPassword) return;

    try {
      const response = await fetch(`/api/groups/${groupData.group.id}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: creatorEmail, password: creatorPassword }),
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

  const canInitiate = groupData.memberCount >= 4 && groupData.group.status === 'pending';

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{groupData.group.name}</h1>
            <p className="text-gray-600">Secret Santa Group</p>
          </div>
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

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">
              Members: {groupData.memberCount}
            </h2>
            {groupData.group.status !== 'pending' && (
              <div className="text-lg font-semibold text-green-600">
                Gifts Confirmed Shipped: {groupData.shipmentCount} / {groupData.memberCount}
              </div>
            )}
          </div>

          <div className="space-y-2 mb-6">
            {groupData.members.map((member) => (
              <div key={member.id} className="flex items-center justify-between py-2 border-b">
                <span className="text-gray-800">{member.name}</span>
                {isCreator && groupData.group.status === 'pending' && (
                  <button
                    onClick={async () => {
                      const creatorEmail = prompt('Enter your email:');
                      const creatorPassword = prompt('Enter your password:');
                      if (!creatorEmail || !creatorPassword) return;
                      
                      try {
                        const response = await fetch(`/api/groups/${groupData.group.id}/exclude`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            creatorEmail,
                            creatorPassword,
                            memberId: member.id,
                            excluded: !member.excluded,
                          }),
                        });
                        
                        if (response.ok) {
                          loadGroupById(groupData.group.id);
                        }
                      } catch (err) {
                        console.error('Error toggling exclusion:', err);
                      }
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

          {groupData.group.status === 'pending' && (
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
                    onClick={() => setShowInitiateConfirm(true)}
                    disabled={!canInitiate}
                    className={`w-full py-3 rounded-lg font-semibold mb-4 transition-colors ${
                      canInitiate
                        ? 'bg-green-600 text-white hover:bg-green-700'
                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    {canInitiate ? 'INITIATE SECRET SANTA CYCLE' : `Need ${4 - groupData.memberCount} more members`}
                  </button>

                  {showInitiateConfirm && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                      <div className="bg-white p-6 rounded-lg max-w-md">
                        <h3 className="text-xl font-bold mb-4">Confirm Cycle Initiation</h3>
                        <p className="mb-4">Are you sure you want to initiate the Secret Santa cycle? This cannot be undone.</p>
                        <div className="flex gap-4">
                          <button
                            onClick={handleInitiateCycle}
                            className="flex-1 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700"
                          >
                            Yes, Initiate
                          </button>
                          <button
                            onClick={() => setShowInitiateConfirm(false)}
                            className="flex-1 bg-gray-300 text-gray-800 py-2 rounded-lg hover:bg-gray-400"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="w-full bg-red-600 text-white py-2 rounded-lg font-semibold hover:bg-red-700 transition-colors"
                  >
                    DELETE GROUP
                  </button>

                  {showDeleteConfirm && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                      <div className="bg-white p-6 rounded-lg max-w-md">
                        <h3 className="text-xl font-bold mb-4 text-red-600">Confirm Deletion</h3>
                        <p className="mb-4">Are you sure you want to delete this group? This action cannot be undone.</p>
                        <div className="flex gap-4">
                          <button
                            onClick={handleDeleteGroup}
                            className="flex-1 bg-red-600 text-white py-2 rounded-lg hover:bg-red-700"
                          >
                            Yes, Delete
                          </button>
                          <button
                            onClick={() => setShowDeleteConfirm(false)}
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

            </>
          )}

          {groupData.group.status !== 'pending' && (
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
                <AssignmentDisplay groupId={groupData.group.id} slug={slug} />
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

