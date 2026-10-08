/**
 * Magyar szövegek a felhasználói útvonalhoz (camera#352), tegező stílusban (a tulajdonos döntése, 2026-10-08). Minden kulcsnak szerepelnie kell, ami az
 * angol szótárban van (a típusellenőrzés ezt kikényszeríti). A szerkesztő által egy eseményhez írt szöveg továbbra is erősebb a szótárnál.
 */
import type { MessageKey } from '@/lib/i18n/messages.en';

export const hu: Record<MessageKey, string> = {
  'event.loading': 'Esemény betöltése...',
  'event.notFound.title': 'Az esemény nem található',
  'event.notFound.text': 'Ezt az eseményt nem sikerült betölteni.',
};
