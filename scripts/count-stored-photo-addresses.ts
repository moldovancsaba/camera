/**
 * Counts the photos that still hold an IP address or a full device string (owner decision 243, issue 521 phase 2: new photos store neither; the old ones keep what they have until the owner decides).
 *
 * READ ONLY. This script has no `--apply` and no write call: it counts, by event, the photos with `metadata.ipAddress` (and `metadata.ip` of an editor's upload) and with `metadata.deviceInfo` (and
 * `metadata.device`), and prints the one update that would remove them, so the owner can decide with real numbers. Nothing is deleted, rewritten or changed by running it. To remove the values the
 * owner would ask for a separate change with a dry run of its own, because the Devices figure of the Analytics view reads `metadata.deviceInfo` of older photos (the class is made when it is read), and
 * removing the string would turn those photos into "not recorded" unless `metadata.deviceClass` is written first.
 *
 * Usage:
 *   npx tsx scripts/count-stored-photo-addresses.ts
 */

import { closeConnection, connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { loadEnvFromFiles } from './load-env-from-files';

const ADDRESS_FIELDS = ['metadata.ipAddress', 'metadata.ip'] as const;
const DEVICE_FIELDS = ['metadata.deviceInfo', 'metadata.device'] as const;
const hasAny = (fields: readonly string[]) => ({ $or: fields.map((field) => ({ [field]: { $type: 'string', $ne: '' } })) });

async function main() {
  loadEnvFromFiles();
  const db = await connectToDatabase();
  const submissions = db.collection(COLLECTIONS.SUBMISSIONS);

  const [total, withAddress, withDevice, withDeviceNoClass] = await Promise.all([
    submissions.countDocuments({}),
    submissions.countDocuments(hasAny(ADDRESS_FIELDS)),
    submissions.countDocuments(hasAny(DEVICE_FIELDS)),
    submissions.countDocuments({ $and: [hasAny(DEVICE_FIELDS), { 'metadata.deviceClass': { $exists: false } }] }),
  ]);
  console.log('READ ONLY (nothing is written)');
  console.log(`photos in total:                                   ${total}`);
  console.log(`photos that hold an IP address:                    ${withAddress}`);
  console.log(`photos that hold a full device string:             ${withDevice}`);
  console.log(`  of those, with no stored device class yet:       ${withDeviceNoClass}  (the Devices figure classifies these when it reads them)`);

  // A field holds a value when it is a string with something in it (an aggregation expression, so it can be summed by event).
  const holds = (field: string) => ({ $gt: [{ $cond: [{ $eq: [{ $type: `$${field}` }, 'string'] }, { $strLenCP: `$${field}` }, 0] }, 0] });
  const byEvent = await submissions
    .aggregate<{ _id: string | null; withAddress: number; withDevice: number }>([
      { $match: { $or: [...hasAny(ADDRESS_FIELDS).$or, ...hasAny(DEVICE_FIELDS).$or] } },
      {
        $group: {
          _id: '$eventName',
          withAddress: { $sum: { $cond: [{ $or: ADDRESS_FIELDS.map(holds) }, 1, 0] } },
          withDevice: { $sum: { $cond: [{ $or: DEVICE_FIELDS.map(holds) }, 1, 0] } },
        },
      },
      { $sort: { withAddress: -1 } },
    ])
    .toArray();
  console.log('\nby event:');
  for (const row of byEvent) console.log(`  ${String(row._id ?? '(no event name)').slice(0, 40).padEnd(40)} address ${String(row.withAddress).padStart(6)}   device string ${String(row.withDevice).padStart(6)}`);

  console.log('\nWhat removing the addresses would be (NOT RUN, NOT AVAILABLE HERE):');
  console.log('  updateMany({ $or: [{ "metadata.ipAddress": { $exists: true } }, { "metadata.ip": { $exists: true } }] }, { $unset: { "metadata.ipAddress": "", "metadata.ip": "" } })');
  console.log('The device strings should only be removed after metadata.deviceClass is written from them, so the Devices figure keeps its numbers.');
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeConnection());
