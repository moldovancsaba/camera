/**
 * The Waiting and Needs contact lists of an event ask the server for changes by themselves (camera#373): an approver at the match should not have to reload to see
 * new photos or a guest's completed contact step. Pure, so the rule has a test; the queue component runs the timer.
 */

/** How often the Waiting and Needs contact lists ask the server again. */
export const WAITING_REFRESH_MS = 10_000;

/**
 * Whether the list asks now: only a live workflow list, only while the page is on screen, and not while a decision is in flight or a reason for a rejection is
 * being written (the list changing under the cursor is no help then).
 */
export function shouldRefreshWaiting(state: { status: string; hidden: boolean; deciding: boolean; rejecting: boolean }): boolean {
  return state.status === 'pending_review' && !state.hidden && !state.deciding && !state.rejecting;
}
