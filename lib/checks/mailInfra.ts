import {
  DNS_TYPE,
  RCODE,
  resolveDns,
  resolveMx,
  resolveNs,
  type DohResult,
  type DohResolveOptions,
} from '@/lib/dns/dohJson';
import { resolveTxt } from '@/lib/dns/queryTxt';
import { checkM365Tenant } from '@/lib/checks/microsoft365Tenant';
import {
  analyzeMtaStsTxt,
  MTA_STS_ABSENT_DETAIL_TEXT,
} from '@/lib/parse/mtaStsRecord';
import {
  analyzeTlsRptTxt,
  TLS_RPT_ABSENT_DETAIL_TEXT,
} from '@/lib/parse/tlsRptRecord';
import { analyzeMxProviderGroup } from '@/lib/mailProviders/identifyMxProvider';
import type { HealthStatus } from '@/lib/score/common';

export type MailInfraCheckOptions = Pick<DohResolveOptions, 'dnsProvider'>;

export type MailInfraCheck = {
  id: 'mx' | 'ns' | 'mtaSts' | 'tlsRpt' | 'dnssec' | 'm365Tenant';
  title: string;
  status: HealthStatus;
  summary: string;
  lines: string[];
  /** Entra OIDC pass — rendered as TenantID + copy control in the popup. */
  tenantDirectoryId?: string;
  raw?: string;
  /**
   * When MX matched a known profile — used only to build the informational SPF supplement
   * on the main SPF card (no scoring).
   */
  providerProfile?: {
    name: string;
    expectedSpfInclude?: string;
  };
};

function foldSeverity(statuses: HealthStatus[]): HealthStatus {
  if (statuses.includes('fail')) return 'fail';
  if (statuses.includes('warn')) return 'warn';
  if (statuses.includes('missing')) return 'missing';
  return 'pass';
}

/** "1 MX record detected" vs "4 MX records detected". */
function mxRecordsDetectedPhrase(n: number): string {
  return n === 1 ? '1 MX record detected' : `${n} MX records detected`;
}

async function checkMx(
  domain: string,
  dns?: MailInfraCheckOptions,
): Promise<MailInfraCheck> {
  const mx = await resolveMx(domain, { dnsProvider: dns?.dnsProvider });
  if (mx.length === 0) {
    return {
      id: 'mx',
      title: 'MX',
      status: 'fail',
      summary: 'No MX records',
      lines: [
        'No mail exchangers. If you do not receive mail here, use a null MX (priority 0, target ".") per RFC 7505.',
      ],
    };
  }
  const nullMx =
    mx.length === 1 &&
    mx[0].priority === 0 &&
    (mx[0].exchange === '.' || mx[0].exchange === '');
  if (nullMx) {
    return {
      id: 'mx',
      title: 'MX',
      status: 'pass',
      summary: 'Null MX (no inbound mail)',
      lines: ['Null MX present — domain should not receive SMTP.'],
      raw: '0 .',
    };
  }
  const raw = mx.map((m) => `${m.priority} ${m.exchange}`).join('\n');
  const { identified, allSameProvider } = analyzeMxProviderGroup(mx, domain);

  let lines: string[];
  if (identified) {
    lines = [mxRecordsDetectedPhrase(mx.length)];
    if (!allSameProvider) {
      lines.push(`Identified provider (MX): ${identified.name}`);
    }
    if (identified.dkimSelectors?.length) {
      lines.push(
        `Suggested DKIM selectors (profile): ${identified.dkimSelectors.join(', ')}`,
      );
    }
  } else {
    const label =
      mx.length === 1 ? '1 MX record.' : `${mx.length} MX records.`;
    lines = [
      label,
      ...mx.slice(0, 6).map((m) => `${m.priority} ${m.exchange}`),
    ];
    if (mx.length > 6) {
      lines.push(`… +${mx.length - 6} more`);
    }
    lines.push(
      'MX host(s) did not match known hosting / security profiles (custom or unlisted provider).',
    );
  }

  const summary =
    identified && allSameProvider
      ? identified.name
      : identified
        ? `${mx.length} mail exchanger(s) — ${identified.name}`
        : `${mx.length} mail exchanger(s)`;

  const providerProfile = identified
    ? {
        name: identified.name,
        ...(identified.expectedSpfInclude?.trim()
          ? { expectedSpfInclude: identified.expectedSpfInclude.trim() }
          : {}),
      }
    : undefined;

  return {
    id: 'mx',
    title: 'MX',
    status: 'pass',
    summary,
    lines,
    raw,
    ...(providerProfile ? { providerProfile } : {}),
  };
}

async function checkNs(
  domain: string,
  dns?: MailInfraCheckOptions,
): Promise<MailInfraCheck> {
  const ns = await resolveNs(domain, { dnsProvider: dns?.dnsProvider });
  if (ns.length === 0) {
    return {
      id: 'ns',
      title: 'NS',
      status: 'fail',
      summary: 'No NS records',
      lines: ['No delegation NS records returned for this name.'],
    };
  }
  const status: HealthStatus = ns.length >= 2 ? 'pass' : 'warn';
  const lines = [
    `${ns.length} nameserver(s):`,
    ...ns.slice(0, 8),
  ];
  if (ns.length > 8) lines.push(`… +${ns.length - 8} more`);
  if (ns.length === 1) {
    lines.push('Only one NS — redundancy is recommended.');
  }
  return {
    id: 'ns',
    title: 'NS',
    status,
    summary: `${ns.length} nameserver(s)`,
    lines,
    raw: ns.join('\n'),
  };
}

