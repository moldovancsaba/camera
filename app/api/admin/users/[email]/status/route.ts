/**
 * Admin User Status Management API
 * Version: 2.5.0
 * 
 * PATCH /api/admin/users/[email]/status
 * Activate or deactivate users (real or pseudo)
 * 
 * Why this endpoint:
 * - Administrators need to temporarily disable user accounts
 * - Inactive users cannot login (real users)
 * - Inactive users' submissions are hidden from public views
 * 
 * User Types:
 * - real: SSO authenticated users (update SSO database)
 * - pseudo: Event guests (update camera submissions)
 * - administrator: SSO authenticated admins (update SSO database)
 * 
 * Security:
 * - Requires admin authentication
 * - Cannot deactivate yourself
 * - All changes logged with timestamp and admin ID
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/session';
import { connectToDatabase } from '@/lib/db/mongodb';
import { MongoClient } from 'mongodb';
import { getSsoMongoUri } from '@/lib/db/sso';

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ email: string }> }
) {
  try {
    // Require admin authentication
    const session = await requireAdmin();
    const { email } = await context.params;
    
    // Parse request body
    const body = await request.json();
    const { isActive, userType } = body;
    
    // Validate inputs
    if (typeof isActive !== 'boolean') {
      return NextResponse.json(
        { error: 'isActive must be a boolean' },
        { status: 400 }
      );
    }
    
    if (!userType || !['real', 'pseudo', 'administrator'].includes(userType)) {
      return NextResponse.json(
        { error: 'Invalid userType. Must be "real", "pseudo", or "administrator"' },
        { status: 400 }
      );
    }
    
    // Decode email from URL
    const decodedEmail = decodeURIComponent(email);
    
    // Prevent self-deactivation
    if (decodedEmail === session.user.email && !isActive) {
      return NextResponse.json(
        { error: 'Cannot deactivate yourself' },
        { status: 403 }
      );
    }
    
    const now = new Date().toISOString();
    
    // Handle real users and administrators (stored in SSO database)
    if (userType === 'real' || userType === 'administrator') {
      const client = new MongoClient(getSsoMongoUri());
      await client.connect();
      
      try {
        const db = client.db('sso');
        
        // Update user status in SSO publicUsers collection
        const updateFields: any = {
          isActive: isActive,
          updatedAt: now,
          statusChangedBy: session.user.id,
          statusChangedAt: now,
        };
        
        // Add deactivation info if deactivating
        if (!isActive) {
          updateFields.deactivatedAt = now;
          updateFields.deactivatedBy = session.user.id;
        } else {
          // Remove deactivation info if reactivating
          updateFields.deactivatedAt = null;
          updateFields.deactivatedBy = null;
        }
        
        const result = await db.collection('publicUsers').updateOne(
          { email: decodedEmail },
          { $set: updateFields }
        );
        
        if (result.matchedCount === 0) {
          return NextResponse.json(
            { error: 'User not found in SSO database' },
            { status: 404 }
          );
        }
        
        console.log(`✓ User status updated: ${decodedEmail} → ${isActive ? 'active' : 'inactive'} (by ${session.user.email})`);
        
        return NextResponse.json({
          success: true,
          message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
          email: decodedEmail,
          isActive: isActive,
          userType: userType,
        });
        
      } finally {
        await client.close();
      }
    }
    
    // Handle pseudo users (stored in camera submissions)
    if (userType === 'pseudo') {
      const db = await connectToDatabase();
      
      // Update all submissions with this userInfo.email
      const result = await db.collection('submissions').updateMany(
        { 'userInfo.email': decodedEmail },
        {
          $set: {
            'userInfo.isActive': isActive,
            'userInfo.statusChangedBy': session.user.id,
            'userInfo.statusChangedAt': now,
            updatedAt: now,
          },
        }
      );
      
      if (result.matchedCount === 0) {
        return NextResponse.json(
          { error: 'No submissions found for this pseudo user' },
          { status: 404 }
        );
      }
      
      console.log(`✓ Pseudo user status updated: ${decodedEmail} → ${isActive ? 'active' : 'inactive'} (${result.modifiedCount} submissions)`);
      
      return NextResponse.json({
        success: true,
        message: `Pseudo user ${isActive ? 'activated' : 'deactivated'} successfully`,
        email: decodedEmail,
        isActive: isActive,
        userType: userType,
        submissionsUpdated: result.modifiedCount,
      });
    }
    
  } catch (error) {
    console.error('Error updating user status:', error);
    return NextResponse.json(
      {
        error: 'Failed to update user status',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
