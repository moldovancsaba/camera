/**
 * What the reviewers marked in the photos of one event (issue 542, lib/photo-vetting/people.ts): the people, the mix of gender and age, the emotions and the items, counted over the photos
 * where somebody looked, in the words of the event's vocabulary (issue 628). Server component; shown in the event's Vetting tab once any photo has been marked. The same counts are what the
 * analytics and the counters for messmass read.
 */

import { optionLabel, STANDARD_VOCABULARY, type ResolvedVocabulary, type VocabGroup } from '@/lib/photo-vetting/vocabulary';
import type { PeopleSummary } from '@/lib/photo-vetting/people';

const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)} %` : '0 %');
const CELL = { border: '1px solid var(--mantine-color-default-border)', borderRadius: '0.75rem', display: 'grid', gap: '0.25rem', padding: '0.75rem' } as const;

export default function PeopleSummaryCard({ summary, vocabulary = STANDARD_VOCABULARY }: { summary: PeopleSummary; vocabulary?: ResolvedVocabulary }) {
  if (summary.photos === 0) return null;
  const lines = (group: VocabGroup, counts: Record<string, number>, share = true) =>
    Object.entries(counts).map(([key, count]) => (
      <span key={key} style={{ fontSize: '0.8125rem' }}>
        {optionLabel(vocabulary, group, key)}: {count}
        {share ? ` (${pct(count, summary.people)})` : ''}
      </span>
    ));
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
          <strong style={{ fontSize: '0.8125rem' }}>Gender</strong>
          {lines('gender', summary.byGender)}
        </div>
        <div style={CELL}>
          <strong style={{ fontSize: '0.8125rem' }}>Age</strong>
          {lines('age', summary.byAge)}
        </div>
        <div style={CELL}>
          <strong style={{ fontSize: '0.8125rem' }}>Emotion</strong>
          {lines('emotion', summary.byEmotion)}
        </div>
        <div style={CELL}>
          <strong style={{ fontSize: '0.8125rem' }}>Items</strong>
          <span style={{ fontSize: '0.8125rem' }}>
            With any: {summary.withMerch} ({pct(summary.withMerch, summary.people)})
          </span>
          {lines('merch', summary.byMerch, false)}
        </div>
      </div>
    </section>
  );
}
