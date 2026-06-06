/**
 * Add UUID Fields to All Collections
 * Ensures every document has a proper UUID field (eventId, frameId, etc.)
 */

import { MongoClient } from 'mongodb';
import { randomUUID } from 'crypto';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || 'camera';

if (!uri) {
  console.error('Required environment variables are missing.');
  process.exit(1);
}

const client = new MongoClient(uri);

try {
  console.log('🔌 Connecting to MongoDB...');
  await client.connect();
  const db = client.db(dbName);
  
  // Add frameId to frames collection
  console.log('\n📦 Processing frames collection...');
  const frames = await db.collection('frames').find({}).toArray();
  console.log(`   Found ${frames.length} frames`);
  
  let framesUpdated = 0;
  for (const frame of frames) {
    if (!frame.frameId) {
      const frameId = randomUUID();
      await db.collection('frames').updateOne(
        { _id: frame._id },
        { 
          $set: { 
            frameId,
            updatedAt: new Date().toISOString()
          } 
        }
      );
      console.log(`   ✅ Added frameId to "${frame.name}": ${frameId}`);
      framesUpdated++;
    } else {
      console.log(`   ⏭️  "${frame.name}" already has frameId: ${frame.frameId}`);
    }
  }
  console.log(`   Updated ${framesUpdated} frame(s)`);
  
  // Add eventId to events collection
  console.log('\n📅 Processing events collection...');
  const events = await db.collection('events').find({}).toArray();
  console.log(`   Found ${events.length} events`);
  
  let eventsUpdated = 0;
  for (const event of events) {
    if (!event.eventId) {
      const eventId = randomUUID();
      await db.collection('events').updateOne(
        { _id: event._id },
        { 
          $set: { 
            eventId,
            updatedAt: new Date().toISOString()
          } 
        }
      );
      console.log(`   ✅ Added eventId to "${event.name}": ${eventId}`);
      eventsUpdated++;
    } else {
      console.log(`   ⏭️  "${event.name}" already has eventId: ${event.eventId}`);
    }
  }
  console.log(`   Updated ${eventsUpdated} event(s)`);
  
  // Add partnerId to partners collection
  console.log('\n🤝 Processing partners collection...');
  const partners = await db.collection('partners').find({}).toArray();
  console.log(`   Found ${partners.length} partners`);
  
  let partnersUpdated = 0;
  for (const partner of partners) {
    if (!partner.partnerId) {
      const partnerId = randomUUID();
      await db.collection('partners').updateOne(
        { _id: partner._id },
        { 
          $set: { 
            partnerId,
            updatedAt: new Date().toISOString()
          } 
        }
      );
      console.log(`   ✅ Added partnerId to "${partner.name}": ${partnerId}`);
      partnersUpdated++;
    } else {
      console.log(`   ⏭️  "${partner.name}" already has partnerId: ${partner.partnerId}`);
    }
  }
  console.log(`   Updated ${partnersUpdated} partner(s)`);
  
  // Add submissionId to submissions collection
  console.log('\n📸 Processing submissions collection...');
  const submissions = await db.collection('submissions').find({}).limit(10).toArray();
  console.log(`   Found ${submissions.length} submissions (checking first 10)`);
  
  let submissionsUpdated = 0;
  for (const submission of submissions) {
    if (!submission.submissionId) {
      const submissionId = randomUUID();
      await db.collection('submissions').updateOne(
        { _id: submission._id },
        { 
          $set: { 
            submissionId,
            updatedAt: new Date().toISOString()
          } 
        }
      );
      console.log(`   ✅ Added submissionId: ${submissionId}`);
      submissionsUpdated++;
    }
  }
  console.log(`   Updated ${submissionsUpdated} submission(s)`);
  
  console.log('\n✅ UUID migration complete!');
  
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
} finally {
  await client.close();
  console.log('\n🔌 Database connection closed');
}
