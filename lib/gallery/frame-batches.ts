/**
 * Putting the event's frame on the photos uploaded to a gallery, a few at a time (camera#488). The gallery used to send up to 25 in one request and show the outcome far below the button,
 * so a request that ran long or failed looked like a button that did nothing (owner, 2026-10-09: "it did not work"). Now: five a time, a progress line, a stop that names its reason and
 * says what was done before it, and a summary. Pure and DOM-free, unit-tested in frame-batches.test.ts.
 */

export const FRAME_CHUNK = 5;

export interface FramedPhoto { id: string; imageUrl: string }
export interface SkippedPhoto { id: string; reason: string }

export interface BatchAnswer { framed: FramedPhoto[]; skipped: SkippedPhoto[] }

export interface FrameBatchResult extends BatchAnswer {
  /** Why it stopped, or null when every batch was answered. */
  failure: string | null;
}

/** What a person reads when a batch fails: a network failure is not the server's answer, and anything else keeps its own words. */
export function describeFailure(error: unknown): string {
  if (error instanceof TypeError) return 'The request did not reach the server.';
  return error instanceof Error && error.message.trim() ? error.message.trim() : 'The frame could not be added.';
}

/** Sends the ids in batches, in order; a batch that fails stops the run and keeps what the earlier batches did. `send` throws on any failure. */
export async function frameInBatches(
  ids: readonly string[],
  send: (batch: string[]) => Promise<BatchAnswer>,
  onProgress: (done: number, total: number) => void = () => undefined,
  size: number = FRAME_CHUNK
): Promise<FrameBatchResult> {
  const framed: FramedPhoto[] = [];
  const skipped: SkippedPhoto[] = [];
  let failure: string | null = null;
  for (let i = 0; i < ids.length; i += size) {
    try {
      const answer = await send(ids.slice(i, i + size));
      framed.push(...answer.framed);
      skipped.push(...answer.skipped);
    } catch (error) {
      failure = describeFailure(error);
      break;
    }
    onProgress(Math.min(i + size, ids.length), ids.length);
  }
  return { framed, skipped, failure };
}

/** The two messages the gallery shows after a run: what was done (when something was), and why it stopped (when it did). */
export function frameOutcome(result: FrameBatchResult): { message: string | null; error: string | null } {
  const { framed, skipped, failure } = result;
  const why = [...new Set(skipped.map((s) => s.reason))].join('; ');
  const summary = `Framed ${framed.length} photo${framed.length === 1 ? '' : 's'}${skipped.length ? `; ${skipped.length} left as they were (${why})` : ''}.`;
  if (failure === null) return { message: summary, error: null };
  const tail = framed.length > 0 ? 'It stopped there; press the button again for the rest (a photo that has a frame is skipped).' : 'Nothing was changed.';
  return { message: framed.length > 0 ? summary : null, error: `${failure} ${tail}` };
}
