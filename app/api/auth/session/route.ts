/**
 * Session API Route
 * 
 * Returns current user session information
 * Used by capture flow to resume after SSO authentication
 */

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';

export async function GET() {
  try {
    const session = await getSession();
    
    if (!session) {
      return NextResponse.json({
        authenticated: false,
        user: null,
      });
    }
    
    return NextResponse.json({
      authenticated: true,
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        role: session.user.role,
      },
    });
  } catch (error) {
    console.error('Error fetching session:', error);
    return NextResponse.json({
      authenticated: false,
      user: null,
    }, { status: 500 });
  }
}
