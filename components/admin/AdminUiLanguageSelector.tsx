'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminSelect } from '@sovereignsquad/gds-admin/client';
import { VisuallyHidden } from '@sovereignsquad/gds-core/client';
import { useSetUiLanguage, useUiLanguage } from '@/components/i18n/UiLanguageProvider';
import { UI_LANGUAGES, isUiLanguage, type UiLanguage, uiLanguageOptionLabel } from '@/lib/i18n';
import { adminAccountText } from '@/lib/i18n/admin-account';

const DEVICE_LANGUAGE = 'device';

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

/** Quick access to the same per-user preference stored on the account settings page. */
export default function AdminUiLanguageSelector({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const language = useUiLanguage();
  const setUiLanguage = useSetUiLanguage();
  const t = useCallback((text: string) => adminAccountText(text, language), [language]);
  const [deviceLanguage, setDeviceLanguage] = useState<UiLanguage>(language);
  const [selection, setSelection] = useState<string>(language);
  const [savedSelection, setSavedSelection] = useState<string>(language);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<'load' | 'save' | null>(null);

  const options = useMemo(() => [
    { value: DEVICE_LANGUAGE, label: `${t('Use device language')} (${uiLanguageOptionLabel(deviceLanguage)})` },
    ...UI_LANGUAGES.map((item) => ({ value: item, label: uiLanguageOptionLabel(item) })),
  ], [deviceLanguage, t]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/account/preferences', { method: 'GET', cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        const data = responseData(payload);
        if (!response.ok || !data) throw new Error('Could not load preferences');
        if (!cancelled) {
          const nextSelection = data.uiLanguage ?? DEVICE_LANGUAGE;
          setDeviceLanguage(data.deviceLanguage);
          setSelection(nextSelection);
          setSavedSelection(nextSelection);
          setError(null);
        }
      })
      .catch(() => {
        if (!cancelled) setError('load');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  async function changeLanguage(value: string | null) {
    if (!value || loading || saving || value === savedSelection) return;
    if (value !== DEVICE_LANGUAGE && !isUiLanguage(value)) return;

    setSelection(value);
    setSaving(true);
    setSaved(false);
    setError(null);
    const uiLanguage = value === DEVICE_LANGUAGE ? null : value;
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
      setSavedSelection(value);
      setSaved(true);
      router.refresh();
    } catch {
      setSelection(savedSelection);
      setSaved(false);
      setError('save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ flex: compact ? '0 1 132px' : '0 1 184px', minWidth: compact ? 120 : 150 }}>
      <AdminSelect
        name="adminUiLanguageQuickSetting"
        label={<VisuallyHidden>{t('Interface language')}</VisuallyHidden>}
        data={options}
        value={selection}
        onChange={(value) => void changeLanguage(value)}
        searchable
        disabled={loading || saving}
        state={loading || saving ? 'loading' : 'idle'}
        error={error === 'load' ? t('Settings could not be loaded.') : error === 'save' ? t('Settings could not be saved.') : undefined}
        aria-label={t('Interface language')}
      />
      <VisuallyHidden>
        <span role="status" aria-live="polite" aria-atomic="true">
          {saved ? t('Settings saved.') : ''}
        </span>
      </VisuallyHidden>
    </div>
  );
}
