/**
 * Event Database Helpers
 * 
 * Helper functions for event-related database operations, including
 * style inheritance cascade from partner defaults to child events.
 */

import { connectToDatabase } from './mongodb';
import { COLLECTIONS, Event, Partner, LogoScenario, generateTimestamp } from './schemas';

/**
 * Update Child Events from Partner Defaults
 * 
 * When a partner's default styles change, this function cascades those changes
 * to all non-orphaned child events (events where override flags are false/undefined).
 * 
 * Inheritance logic:
 * - brandColorsOverridden === false/undefined: Update brand colors from partner
 * - framesOverridden === false/undefined: Update frame assignments from partner
 * - logosOverridden === false/undefined: Update logo assignments from partner
 * 
 * @param partnerId - Partner ID whose defaults changed
 * @param updates - Object containing the updated default values
 * @returns Object with count of updated events per style type
 */
export async function updateChildEventsFromPartner(
  partnerId: string,
  updates: {
    defaultBrandColors?: {
      primary?: string;
      secondary?: string;
      accent?: string;
    };
    defaultFrames?: string[];
    defaultLogos?: Array<{
      logoId: string;
      scenario: LogoScenario;
      order: number;
    }>;
  }
): Promise<{
  brandColorsUpdated: number;
  framesUpdated: number;
  logosUpdated: number;
}> {
  const db = await connectToDatabase();
  const eventsCollection = db.collection<Event>(COLLECTIONS.EVENTS);
  const now = generateTimestamp();
  
  const result = {
    brandColorsUpdated: 0,
    framesUpdated: 0,
    logosUpdated: 0,
  };

  // Find all events for this partner
  const events = await eventsCollection.find({ partnerId }).toArray();

  // Process each event individually to handle different override states
  for (const event of events) {
    const eventUpdates: any = {
      updatedAt: now,
    };

    // Update brand colors if not overridden and defaults provided
    if (updates.defaultBrandColors && !event.brandColorsOverridden) {
      eventUpdates.brandColor = updates.defaultBrandColors.primary;
      eventUpdates.brandBorderColor = updates.defaultBrandColors.secondary;
      result.brandColorsUpdated++;
    }

    // Update frames if not overridden and defaults provided
    if (updates.defaultFrames && !event.framesOverridden) {
      // Convert frame IDs to frame assignments with metadata
      eventUpdates.frames = updates.defaultFrames.map(frameId => ({
        frameId,
        isActive: true,
        addedAt: now,
        addedBy: 'system', // System update from partner defaults
      }));
      result.framesUpdated++;
    }

    // Update logos if not overridden and defaults provided
    if (updates.defaultLogos && !event.logosOverridden) {
      // Convert default logos to logo assignments with metadata
      eventUpdates.logos = updates.defaultLogos.map(logo => ({
        logoId: logo.logoId,
        scenario: logo.scenario,
        order: logo.order,
        isActive: true,
        addedAt: now,
        addedBy: 'system', // System update from partner defaults
      }));
      result.logosUpdated++;
    }

    // Only update if there are changes beyond updatedAt
    if (Object.keys(eventUpdates).length > 1) {
      await eventsCollection.updateOne(
        { eventId: event.eventId },
        { $set: eventUpdates }
      );
    }
  }

  return result;
}

/**
 * Inherit Partner Defaults for New Event
 * 
 * Populates a new event with partner's default styles.
 * Sets all override flags to false (child behavior).
 * 
 * @param partnerId - Partner ID to inherit from
 * @returns Object with inherited style values and override flags
 */
