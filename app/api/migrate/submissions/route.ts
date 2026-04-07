/**
 * Migration API: Convert eventId to eventIds
 * 
 * GET /api/migrate/submissions
 * 
 * Migrates all submissions from old schema to new schema:
 * - eventId (string) -> eventIds (array)
 * - Adds isArchived, hiddenFromPartner, hiddenFromEvents fields
 * - Removes isDeleted, deletedAt fields
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { blockDangerousApiInProduction } from '@/lib/api/production-guard';

export async function GET(request: NextRequest) {
  const blocked = blockDangerousApiInProduction();
  if (blocked) {
    return blocked;
  }

  try {
    const db = await connectToDatabase();

    // Step 1: Convert eventId to eventIds array
    const result = await db.collection(COLLECTIONS.SUBMISSIONS).updateMany(
      { eventId: { $exists: true } },
      [
        {
          $set: {
            eventIds: {
              $cond: {
                if: { $eq: ["$eventId", null] },
                then: [],
                else: ["$eventId"]
              }
            },
            isArchived: { $ifNull: ["$isArchived", false] },
            hiddenFromPartner: { $ifNull: ["$hiddenFromPartner", false] },
            hiddenFromEvents: { $ifNull: ["$hiddenFromEvents", []] }
          }
        }
      ]
    );

    // Step 2: Remove old fields
    const cleanup = await db.collection(COLLECTIONS.SUBMISSIONS).updateMany(
      {},
      {
        $unset: {
          eventId: "",
          isDeleted: "",
          deletedAt: ""
        }
      }
    );

    // Count migrated documents
    const total = await db.collection(COLLECTIONS.SUBMISSIONS).countDocuments({});

    return NextResponse.json({
      success: true,
      message: 'Migration completed successfully',
      stats: {
        totalSubmissions: total,
        convertedToArray: result.modifiedCount,
        cleanedUpFields: cleanup.modifiedCount
      }
    });

  } catch (error) {
    console.error('Migration error:', error);
    return NextResponse.json(
      { 
        error: 'Migration failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
