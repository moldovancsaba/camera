// LEGACY one-off migration utility. Hardcodes its database name and predates
// the MONGODB_DB convention — review before running against Atlas.
import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

try {
  await client.connect();
  const db = client.db('camera');
  
  console.log('✓ Connected to MongoDB');
  
  const result1 = await db.collection('submissions').updateMany(
    { eventId: { $exists: true } },
    [{ $set: {
      eventIds: { $cond: { if: { $eq: ["$eventId", null] }, then: [], else: ["$eventId"] } },
      isArchived: { $ifNull: ["$isArchived", false] },
      hiddenFromPartner: { $ifNull: ["$hiddenFromPartner", false] },
      hiddenFromEvents: { $ifNull: ["$hiddenFromEvents", []] }
    }}]
  );
  
  console.log(`✓ Converted ${result1.modifiedCount} submissions`);
  
  const result2 = await db.collection('submissions').updateMany({}, { $unset: { eventId: "", isDeleted: "", deletedAt: "" } });
  console.log(`✓ Cleaned ${result2.modifiedCount} submissions`);
  
  const total = await db.collection('submissions').countDocuments({});
  console.log(`✓ Total: ${total} submissions\n`);
  console.log('✅ MIGRATION COMPLETE!');
  
} catch (error) {
  console.error('❌ ERROR:', error.message);
} finally {
  await client.close();
}
