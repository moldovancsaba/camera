/**
 * Admin User Merge API
 * Version: 2.5.0
 * 
 * POST /api/admin/users/merge
 * Merge pseudo user submissions with real user account
 * 
 * Why this endpoint:
 * - Users may create submissions as pseudo user (event guest) before creating account
 * - After creating account with same email, need to link old submissions to new account
 * - Maintains historical record while unifying user identity
 * 
 * Process:
 * 1. Find all submissions where userInfo.email matches pseudo email
 * 2. Update userId and userEmail to real user's SSO credentials
 * 3. Keep userInfo for historical record
 * 4. Add mergedWith and mergedAt timestamps
 * 
 * Security:
 * - Requires admin authentication
 * - Merge is one-way and permanent
 * - All changes logged
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/session';
import { connectToDatabase } from '@/lib/db/mongodb';
import { MongoClient } from 'mongodb';
import { getSsoMongoUri } from '@/lib/db/sso';

export async function POST(request: NextRequest) {
  try {
    // Require admin authentication
    const session = await requireAdmin();
    
    // Parse request body
    const body = await request.json();
    const { pseudoEmail, realUserEmail } = body;
    
    // Validate inputs
    if (!pseudoEmail || !realUserEmail) {
      return NextResponse.json(
        { error: 'Both pseudoEmail and realUserEmail are required' },
        { status: 400 }
      );
    }
    
    // Fetch real user from SSO database to get their UUID
    const ssoClient = new MongoClient(getSsoMongoUri());
    await ssoClient.connect();
    
    let realUser;
    try {
      const ssoDb = ssoClient.db('sso');
      realUser = await ssoDb.collection('publicUsers').findOne({ email: realUserEmail });
      
      if (!realUser) {
        return NextResponse.json(
          { error: 'Real user not found in SSO database' },
          { status: 404 }
        );
      }
    } finally {
      await ssoClient.close();
    }
    
    // Connect to camera database
    const db = await connectToDatabase();
    
    // Find submissions with pseudo email
    const pseudoSubmissions = await db.collection('submissions').find({
      'userInfo.email': pseudoEmail,
    }).toArray();
    
    if (pseudoSubmissions.length === 0) {
      return NextResponse.json(
        { error: 'No submissions found for pseudo user email' },
        { status: 404 }
      );
    }
    
    // Check if any submissions are already merged
    const alreadyMerged = pseudoSubmissions.some(s => s.userInfo?.mergedWith);
    if (alreadyMerged) {
      return NextResponse.json(
        { error: 'Some submissions are already merged with another user' },
        { status: 400 }
      );
    }
    
    const now = new Date().toISOString();
    
    // Update all submissions with pseudo email
    const result = await db.collection('submissions').updateMany(
      { 'userInfo.email': pseudoEmail },
      {
        $set: {
          userId: realUser.id,
          userEmail: realUser.email,
          userName: realUser.name,
          'userInfo.mergedWith': realUser.id,
          'userInfo.mergedAt': now,
          'userInfo.mergedBy': session.user.id,
          updatedAt: now,
        },
      }
    );
    
    console.log(`✓ Merged pseudo user ${pseudoEmail} with real user ${realUserEmail} (${result.modifiedCount} submissions)`);
    
    return NextResponse.json({
      success: true,
      message: `Successfully merged ${result.modifiedCount} submissions from pseudo user to real user`,
      pseudoEmail: pseudoEmail,
      realUserEmail: realUserEmail,
      realUserId: realUser.id,
      submissionsMerged: result.modifiedCount,
      mergedAt: now,
    });
    
  } catch (error) {
    console.error('Error merging users:', error);
    return NextResponse.json(
      {
        error: 'Failed to merge users',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
