'use client';

/**
 * The text editor of one level (issue 353, docs/BUILDING_BRICKS.md step 6): the same screen for the global Dictionary, a partner's texts and an event's texts. It lists every default
 * text of the user journey in a language with what is used now (the wording from above: the dictionary, the global wording, the partner's) and an input for this level's own
 * wording. An empty input means "use the one from above" (nothing is copied down), a wording is plain text and keeps its {markers}. The page saves (`onSave`); the editor only
 * edits a draft. Built on GDS parts, no style props of its own.
 */

import { useMemo, useState } from 'react';
import { GdsInline, GdsStack, InlineAlert, LabelTag, MetadataText, SectionPanel } from '@sovereignsquad/gds-core/client';
import { AdminSelect, AdminTextInput } from '@sovereignsquad/gds-admin/client';
import SemanticButton from '@/components/gds/CameraSemanticButton';
import { groupedCatalog } from '@/lib/i18n/catalog';
import { UI_LANGUAGES, UI_LANGUAGE_LABELS, type UiLanguage } from '@/lib/i18n';
import { TEXT_MAX, markersOf, type TextOverrides, type TextsByLanguage } from '@/lib/i18n/overrides';

export interface InheritedLevel {
  /** How the level is named in a sentence ("the global wording", "the partner's wording"). */
  label: string;
  texts: TextsByLanguage;
}

export interface TextLevelEditorProps {
  /** The wordings this level has written. */
  own: TextsByLanguage;
  /** The levels above, lowest first: what is used where this level wrote nothing. */
  inherited: InheritedLevel[];
  initialLanguage?: UiLanguage;
  busy?: boolean;
  error?: string | null;
  saved?: boolean;
  onSave: (texts: TextsByLanguage) => Promise<void> | void;
}

const clean = (texts: TextsByLanguage): TextsByLanguage =>
  Object.fromEntries(
    UI_LANGUAGES.map((language) => [language, Object.fromEntries(Object.entries(texts[language] ?? {}).filter(([, text]) => text.trim()))] as const).filter(([, map]) => Object.keys(map).length > 0)
  );

export default function TextLevelEditor({ own, inherited, initialLanguage = 'en', busy, error, saved, onSave }: TextLevelEditorProps) {
  const [language, setLanguage] = useState<UiLanguage>(initialLanguage);
  const [draft, setDraft] = useState<TextsByLanguage>(() => clean(own));
  const [search, setSearch] = useState('');
  const groups = useMemo(() => groupedCatalog(), []);

  const dirty = JSON.stringify(clean(draft)) !== JSON.stringify(clean(own));
  const written = Object.values(draft[language] ?? {}).filter((text) => text.trim()).length;
  const query = search.trim().toLowerCase();

  const set = (key: string, text: string) => setDraft((current) => ({ ...current, [language]: { ...(current[language] ?? {}), [key]: text } as TextOverrides }));

  /** What is used for this key where this level wrote nothing: the nearest level above that has a wording, else the dictionary. */
  const fromAbove = (key: string, dictionary: string): { text: string; source: string } => {
    for (const level of [...inherited].reverse()) {
      const text = (level.texts[language] as Record<string, string> | undefined)?.[key];
      if (text) return { text, source: level.label };
    }
    return { text: dictionary, source: 'the dictionary' };
  };

  const problem = (key: string, dictionaryEn: string, text: string): string | null => {
    if (!text.trim()) return null;
    if (/[<>]/.test(text)) return 'Plain text only: no < or >.';
    if (text.length > TEXT_MAX) return `At most ${TEXT_MAX} characters.`;
    const wanted = markersOf(dictionaryEn);
    return wanted.join() === markersOf(text).join() ? null : `Keep ${wanted.length ? wanted.map((name) => `{${name}}`).join(', ') : 'no {markers}'}.`;
  };
  const anyProblem = groups.some((group) => group.entries.some((entry) => problem(entry.key, entry.en, (draft[language] as Record<string, string> | undefined)?.[entry.key] ?? '')))
    || UI_LANGUAGES.some((other) => Object.entries(draft[other] ?? {}).some(([key, text]) => { const entry = groups.flatMap((g) => g.entries).find((e) => e.key === key); return entry ? Boolean(problem(key, entry.en, text)) : false; }));

  return (
    <GdsStack gap="lg">
      {error ? <InlineAlert title="That did not work" message={error} severity="error" /> : null}
      {saved && !dirty ? <InlineAlert title="Saved" message="The texts are saved. Pages show them the next time they load." severity="info" /> : null}

      <GdsInline gap="md" align="end">
        <AdminSelect
          name="text-language"
          label="Language"
          value={language}
          onChange={(next) => setLanguage(next === 'hu' ? 'hu' : 'en')}
          data={UI_LANGUAGES.map((code) => ({ value: code, label: UI_LANGUAGE_LABELS[code] }))}
        />
        <AdminTextInput name="text-search" label="Find a text" value={search} onChange={setSearch} placeholder="Part of a text or its name" />
        <SemanticButton action="texts:save" loading={busy} disabled={busy || !dirty || anyProblem} onClick={() => void onSave(clean(draft))}>
          Save the texts
        </SemanticButton>
        <SemanticButton action="texts:discard" variant="secondary" disabled={busy || !dirty} onClick={() => setDraft(clean(own))}>
          Discard the changes
        </SemanticButton>
      </GdsInline>
      <MetadataText>
        {written} text{written === 1 ? '' : 's'} written at this level in {UI_LANGUAGE_LABELS[language]}. Leave an input empty to use the one from above; nothing is copied down.
      </MetadataText>

      {groups.map((group) => {
        const entries = group.entries.filter((entry) => !query || entry.key.toLowerCase().includes(query) || entry.en.toLowerCase().includes(query) || entry.hu.toLowerCase().includes(query));
        if (entries.length === 0) return null;
        return (
          <SectionPanel key={group.group} title={group.label} description={`${entries.length} text${entries.length === 1 ? '' : 's'}`}>
            <GdsStack gap="md">
              {entries.map((entry) => {
                const value = (draft[language] as Record<string, string> | undefined)?.[entry.key] ?? '';
                const above = fromAbove(entry.key, entry[language]);
                const wrong = problem(entry.key, entry.en, value);
                return (
                  <GdsStack key={entry.key} gap="xs">
                    <GdsInline gap="sm" align="center">
                      <strong>{entry.key}</strong>
                      {value.trim() ? <LabelTag tone="success" label="Own" /> : <LabelTag tone="neutral" label={`From ${above.source}`} />}
                    </GdsInline>
                    <AdminTextInput
                      name={`text-${entry.key}`}
                      label={`Used now: ${above.text}`}
                      value={value}
                      onChange={(next) => set(entry.key, next)}
                      placeholder={above.text}
                      error={wrong ?? undefined}
                    />
                    {value.trim() ? (
                      <div>
                        <SemanticButton action="texts:clear" variant="secondary" size="xs" disabled={busy} onClick={() => set(entry.key, '')}>
                          Use the one from above
                        </SemanticButton>
                      </div>
                    ) : null}
                  </GdsStack>
                );
              })}
            </GdsStack>
          </SectionPanel>
        );
      })}
    </GdsStack>
  );
}