export async function inheritPartnerDefaults(
  partnerId: string
): Promise<{
  brandColor?: string;
  brandBorderColor?: string;
  brandColorsOverridden: boolean;
  frames: Array<{
    frameId: string;
    isActive: boolean;
    addedAt: string;
    addedBy: string;
  }>;
  framesOverridden: boolean;
  logos: Array<{
    logoId: string;
    scenario: LogoScenario;
    order: number;
    isActive: boolean;
    addedAt: string;
    addedBy: string;
  }>;
  logosOverridden: boolean;
}> {
  const db = await connectToDatabase();
  const partnersCollection = db.collection<Partner>(COLLECTIONS.PARTNERS);
  const now = generateTimestamp();
  
  // Fetch partner to get defaults
  const partner = await partnersCollection.findOne({ partnerId });
  
  if (!partner) {
    throw new Error(`Partner not found: ${partnerId}`);
  }

  const result: any = {
    brandColorsOverridden: false,
    framesOverridden: false,
    logosOverridden: false,
    frames: [],
    logos: [],
  };

  // Apply brand color defaults
  if (partner.defaultBrandColors) {
    if (partner.defaultBrandColors.primary) {
      result.brandColor = partner.defaultBrandColors.primary;
    }
    if (partner.defaultBrandColors.secondary) {
      result.brandBorderColor = partner.defaultBrandColors.secondary;
    }
  }

  // Apply frame defaults
  if (partner.defaultFrames && partner.defaultFrames.length > 0) {
    result.frames = partner.defaultFrames.map(frameId => ({
      frameId,
      isActive: true,
      addedAt: now,
      addedBy: 'system', // Inherited from partner
    }));
  }

  // Apply logo defaults
  if (partner.defaultLogos && partner.defaultLogos.length > 0) {
    result.logos = partner.defaultLogos.map(logo => ({
      logoId: logo.logoId,
      scenario: logo.scenario,
      order: logo.order,
      isActive: true,
      addedAt: now,
      addedBy: 'system', // Inherited from partner
    }));
  }

  return result;
}

/**
 * Reset Event Style to Partner Default
 * 
 * Resets a specific style field (brandColors, frames, or logos) to inherit
 * from partner defaults. Clears custom values and sets override flag to false.
 * 
 * @param eventId - Event ID to reset
 * @param styleField - Which style field to reset ('brandColors', 'frames', 'logos')
 * @returns Updated event document
 */
export async function resetEventStyleToDefault(
  eventId: string,
  styleField: 'brandColors' | 'frames' | 'logos'
): Promise<Event> {
  const db = await connectToDatabase();
  const eventsCollection = db.collection<Event>(COLLECTIONS.EVENTS);
  const partnersCollection = db.collection<Partner>(COLLECTIONS.PARTNERS);
  const now = generateTimestamp();
  
  // Get event and partner
  const event = await eventsCollection.findOne({ eventId });
  if (!event) {
    throw new Error(`Event not found: ${eventId}`);
  }

  const partner = await partnersCollection.findOne({ partnerId: event.partnerId });
  if (!partner) {
    throw new Error(`Partner not found: ${event.partnerId}`);
  }

  const eventUpdates: any = {
    updatedAt: now,
  };

  // Reset based on style field
  switch (styleField) {
    case 'brandColors':
      eventUpdates.brandColorsOverridden = false;
      if (partner.defaultBrandColors) {
        if (partner.defaultBrandColors.primary) {
          eventUpdates.brandColor = partner.defaultBrandColors.primary;
        }
        if (partner.defaultBrandColors.secondary) {
          eventUpdates.brandBorderColor = partner.defaultBrandColors.secondary;
        }
      }
      break;

    case 'frames':
      eventUpdates.framesOverridden = false;
      if (partner.defaultFrames && partner.defaultFrames.length > 0) {
        eventUpdates.frames = partner.defaultFrames.map(frameId => ({
          frameId,
          isActive: true,
          addedAt: now,
          addedBy: 'system',
        }));
      } else {
        eventUpdates.frames = [];
      }
      break;

    case 'logos':
      eventUpdates.logosOverridden = false;
      if (partner.defaultLogos && partner.defaultLogos.length > 0) {
        eventUpdates.logos = partner.defaultLogos.map(logo => ({
          logoId: logo.logoId,
          scenario: logo.scenario,
          order: logo.order,
          isActive: true,
          addedAt: now,
          addedBy: 'system',
        }));
      } else {
        eventUpdates.logos = [];
      }
      break;
  }

  // Update event
  await eventsCollection.updateOne(
    { eventId },
    { $set: eventUpdates }
  );

  // Return updated event
  const updatedEvent = await eventsCollection.findOne({ eventId });
  if (!updatedEvent) {
    throw new Error(`Failed to fetch updated event: ${eventId}`);
  }

  return updatedEvent;
}
