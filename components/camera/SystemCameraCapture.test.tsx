import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { MantineProvider } from '@mantine/core';
import { renderToStaticMarkup } from 'react-dom/server';
import UiLanguageProvider from '@/components/i18n/UiLanguageProvider';
import SystemCameraCapture from './SystemCameraCapture';

const render = (language: 'en' | 'hu') =>
  renderToStaticMarkup(
    <MantineProvider>
      <UiLanguageProvider language={language}>
        <SystemCameraCapture onCapture={() => undefined} />
      </UiLanguageProvider>
    </MantineProvider>
  );

test('the page has one button that opens the device\'s camera app on the front camera; there is no back camera button (owner, 2026-10-09)', () => {
  for (const [language, takePhoto, backCamera] of [['en', 'Take photo', /back camera/i], ['hu', 'Fotó készítése', /hátsó/i]] as const) {
    const html = render(language);
    assert.equal((html.match(/<button/g) ?? []).length, 1, language);
    assert.match(html, new RegExp(takePhoto));
    assert.doesNotMatch(html, backCamera);
    assert.equal((html.match(/type="file"/g) ?? []).length, 1);
    assert.match(html, /capture="user"/);
    assert.doesNotMatch(html, /capture="environment"/);
  }
});

test('nothing in the code or the dictionary still offers a switch to another camera: the camera app does that', () => {
  for (const file of ['components/camera/SystemCameraCapture.tsx', 'components/camera/CameraCapture.tsx', 'lib/i18n/messages.en.ts', 'lib/i18n/messages.hu.ts', 'lib/tour/config/captureTourSteps.tsx']) {
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /camera\.useBack|camera\.useFront|camera\.switch|camera\.changeCamera|tour\.switchCamera|capture-switch-camera|switchCamera|hasMultipleCameras|initialFacingMode/, file);
  }
});
