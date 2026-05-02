import type { SpfAnalysis } from '@/lib/parse/spf';
import type { DmarcAnalysis } from '@/lib/parse/dmarc';
import type { DkimRecordAnalysis } from '@/lib/parse/dkim';
import { getDkimSelectors } from '@/lib/parse/dkim';
import type { HealthStatus } from '@/lib/score/common';

/** Granular grading lines for SPF / DMARC / DKIM cards. */
export type GradeLine = {
  status: HealthStatus | 'info';
  text: string;
};

/** DKIM missing breakdown; omitted when Detailed breakdown is off (card summary still shows). */
export const DKIM_ABSENT_PROBE_DETAIL_TEXT =
  'No DKIM DNS record at any probed selector.';

const GRADE_LINE_TEXTS_HIDDEN_WHEN_COMPACT = new Set<string>([
  DKIM_ABSENT_PROBE_DETAIL_TEXT,
]);

/** Compact cards: omit pass/info bullets and selected noisy absent-record lines; keep warn, fail, missing otherwise. */
export function filterBreakdownForCompactMode(lines: GradeLine[]): GradeLine[] {
  return lines.filter((l) => {
    if (GRADE_LINE_TEXTS_HIDDEN_WHEN_COMPACT.has(l.text)) return false;
    return l.status !== 'pass' && l.status !== 'info';
  });
}

export function buildSpfBreakdown(a: SpfAnalysis): GradeLine[] {
  const lines: GradeLine[] = [];
  if (!a.present) {
    lines.push({
      status: 'fail',
      text: 'No SPF TXT with v=spf1 at this query name.',
    });
    return lines;
  }
  lines.push({ status: 'pass', text: 'SPF record found (v=spf1).' });
  if (a.multipleRecords) {
    lines.push({
      status: 'fail',
      text: 'Multiple SPF records; only one is valid per RFC 7208.',
    });
  } else {
    lines.push({ status: 'pass', text: 'Single SPF record.' });
  }
  if (a.openAll) {
    lines.push({
      status: 'fail',
      text: '+all (or bare all) allows any sender; not acceptable.',
    });
  } else {
    lines.push({ status: 'pass', text: 'Not using permissive +all.' });
  }
  if (a.lookupApprox > 10) {
    lines.push({
      status: 'warn',
      text: `~${a.lookupApprox} mechanisms may consume DNS lookups (limit 10 per RFC 7208).`,
    });
  } else {
    lines.push({
      status: 'info',
      text: `~${a.lookupApprox} mechanisms counted towards the 10 lookup cap.`,
    });
  }
  if (!a.openAll) {
    switch (a.allQualifier) {
      case 'fail':
        lines.push({
          status: 'pass',
          text: 'Ends with -all (hard fail for unknown senders).',
        });
        break;
      case 'softfail':
        lines.push({
          status: 'warn',
          text: 'Ends with ~all (soft fail).',
        });
        break;
      case 'neutral':
        lines.push({
          status: 'warn',
          text: 'Ends with ?all (neutral).',
        });
        break;
      case 'pass':
        lines.push({
          status: 'warn',
          text: 'Ends with +all.',
        });
        break;
      default:
        lines.push({
          status: 'warn',
          text: 'No explicit all mechanism; consider -all or ~all.',
        });
    }
  }
  return lines;
}

export function buildDmarcBreakdown(
  a: DmarcAnalysis,
  orgDomain: string,
): GradeLine[] {
  const lines: GradeLine[] = [];
  if (!a.present) {
    lines.push({
      status: 'missing',
      text: `No DMARC record at _dmarc.${orgDomain}.`,
    });
    return lines;
  }
  lines.push({
    status: 'pass',
    text: `_dmarc.${orgDomain} has a DMARC TXT.`,
  });
  if (a.multipleRecords) {
    lines.push({
      status: 'fail',
      text: 'Multiple DMARC TXT records; only one is valid per RFC 7489.',
    });
    return lines;
  }
  switch (a.policy) {
    case 'reject':
      lines.push({
        status: 'pass',
        text: 'p=reject (strongest org policy).',
      });
      break;
    case 'quarantine':
      lines.push({
        status: 'warn',
        text: 'p=quarantine (suspicious mail may be marked/spam).',
      });
      break;
    case 'none':
      lines.push({
        status: 'warn',
        text: 'p=none (monitoring only; no enforcement).',
      });
      break;
    default:
      lines.push({
        status: 'fail',
        text: 'p= tag missing or invalid.',
      });
  }
  if (a.sp != null) {
    lines.push({
      status: 'info',
      text: `sp=${a.sp} (subdomain policy).`,
    });
  }
  if (a.hasRua) {
    lines.push({
      status: 'pass',
      text: 'rua= aggregate reporting configured.',
    });
  } else {
    lines.push({
      status: 'warn',
      text: 'No rua=; add aggregate report addresses.',
    });
  }
  if (a.pct != null && a.pct < 100) {
    lines.push({
      status: 'warn',
      text: `pct=${a.pct} (policy applies to less than 100% of mail).`,
    });
  } else if (a.pct === 100 || a.pct == null) {
    lines.push({
      status: 'info',
      text:
        a.pct === 100
          ? 'pct=100 (policy applies to all affected mail).'
          : 'pct defaults to 100.',
    });
  }
  if (a.adkim === 's' || a.aspf === 's') {
    lines.push({
      status: 'pass',
      text: `Strict alignment: adkim=${a.adkim ?? 'r'}, aspf=${a.aspf ?? 'r'}.`,
    });
  } else {
    lines.push({
      status: 'warn',
      text:
        'Alignment is relaxed (adkim=r, aspf=r by default); strict alignment (adkim=s / aspf=s) increases this pillar score.',
    });
  }
  return lines;
}

export function buildDkimBreakdown(
  d: DkimRecordAnalysis & { selector: string },
): GradeLine[] {
  const lines: GradeLine[] = [];
  const selectors = getDkimSelectors().join(', ');
  lines.push({
    status: 'info',
    text: `Probed selectors: ${selectors}.`,
  });
  if (!d.raw) {
    lines.push({
      status: 'missing',
      text: DKIM_ABSENT_PROBE_DETAIL_TEXT,
    });
    return lines;
  }
  lines.push({
    status: 'info',
    text: `Best TXT candidate: selector "${d.selector}".`,
  });
  if (d.hasVersion) {
    lines.push({ status: 'pass', text: 'v=DKIM1 present.' });
  } else {
    lines.push({
      status: 'fail',
      text: 'Missing v=DKIM1 tag.',
    });
  }
  if (d.publicKeyEmpty) {
    lines.push({
      status: d.hasVersion ? 'warn' : 'fail',
      text: d.hasVersion
        ? 'p= is empty; key may be revoked.'
        : 'No published public key (p=).',
    });
  } else {
    lines.push({
      status: 'pass',
      text: 'Public key published in p=.',
    });
  }
  const k = d.keyType ?? 'rsa';
  lines.push({
    status: 'info',
    text: `k=${k} (algorithm hint).`,
  });
  return lines;
}
