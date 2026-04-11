/**
 * User Profile Page
 *
 * Displays detailed user profile with all submissions, consents, and event participation.
 * Accessible at /users/[name] - shows full history and photo gallery.
 *
 * Admins with Camera app access (`admin` / `superadmin`) see user management (role / active / merge) on this page.
 *
 * Note: Usernames in URLs are sanitized (spaces/special chars → underscores)
 * We search for matching names by converting both to sanitized format
 */

import { connectToDatabase } from '@/lib/db/mongodb';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { buildUserManagementPropsFromSubmissions } from '@/lib/admin/build-user-management-props';
import UserManagementActions from '@/components/admin/UserManagementActions';

export const dynamic = 'force-dynamic';

/**
 * Sanitize username for comparison
 * Replaces spaces and special characters with underscores
 */
function sanitizeUsername(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_');
}

interface PageProps {
  params: Promise<{
    name: string;
  }>;
}

export default async function UserProfilePage({ params }: PageProps) {
  const { name } = await params;
  const sanitizedUrlName = name;  // Already sanitized in URL (spaces → underscores)
  const session = await getSession();
  const viewerCanManageUsers =
    (session?.appRole === 'admin' || session?.appRole === 'superadmin') &&
    session.appAccess !== false;

  let user: any = null;
  let error = null;
  let managementProps: Awaited<
    ReturnType<typeof buildUserManagementPropsFromSubmissions>
  > = null;

  try {
    const db = await connectToDatabase();
    
    console.log('=== User Profile Debug ===');
    console.log('Looking for user with sanitized name:', sanitizedUrlName);
    
    // Get all submissions and find matching user by sanitized name comparison
    // Note: Don't filter by isArchived - we want to show all user submissions
    const allSubmissions = await db
      .collection('submissions')
      .find({})
      .sort({ createdAt: -1 })
      .toArray();
    
    console.log('Total submissions:', allSubmissions.length);
    console.log('Sample submission:', allSubmissions[0] ? {
      userId: allSubmissions[0].userId,
      userName: allSubmissions[0].userName,
      userEmail: allSubmissions[0].userEmail,
      userInfo: allSubmissions[0].userInfo,
    } : 'none');
    
    // Filter submissions where sanitized username matches the URL parameter
    const submissions = allSubmissions.filter((sub: any) => {
      const nameFromUserInfo = sub.userInfo?.name;
      const nameFromSession = sub.userName;  // From SSO session when user authenticated
      // Check multiple variations of anonymous email for backward compatibility
      const isAnonymous = sub.userId === 'anonymous' || 
                         sub.userEmail === 'anonymous@event.com' ||
                         sub.userEmail === 'anonymous@event';
      
      // Priority: userInfo (from pseudo reg) > session name (from SSO) > Anonymous > Unknown
      const actualName = nameFromUserInfo || 
                        (isAnonymous ? 'Anonymous User' : nameFromSession) || 
                        'Unknown';
      const sanitized = sanitizeUsername(actualName);
      
      console.log(`Checking submission: sanitized="${sanitized}" vs urlName="${sanitizedUrlName}" (userInfo=${nameFromUserInfo}, userName=${nameFromSession}, userEmail=${sub.userEmail}, isAnon=${isAnonymous})`);
      
      return sanitized === sanitizedUrlName;
    });

    console.log('Matched submissions:', submissions.length);
    if (submissions.length === 0) {
      console.log('No submissions found for user:', sanitizedUrlName);
      // Show all unique sanitized names to help debug
      const uniqueNames = new Set(
        allSubmissions.map((s: any) => {
          const n = s.userInfo?.name || s.userName || 'Unknown';
          return sanitizeUsername(n);
        })
      );
      console.log('Available sanitized names:', Array.from(uniqueNames).slice(0, 10));
      notFound();
    }

    if (viewerCanManageUsers) {
      managementProps = await buildUserManagementPropsFromSubmissions(
        submissions,
        session?.accessToken
      );
    }

    // Build user profile from submissions
    const firstSubmission = submissions[0];
    const hasUserInfo = firstSubmission.userInfo?.email && firstSubmission.userInfo?.name;
    const isAnonymous = !hasUserInfo && 
      (firstSubmission.userId === 'anonymous' || 
       firstSubmission.userEmail === 'anonymous@event.com' ||
       firstSubmission.userEmail === 'anonymous@event');

    // Get unique events this user participated in
    const eventsMap = new Map();
    submissions.forEach((sub: any) => {
      if (sub.eventId && !eventsMap.has(sub.eventId)) {
        eventsMap.set(sub.eventId, {
          eventId: sub.eventId,
          eventName: sub.eventName || 'Unknown Event',
          partnerName: sub.partnerName,
          firstSubmissionAt: sub.createdAt,
          submissionCount: 0,
        });
      }
      if (sub.eventId) {
        const evt = eventsMap.get(sub.eventId);
        if (evt) evt.submissionCount++;
      }
    });

    // Collect all unique consents
    const consentsMap = new Map();
    submissions.forEach((sub: any) => {
      if (sub.consents && Array.isArray(sub.consents)) {
        sub.consents.forEach((consent: any) => {
          if (!consentsMap.has(consent.pageId)) {
            consentsMap.set(consent.pageId, consent);
          }
        });
      }
    });

    user = {
      name: hasUserInfo ? firstSubmission.userInfo.name : (isAnonymous ? 'Anonymous User' : firstSubmission.userName || 'Unknown'),
      email: hasUserInfo ? firstSubmission.userInfo.email : firstSubmission.userEmail,
      isAnonymous: isAnonymous,
      registeredAt: firstSubmission.userInfo?.collectedAt || firstSubmission.createdAt,
      events: Array.from(eventsMap.values()),
      consents: Array.from(consentsMap.values()),
      submissions: submissions.map((sub: any) => ({
        _id: sub._id,
        imageUrl: sub.imageUrl,
        frameName: sub.frameName,
        eventName: sub.eventName,
        createdAt: sub.createdAt,
        playCount: sub.playCount || 0,
      })),
      totalPhotos: submissions.length,
    };

  } catch (err) {
    console.error('Error fetching user profile:', err);
    error = err instanceof Error ? err.message : 'Unknown error';
  }

  if (!user || error) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto p-8">
        {/* Navigation */}
        <div className="mb-6">
          {viewerCanManageUsers ? (
            <Link
              href="/admin/users"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              ← Back to Users List
            </Link>
          ) : (
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              ← Back to home
            </Link>
          )}
        </div>

        {viewerCanManageUsers && managementProps ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
              User management
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Assign or revoke admin rights, activate or deactivate this account, or merge a
              pseudo user with a real SSO user.
            </p>
            <UserManagementActions
              user={{
                email: managementProps.email,
                name: managementProps.name,
                type: managementProps.type,
                role: managementProps.role,
                isActive: managementProps.isActive,
                mergedWith: managementProps.mergedWith,
              }}
              currentUserEmail={session?.user.email ?? ''}
            />
          </div>
        ) : null}

        {/* User Header */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-8 mb-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
                  {user.name}
                </h1>
                {user.isAnonymous ? (
                  <span className="px-3 py-1 text-sm font-semibold bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded">
                    Anonymous
                  </span>
                ) : (
                  <span className="px-3 py-1 text-sm font-semibold bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded">
                    Registered
                  </span>
                )}
              </div>
              
              <div className="space-y-1 text-gray-600 dark:text-gray-400">
                <p className="text-lg">
                  <span className="font-medium">Email:</span> {user.isAnonymous ? 'anonymous@event.com' : user.email}
                </p>
                <p className="text-lg">
                  <span className="font-medium">Registered:</span> {new Date(user.registeredAt).toLocaleString()}
                </p>
                <p className="text-lg">
                  <span className="font-medium">Total Photos:</span> {user.totalPhotos}
                </p>
              </div>
            </div>
            
            <div className="ml-6 px-6 py-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-center">
              <div className="text-5xl font-bold text-blue-600 dark:text-blue-400">
                {user.totalPhotos}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {user.totalPhotos === 1 ? 'submission' : 'submissions'}
              </div>
            </div>
          </div>
        </div>

        {/* Events Participation */}
        {user.events.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Event Participation</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {user.events.map((event: any, idx: number) => (
                <div
                  key={`${event.eventId}-${idx}`}
                  className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg"
                >
                  <Link
                    href={
                      viewerCanManageUsers
                        ? `/admin/events/${event.eventId}`
                        : `/capture/${event.eventId}`
                    }
                    className="text-lg font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {event.eventName}
                  </Link>
                  {event.partnerName && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      Partner: {event.partnerName}
                    </p>
                  )}
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    First visit: {new Date(event.firstSubmissionAt).toLocaleDateString()}
                  </p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white mt-1">
                    {event.submissionCount} {event.submissionCount === 1 ? 'photo' : 'photos'}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Consents Accepted */}
        {user.consents.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Consents & Acceptances</h2>
            <div className="space-y-3">
              {user.consents.map((consent: any, idx: number) => (
                <div
                  key={`${consent.pageId}-${idx}`}
                  className="flex items-start gap-3 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg"
                >
                  <div className="flex-shrink-0 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                    <svg
                      className="w-4 h-4 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900 dark:text-white">
                      {consent.checkboxText}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      Accepted on {new Date(consent.acceptedAt).toLocaleString()} • {' '}
                      <span className="capitalize">{consent.pageType}</span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Photo Gallery */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Photo Gallery</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {user.submissions.map((submission: any) => (
              <Link
                key={submission._id.toString()}
                href={`/share/${submission._id}`}
                className="group relative aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700"
              >
                <img
                  src={submission.imageUrl}
                  alt={`Photo with ${submission.frameName}`}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/60 transition-colors flex flex-col justify-end p-3">
                  <div className="text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="font-semibold">{submission.frameName}</div>
                    <div className="text-gray-300">{submission.eventName}</div>
                    <div className="text-gray-300 mt-1">{new Date(submission.createdAt).toLocaleDateString()}</div>
                    {submission.playCount > 0 && (
                      <div className="text-purple-300 mt-1">🎬 {submission.playCount} plays</div>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
