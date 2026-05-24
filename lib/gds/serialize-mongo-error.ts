import { describeMongoConnectionError, type MongoConnectionDiagnosis } from '@/lib/db/mongo-errors';

export function serializeMongoError(error: unknown): MongoConnectionDiagnosis {
  return describeMongoConnectionError(error);
}
