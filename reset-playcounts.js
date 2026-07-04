// LEGACY testing utility. Hardcodes db 'camera' and predates the MONGODB_DB
// convention — review before running against Atlas.
import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const dbName = 'camera';

async function resetPlayCounts() {
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    
    const db = client.db(dbName);
    const result = await db.collection('submissions').updateMany(
      {},
      {
        $set: { playCount: 0 },
        $unset: { lastPlayedAt: '', slideshowPlays: '' }
      }
    );
    
    console.log(`Reset playCount for ${result.modifiedCount} submissions`);
  } finally {
    await client.close();
  }
}

resetPlayCounts().catch(console.error);
