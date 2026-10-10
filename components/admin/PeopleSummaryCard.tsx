/**
 * What the reviewers marked in the photos of one event (issue 542, lib/photo-vetting/people.ts): the people, the mix of age and gender, the emotions and the merchandise, counted over the
 * photos where somebody looked. Server component; shown in the event's Vetting tab once any photo has been marked. The same counts are what the analytics and, later, messmass read.
 */

import { EMOTION_OPTIONS, MERCH_OPTIONS, PERSON_OPTIONS, type PeopleSummary } from '@/lib/photo-vetting/people';

const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)} %` : '0 %');
const CELL = { border: '1px solid var(--mantine-color-default-border)', borderRadius: '0.75rem', display: 'grid', gap: '0.25rem', padding: '0.75rem' } as const;

export default function PeopleSummaryCard({ summary }: { summary: PeopleSummary }) {
  if (summary.photos === 0) return null;
  return (
    <section aria-label="People marked in the photos" style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: '1rem', display: 'grid', gap: '0.75rem', padding: '1rem' }} data-people-summary>
      <div>
        <strong>People marked in the photos</strong>
        <p style={{ color: 'var(--mantine-color-dimmed)', fontSize: '0.8125rem', margin: '0.25rem 0 0' }}>
          {summary.people} {summary.people === 1 ? 'person' : 'people'} in {summary.photos} {summary.photos === 1 ? 'photo' : 'photos'} that were looked at ({summary.peoplePerPhoto} a photo; {summary.photosWithPeople} with somebody in it).
        </p>
      </div>
      <div style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 13rem), 1fr))' }}>
        <div style={CELL}>
          <strong style={{ fontSize: '0.8125rem' }}>Who</strong>
          {PERSON_OPTIONS.map((option) => (
            <span key={option.id} style={{ fontSize: '0.8125rem' }}>
              {option.emoji} {option.label}: {summary.byPerson[option.id]} ({pct(summary.byPerson[option.id], summary.people)})
            </span>
          ))}
        </div>
        <div style={CELL}>
          <strong style={{ fontSize: '0.8125rem' }}>Emotion</strong>
          {EMOTION_OPTIONS.map((option) => (
            <span key={option.id} style={{ fontSize: '0.8125rem' }}>
              {option.emoji} {option.label}: {summary.byEmotion[option.id]} ({pct(summary.byEmotion[option.id], summary.people)})
            </span>
          ))}
        </div>
        <div style={CELL}>
          <strong style={{ fontSize: '0.8125rem' }}>Merchandise</strong>
          <span style={{ fontSize: '0.8125rem' }}>
            With any: {summary.withMerch} ({pct(summary.withMerch, summary.people)})
          </span>
          {MERCH_OPTIONS.map((option) => (
            <span key={option.id} style={{ fontSize: '0.8125rem' }}>
              {option.emoji} {option.label}: {summary.byMerch[option.id]}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
