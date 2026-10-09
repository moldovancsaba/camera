/**
 * What a new event gets for its giant screen (issue 326 and issue 327, docs/SCREEN_DESIGN.md): the default slideshow, and from it the picture of the welcome page screen. Done after the
 * response so creating the event stays quick, and never throws: a failure is logged and the event's slideshows list has a button that makes them (Create the default slideshow, Draw the
 * welcome page screen). Only for events created from now on: nothing is made for an existing event by this.
 */

import { ObjectId } from 'mongodb';
import { after } from 'next/server';
import { COLLECTIONS } from '@/lib/db/schemas';
import { connectToDatabase } from '@/lib/db/mongodb';
import { ensureDefaultSlideshow } from '@/lib/slideshow/default-slideshow';
import { ensureWelcomeScreen } from './welcome-screen-store';

export async function makeScreenForNewEvent(mongoId: ObjectId | string): Promise<void> {
  try {
    const db = await connectToDatabase();
    // The event as stored now, so the colours and the frame are the ones it has been given since it was created.
    const event = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(String(mongoId)) });
    if (!event) return;
    const slideshow = await ensureDefaultSlideshow(db, event);
    if (!slideshow.ok) return void console.warn('the default slideshow could not be made for a new event', slideshow.reason);
    const screen = await ensureWelcomeScreen(db, event);
    if (!screen.ok) console.warn('the welcome page screen could not be drawn for a new event', screen.reason);
  } catch (error) {
    console.warn('the screen of a new event could not be made', error);
  }
}

/** Schedules `makeScreenForNewEvent` after the response. Outside a request (a script, a test) nothing is scheduled. */
export function scheduleScreenForNewEvent(mongoId: ObjectId | string): void {
  try {
    after(() => makeScreenForNewEvent(mongoId));
  } catch {
    // not in a request: an admin makes them with the buttons on the event's slideshows list
  }
}
