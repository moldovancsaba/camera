// WHAT: Pins next.config.ts images.remotePatterns to camera's own image hosts,
//   using Next's real matcher (the one /_next/image applies to ?url=).
// WHY: SEC-05 -- a wildcard Blob hostname or an open upload site in this list
//   turns camera's domain into a free image proxy for third-party content.
//   These tests fail if a wildcard or an unmeasured host creeps back in.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hasRemoteMatch } from 'next/dist/shared/lib/match-remote-pattern';
import type { RemotePattern } from 'next/dist/shared/lib/image-config';
import nextConfig from './next.config';
import { detectImageProvider } from './lib/imgbb/url';

const CAMERA_BLOB_HOST = 'bidx0njghn1voknt.public.blob.vercel-storage.com';

// URLs are assembled from host strings on purpose: a literal scheme://host in
// a test would be picked up by scripts/fleet-audit-inventory.py as a phantom
// outbound host.
function u(host: string, path = '/x.jpg', scheme: 'https' | 'http' = 'https'): string {
  return `${scheme}://${host}${path}`;
}

function patterns(): RemotePattern[] {
  const list = nextConfig.images?.remotePatterns ?? [];
  return list.map((p) => (p instanceof URL ? { protocol: p.protocol.replace(/:$/, '') as RemotePattern['protocol'], hostname: p.hostname } : p));
}

function allowed(url: string): boolean {
  return hasRemoteMatch([], patterns(), new URL(url));
}

test('remotePatterns lists exactly camera Blob store + i.ibb.co, https only', () => {
  const list = patterns();
  assert.deepEqual(list.map((p) => p.hostname).sort(), [CAMERA_BLOB_HOST, 'i.ibb.co'].sort());
  for (const p of list) {
    assert.equal(p.protocol, 'https', `${p.hostname} must be https-only`);
    assert.equal(p.hostname.includes('*'), false, `${p.hostname} must not be a wildcard`);
  }
  assert.deepEqual(nextConfig.images?.domains ?? [], [], 'legacy images.domains must stay unset');
});

test('stored image URLs on the measured hosts are allowed', () => {
  assert.equal(allowed(u(CAMERA_BLOB_HOST, '/tryon-result-abc123.jpg')), true);
  assert.equal(allowed(u(CAMERA_BLOB_HOST, '/submissions/2026/final.png')), true);
  assert.equal(allowed(u('i.ibb.co', '/AbC123x/photo.jpg')), true);
});

test('other Blob stores, imgbb viewer/site hosts, http and lookalikes are refused', () => {
  const refused = [
    u('someoneelse0123456.public.blob.vercel-storage.com'),
    u('imgbb.com'),
    u('ibb.co', '/AbC123x'),
    u('i.ibb.co', '/AbC123x/photo.jpg', 'http'),
    u(CAMERA_BLOB_HOST, '/x.jpg', 'http'),
    u('i.ibb.co.attacker.invalid'),
    u(`${CAMERA_BLOB_HOST}.attacker.invalid`),
    u('attacker.invalid', '/a.avif'),
  ];
  for (const url of refused) {
    assert.equal(allowed(url), false, `${url} must not be optimizable`);
  }
});

test('every allowed host is one the app itself classifies as an image provider', () => {
  for (const p of patterns()) {
    assert.notEqual(detectImageProvider(u(p.hostname, '/token/name.jpg')), null, p.hostname);
  }
});
