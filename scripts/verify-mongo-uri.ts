/**
 * Verify MONGODB_URI from .env / .env.local: scheme, host extraction, SRV DNS (mongodb+srv).
 *
 * Usage (repo root):
 *   npm run db:verify-uri
 *
 * Does not connect to MongoDB or log passwords — only DNS + parsing.
 */

import { promisify } from 'util';
import dns from 'dns';

import { loadEnvFromFiles } from './load-env-from-files';

const resolveSrv = promisify(dns.resolveSrv);

/** Hostname from .env.example — not a real Atlas cluster. */
function isPlaceholderAtlasHost(host: string): boolean {
  return host.toLowerCase() === 'cluster.mongodb.net';
}

function hostFromUri(uri: string): { kind: 'srv' | 'standard'; host: string } | null {
  const u = uri.trim();
  if (u.startsWith('mongodb+srv://')) {
    const m = u.match(/@([^/?]+)/);
    return m ? { kind: 'srv', host: m[1].split(':')[0] } : null;
  }
  if (u.startsWith('mongodb://')) {
    const m = u.match(/@([^/?]+)/);
    return m ? { kind: 'standard', host: m[1].split(':')[0] } : null;
  }
  return null;
}

async function main() {
  loadEnvFromFiles();

  const uri = process.env.MONGODB_URI?.trim();
  const db = process.env.MONGODB_DB?.trim();

  console.log('MongoDB URI verification\n');

  if (!uri) {
    console.error('✗ MONGODB_URI is not set.');
    console.error('  Add it to .env or .env.local (see .env.example), or export it in the shell.');
    process.exit(1);
  }

  if (!uri.startsWith('mongodb://') && !uri.startsWith('mongodb+srv://')) {
    console.error('✗ URI must start with mongodb:// or mongodb+srv://');
    process.exit(1);
  }

  const parsed = hostFromUri(uri);
  if (!parsed) {
    console.error('✗ Could not parse host from URI (check @host format).');
    process.exit(1);
  }

  console.log(`  MONGODB_DB: ${db || '(not set — required at runtime)'}`);
  console.log(`  Host:       ${parsed.host}`);
  console.log(`  Mode:       ${parsed.kind === 'srv' ? 'mongodb+srv (SRV lookup)' : 'standard (direct host)'}\n`);

  if (isPlaceholderAtlasHost(parsed.host)) {
    console.error('✗ This host is the template from .env.example, not your Atlas cluster.');
    console.error('  Atlas → Database → Connect → Drivers: copy the full mongodb+srv://… string.');
    console.error('  Real hosts look like: cluster0.abcd123.mongodb.net\n');
    process.exit(1);
  }

  if (parsed.kind === 'srv') {
    const srvName = `_mongodb._tcp.${parsed.host}`;
    try {
      const records = await resolveSrv(srvName);
      console.log(`✓ DNS SRV ${srvName} → ${records.length} target(s)`);
      for (const r of records.slice(0, 5)) {
        console.log(`    ${r.name}:${r.port} (priority ${r.priority})`);
      }
      if (records.length > 5) {
        console.log(`    … and ${records.length - 5} more`);
      }
      console.log('\nSRV resolves OK. If the app still fails, check Network Access + credentials in Atlas.');
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      console.error(`✗ DNS SRV failed for ${srvName}`);
      console.error(`  ${err.code || ''} ${err.message}`.trim());
      console.error('\n  Fix: In Atlas → Database → Connect, copy a new connection string.');
      console.error('  The cluster hostname may be wrong, the cluster removed, or DNS/VPN is blocking SRV.');
      console.error('  See docs/MONGODB_ATLAS.md (Troubleshooting).\n');
      process.exit(1);
    }
  } else {
    console.log('✓ Standard URI (no SRV). Ensure this host is reachable and in Atlas Network Access.');
  }

  console.log('\nDone.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
