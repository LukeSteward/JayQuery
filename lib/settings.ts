/** Persisted extension preferences (browser.storage.local). */

/** Pillar rollup that drives pass/fail toolbar glyphs when the icon is not disabled. */
export type ToolbarIconPillarDriver = 'combined' | 'spf' | 'dmarc' | 'dkim';

/**
 * Toolbar icon behaviour: rollup or single pillar (`ToolbarIconPillarDriver`), or `disabled`
 * for a neutral grey icon regardless of DNS result.
 */
export type ToolbarIconDriver = ToolbarIconPillarDriver | 'disabled';

/** Primary DoH endpoint; JayQuery tries the alternate public resolver on failure / empty OK. */
export type DnsProvider = 'google' | 'cloudflare';

export type ExtensionSettings = {
  /**
   * When true, SERVFAIL / fetch errors etc. count as fail for email-auth pillars.
   * When false, treat like empty TXT (legacy ambiguous behaviour).
   */
  treatDnsResolutionErrorsAsFailure: boolean;
  /**
   * Rollup (`combined`) or pillar-only glyph (`spf`/`dmarc`/`dkim`), or `disabled` for a
   * neutral toolbar icon with no status glyphs.
   */
  toolbarIconDriver: ToolbarIconDriver;
  /** Which public DoH host is queried first (Google × Cloudflare). */
  dnsProvider: DnsProvider;
  /**
   * When true, SPF/DMARC/DKIM cards show every grading bullet (pass/info/warn/fail/missing).
   * When false, only actionable lines (warn, fail, missing) are listed for compact results.
   */
  detailedBreakdown: boolean;
};

const STORAGE_KEY = 'jayquerySettings';
/** Previous key; migrated on load so upgrades keep preferences. */
const LEGACY_STORAGE_KEY = 'dnsHealthSettings';

const VALID_PILLARS: ToolbarIconPillarDriver[] = [
  'combined',
  'spf',
  'dmarc',
  'dkim',
];

function normalizePillar(v: unknown): ToolbarIconPillarDriver {
  return typeof v === 'string' &&
    VALID_PILLARS.includes(v as ToolbarIconPillarDriver)
    ? (v as ToolbarIconPillarDriver)
    : 'combined';
}

/** Raw storage may include removed `coloredToolbarIcon`; normalise that into `disabled`. */
function normalizeToolbarIconDriver(raw: unknown): ToolbarIconDriver {
  if (raw == null || typeof raw !== 'object') {
    return DEFAULT_SETTINGS.toolbarIconDriver;
  }
  const v = raw as Record<string, unknown>;
  const stored = v.toolbarIconDriver;
  if (stored === 'disabled') return 'disabled';
  const pillar = normalizePillar(stored);
  if (v.coloredToolbarIcon === false) {
    return 'disabled';
  }
  return pillar;
}

const VALID_DNS_PROVIDERS: DnsProvider[] = ['google', 'cloudflare'];

function normalizeDnsProvider(v: unknown): DnsProvider {
  return typeof v === 'string' &&
    VALID_DNS_PROVIDERS.includes(v as DnsProvider)
    ? (v as DnsProvider)
    : DEFAULT_SETTINGS.dnsProvider;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  treatDnsResolutionErrorsAsFailure: true,
  toolbarIconDriver: 'combined',
  dnsProvider: 'google',
  detailedBreakdown: false,
};

export async function loadSettings(): Promise<ExtensionSettings> {
  const raw = await browser.storage.local.get([STORAGE_KEY, LEGACY_STORAGE_KEY]);
  const v = (raw[STORAGE_KEY] ?? raw[LEGACY_STORAGE_KEY]) as
    | Partial<ExtensionSettings>
    | undefined;
  const next: ExtensionSettings = {
    treatDnsResolutionErrorsAsFailure:
      typeof v?.treatDnsResolutionErrorsAsFailure === 'boolean'
        ? v.treatDnsResolutionErrorsAsFailure
        : DEFAULT_SETTINGS.treatDnsResolutionErrorsAsFailure,
    toolbarIconDriver: normalizeToolbarIconDriver(v),
    dnsProvider: normalizeDnsProvider(v?.dnsProvider),
    detailedBreakdown:
      typeof v?.detailedBreakdown === 'boolean'
        ? v.detailedBreakdown
        : DEFAULT_SETTINGS.detailedBreakdown,
  };
  if (raw[STORAGE_KEY] === undefined && raw[LEGACY_STORAGE_KEY] !== undefined) {
    await browser.storage.local.set({ [STORAGE_KEY]: next });
    await browser.storage.local.remove(LEGACY_STORAGE_KEY);
  }
  return next;
}

export async function saveSettings(s: ExtensionSettings): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEY]: s });
}
