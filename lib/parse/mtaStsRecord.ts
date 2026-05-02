import type { HealthStatus } from '@/lib/score/common';

/** Shown when no STS TXT — also filtered from bullets when Detailed breakdown is off. */
export const MTA_STS_ABSENT_DETAIL_TEXT =
  'No MTA-STS TXT (v=STSv1) at _mta-sts.';

export type MtaStsTxtAnalysis = {
  record: string | null;
  recordCount: number;
  versionOk: boolean;
  id: string | null;
  idValid: boolean;
  isValid: boolean;
  lines: { status: HealthStatus; text: string }[];
};

/**
 * MTA-STS DNS TXT at _mta-sts.domain — matches Read-MtaStsRecord.ps1 from DNSHealth.
 */
export function analyzeMtaStsTxt(txtRecords: string[]): MtaStsTxtAnalysis {
  const stsLike = txtRecords.filter((t) =>
    /^\s*v=STSv1(\s|;)/i.test(t.replace(/\s+/g, ' ').trim()),
  );
  const recordCount = stsLike.length;
  const primary = stsLike[0] ?? null;
  const lines: { status: HealthStatus; text: string }[] = [];

  if (recordCount === 0) {
    lines.push({
      status: 'missing',
      text: MTA_STS_ABSENT_DETAIL_TEXT,
    });
    return {
      record: null,
      recordCount: 0,
      versionOk: false,
      id: null,
      idValid: false,
      isValid: false,
      lines,
    };
  }

  if (recordCount > 1) {
    lines.push({
      status: 'warn',
      text: 'Multiple MTA-STS TXT records — may cause unexpected behavior.',
    });
  }

  const rec = primary!.replace(/\s+/g, ' ').trim();
  const tags = parseSemicolonTags(rec);
  const v = tags.get('v')?.trim();
  const versionOk = v?.toLowerCase() === 'stsv1';
  if (!versionOk) {
    lines.push({
      status: 'fail',
      text: `Version must be STSv1 (found ${v ?? 'missing'}).`,
    });
  } else {
    lines.push({ status: 'pass', text: 'v=STSv1 present.' });
  }

  const idRaw = tags.get('id')?.trim() ?? '';
  const id = idRaw.length ? idRaw : null;
  const idValid = /^[A-Za-z0-9]+$/.test(idRaw);
  if (!id) {
    lines.push({ status: 'fail', text: 'id= is missing (required for MTA-STS).' });
  } else if (!idValid) {
    lines.push({
      status: 'fail',
      text: 'STS id must be alphanumeric.',
    });
  } else {
    lines.push({ status: 'pass', text: `Policy id=${id}.` });
  }

  const isValid =
    recordCount <= 1 &&
    versionOk &&
    Boolean(id && idValid);

  if (isValid) {
    lines.push({
      status: 'pass',
      text: 'MTA-STS DNS record structure looks valid (fetch policy over HTTPS separately).',
    });
  }

  return {
    record: rec,
    recordCount,
    versionOk,
    id,
    idValid,
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
