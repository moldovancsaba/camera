import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MantineProvider } from '@mantine/core';
import { renderToStaticMarkup } from 'react-dom/server';
import ReframeStep from './ReframeStep';
import type { FullFrameCapture } from '@/lib/camera/frame-capture';

const capture: FullFrameCapture = {
  blob: new Blob(),
  dataUrl: '',
  width: 1920,
  height: 1080,
  facingMode: 'user',
  mirrored: true,
};

function render(permissions: { zoomOut?: boolean; zoomIn?: boolean; pan?: boolean }) {
  return renderToStaticMarkup(
    <MantineProvider>
      <ReframeStep
        capture={capture}
        frameAspect={16 / 9}
        permissions={permissions}
        onDone={() => undefined}
        onRetake={() => undefined}
      />
    </MantineProvider>
  );
}

test('with all guest framing choices off, the page offers only Retake and Continue', () => {
  const html = render({ zoomOut: false, zoomIn: false, pan: false });
  assert.doesNotMatch(html, /data-reframe-edit-controls/);
  assert.doesNotMatch(html, /Zoom 100%|Fill the frame|Reset|Use the zoom control|Drag the photo/);
  assert.match(html, />Retake</);
  assert.match(html, />Continue</);
  assert.equal((html.match(/<button\b/g) ?? []).length, 2);
});

test('when at least one framing choice is enabled, the corresponding editing guidance is shown', () => {
  const panOnly = render({ zoomOut: false, zoomIn: false, pan: true });
  assert.match(panOnly, /data-reframe-edit-controls/);
  assert.match(panOnly, /Drag the photo or use the arrow keys/);
  assert.doesNotMatch(panOnly, /Zoom 100%|Filling the frame/);
  assert.doesNotMatch(panOnly, /aria-label="Zoom"/);

  const zoomOnly = render({ zoomOut: false, zoomIn: true, pan: false });
  assert.match(zoomOnly, /aria-label="Zoom"/);
  assert.match(zoomOnly, /Use the zoom control, pinch, or the plus and minus keys/);
  assert.match(zoomOnly, />Reset</);
});
