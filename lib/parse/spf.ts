const SPF_PREFIX = 'v=spf1';

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
