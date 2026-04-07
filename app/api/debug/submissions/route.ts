/**
 * Debug Submissions Endpoint
 * Check what submissions exist with userInfo
 */

import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { withErrorHandler, requireAuth, apiSuccess } from '@/lib/api';
import { blockDangerousApiInProduction } from '@/lib/api/production-guard';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const blocked = blockDangerousApiInProduction();
  if (blocked) {
    return blocked;
  }

  await requireAuth();

  const db = await connectToDatabase();

  // Get all submissions
  const allSubmissions = await db.collection('submissions')
    .find({})
    .limit(10)
    .toArray();

  // Get submissions with userInfo
  const withUserInfo = await db.collection('submissions')
    .find({ 'userInfo.email': { $exists: true } })
    .limit(10)
    .toArray();

  // Get count with userInfo
  const countWithUserInfo = await db.collection('submissions')
    .countDocuments({ 'userInfo.email': { $exists: true } });

  // Sample submission to see structure
  const sampleSubmission = allSubmissions[0];

  return apiSuccess({
    totalSubmissions: allSubmissions.length,
    countWithUserInfo,
    sampleSubmission,
    withUserInfoSample: withUserInfo[0],
    allUserInfoEmails: withUserInfo.map(s => s.userInfo?.email),
  });
});
