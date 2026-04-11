/**
 * Test Database Connection API Route
 * 
 * Simple endpoint to verify MongoDB Atlas connection is working.
 * This route can be removed after successful testing.
 */

import { NextResponse } from 'next/server';
import { testConnection } from '@/lib/db/mongodb';
import { blockDangerousApiInProduction } from '@/lib/api/production-guard';

export async function GET() {
  const blocked = blockDangerousApiInProduction();
  if (blocked) {
    return blocked;
  }

  try {
    const isConnected = await testConnection();
    
    if (isConnected) {
      return NextResponse.json({
        success: true,
        message: 'MongoDB connection successful',
        database: process.env.MONGODB_DB,
        timestamp: new Date().toISOString(),
      });
    } else {
      return NextResponse.json({
        success: false,
        message: 'MongoDB connection failed',
        timestamp: new Date().toISOString(),
      }, { status: 500 });
    }
  } catch (error) {
    console.error('Database test error:', error);
    return NextResponse.json({
      success: false,
      message: 'Error testing database connection',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}
