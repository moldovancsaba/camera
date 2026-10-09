/**
 * Runs work after the answer has been sent (Next's `after`), so it never slows the user down and still finishes on a serverless host. Outside a request (a test, a script) `after` is not
 * available and the work simply runs, its failure left to the task to handle.
 */

import { after } from 'next/server';

export function runAfterResponse(task: () => Promise<void>): void {
  try {
    after(task);
  } catch {
    void task();
  }
}
