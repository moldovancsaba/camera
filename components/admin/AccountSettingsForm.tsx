'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AdminSelect, AdminTextInput, WorkspaceHeader } from '@sovereignsquad/gds-admin/client';
import { GdsStack, InlineAlert, SectionPanel, StateBlock } from '@sovereignsquad/gds-core/client';
import CameraSemanticButton from '@/components/gds/CameraSemanticButton';
import { useSetUiLanguage, useUiLanguage } from '@/components/i18n/UiLanguageProvider';
import { UI_LANGUAGES, isUiLanguage, type UiLanguage, uiLanguageOptionLabel } from '@/lib/i18n';
import { adminAccountText } from '@/lib/i18n/admin-account';
import { uiLanguageDirection } from '@/lib/i18n/locale-negotiation';

const DEVICE_LANGUAGE = 'device';

interface AccountSettingsFormProps {
  identity: { name: string | null; email: string };
}

interface PreferencesResponse {
  uiLanguage: UiLanguage | null;
  deviceLanguage: UiLanguage;
}

function responseData(payload: unknown): PreferencesResponse | null {
  if (!payload || typeof payload !== 'object') return null;
  const data = (payload as { data?: unknown }).data;
  if (!data || typeof data !== 'object') return null;
  const result = data as Record<string, unknown>;
  if (!(result.uiLanguage === null || isUiLanguage(result.uiLanguage)) || !isUiLanguage(result.deviceLanguage)) return null;
  return { uiLanguage: result.uiLanguage, deviceLanguage: result.deviceLanguage };
}

export default function AccountSettingsForm({ identity }: AccountSettingsFormProps) {
  const router = useRouter();
  const language = useUiLanguage();
  const setUiLanguage = useSetUiLanguage();
  const direction = uiLanguageDirection(language);
  const t = useCallback((text: string) => adminAccountText(text, language), [language]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deviceLanguage, setDeviceLanguage] = useState<UiLanguage>('en');
  const [selection, setSelection] = useState<string>(DEVICE_LANGUAGE);
  const [savedSelection, setSavedSelection] = useState<string>(DEVICE_LANGUAGE);

  const options = useMemo(() => [
    { value: DEVICE_LANGUAGE, label: `${t('Use device language')} (${uiLanguageOptionLabel(deviceLanguage)})` },
    ...UI_LANGUAGES.map((item) => ({ value: item, label: uiLanguageOptionLabel(item) })),
  ], [deviceLanguage, t]);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(false);
    setSaveError(false);
    setSaved(false);
    try {
      const response = await fetch('/api/account/preferences', { method: 'GET', cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      const data = responseData(payload);
      if (!response.ok || !data) throw new Error('Could not load preferences');
      const nextSelection = data.uiLanguage ?? DEVICE_LANGUAGE;
      setDeviceLanguage(data.deviceLanguage);
      setSelection(nextSelection);
      setSavedSelection(nextSelection);
    } catch {
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving || selection === savedSelection) return;

    setIsSaving(true);
    setSaveError(false);
    setSaved(false);
    const uiLanguage = selection === DEVICE_LANGUAGE ? null : isUiLanguage(selection) ? selection : null;
    try {
      const response = await fetch('/api/account/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uiLanguage }),
      });
      const payload = await response.json().catch(() => null);
      const data = responseData(payload);
      if (!response.ok || !data) throw new Error('Could not save preferences');

      const resolved = data.uiLanguage ?? data.deviceLanguage;
      setDeviceLanguage(data.deviceLanguage);
      setUiLanguage(resolved);
      setSelection(data.uiLanguage ?? DEVICE_LANGUAGE);
      setSavedSelection(data.uiLanguage ?? DEVICE_LANGUAGE);
      setSaved(true);
      router.refresh();
    } catch {
      setSaveError(true);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div lang={language} dir={direction}>
      <GdsStack gap="lg">
        <WorkspaceHeader title={t('Account settings')} />

        <SectionPanel title={t('Account details')} description={t('Your name and email are managed by your sign-in account and cannot be changed here.')}>
          <GdsStack gap="md">
            <AdminTextInput name="accountName" label={t('Name')} value={identity.name ?? ''} readOnly state="readonly" />
            <AdminTextInput name="accountEmail" label={t('Email')} value={identity.email} readOnly state="readonly" />
          </GdsStack>
        </SectionPanel>

        <SectionPanel title={t('Interface language')} description={t('Choose the language used in the admin interface.')}>
          {isLoading ? (
            <StateBlock variant="loading" title={t('Loading settings…')} />
          ) : loadError ? (
            <StateBlock
              variant="error"
              title={t('Settings could not be loaded.')}
              action={(
                <CameraSemanticButton
                  action="account-settings:retry"
                  label={t('Try again')}
                  onClick={() => void load()}
                  type="button"
                />
              )}
            />
          ) : (
            <form onSubmit={(event) => void save(event)}>
              <GdsStack gap="md">
                {saveError ? <InlineAlert severity="error" title={t('Settings could not be saved.')} /> : null}
                <AdminSelect
                  name="uiLanguage"
                  label={t('Interface language')}
                  description={t('Choose the language used in the admin interface.')}
                  data={options}
                  value={selection}
                  onChange={(value) => {
                    if (value && (value === DEVICE_LANGUAGE || isUiLanguage(value))) {
                      setSelection(value);
                      setSaved(false);
                      setSaveError(false);
                    }
                  }}
                  searchable
                  state={isSaving ? 'loading' : 'idle'}
                  aria-label={t('Interface language')}
                />
                <div>
                  <CameraSemanticButton
                    action="account-settings:save"
                    label={t('Save changes')}
                    type="submit"
                    loading={isSaving}
                    disabled={isSaving || selection === savedSelection}
                  />
                </div>
                <div role="status" aria-live="polite" aria-atomic="true">
                  {saved ? <InlineAlert severity="success" title={t('Settings saved.')} /> : null}
                </div>
              </GdsStack>
            </form>
          )}
        </SectionPanel>
      </GdsStack>
    </div>
  );
}
