import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NextRequest } from 'next/server';

const apiReal = await import('@/lib/api');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<typeof import('./route')>;

test('the retired standalone annotation endpoint cannot create a second analytics record', async (t) => {
  let authenticated = false;
  t.mock.module('@/lib/api', {
    exports: {
      ...apiReal,
      requireAuth: async () => { authenticated = true; return { user: { id: 'admin' } }; },
    },
  });
  const { PUT } = await importRoute('retired');
  const response = await PUT(new NextRequest('http://localhost/api/admin/submissions/photo/people', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ people: [] }),
  })) as Response;
  assert.equal(authenticated, true);
  assert.equal(response.status, 410);
  assert.match(JSON.stringify(await response.json()), /Fanmass analysis review/);
});
