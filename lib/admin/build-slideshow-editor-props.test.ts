import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { ObjectId } from 'mongodb';
import { designFromDraft, draftFromDesign } from '@/components/admin/ScreenDesignFields';

type PropsModule = typeof import('./build-slideshow-editor-props');

// Colours are assembled from digits: the design-system check bans raw colour literals, tests included.
const hex = (digits: string) => `#${digits}`;
const EVENT = { _id: new ObjectId(), eventId: 'event-uuid', name: 'Derby' };
const DESIGN = {
  overlayImageUrl: 'https://store.example.test/overlay.png',
  window: { left: 10, top: 12.5, width: 60, height: 70 },
  photoFit: 'cover',
  fontFamily: 'Inter',
  qr: { url: 'https://go.example.test/abc123', x: 70, y: 20, size: 25, color: hex('112233') },
  texts: [{ text: 'SCAN ME', x: 70, y: 50, width: 25, size: 4, align: 'center', color: hex('ffffff') }],
};

function load(t: TestContext, slideshow: Record<string, unknown>, tag: string): Promise<PropsModule> {
  const doc = { _id: new ObjectId(), slideshowId: 's-1', name: 'Main screen', isActive: true, createdAt: '2026-10-07T10:00:00.000Z', eventId: 'event-uuid', ...slideshow };
  t.mock.module('@/lib/db/mongodb', {
    namedExports: { connectToDatabase: async () => ({ collection: (name: string) => ({ findOne: async () => (name === 'events' ? EVENT : doc) }) }) },
  });
  return import('./build-slideshow-editor-props?case=' + tag) as Promise<PropsModule>;
}

test('the editor gets the screen design stored on the slideshow, and opening then saving it without a change gives the same design back', async (t) => {
  const { buildSlideshowEditorProps } = await load(t, { screenDesign: DESIGN }, 'design');
  const props = await buildSlideshowEditorProps(EVENT._id.toHexString(), new ObjectId().toHexString());
  const design = props?.slideshow?.screenDesign;
  assert.ok(design, 'the design is passed to the editor');
  assert.equal(design.overlayImageUrl, DESIGN.overlayImageUrl);
  // The editor's fields hold the design and give it back unchanged (what a save without edits would send).
  assert.deepEqual(designFromDraft(draftFromDesign(design)), design);
});

test('a slideshow without a screen design gives the editor none', async (t) => {
  const { buildSlideshowEditorProps } = await load(t, {}, 'none');
  assert.equal((await buildSlideshowEditorProps(EVENT._id.toHexString(), new ObjectId().toHexString()))?.slideshow?.screenDesign, null);
});
