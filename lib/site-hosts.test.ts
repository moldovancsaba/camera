import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canonicalPublicOrigin, defaultCameraOrigin, defaultGoShortOrigin } from './site-hosts';

function withEnv(values: Record<string, string | undefined>, run: () => void): void {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('legacy public Done Is Better hosts resolve to the canonical Messmass host', () => {
  withEnv({ NODE_ENV: 'production' }, () => {
    assert.equal(canonicalPublicOrigin('https://camera.doneisbetter.com'), 'https://camera.messmass.com');
    assert.equal(canonicalPublicOrigin('https://doneisbetter.com/capture'), 'https://camera.messmass.com/capture');
    assert.equal(canonicalPublicOrigin('https://preview.example.com'), 'https://preview.example.com');
    assert.equal(canonicalPublicOrigin('https://sso.doneisbetter.com'), 'https://sso.doneisbetter.com');
  });
});

test('camera and short-link origins correct legacy production environment settings', () => {
  withEnv({
    NODE_ENV: 'production',
    NEXT_PUBLIC_CAMERA_ORIGIN: 'https://camera.doneisbetter.com',
    NEXT_PUBLIC_GO_ORIGIN: 'https://go.doneisbetter.com',
  }, () => {
    assert.equal(defaultCameraOrigin(), 'https://camera.messmass.com');
    assert.equal(defaultGoShortOrigin(), 'https://go.messmass.com');
  });
});

test('the test environment can still use Done Is Better fixtures', () => {
  withEnv({ NODE_ENV: 'test' }, () => {
    assert.equal(canonicalPublicOrigin('https://camera.doneisbetter.com'), 'https://camera.doneisbetter.com');
  });
});
