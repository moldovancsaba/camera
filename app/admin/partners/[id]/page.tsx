/**
 * Partner Detail Page
 * 
 * Display partner details with list of events and frames
 * v2.8.0: Added default styles display for child event inheritance
 */

import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { COLLECTIONS } from '@/lib/db/schemas';
import { ObjectId } from 'mongodb';
import Image from 'next/image';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import DeletePartnerButton from '@/components/admin/DeletePartnerButton';
import StyleSections from '@/components/admin/StyleSections';
import PartnerUserAccessManager from '@/components/admin/PartnerUserAccessManager';
import { FUNFITFAN_PARTNER_ID } from '@/lib/funfitfan/constants';
import { listPartnerUserAccess } from '@/lib/partners/access';
import {
  getPartnerScopedAccessForPartner,
  isGlobalAdminSession,
  listSessionPartnerAssignments,
} from '@/lib/partners/authorization';

interface FrameDetailsDoc {
  frameId: string;
  name?: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  hashtags?: string[];
}

interface LogoAssignmentDoc {
  logoId: string;
  position?: string;
  maxWidthPercent?: number;
}

interface LogoDoc {
  logoId: string;
  name?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
}

interface PartnerDoc {
  _id: ObjectId;
  partnerId: string;
  name: string;
  description?: string;
  isActive?: boolean;
  contactName?: string;
  contactEmail?: string;
  createdAt: string;
  updatedAt: string;
  defaultBrandColors?: { primary?: string; secondary?: string };
  defaultFrames?: string[];
  defaultLogos?: LogoAssignmentDoc[];
  frameCount?: number;
  defaultFramesWithDetails?: Array<{
    frameId: string;
    isActive: boolean;
    frameDetails: FrameDetailsDoc | null;
  }>;
  defaultLogosWithDetails?: Array<LogoAssignmentDoc & {
    isActive: boolean;
    name?: string;
    imageUrl?: string;
    thumbnailUrl?: string;
  }>;
}

interface EventDoc {
  _id: ObjectId;
  name: string;
  description?: string;
  eventDate?: string;
  location?: string;
  isActive?: boolean;
  frames?: Array<{ frameId: string }>;
}

interface SubmissionDoc {
  _id: ObjectId;
  imageUrl?: string;
  finalImageUrl?: string;
  userName?: string;
  userEmail?: string;
  eventName?: string;
  createdAt: string;
}

interface PartnerAccessAssignmentDoc {
  accessId: string;
  partnerId: string;
  partnerName: string;
  userId?: string | null;
  userEmail: string;
  userName?: string | null;
  appKey: 'events' | 'gym';
  role: 'viewer' | 'manager' | 'admin';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export default async function PartnerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  
  // Validate ObjectId format
  if (!ObjectId.isValid(id)) {
    notFound();
  }

  let partner: PartnerDoc | null = null;
  let events: EventDoc[] = [];
  let submissions: SubmissionDoc[] = [];
  let partnerAccessAssignments: PartnerAccessAssignmentDoc[] = [];
  let participantCount = 0;
  let dbError = null;
  const session = await getSession();
  const canManagePartner = isGlobalAdminSession(session);
  let canManageEvents = isGlobalAdminSession(session);
  let canAccessGym = isGlobalAdminSession(session);

