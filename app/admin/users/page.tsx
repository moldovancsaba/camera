/**
 * Admin Users Page
 * Version: 2.5.0
 * 
 * Comprehensive user management interface.
 * 
 * Features:
 * - Lists all user types: Administrators, Real users, Pseudo users, Anonymous users
 * - Role management (user ↔ admin)
 * - Status management (active ↔ inactive)
 * - Merge pseudo users with real users
 * - Visual indicators for user status and role
 * 
 * User Types:
 * - Administrator: SSO authenticated with admin role
 * - Real: SSO authenticated with user role
 * - Pseudo: Event guests who provided name/email
 * - Anonymous: Session-based, no personal info
 */

import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { MongoClient } from 'mongodb';
import Link from 'next/link';
import UserManagementActions from '@/components/admin/UserManagementActions';
import DatabaseConnectionAlert from '@/components/admin/DatabaseConnectionAlert';
import { getSsoMongoUri } from '@/lib/db/sso';

// Force dynamic rendering (uses cookies for session)
export const dynamic = 'force-dynamic';

/**
 * Sanitize username for URL
 * Replaces spaces and special characters with underscores
 */
function sanitizeUsername(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_');
}

export default async function AdminUsersPage() {
  let users: any[] = [];
  let error: unknown = null;
  let currentUserEmail = '';

  try {
    // Get current session for admin email
    const session = await getSession();
    currentUserEmail = session?.user.email || '';
    
    // Fetch camera database submissions
    const db = await connectToDatabase();
    const submissions = await db
      .collection('submissions')
      .find({ 
        $or: [
          { isArchived: false },
          { isArchived: { $exists: false } }
        ]
      })
      .sort({ createdAt: -1 })
      .toArray();

    // Fetch SSO users to get roles and status
    const ssoClient = new MongoClient(getSsoMongoUri());
    await ssoClient.connect();
    let ssoUsers: any[] = [];
    try {
      const ssoDb = ssoClient.db('sso');
      ssoUsers = await ssoDb.collection('publicUsers').find({}).toArray();
    } finally {
      await ssoClient.close();
    }
    
    // Create SSO user lookup map
    const ssoUserMap = new Map();
    ssoUsers.forEach(u => {
      ssoUserMap.set(u.email, {
        id: u.id,
        role: u.role || 'user',
        isActive: u.isActive !== false, // Default to true
      });
    });

    // Group submissions by user identifier
    const userMap = new Map<string, any>();
    
    for (const submission of submissions) {
      const hasUserInfo = submission.userInfo?.email && submission.userInfo?.name;
      const isMergedPseudo = hasUserInfo && submission.userInfo?.mergedWith;
      
      // CRITICAL: If merged, ALWAYS use the real user's email to consolidate all submissions
      // This prevents duplicate user entries in the list
      const identifier = isMergedPseudo
        ? submission.userInfo.mergedWith  // Use the SSO user ID they were merged with
        : (hasUserInfo ? submission.userInfo.email : (submission.userId || submission.userEmail));
      
      const isAnonymous = !hasUserInfo && 
        (submission.userId === 'anonymous' || submission.userEmail === 'anonymous@event');
      
      if (!userMap.has(identifier)) {
        // Determine user type
        // If submission has userInfo with mergedWith, it's now a real user (merged)
        const isPseudoUser = hasUserInfo && !isMergedPseudo;
        const isRealOrAdmin = !hasUserInfo && !isAnonymous;
        const isMergedUser = isMergedPseudo;
        
        let userType = 'pseudo';
        let role = 'user';
        let isActive = true;
        
        if (isAnonymous) {
          userType = 'anonymous';
        } else if (isMergedUser) {
          // Merged pseudo users are now real users - look them up by merged ID
          const mergedUserId = submission.userInfo.mergedWith;
          // Find SSO user by ID
          const ssoUser = ssoUsers.find(u => u.id === mergedUserId);
          if (ssoUser) {
            role = ssoUser.role || 'user';
            isActive = ssoUser.isActive !== false;
            userType = role === 'admin' ? 'administrator' : 'real';
          } else {
            userType = 'real'; // Fallback - merged but SSO data not found
          }
        } else if (isRealOrAdmin) {
          // Regular SSO users - check by email
          const ssoData = ssoUserMap.get(submission.userEmail);
          if (ssoData) {
            role = ssoData.role;
            isActive = ssoData.isActive;
            userType = role === 'admin' ? 'administrator' : 'real';
          } else {
            userType = 'real'; // Fallback
          }
        } else if (isPseudoUser) {
          // Unmerged pseudo users
          isActive = submission.userInfo?.isActive !== false;
          userType = 'pseudo';
        }
        
        userMap.set(identifier, {
          email: hasUserInfo ? submission.userInfo.email : submission.userEmail,
          name: hasUserInfo ? submission.userInfo.name : (isAnonymous ? 'Anonymous User' : submission.userName || 'Unknown'),
          isAnonymous: isAnonymous,
          type: userType,
          role: role,
          isActive: isActive,
          mergedWith: submission.userInfo?.mergedWith,
          collectedAt: submission.userInfo?.collectedAt || submission.createdAt,
          eventId: submission.eventId,
          eventName: submission.eventName || 'Unknown Event',
          submissions: [],
        });
      }
      
      userMap.get(identifier)?.submissions.push({
        _id: submission._id,
        imageUrl: submission.imageUrl,
        createdAt: submission.createdAt,
      });
    }

    users = Array.from(userMap.values());

  } catch (err) {
    console.error('Error fetching users:', err);
    error = err;
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Users</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">Compact list with core info</p>
      </div>

      {error != null ? <DatabaseConnectionAlert error={error} /> : null}

      {!error && users.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
          <div className="text-6xl mb-4">👥</div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No users yet</h3>
          <p className="text-gray-600 dark:text-gray-400">Waiting for first submissions</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {users.map((user: any, index: number) => {
              const profileHref = `/users/${sanitizeUsername(user.name || 'Anonymous')}`;
              const emailDisplay = user.isAnonymous ? 'anonymous@event.com' : (user.email || 'unknown');
              const registeredAt = new Date(user.collectedAt).toLocaleString();
              const photosCount = user.submissions.length;
              const lastEvent = user.eventName || 'Unknown Event';

              return (
                <div key={`${user.email}-${index}`} className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 last:border-b-0">
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                    {/* User Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <Link href={profileHref} className="font-semibold text-blue-600 dark:text-blue-400 hover:underline truncate">
                          {user.name || 'Anonymous'}
                        </Link>
                        
                        {/* Status Badges */}
                        {user.isAnonymous && (
                          <span className="px-2 py-0.5 text-[10px] font-semibold bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded">Anonymous</span>
                        )}
                        {user.type === 'administrator' && (
                          <span className="px-2 py-0.5 text-[10px] font-semibold bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded">Admin</span>
                        )}
                        {/* Only show Pseudo badge if NOT merged */}
                        {user.type === 'pseudo' && !user.mergedWith && (
                          <span className="px-2 py-0.5 text-[10px] font-semibold bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded">Pseudo</span>
                        )}
                        {!user.isActive && (
                          <span className="px-2 py-0.5 text-[10px] font-semibold bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded">Inactive</span>
                        )}
                        {/* Show Merged badge but don't show Pseudo at the same time */}
                        {user.mergedWith && (
                          <span className="px-2 py-0.5 text-[10px] font-semibold bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded">Merged</span>
                        )}
                      </div>
                      
                      <div className="space-y-1">
                        <div className="text-sm text-gray-600 dark:text-gray-400 truncate">📧 {emailDisplay}</div>
                        <div className="text-sm text-gray-600 dark:text-gray-400 truncate">📸 {photosCount} photos</div>
                        <div className="text-sm text-gray-600 dark:text-gray-400 truncate">🎉 Last Event: {lastEvent}</div>
                        <div className="text-sm text-gray-600 dark:text-gray-400 truncate">📅 Registered: {registeredAt}</div>
                      </div>
                    </div>
                    
                    {/* Management Actions */}
                    <div className="lg:w-80">
                      <UserManagementActions 
                        user={{
                          email: user.email,
                          name: user.name,
                          type: user.type,
                          role: user.role,
                          isActive: user.isActive,
                          mergedWith: user.mergedWith,
                        }}
                        currentUserEmail={currentUserEmail}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
