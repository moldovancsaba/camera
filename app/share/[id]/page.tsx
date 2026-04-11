/**
 * Public Share Page
 * 
 * Displays shared photo submissions with Open Graph meta tags.
 */

import { connectToDatabase } from '@/lib/db/mongodb';
import { ObjectId } from 'mongodb';
import Image from 'next/image';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { id } = await params;
    const db = await connectToDatabase();
    const submission = await db
      .collection('submissions')
      .findOne({ _id: new ObjectId(id) });

    if (!submission) {
      return {
        title: 'Photo Not Found',
      };
    }

    return {
      title: `Photo by ${submission.userName} - Camera`,
      description: `Check out this photo created with ${submission.frameName} frame on Camera`,
      openGraph: {
        title: `Photo by ${submission.userName}`,
        description: `Created with ${submission.frameName} frame`,
        images: [
          {
            url: submission.imageUrl,
            width: 1200,
            height: 1200,
            alt: `Photo by ${submission.userName}`,
          },
        ],
        type: 'website',
      },
      twitter: {
        card: 'summary_large_image',
        title: `Photo by ${submission.userName}`,
        description: `Created with ${submission.frameName} frame`,
        images: [submission.imageUrl],
      },
    };
  } catch (error) {
    console.error('Error generating metadata:', error);
    return {
      title: 'Photo - Camera',
    };
  }
}

export default async function SharePage({ params }: Props) {
  let submission: any = null;
  
  try {
    const { id } = await params;
    const db = await connectToDatabase();
    submission = await db
      .collection('submissions')
      .findOne({ _id: new ObjectId(id) });
  } catch (error) {
    console.error('Error fetching submission:', error);
  }

  if (!submission) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 py-12">
      <div className="max-w-4xl mx-auto px-4">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
            📸 Camera
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Photo by <span className="font-semibold">{submission.userName}</span>
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

          <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400 mb-6">
            <span>Frame: <span className="font-medium">{submission.frameName}</span></span>
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
              href="/"
              className="flex-1 px-6 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors text-center"
            >
              📸 Create Your Own
            </a>
          </div>
        </div>

        <div className="text-center">
          <a
            href="/"
            className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            ← Back to Camera
          </a>
        </div>
      </div>
    </div>
  );
}
