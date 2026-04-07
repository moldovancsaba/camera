/**
 * Admin User Role Management API
 * Version: 2.5.0
 * 
 * PATCH /api/admin/users/[email]/role
 * Updates user role in SSO database (user ↔ admin)
 * 
 * Why this endpoint:
 * - Administrators need to promote users to admin or demote admins to user
 * - Role changes stored in SSO database (publicUsers collection)
 * - User must logout and login again for role change to take effect
 * 
 * Security:
 * - Requires admin authentication
 * - Cannot demote yourself
 * - All changes logged with timestamp and admin ID
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/session';
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
    const { role } = body;
    
    // Validate role
    if (!role || !['user', 'admin'].includes(role)) {
      return NextResponse.json(
        { error: 'Invalid role. Must be "user" or "admin"' },
        { status: 400 }
      );
    }
    
    // Decode email from URL
    const decodedEmail = decodeURIComponent(email);
    
    // Prevent self-demotion
    if (decodedEmail === session.user.email && role === 'user') {
      return NextResponse.json(
        { error: 'Cannot demote yourself from admin' },
        { status: 403 }
      );
    }
    
    // Connect to SSO database
    const client = new MongoClient(getSsoMongoUri());
    await client.connect();
    
    try {
      const db = client.db('sso');
      
      // Update user role in SSO publicUsers collection
      const result = await db.collection('publicUsers').updateOne(
        { email: decodedEmail },
        {
          $set: {
            role: role,
            updatedAt: new Date().toISOString(),
            roleChangedBy: session.user.id,
            roleChangedAt: new Date().toISOString(),
          },
        }
      );
      
      if (result.matchedCount === 0) {
        return NextResponse.json(
          { error: 'User not found in SSO database' },
          { status: 404 }
        );
      }
      
      console.log(`✓ User role updated: ${decodedEmail} → ${role} (by ${session.user.email})`);
      
      return NextResponse.json({
        success: true,
        message: `User role updated to ${role}. User must logout and login again for changes to take effect.`,
        email: decodedEmail,
        role: role,
      });
      
    } finally {
      await client.close();
    }
    
  } catch (error) {
    console.error('Error updating user role:', error);
    return NextResponse.json(
      {
        error: 'Failed to update user role',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