  try {
    const db = await connectToDatabase();
    
    // Get partner details
    partner = await db
      .collection(COLLECTIONS.PARTNERS)
      .findOne({ _id: new ObjectId(id) }) as unknown as PartnerDoc | null;

    if (!partner) {
      notFound();
    }

    const workspaceAccess = await getPartnerScopedAccessForPartner(db, session!, partner.partnerId);
    if (!workspaceAccess.allowed) {
      redirect('/admin/partners');
    }

    const assignments = await listSessionPartnerAssignments(db, session!);
    if (!isGlobalAdminSession(session)) {
      canManageEvents = assignments.some(
        (assignment) =>
          assignment.partnerId === partner!.partnerId &&
          assignment.appKey === 'events' &&
          assignment.isActive &&
          (assignment.role === 'manager' || assignment.role === 'admin')
      );
      canAccessGym = assignments.some(
        (assignment) =>
          assignment.partnerId === partner!.partnerId &&
          assignment.appKey === 'gym' &&
          assignment.isActive
      );
    }

    // Get events for this partner
    events = await db
      .collection(COLLECTIONS.EVENTS)
      .find({ partnerId: partner.partnerId })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray() as unknown as EventDoc[];

    // Get submissions for all events under this partner (limit to most recent 50)
    // NEW: Updated query for new schema with archive and hidden checks
    submissions = await db
      .collection(COLLECTIONS.SUBMISSIONS)
      .find({
        partnerId: partner.partnerId,
        isArchived: false,              // NEW: Exclude archived submissions
        hiddenFromPartner: false        // NEW: Exclude hidden from partner
      })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray() as unknown as SubmissionDoc[];

    const participantRows = await db
      .collection(COLLECTIONS.SUBMISSIONS)
      .aggregate([
        {
          $match: {
            partnerId: partner.partnerId,
            isArchived: false,
            hiddenFromPartner: false,
          },
        },
        {
          $project: {
            participantKey: {
              $ifNull: [
                '$userInfo.email',
                {
                  $ifNull: [
                    '$userEmail',
                    '$userId',
                  ],
                },
              ],
            },
          },
        },
        {
          $match: {
            participantKey: { $type: 'string', $ne: '' },
          },
        },
        {
          $group: {
            _id: '$participantKey',
          },
        },
      ])
      .toArray();
    participantCount = participantRows.length;
    partnerAccessAssignments = await listPartnerUserAccess(db, partner.partnerId) as unknown as PartnerAccessAssignmentDoc[];

    // Populate frame details for default frames (v2.8.0)
    if (partner.defaultFrames && partner.defaultFrames.length > 0) {
      const frames = await db
        .collection(COLLECTIONS.FRAMES)
        .find({ frameId: { $in: partner.defaultFrames } })
        .toArray() as unknown as FrameDetailsDoc[];
      
      // Map frame details to assignments
      partner.defaultFramesWithDetails = partner.defaultFrames.map((frameId: string) => {
        const frameDetails = frames.find((frame) => frame.frameId === frameId);
        return {
          frameId,
          isActive: true,
          frameDetails: frameDetails ? {
            frameId: frameDetails.frameId,
            name: frameDetails.name,
            thumbnailUrl: frameDetails.thumbnailUrl,
            width: frameDetails.width,
            height: frameDetails.height,
            hashtags: frameDetails.hashtags,
          } : null
        };
      });
    }

    // Populate logo details for default logos (v2.8.0)
    if (partner.defaultLogos && partner.defaultLogos.length > 0) {
      const logoIds = partner.defaultLogos.map((logoAssignment) => logoAssignment.logoId);
      const logos = await db
        .collection(COLLECTIONS.LOGOS)
        .find({ logoId: { $in: logoIds } })
        .toArray() as unknown as LogoDoc[];
      
      // Merge logo details
      partner.defaultLogosWithDetails = partner.defaultLogos.map((logoAssignment) => {
        const logo = logos.find((entry) => entry.logoId === logoAssignment.logoId);
        return {
          ...logoAssignment,
          isActive: true,
          name: logo?.name,
          imageUrl: logo?.imageUrl,
          thumbnailUrl: logo?.thumbnailUrl,
        };
      });
    }

  } catch (error) {
    console.error('Error fetching partner details:', error);
    dbError = error instanceof Error ? error.message : 'Unknown error';
  }

  if (!partner) {
    notFound();
  }

