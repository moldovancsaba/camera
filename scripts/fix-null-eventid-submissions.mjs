import { MongoClient, ObjectId } from 'mongodb';

const uri = 'mongodb+srv://moldovancsaba_db_user:wMP6z5B3ft5mmyI0@camaraclastar.koyedpi.mongodb.net/?appName=camaraclastar';
const dbName = 'camera';

// AS Roma - Lupetto Day event
const targetEventMongoId = '690a72d084eb48114aa84ef5';

const client = new MongoClient(uri);

try {
  console.log('🔌 Connecting to MongoDB...');
  await client.connect();
  const db = client.db(dbName);
  
  // Get the event
  const event = await db.collection('events').findOne({ _id: new ObjectId(targetEventMongoId) });
  console.log('\n📋 Target Event:');
  console.log('  Name:', event.name);
  console.log('  UUID:', event.eventId);
  console.log('  Partner:', event.partnerName);
  
  // Get partner details
  // Find all submissions with NULL eventId
  const nullSubmissions = await db.collection('submissions')
    .find({ $or: [{ eventId: null }, { eventId: { $exists: false } }] })
    .sort({ createdAt: -1 })
    .toArray();
  
  console.log('\n📸 Found', nullSubmissions.length, 'submissions with NULL eventId');
  
  if (nullSubmissions.length === 0) {
    console.log('✅ No submissions to fix!');
    process.exit(0);
  }
  
  console.log('\nFirst 5 submissions (most recent):');
  nullSubmissions.slice(0, 5).forEach(s => {
    console.log('  -', s._id.toString(), 'created:', s.createdAt, 'eventName:', s.eventName || 'NONE');
  });
  
  console.log('\n⚠️  About to assign ALL', nullSubmissions.length, 'submissions to event:', event.name);
  console.log('    This will set:');
  console.log('    - eventId:', event.eventId);
  console.log('    - eventName:', event.name);
  console.log('    - partnerId:', event.partnerId);
  console.log('    - partnerName:', event.partnerName);
  
  // Update all NULL submissions
  const result = await db.collection('submissions').updateMany(
    { $or: [{ eventId: null }, { eventId: { $exists: false } }] },
    {
      $set: {
        eventId: event.eventId,
        eventName: event.name,
        partnerId: event.partnerId,
        partnerName: event.partnerName,
        updatedAt: new Date().toISOString()
      }
    }
  );
  
  console.log('\n✅ Updated', result.modifiedCount, 'submissions');
  
  // Verify
  const newCount = await db.collection('submissions').countDocuments({ eventId: event.eventId });
  console.log('✅ Event now has', newCount, 'total submissions');
  
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
} finally {
  await client.close();
  console.log('\n🔌 Database connection closed');
}
