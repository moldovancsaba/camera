/**
 * Public Share Page
 * 
 * Displays shared photo submissions with Open Graph meta tags.
 */

import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { ObjectId } from 'mongodb';
import type { Db } from 'mongodb';
import Image from 'next/image';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';

interface Props {
  params: Promise<{ id: string }>;
}

async function resolveEventForSubmission(
  db: Db,
  submission: Record<string, unknown>
): Promise<{ mongoId: string; name: string } | null> {
  const eventLookupKey =
    (Array.isArray(submission.eventIds) && submission.eventIds[0]) ||
    submission.eventId ||
    null;
  if (!eventLookupKey || !String(eventLookupKey).trim()) return null;
  const key = String(eventLookupKey).trim();
  const orClauses: Record<string, unknown>[] = [{ eventId: key }];
  if (ObjectId.isValid(key)) {
    orClauses.push({ _id: new ObjectId(key) });
  }
  const eventDoc = await db
    .collection(COLLECTIONS.EVENTS)
    .findOne({ $or: orClauses });
  if (!eventDoc?._id) return null;
  const name =
    typeof eventDoc.name === 'string' && eventDoc.name.trim()
      ? eventDoc.name.trim()
      : 'Event';
  return { mongoId: eventDoc._id.toString(), name };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { id } = await params;
    const db = await connectToDatabase();
    const submission = await db
      .collection(COLLECTIONS.SUBMISSIONS)
      .findOne({ _id: new ObjectId(id) });

    if (!submission) {
      return {
        title: 'Photo Not Found',
      };
    }

    const event = await resolveEventForSubmission(db, submission);
    const eventLabel = event?.name ?? 'Shared photo';
    const userName =
      typeof submission.userName === 'string' ? submission.userName : 'Guest';

    return {
      title: `Photo by ${userName} — ${eventLabel}`,
      description: `Photo from ${eventLabel}`,
      openGraph: {
        title: `Photo by ${userName}`,
        description: `From ${eventLabel}`,
        images: [
          {
            url: submission.imageUrl,
            width: 1200,
            height: 1200,
            alt: `Photo by ${userName}`,
          },
        ],
        type: 'website',
      },
      twitter: {
        card: 'summary_large_image',
        title: `Photo by ${userName}`,
        description: `From ${eventLabel}`,
        images: [submission.imageUrl],
      },
    };
  } catch (error) {
    console.error('Error generating metadata:', error);
    return {
      title: 'Photo',
    };
  }
}

export default async function SharePage({ params }: Props) {
  let submission: any = null;
  
  try {
    const { id } = await params;
    const db = await connectToDatabase();
    submission = await db
      .collection(COLLECTIONS.SUBMISSIONS)
      .findOne({ _id: new ObjectId(id) });
  } catch (error) {
    console.error('Error fetching submission:', error);
  }

  if (!submission) {
    notFound();
  }

  const db = await connectToDatabase();
  const event = await resolveEventForSubmission(db, submission);

  // `/capture/[eventId]` expects the event document Mongo `_id`, while submissions often store public `eventId` UUID in `eventIds` / `eventId`.
  let createYourOwnHref = '/capture';
  if (event?.mongoId) {
    createYourOwnHref = `/capture/${event.mongoId}`;
  }

  const headline = event?.name ?? 'Shared photo';

  return (
    <div className="min-h-screen bg-transparent py-12">
      <div className="max-w-4xl mx-auto px-4">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">{headline}</h1>
          <p className="text-slate-300">
            Photo by{' '}
            <span className="font-semibold">{submission.userName}</span>
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 mb-6">
          <div 
            className="relative bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden mb-4 mx-auto"
            style={{
              aspectRatio: submission.metadata?.finalWidth && submission.metadata?.finalHeight 
                ? `${submission.metadata.finalWidth} / ${submission.metadata.finalHeight}`
                : '1',
              maxWidth: '100%',
            }}
          >
            <Image
              src={submission.imageUrl}
              alt="Shared photo"
              fill
              className="object-contain"
              unoptimized
            />
          </div>

          <div className="flex items-center justify-end text-sm text-gray-600 dark:text-gray-400 mb-6">
            <span>{new Date(submission.createdAt).toLocaleDateString()}</span>
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
            <a
              href={submission.imageUrl}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors text-center"
            >
              💾 Download
            </a>
            <a
              href={createYourOwnHref}
              className="flex-1 px-6 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors text-center"
            >
              📸 Create Your Own
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
