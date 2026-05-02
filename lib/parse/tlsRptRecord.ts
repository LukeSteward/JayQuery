import type { HealthStatus } from '@/lib/score/common';

/** Shown when no TLS-RPT TXT; also filtered from bullets when Detailed breakdown is off. */
export const TLS_RPT_ABSENT_DETAIL_TEXT =
  'No TLS-RPT TXT (v=TLSRPTv1) at _smtp._tls.';

export type TlsRptTxtAnalysis = {
  record: string | null;
  recordCount: number;
  versionOk: boolean;
  hasValidRua: boolean;
  ruaHints: string[];
  isValid: boolean;
  lines: { status: HealthStatus; text: string }[];
};

const RUA_MAILTO = /^mailto:(.+)$/i as RegExp;
const RUA_HTTPS = /^https:\/\/.+/i as RegExp;

/**
 * TLS reporting (TLS-RPT) TXT at _smtp._tls.domain; similar to Read-TlsRptRecord.ps1 from DNSHealth.
 */
export function analyzeTlsRptTxt(txtRecords: string[]): TlsRptTxtAnalysis {
  const tlsrptLike = txtRecords.filter((t) =>
    /^\s*v=TLSRPTv1(\s|;)/i.test(t.replace(/\s+/g, ' ').trim()),
  );
  const recordCount = tlsrptLike.length;
  const primary = tlsrptLike[0] ?? null;
  const lines: { status: HealthStatus; text: string }[] = [];

  if (recordCount === 0) {
    lines.push({
      status: 'missing',
      text: TLS_RPT_ABSENT_DETAIL_TEXT,
    });
    return {
      record: null,
      recordCount: 0,
      versionOk: false,
      hasValidRua: false,
      ruaHints: [],
      isValid: false,
      lines,
    };
  }

  if (recordCount > 1) {
    lines.push({
      status: 'fail',
      text: 'Multiple TLS-RPT records; invalid.',
    });
  }

  const rec = primary!.replace(/\s+/g, ' ').trim();
  const tags = parseSemicolonTags(rec);
  const v = tags.get('v')?.trim();
  const versionOk = v?.toUpperCase() === 'TLSRPTV1';
  if (!versionOk) {
    lines.push({
      status: 'fail',
      text: `Version must be TLSRPTv1 (found ${v ?? 'missing'}).`,
    });
  } else {
    lines.push({ status: 'pass', text: 'v=TLSRPTv1 present.' });
  }

  const ruaRaw = tags.get('rua') ?? '';
  const ruaParts = ruaRaw
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  const ruaHints: string[] = [];
  let hasValidRua = false;
  for (const entry of ruaParts) {
    const mMail = RUA_MAILTO.exec(entry);
    if (mMail) {
      ruaHints.push(mMail[1]);
      hasValidRua = true;
      continue;
    }
    if (RUA_HTTPS.test(entry)) {
      ruaHints.push(entry);
      hasValidRua = true;
    }
  }

  if (hasValidRua) {
    lines.push({
      status: 'pass',
      text: 'rua= includes mailto: or https: aggregate endpoints.',
    });
  } else {
    lines.push({
      status: 'warn',
      text: 'rua= missing or no valid mailto:/https: endpoints.',
    });
  }

  const isValid =
    recordCount === 1 && versionOk && hasValidRua;

  if (isValid) {
    lines.push({ status: 'pass', text: 'TLS-RPT record structure looks valid.' });
  }

  return {
    record: rec,
    recordCount,
    versionOk,
    hasValidRua,
    ruaHints,
    isValid,
    lines,
  };
}

function parseSemicolonTags(record: string): Map<string, string> {
  const map = new Map<string, string>();
  const parts = record.split(';').map((p) => p.trim()).filter(Boolean);
  for (const p of parts) {
    const eq = p.indexOf('=');
    if (eq <= 0) continue;
    const k = p.slice(0, eq).trim().toLowerCase();
    const v = p.slice(eq + 1).trim();
    map.set(k, v);
  }
  return map;
}
