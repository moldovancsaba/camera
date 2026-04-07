/**
 * Debug API to check users data from submissions
 * Temporary debugging endpoint
 */

import { connectToDatabase } from '@/lib/db/mongodb';
import { NextResponse } from 'next/server';
import { blockDangerousApiInProduction } from '@/lib/api/production-guard';

export async function GET() {
  const blocked = blockDangerousApiInProduction();
  if (blocked) {
    return blocked;
  }

  try {
    const db = await connectToDatabase();
    
    const submissions = await db
      .collection('submissions')
      .find({ isArchived: false })
      .limit(20)
      .toArray();

    // Group submissions by user identifier
    const userMap = new Map<string, any>();
    
    for (const submission of submissions) {
      const hasUserInfo = submission.userInfo?.email && submission.userInfo?.name;
      const identifier = hasUserInfo 
        ? submission.userInfo.email 
        : submission.userId || submission.userEmail;
      
      const isAnonymous = !hasUserInfo && 
        (submission.userId === 'anonymous' || submission.userEmail === 'anonymous@event');
      
      if (!userMap.has(identifier)) {
        userMap.set(identifier, {
          identifier,
          email: hasUserInfo ? submission.userInfo.email : submission.userEmail,
          name: hasUserInfo ? submission.userInfo.name : (isAnonymous ? 'Anonymous User' : submission.userName || 'Unknown'),
          isAnonymous: isAnonymous,
          userId: submission.userId,
          userName: submission.userName,
          userEmail: submission.userEmail,
          hasUserInfo: hasUserInfo,
          userInfo: submission.userInfo,
          count: 0,
        });
      }
      
      userMap.get(identifier).count++;
    }

    const users = Array.from(userMap.values());

    return NextResponse.json({
      totalSubmissions: submissions.length,
      uniqueUsers: users.length,
      users: users,
      rawSample: submissions.slice(0, 3).map(s => ({
        _id: s._id,
        userId: s.userId,
        userEmail: s.userEmail,
        userName: s.userName,
        userInfo: s.userInfo,
        isArchived: s.isArchived,
      })),
    });
  } catch (error) {
    console.error('Debug API error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
