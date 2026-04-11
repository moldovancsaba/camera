/**
 * Migration Script: Add frameId to Existing Frames
 * 
 * This script adds a frameId (UUID) to any existing frames in the database
 * that don't have one. All new frames are created with frameId, but older
 * frames need to be migrated.
 * 
 * Prerequisites:
 *   - MONGODB_URI environment variable must be set
 * 
 * Usage:
 *   MONGODB_URI="your-connection-string" npx tsx scripts/migrate-frames-add-frameId.ts
 *   
 *   OR if you have .env.local:
 *   source .env.local && npx tsx scripts/migrate-frames-add-frameId.ts
 */

import { connectToDatabase } from '../lib/db/mongodb';
import { COLLECTIONS, generateId } from '../lib/db/schemas';

async function migrateFrames() {
  console.log('🔄 Starting frame migration...\n');

  const db = await connectToDatabase();
  const framesCollection = db.collection(COLLECTIONS.FRAMES);

  // Find all frames without frameId
  const framesWithoutId = await framesCollection.find({ frameId: { $exists: false } }).toArray();

  console.log(`Found ${framesWithoutId.length} frames without frameId\n`);

  if (framesWithoutId.length === 0) {
    console.log('✅ All frames already have frameId. No migration needed.');
    process.exit(0);
  }

  let successCount = 0;
  let errorCount = 0;

  // Add frameId to each frame
  for (const frame of framesWithoutId) {
    const frameId = generateId();
    
    try {
      await framesCollection.updateOne(
        { _id: frame._id },
        { 
          $set: { 
            frameId,
            updatedAt: new Date().toISOString()
          } 
        }
      );
      
      console.log(`✅ Added frameId to frame: ${frame.name} (${frameId})`);
      successCount++;
    } catch (error) {
      console.error(`❌ Failed to add frameId to frame: ${frame.name}`, error);
      errorCount++;
    }
  }

  console.log('\n📊 Migration Summary:');
  console.log(`   Success: ${successCount}`);
  console.log(`   Errors: ${errorCount}`);
  console.log(`   Total: ${framesWithoutId.length}`);

  if (errorCount === 0) {
    console.log('\n✅ Migration completed successfully!');
  } else {
    console.log('\n⚠️  Migration completed with errors. Please review.');
  }

  process.exit(0);
}

migrateFrames().catch((error) => {
  console.error('💥 Migration failed:', error);
  process.exit(1);
});
