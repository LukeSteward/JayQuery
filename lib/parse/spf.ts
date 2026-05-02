const SPF_PREFIX = 'v=spf1';

function normalizeSpfHostname(s: string): string {
  return s.toLowerCase().replace(/\.$/, '').trim();
}

/**
 * Whether any `v=spf1` TXT uses `include:` for the given hostname (exact match after normalisation).
 */
export function spfTxtRecordsInclude(
  txtRecords: string[],
  includeHostname: string,
): boolean {
  const want = normalizeSpfHostname(includeHostname);
  if (!want) return false;

  const spfLike = txtRecords.filter((t) =>
    t.trim().toLowerCase().startsWith(SPF_PREFIX),
  );

  for (const record of spfLike) {
    for (const token of record.trim().split(/\s+/)) {
      const m = token.match(/^(?:[+\-~?])?include:([a-z0-9._-]+)/i);
      if (!m) continue;
      if (normalizeSpfHostname(m[1]) === want) return true;
    }
  }
  return false;
}

export type SpfAnalysis = {
  /** At least one TXT starting with v=spf1 */
  present: boolean;
  /** More than one distinct SPF record */
  multipleRecords: boolean;
  /** Rough mechanism / modifier token count (space-split) */
  tokenCount: number;
  /** Last all mechanism qualifier if present */
  allQualifier: 'pass' | 'neutral' | 'softfail' | 'fail' | null;
  /** Includes +all (dangerous open relay signal) */
  openAll: boolean;
  /** Approximate DNS lookup budget per RFC 7208-style counting */
  lookupApprox: number;
  rawRecords: string[];
};

function countSpfLookups(record: string): number {
  let n = 0;
  const tokens = record.trim().split(/\s+/).filter(Boolean);
  for (const t of tokens) {
    const lower = t.toLowerCase();
    if (lower === 'v=spf1') continue;
    if (/^\+?all$/i.test(t)) continue;
    if (/^(?:\+|-|~|\?)?include:/i.test(t)) n += 1;
    if (/^(?:\+|-|~|\?)?a(?:[:/]|$)/i.test(t)) n += 1;
    if (/^(?:\+|-|~|\?)?mx(?::|\/|$)/i.test(t)) n += 1;
    if (/^(?:\+|-|~|\?)?ptr(?::|$)/i.test(t)) n += 1;
    if (/^(?:\+|-|~|\?)?exists:/i.test(t)) n += 1;
    if (/^redirect=/i.test(t)) n += 1;
  }
  return n;
}

function detectAllQualifier(record: string): SpfAnalysis['allQualifier'] {
  const tokens = record.trim().split(/\s+/).filter(Boolean);
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i];
    if (/^\+all$/i.test(t)) return 'pass';
    if (/^\?all$/i.test(t)) return 'neutral';
    if (/^~all$/i.test(t)) return 'softfail';
    if (/^-all$/i.test(t)) return 'fail';
    if (/^all$/i.test(t)) return 'pass';
  }
  return null;
}

export function analyzeSpf(txtRecords: string[]): SpfAnalysis {
  const spfLike = txtRecords.filter((t) =>
    t.trim().toLowerCase().startsWith(SPF_PREFIX),
  );
  const present = spfLike.length > 0;
  const multipleRecords = spfLike.length > 1;
  const primary = spfLike[0] ?? '';

  let allQualifier: SpfAnalysis['allQualifier'] = null;
  let lookupApprox = 0;
  let tokenCount = 0;
  let openAll = false;

  if (primary) {
    allQualifier = detectAllQualifier(primary);
    lookupApprox = countSpfLookups(primary);
    tokenCount = primary.trim().split(/\s+/).filter(Boolean).length;
    openAll = primary
      .split(/\s+/)
      .some((x) => /^\+all$/i.test(x.trim()) || /^all$/i.test(x.trim()));
  }

  return {
    present,
    multipleRecords,
    tokenCount,
    allQualifier,
    openAll,
    lookupApprox,
    rawRecords: [...spfLike],
  };
}

function isAllMechanismToken(t: string): boolean {
  return /^(?:[+\-~?])?all$/i.test(t.trim());
}

function tokenAuthorizesOrRedirects(t: string): boolean {
  const x = t.trim();
  if (/^redirect=/i.test(x)) return true;
  if (/^(?:\+|-|~|\?)?include:/i.test(x)) return true;
  if (/^(?:\+|-|~|\?)?a(?:[:/]|$)/i.test(x)) return true;
  if (/^(?:\+|-|~|\?)?mx(?::|\/|$)/i.test(x)) return true;
  if (/^(?:\+|-|~|\?)?ptr(?::|$)/i.test(x)) return true;
  if (/^(?:\+|-|~|\?)?exists:/i.test(x)) return true;
  if (/^(?:\+|-|~|\?)?ip[46]:/i.test(x)) return true;
  return false;
}

/**
 * SPF that does not authorise any senders: ends with `-all` and has no ip/include/a/mx/ptr/exists/redirect, etc.
 * Typical form `v=spf1 -all` (optional `exp=` / `rf=` modifiers allowed).
 */
export function isNullSpf(a: SpfAnalysis): boolean {
  if (
    !a.present ||
    a.multipleRecords ||
    a.openAll ||
    a.allQualifier !== 'fail'
  ) {
    return false;
  }
  const record = a.rawRecords[0] ?? '';
  const tokens = record.trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return false;
  if (!tokens[0].trim().toLowerCase().startsWith(SPF_PREFIX)) return false;

  let sawHardAll = false;
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i].trim();
    if (/^-all$/i.test(t)) {
      sawHardAll = true;
      continue;
    }
    if (isAllMechanismToken(t)) {
      continue;
    }
    if (/^exp=/i.test(t) || /^rf=/i.test(t)) {
      continue;
    }
    if (tokenAuthorizesOrRedirects(t)) {
      return false;
    }
    return false;
  }
  return sawHardAll;
}
