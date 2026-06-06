/**
 * Grant admin access to a user in SSO database by ID
 * Usage: node scripts/grant-admin-by-id.mjs <userId>
 */

import { MongoClient } from 'mongodb';

const SSO_URI = process.env.SSO_MONGODB_URI;
const userId = process.argv[2];

if (!SSO_URI || !userId) {
  console.error('Required environment/arguments are missing.');
  process.exit(1);
}

async function grantAdmin() {
  const client = new MongoClient(SSO_URI);
  
  try {
    await client.connect();
    console.log('✓ Connected to SSO database');
    
    const db = client.db('sso');
    
    // Find user by ID
    const user = await db.collection('publicUsers').findOne({ id: userId });
    
    if (!user) {
      console.error(`✗ User not found with ID: ${userId}`);
      process.exit(1);
    }
    
    console.log('\nCurrent user:', {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive
    });
    
    // Update to admin
    const result = await db.collection('publicUsers').updateOne(
      { id: userId },
      {
        $set: {
          role: 'admin',
          isActive: true,
          roleChangedAt: new Date().toISOString(),
          roleChangedBy: 'system',
        }
      }
    );
    
    if (result.modifiedCount > 0) {
      console.log('\n✓ User updated to admin role');
      console.log('Please logout and login again for changes to take effect');
    } else {
      console.log('\n⚠ No changes made (user may already be admin)');
    }
    
  } catch (error) {
    console.error('✗ Error:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

grantAdmin();
