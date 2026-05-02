/** Persisted extension preferences (browser.storage.local). */

/** What drives red / good-vs-bad on the toolbar icon. */
export type ToolbarIconDriver = 'combined' | 'spf' | 'dmarc' | 'dkim';

/** Primary DoH endpoint; JayQuery tries the alternate public resolver on failure / empty OK. */
export type DnsProvider = 'google' | 'cloudflare';

export type ExtensionSettings = {
  /** When true, update toolbar action icon with SPF/DMARC/DKIM segment colors. */
  coloredToolbarIcon: boolean;
  /**
   * When true, SERVFAIL / fetch errors etc. count as fail for email-auth pillars.
   * When false, treat like empty TXT (legacy ambiguous behavior).
   */
  treatDnsResolutionErrorsAsFailure: boolean;
  /**
   * `combined`: three columns (SPF | DMARC | DKIM), each with good/bad (or warn) glyph.
   * Otherwise only that pillar’s status controls the single toolbar glyph.
   */
  toolbarIconDriver: ToolbarIconDriver;
  /** Which public DoH host is queried first (Google × Cloudflare). */
  dnsProvider: DnsProvider;
};

const STORAGE_KEY = 'dnsHealthSettings';

const VALID_DRIVERS: ToolbarIconDriver[] = [
  'combined',
  'spf',
  'dmarc',
  'dkim',
];

function normalizeDriver(v: unknown): ToolbarIconDriver {
  return typeof v === 'string' && VALID_DRIVERS.includes(v as ToolbarIconDriver)
    ? (v as ToolbarIconDriver)
    : DEFAULT_SETTINGS.toolbarIconDriver;
}

const VALID_DNS_PROVIDERS: DnsProvider[] = ['google', 'cloudflare'];

function normalizeDnsProvider(v: unknown): DnsProvider {
  return typeof v === 'string' &&
    VALID_DNS_PROVIDERS.includes(v as DnsProvider)
    ? (v as DnsProvider)
    : DEFAULT_SETTINGS.dnsProvider;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  coloredToolbarIcon: true,
  treatDnsResolutionErrorsAsFailure: true,
  toolbarIconDriver: 'combined',
  dnsProvider: 'google',
};

export async function loadSettings(): Promise<ExtensionSettings> {
  const raw = await browser.storage.local.get(STORAGE_KEY);
  const v = raw[STORAGE_KEY] as Partial<ExtensionSettings> | undefined;
  return {
    coloredToolbarIcon:
      typeof v?.coloredToolbarIcon === 'boolean'
        ? v.coloredToolbarIcon
        : DEFAULT_SETTINGS.coloredToolbarIcon,
    treatDnsResolutionErrorsAsFailure:
      typeof v?.treatDnsResolutionErrorsAsFailure === 'boolean'
        ? v.treatDnsResolutionErrorsAsFailure
        : DEFAULT_SETTINGS.treatDnsResolutionErrorsAsFailure,
    toolbarIconDriver: normalizeDriver(v?.toolbarIconDriver),
    dnsProvider: normalizeDnsProvider(v?.dnsProvider),
  };
}

export async function saveSettings(s: ExtensionSettings): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEY]: s });
}
