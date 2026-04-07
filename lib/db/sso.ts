/**
 * SSO Database Helper
 * Version: 1.0.0
 * 
 * Helper functions to query SSO database for user management
 */

import { MongoClient } from 'mongodb';

const SSO_DB_NAME = 'sso';

/**
 * SSO MongoDB connection string (Atlas).
 * Set SSO_MONGODB_URI in .env — never commit credentials.
 */
export function getSsoMongoUri(): string {
  const uri = process.env.SSO_MONGODB_URI?.trim();
  if (!uri) {
    throw new Error('SSO_MONGODB_URI environment variable is not defined');
  }
  return uri;
}
const SSO_COLLECTION_NAME = 'publicUsers';

// Cache connection to avoid reconnecting on every request
let cachedSsoClient: MongoClient | null = null;

/**
 * Connect to SSO database
 * Returns MongoDB client and database objects
 */
export async function connectToSSODatabase() {
  if (cachedSsoClient) {
    return {
      client: cachedSsoClient,
      db: cachedSsoClient.db(SSO_DB_NAME),
    };
  }

  const client = new MongoClient(getSsoMongoUri());
  await client.connect();
  cachedSsoClient = client;

  return {
    client,
    db: client.db(SSO_DB_NAME),
  };
}

/**
 * Get all inactive user emails from SSO database
 * Returns Set of email addresses for efficient lookup
 * 
 * Usage:
 * const inactiveEmails = await getInactiveUserEmails();
 * if (inactiveEmails.has(userEmail)) {
 *   // User is inactive, filter them out
 * }
 */
export async function getInactiveUserEmails(): Promise<Set<string>> {
  const { db } = await connectToSSODatabase();
  
  // Query for users where isActive is explicitly false
  const inactiveUsers = await db
    .collection(SSO_COLLECTION_NAME)
    .find({ isActive: false })
    .project({ email: 1 })
    .toArray();
  
  // Convert to Set for O(1) lookup performance
  const emails = new Set<string>();
  for (const user of inactiveUsers) {
    if (user.email) {
      emails.add(user.email);
    }
  }
  
  console.log(`[SSO] Found ${emails.size} inactive users`);
  return emails;
}

/**
 * Get user status from SSO database
 * Returns { isActive: boolean } or null if user not found
 */
export async function getUserStatus(email: string): Promise<{ isActive: boolean } | null> {
  const { db } = await connectToSSODatabase();
  
  const user = await db
    .collection(SSO_COLLECTION_NAME)
    .findOne({ email }, { projection: { isActive: 1 } });
  
  if (!user) {
    return null;
  }
  
  return {
    isActive: user.isActive !== false, // Default to true if not set
  };
}