  const isFunFitFanPartner = partner.partnerId === FUNFITFAN_PARTNER_ID;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-2">
          <Link href="/admin/partners" className="hover:text-gray-700 dark:hover:text-gray-200">
            Partners
          </Link>
          <span>→</span>
          <span>{partner.name}</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{partner.name}</h1>
            {partner.description && (
              <p className="text-gray-600 dark:text-gray-400 mt-2">{partner.description}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {canManagePartner ? (
              <Link
                href={`/admin/partners/${id}/edit`}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
              >
                Edit Partner
              </Link>
            ) : null}
            <span className={`inline-flex px-3 py-2 text-sm font-semibold rounded-lg ${
              partner.isActive
                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400'
            }`}>
              {partner.isActive ? '● Active' : '○ Inactive'}
            </span>
          </div>
        </div>
      </div>

      {dbError && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-red-800 dark:text-red-200 font-medium">Error loading data</p>
          <p className="text-red-600 dark:text-red-300 text-sm mt-1">{dbError}</p>
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-5">
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">
            Workspace
          </p>
          <h2 className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">Partner Operations</h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Use this page as the operating home for this partner’s resources, app surfaces, and gallery context.
          </p>
        </div>

        <Link
          href={`/admin/partners/${id}/frames`}
          className="rounded-lg border border-blue-200 bg-blue-50 p-5 shadow-sm transition-colors hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-900/20 dark:hover:bg-blue-900/30"
        >
          <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">Resources</p>
          <p className="mt-2 text-sm text-blue-800 dark:text-blue-200">
            Manage default frames and logos in partner context instead of starting from the global inventory.
          </p>
        </Link>

        <Link
          href={canManageEvents ? `/admin/events/new?partnerId=${partner.partnerId}` : '/admin/events'}
          className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 shadow-sm transition-colors hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/30"
        >
          <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">Events App</p>
          <p className="mt-2 text-sm text-emerald-800 dark:text-emerald-200">
            {canManageEvents
              ? 'Create and manage the event app instances that use this partner’s brand defaults and resource assignments.'
              : 'Review the event app instances that use this partner’s brand defaults and resource assignments.'}
          </p>
        </Link>

        {isFunFitFanPartner ? (
          <div className="rounded-lg border border-violet-200 bg-violet-50 p-5 shadow-sm dark:border-violet-800 dark:bg-violet-900/20">
            <p className="text-sm font-semibold text-violet-900 dark:text-violet-100">Gym App</p>
            <p className="mt-2 text-sm text-violet-800 dark:text-violet-200">
              This partner is the dedicated Gym workspace. Use the app settings entry to manage the member experience.
            </p>
            <div className="mt-4">
              {canAccessGym ? (
                <Link
                  href="/admin/gym/funfitfan"
                  className="inline-flex rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-700"
                >
                  Open Gym Settings
                </Link>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-violet-200 bg-violet-50 p-5 shadow-sm dark:border-violet-800 dark:bg-violet-900/20">
            <p className="text-sm font-semibold text-violet-900 dark:text-violet-100">Gym App</p>
            <p className="mt-2 text-sm text-violet-800 dark:text-violet-200">
              Gym currently uses dedicated app-scoped configuration. Keep this partner page focused on shared resources and event operations.
            </p>
            <div className="mt-4">
              {canAccessGym ? (
                <Link
                  href="/admin/gym"
                  className="inline-flex rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-700"
                >
                  Open Gym App
                </Link>
              ) : null}
            </div>
          </div>
        )}

        {canManagePartner ? (
          <Link
            href="/admin/users"
            className="rounded-lg border border-amber-200 bg-amber-50 p-5 shadow-sm transition-colors hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-900/20 dark:hover:bg-amber-900/30"
          >
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">Users</p>
            <p className="mt-2 text-sm text-amber-800 dark:text-amber-200">
              View global access-managed users and submission-derived guest identities that show up in this partner’s activity.
            </p>
          </Link>
        ) : null}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Partner Information */}
        <div className="lg:col-span-1 space-y-6">
          {/* Basic Info Card */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Partner Information</h2>
            <dl className="space-y-3">
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Partner ID</dt>
                <dd className="mt-1 text-sm text-gray-900 dark:text-white font-mono">{partner.partnerId}</dd>
              </div>
              {partner.contactName && (
                <div>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Contact Person</dt>
                  <dd className="mt-1 text-sm text-gray-900 dark:text-white">{partner.contactName}</dd>
                </div>
              )}
              {partner.contactEmail && (
                <div>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Contact Email</dt>
                  <dd className="mt-1 text-sm text-gray-900 dark:text-white">
                    <a href={`mailto:${partner.contactEmail}`} className="text-blue-600 hover:text-blue-800 dark:text-blue-400">
                      {partner.contactEmail}
                    </a>
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Created</dt>
                <dd className="mt-1 text-sm text-gray-900 dark:text-white">
                  {new Date(partner.createdAt).toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Last Updated</dt>
                <dd className="mt-1 text-sm text-gray-900 dark:text-white">
                  {new Date(partner.updatedAt).toLocaleString()}
                </dd>
              </div>
            </dl>
          </div>

          {/* Statistics Card */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Statistics</h2>
            <dl className="space-y-3">
              <div className="flex items-center justify-between">
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Events</dt>
                <dd className="text-2xl font-bold text-gray-900 dark:text-white">{events.length}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Frames</dt>
                <dd className="text-2xl font-bold text-gray-900 dark:text-white">{partner.frameCount || 0}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Photos</dt>
                <dd className="text-2xl font-bold text-gray-900 dark:text-white">{submissions.length}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Participants</dt>
                <dd className="text-2xl font-bold text-gray-900 dark:text-white">{participantCount}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">User assignments</dt>
                <dd className="text-2xl font-bold text-gray-900 dark:text-white">{partnerAccessAssignments.length}</dd>
              </div>
            </dl>
            <Link
              href={`/admin/partners/${id}#gallery`}
              className="mt-4 block w-full px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors text-center"
            >
              View Gallery →
            </Link>
          </div>

          {/* Delete Partner Card */}
          {canManagePartner ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Danger Zone</h2>
              <DeletePartnerButton
                partnerId={id}
                partnerName={partner.name}
                hasEvents={events.length > 0}
                eventCount={events.length}
              />
            </div>
          ) : null}
        </div>

        {/* Right Column - Resources and App Instances */}
        <div className="lg:col-span-2 space-y-6">
          {canManagePartner ? (
            <PartnerUserAccessManager
              partnerMongoId={id}
              initialAssignments={partnerAccessAssignments.map((assignment) => ({
                accessId: assignment.accessId,
                partnerId: assignment.partnerId,
                partnerName: assignment.partnerName,
                userId: assignment.userId ?? null,
                userEmail: assignment.userEmail,
                userName: assignment.userName ?? null,
                appKey: assignment.appKey,
                role: assignment.role,
                isActive: assignment.isActive,
                createdAt: assignment.createdAt,
                updatedAt: assignment.updatedAt,
              }))}
            />
          ) : null}

          {/* Default Styles Section - Using Unified StyleSections Component */}
          <StyleSections
            type="partner"
            id={id}
            name={partner.name}
            brandColor={partner.defaultBrandColors?.primary}
            brandBorderColor={partner.defaultBrandColors?.secondary}
            frames={partner.defaultFramesWithDetails || []}
            logos={partner.defaultLogosWithDetails || []}
          />

          {/* Events List */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Events App</h2>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    Event app instances that inherit this partner’s defaults and can override them when needed.
                  </p>
                </div>
                {canManageEvents ? (
                  <Link
                    href={`/admin/events/new?partnerId=${partner.partnerId}`}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
                  >
                    + Add Event
                  </Link>
                ) : null}
              </div>
            </div>

            {events.length === 0 ? (
              <div className="p-12 text-center">
                <div className="text-5xl mb-4">🎯</div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">No events yet</h3>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  Create your first event for this partner
                </p>
                {canManageEvents ? (
                  <Link
                    href={`/admin/events/new?partnerId=${partner.partnerId}`}
                    className="inline-flex px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
                  >
                    Create Event
                  </Link>
                ) : null}
              </div>
            ) : (
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {events.map((event) => (
                  <div key={event._id.toString()} className="p-6 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <Link
                          href={`/admin/events/${event._id}`}
                          className="text-lg font-medium text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400"
                        >
                          {event.name}
                        </Link>
                        {event.description && (
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            {event.description}
                          </p>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-sm text-gray-500 dark:text-gray-400">
                          {event.eventDate && (
                            <span>📅 {new Date(event.eventDate).toLocaleDateString()}</span>
                          )}
                          {event.location && (
                            <span>📍 {event.location}</span>
                          )}
                          <span>🖼️ {event.frames?.length || 0} frames</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 ml-4">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          event.isActive
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400'
                        }`}>
                          {event.isActive ? '● Active' : '○ Inactive'}
                        </span>
                        {canManageEvents ? (
                          <Link
                            href={`/admin/events/${event._id}/edit`}
                            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 text-sm font-medium"
                          >
                            Edit
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Partner Gallery Section */}
      <div id="gallery" className="mt-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
              📷 Partner Gallery
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              All photos captured across {partner.name}&apos;s events
            </p>
          </div>

          {submissions.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-5xl mb-4">📸</div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                No submissions yet
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Photos captured at this partner&apos;s events will appear here
              </p>
              {events.length > 0 && (
                <Link
                  href={`/capture/${events[0]._id}`}
                  className="inline-flex px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
                >
                  📸 Start Capturing
                </Link>
              )}
            </div>
          ) : (
            <div className="p-6">
              {/* Pinterest-style masonry grid */}
              <div className="columns-2 md:columns-3 lg:columns-4 xl:columns-5 gap-4">
                {submissions.map((submission) => (
                  <Link
                    key={submission._id.toString()}
                    href={`/share/${submission._id}`}
                    className="group relative bg-gray-100 dark:bg-gray-900 rounded-lg overflow-hidden hover:ring-2 hover:ring-blue-500 transition-all mb-4 break-inside-avoid block"
                  >
                    <Image
                      src={submission.imageUrl || submission.finalImageUrl || ''}
                      alt={`Photo by ${submission.userName || submission.userEmail}`}
                      width={1200}
                      height={1600}
                      unoptimized
                      className="w-full h-auto"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="absolute bottom-0 left-0 right-0 p-2">
                        <p className="text-white text-xs font-medium truncate">
                          {submission.eventName || 'General'}
                        </p>
                        <p className="text-white/80 text-xs truncate">
                          {submission.userName || submission.userEmail}
                        </p>
                        <p className="text-white/60 text-xs">
                          {new Date(submission.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
              {submissions.length >= 50 && (
                <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-6">
                  Showing the 50 most recent submissions
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
