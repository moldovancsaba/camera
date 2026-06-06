/**
 * Cleanup Orphaned Frame References
 * Removes frame references from events that no longer exist in the frames collection
 */

import { MongoClient, ObjectId } from 'mongodb';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || 'camera';
const eventMongoId = process.env.EVENT_MONGO_ID;

if (!uri || !eventMongoId) {
  console.error('Required environment variables are missing.');
  process.exit(1);
}

const client = new MongoClient(uri);

try {
  console.log('🔌 Connecting to MongoDB...');
  await client.connect();
  const db = client.db(dbName);
  
  // Get the event
  console.log(`\n📋 Fetching event ${eventMongoId}...`);
  const event = await db.collection('events').findOne({ _id: new ObjectId(eventMongoId) });
  
  if (!event) {
    console.log('❌ Event not found!');
    process.exit(1);
  }
  
  console.log(`✅ Found event: ${event.name}`);
  console.log(`   Event UUID: ${event.eventId}`);
  console.log(`   Frames in array: ${event.frames?.length || 0}`);
  
  if (!event.frames || event.frames.length === 0) {
    console.log('\n✅ Event has no frame assignments. Nothing to clean up!');
    process.exit(0);
  }
  
  console.log('\n🔍 Checking each frame reference...');
  const orphanedFrames = [];
  
  for (const frameAssignment of event.frames) {
    const frameId = frameAssignment.frameId;
    console.log(`\n   Checking frame: ${frameId}`);
    
    // Try to find the frame in the frames collection
    const frame = await db.collection('frames').findOne({ _id: new ObjectId(frameId) });
    
    if (frame) {
      console.log(`   ✅ Frame exists: ${frame.name}`);
    } else {
      console.log(`   ❌ ORPHANED - Frame does not exist in database`);
      orphanedFrames.push(frameId);
    }
  }
  
  if (orphanedFrames.length === 0) {
    console.log('\n✅ All frame references are valid. Nothing to clean up!');
    process.exit(0);
  }
  
  console.log(`\n🧹 Found ${orphanedFrames.length} orphaned frame reference(s)`);
  console.log('   Orphaned IDs:', orphanedFrames);
  
  console.log('\n🗑️  Removing orphaned frames from event...');
  
  const result = await db.collection('events').updateOne(
    { _id: new ObjectId(eventMongoId) },
    {
      $pull: {
        frames: {
          frameId: { $in: orphanedFrames }
        }
      },
      $set: {
        updatedAt: new Date().toISOString()
      }
    }
  );
  
  console.log(`   Modified ${result.modifiedCount} document(s)`);
  
  // Verify cleanup
  const updatedEvent = await db.collection('events').findOne({ _id: new ObjectId(eventMongoId) });
  console.log(`\n✅ Cleanup complete!`);
  console.log(`   Frames remaining: ${updatedEvent.frames?.length || 0}`);
  
  if (updatedEvent.frames && updatedEvent.frames.length > 0) {
    console.log('   Valid frames:');
    for (const f of updatedEvent.frames) {
      const frame = await db.collection('frames').findOne({ _id: new ObjectId(f.frameId) });
      console.log(`   - ${f.frameId}: ${frame?.name || 'Unknown'}`);
    }
  }
  
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
} finally {
  await client.close();
  console.log('\n🔌 Database connection closed');
}
