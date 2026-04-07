/**
 * Admin-only alert for MongoDB (or similar) connection failures with guided hints.
 */

import { describeMongoConnectionError } from '@/lib/db/mongo-errors';

export default function DatabaseConnectionAlert({ error }: { error: unknown }) {
  const { rawMessage, summary, hints } = describeMongoConnectionError(error);

  return (
    <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
      <p className="text-red-800 dark:text-red-200 font-medium">Database connection error</p>
      <p className="text-red-700 dark:text-red-300 text-sm mt-2">{summary}</p>
      <p className="text-red-600 dark:text-red-400 text-xs mt-2 font-mono break-all">
        {rawMessage}
      </p>
      {hints.length > 0 && (
        <ul className="mt-3 text-sm text-red-800 dark:text-red-200 list-disc list-inside space-y-1">
          {hints.map((h, i) => (
            <li key={i}>{h}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
