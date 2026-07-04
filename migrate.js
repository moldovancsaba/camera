// LEGACY one-off migration utility (eventId -> eventIds). Hardcodes db 'camera'
// and predates the MONGODB_DB convention — review before running against Atlas.
import { MongoClient } from 'mongodb';

async function migrate() {
  const uri = process.env.MONGODB_URI;
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    const db = client.db('camera');
    
    console.log('Connected to MongoDB');
    
    // Step 1: Convert eventId to eventIds array
    const result1 = await db.collection('submissions').updateMany(
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
    
    console.log(`Converted ${result1.modifiedCount} submissions to array format`);
    
    // Step 2: Remove old fields
    const result2 = await db.collection('submissions').updateMany(
      {},
      {
        $unset: {
          eventId: "",
          isDeleted: "",
          deletedAt: ""
        }
      }
    );
    
    console.log(`Cleaned up ${result2.modifiedCount} submissions`);
    
    const total = await db.collection('submissions').countDocuments({});
    console.log(`Total submissions in database: ${total}`);
    
    console.log('\n✅ Migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

migrate();