async function checkMtaSts(
  domain: string,
  dns?: MailInfraCheckOptions,
): Promise<MailInfraCheck> {
  const txts = await resolveTxt(`_mta-sts.${domain}`, dns);
  const a = analyzeMtaStsTxt(txts);
  const lineStatuses = a.lines.map((l) => l.status);
  const rolled = foldSeverity(lineStatuses);
  const status: HealthStatus = a.isValid ? 'pass' : rolled;
  return {
    id: 'mtaSts',
    title: 'MTA-STS (DNS)',
    status,
    summary: a.isValid
      ? 'STS TXT valid'
      : a.recordCount === 0
        ? 'No STS TXT'
        : 'STS TXT issues',
    lines: a.lines.map((l) => l.text),
    raw: a.record ?? undefined,
  };
}

async function checkTlsRpt(
  domain: string,
  dns?: MailInfraCheckOptions,
): Promise<MailInfraCheck> {
  const txts = await resolveTxt(`_smtp._tls.${domain}`, dns);
  const a = analyzeTlsRptTxt(txts);
  const lineStatuses = a.lines.map((l) => l.status);
  const rolled = foldSeverity(lineStatuses);
  const status: HealthStatus = a.isValid ? 'pass' : rolled;
  return {
    id: 'tlsRpt',
    title: 'TLS-RPT',
    status,
    summary: a.isValid
      ? 'TLS-RPT valid'
      : a.recordCount === 0
        ? 'No TLS-RPT'
        : 'TLS-RPT issues',
    lines: a.lines.map((l) => l.text),
    raw: a.record ?? undefined,
  };
}

/** Shown when apex has no DNSKEY — also filtered from bullets when Detailed breakdown is off. */
export const DNSSEC_NO_DNSKEY_DETAIL_TEXT =
  'No DNSKEY records — DNSSEC not enabled (or wrong query name).';

const MAIL_INFRA_LINES_HIDDEN_WHEN_COMPACT = new Set<string>([
  MTA_STS_ABSENT_DETAIL_TEXT,
  TLS_RPT_ABSENT_DETAIL_TEXT,
  DNSSEC_NO_DNSKEY_DETAIL_TEXT,
]);

/** Omit noisy “record absent” bullets when Detailed breakdown is disabled (card summary/badge unchanged). */
export function filterMailInfraLinesWhenCompact(lines: string[]): string[] {
  return lines.filter((t) => !MAIL_INFRA_LINES_HIDDEN_WHEN_COMPACT.has(t));
}

function interpretDnssec(r: DohResult, domain: string): MailInfraCheck {
  const keyAnswers = r.answers.filter((a) => a.type === DNS_TYPE.DNSKEY);

  if (r.status === RCODE.SERVFAIL && !r.ad) {
    return {
      id: 'dnssec',
      title: 'DNSSEC',
      status: 'fail',
      summary: 'Validation failed',
      lines: [
        'DNSSEC validation failed for this query (SERVFAIL / not AD).',
      ],
    };
  }

  if (r.status === RCODE.NXDOMAIN) {
    return {
      id: 'dnssec',
      title: 'DNSSEC',
      status: 'fail',
      summary: 'Zone not found',
      lines: [`NXDOMAIN for ${domain} — cannot assess DNSKEY.`],
    };
  }

  if (keyAnswers.length === 0) {
    return {
      id: 'dnssec',
      title: 'DNSSEC',
      status: 'missing',
      summary: 'Not enabled',
      lines: [DNSSEC_NO_DNSKEY_DETAIL_TEXT],
    };
  }

  const lines: string[] = [`${keyAnswers.length} DNSKEY RR(s) returned.`];
  if (r.ad) {
    lines.push('AD=true — response validated by this DoH resolver.');
    return {
      id: 'dnssec',
      title: 'DNSSEC',
      status: 'pass',
      summary: 'Enabled & validated',
      lines,
    };
  }

  lines.push(
    'AD=false — keys present but response not AD-validated here (Test-DNSSEC style check).',
  );
  return {
    id: 'dnssec',
    title: 'DNSSEC',
    status: 'warn',
    summary: 'Present; not AD',
    lines,
  };
}

async function checkDnssec(
  domain: string,
  dns?: MailInfraCheckOptions,
): Promise<MailInfraCheck> {
  const r = await resolveDns(domain, DNS_TYPE.DNSKEY, {
    dnssec: true,
    fallbackWhenEmpty: true,
    dnsProvider: dns?.dnsProvider,
  });
  return interpretDnssec(r, domain);
}

/**
 * Extra checks similar to [DNSHealth](https://github.com/johnduprey/DNSHealth/) (MX, NS, MTA-STS TXT, TLS-RPT, Test-DNSSEC).
 * All use the organizational `mailDomain`.
 */
export async function runMailInfraChecks(
  mailDomain: string,
  options?: MailInfraCheckOptions,
): Promise<MailInfraCheck[]> {
  const d = mailDomain.toLowerCase();
  const dns = options;
  const [mx, ns, mtaSts, tlsRpt, dnssec, m365Tenant] = await Promise.all([
    checkMx(d, dns),
    checkNs(d, dns),
    checkMtaSts(d, dns),
    checkTlsRpt(d, dns),
    checkDnssec(d, dns),
    checkM365Tenant(d),
  ]);
  return [mx, ns, mtaSts, tlsRpt, dnssec, m365Tenant];
}
