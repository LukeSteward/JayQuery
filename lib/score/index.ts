import type { SpfAnalysis } from '@/lib/parse/spf';
import type { DmarcAnalysis } from '@/lib/parse/dmarc';
import type { DkimRecordAnalysis } from '@/lib/parse/dkim';
import type { HealthStatus } from '@/lib/score/common';

export type { HealthStatus };

export type ProtocolScore = {
  points: number;
  max: number;
  status: HealthStatus;
  detail: string;
};

export type FullScore = {
  overall: number;
  spf: ProtocolScore;
  dmarc: ProtocolScore;
  dkim: ProtocolScore;
};

const SPF_MAX = 3;
const DMARC_MAX = 4;
const DKIM_MAX = 3;

function roundOverall(n: number): number {
  return Math.round(n * 10) / 10;
}

export function scoreSpf(a: SpfAnalysis): ProtocolScore {
  if (!a.present) {
    return {
      points: 0,
      max: SPF_MAX,
      status: 'missing',
      detail: 'No SPF record (v=spf1) found for this hostname.',
    };
  }
  if (a.multipleRecords) {
    return {
      points: 0.5,
      max: SPF_MAX,
      status: 'fail',
      detail: 'Multiple SPF TXT records found — only one is allowed.',
    };
  }

  if (a.openAll) {
    return {
      points: 0.4,
      max: SPF_MAX,
      status: 'fail',
      detail: 'SPF ends with +all (any sender passes).',
    };
  }

  let p = 1.2;
  if (a.lookupApprox > 10) {
    p -= Math.min(1.2, (a.lookupApprox - 10) * 0.2);
  }

  switch (a.allQualifier) {
    case 'fail':
      p += 1.55;
      break;
    case 'softfail':
      p += 1.15;
      break;
    case 'neutral':
      p += 0.55;
      break;
    case 'pass':
      p += 0.25;
      break;
    default:
      p += 0.35;
      break;
  }

  p = Math.max(0, Math.min(SPF_MAX, p));
  const status: HealthStatus =
    p >= 2.3 ? 'pass' : p >= 1.2 ? 'warn' : 'fail';
  const lookupNote =
    a.lookupApprox > 10
      ? ` ~${a.lookupApprox} mechanisms that may trigger DNS lookups (limit 10).`
      : '';
  return {
    points: p,
    max: SPF_MAX,
    status,
    detail: `SPF is present.${lookupNote}`.trim(),
  };
}

export function scoreDmarc(a: DmarcAnalysis, dmarcHost: string): ProtocolScore {
  if (!a.present || !a.validVersion) {
    return {
      points: 0,
      max: DMARC_MAX,
      status: 'missing',
      detail: `No DMARC found at _dmarc.${dmarcHost}.`,
    };
  }

  let p = 1.0;
  switch (a.policy) {
    case 'reject':
      p += 2.05;
      break;
    case 'quarantine':
      p += 1.25;
      break;
    case 'none':
      p += 0.35;
      break;
    default:
      p += 0.2;
      break;
  }

  if (a.hasRua) p += 0.45;

  const strict =
    (a.aspf === 's' ? 0.15 : 0) + (a.adkim === 's' ? 0.15 : 0);
  p += Math.min(0.3, strict);

  if (a.pct != null && a.pct < 100) {
    p -= 0.25;
  }

  if (a.multipleRecords) {
    p -= 0.4;
  }

  p = Math.max(0, Math.min(DMARC_MAX, p));
  const status: HealthStatus =
    p >= 3.2 ? 'pass' : p >= 1.8 ? 'warn' : 'fail';
  const pol = a.policy ?? 'unknown';
  return {
    points: p,
    max: DMARC_MAX,
    status,
    detail: [
      `Policy p=${pol} at _dmarc.${dmarcHost}.`,
      a.hasRua ? null : 'Consider adding rua for aggregate reports.',
    ]
      .filter(Boolean)
      .join(' '),
  };
}

export function scoreDkim(
  best: DkimRecordAnalysis & { selector: string },
): ProtocolScore {
  if (!best.raw) {
    return {
      points: 0,
      max: DKIM_MAX,
      status: 'missing',
      detail: 'No DKIM DNS record at common selectors for this hostname.',
    };
  }
  if (best.publicKeyEmpty && best.hasVersion) {
    return {
      points: 0.6,
      max: DKIM_MAX,
      status: 'warn',
      detail: `Selector "${best.selector}" looks revoked (empty p=).`,
    };
  }
  if (!best.valid) {
    return {
      points: 0.4,
      max: DKIM_MAX,
      status: 'fail',
      detail: `TXT at selector "${best.selector}" is not a valid DKIM record.`,
    };
  }

  let p = 2.55;
  const k = (best.keyType ?? 'rsa').toLowerCase();
  if (k.includes('ed25519')) p += 0.35;
  else if (k.includes('rsa')) p += 0.35;

  p = Math.max(0, Math.min(DKIM_MAX, p));
  const status: HealthStatus = p >= 2.6 ? 'pass' : 'warn';
  return {
    points: p,
    max: DKIM_MAX,
    status,
    detail: `Valid DKIM for selector "${best.selector}" (k=${best.keyType ?? 'rsa'}).`,
  };
}

export function computeFullScore(
  spf: ProtocolScore,
  dmarc: ProtocolScore,
  dkim: ProtocolScore,
): FullScore {
  const overall = roundOverall(spf.points + dmarc.points + dkim.points);
  return { overall, spf, dmarc, dkim };
}

/** Hard fail when TXT resolution was non-definitive (SERVFAIL, fetch errors, etc.). */
export function scoreDnsResolutionFailure(
  protocol: 'spf' | 'dmarc' | 'dkim',
  detail: string,
): ProtocolScore {
  const max =
    protocol === 'spf' ? SPF_MAX : protocol === 'dmarc' ? DMARC_MAX : DKIM_MAX;
  return {
    points: 0,
    max,
    status: 'fail',
    detail,
  };
}

export type { GradeLine } from './breakdown';
export {
  buildDkimBreakdown,
  buildDmarcBreakdown,
  buildSpfBreakdown,
} from './breakdown';
