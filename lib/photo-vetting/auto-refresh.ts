/**
 * The Waiting list of an event asks the server for new photos by itself (camera#373): an approver at the match should not have to reload the page to see
 * the next photo. Pure, so the rule has a test; the queue component runs the timer.
 */

/** How often the Waiting list asks the server again. */
export const WAITING_REFRESH_MS = 10_000;

/**
 * Whether the list asks now: only the Waiting list, only while the page is on screen, and not while a decision is in flight or a reason for a rejection is
 * being written (the list changing under the cursor is no help then).
 */
export function shouldRefreshWaiting(state: { status: string; hidden: boolean; deciding: boolean; rejecting: boolean }): boolean {
  return state.status === 'pending_review' && !state.hidden && !state.deciding && !state.rejecting;
}
