import { after } from 'next/server';

/**
 * Runs `task` after the response has been sent, so a slow job (redrawing images) does not hold the answer. Outside a request, in a unit test, there is no
 * response to wait for and the task runs at once. A failing task is logged by the task itself; it never changes the answer.
 */
export function afterResponse(task: () => Promise<unknown>): void {
  try {
    after(task);
  } catch {
    void task().catch(() => undefined);
  }
}
