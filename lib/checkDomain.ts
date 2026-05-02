import { getDomain } from 'tldts';
import { runMailInfraChecks, type MailInfraCheck } from '@/lib/checks/mailInfra';
import {
  buildMailProviderSpfHint,
  type SpfMailProviderHint,
} from '@/lib/checks/mailProviderSpfHint';
import { resolveTxtDetailed } from '@/lib/dns/queryTxt';
import type { TxtRecordsDetailed } from '@/lib/dns/dohJson';
import type { DnsProvider } from '@/lib/settings';
import { analyzeSpf } from '@/lib/parse/spf';
import { analyzeDmarc } from '@/lib/parse/dmarc';
import {
  analyzeDkimRecord,
  dkimDnsWildcardFqdn,
  getDkimSelectors,
  isNullDkimDeclaration,
  type DkimRecordAnalysis,
} from '@/lib/parse/dkim';
import {
  buildDkimBreakdown,
  buildDmarcBreakdown,
  buildSpfBreakdown,
  computeFullScore,
  scoreDmarc,
  scoreDkim,
  scoreSpf,
  scoreDnsResolutionFailure,
  type FullScore,
  type GradeLine,
} from '@/lib/score';

export type CheckMode = 'apex' | 'exact';

export type DnsCheckOptions = {
  /** When true, SERVFAIL / fetch failure count as fail for SPF/DMARC/DKIM. Default true. */
  treatDnsResolutionErrorsAsFailure?: boolean;
  /** Which public DoH endpoint is queried first. Default `google`. */
  dnsProvider?: DnsProvider;
};

export type CheckResult = {
  tabHostname: string;
  queryHostname: string;
  dmarcLookupHost: string;
  mode: CheckMode;
  full: FullScore;
  spfRecords: string[];
  dmarcRecords: string[];
  dkim: DkimRecordAnalysis & { selector: string };
  spfBreakdown: GradeLine[];
  dmarcBreakdown: GradeLine[];
  dkimBreakdown: GradeLine[];
  /** MX, NS, MTA-STS TXT, TLS-RPT, DNSSEC, M365 tenant at organisational domain. */
  mailInfra: MailInfraCheck[];
  /** True when that pillar hit non-definitive DNS and strict mode applied. */
  emailAuthDnsError: { spf: boolean; dmarc: boolean; dkim: boolean };
  /**
   * Inbound MX provider SPF include check at the organisational domain; informational only;
   * does not change {@link CheckResult.full} scores.
   */
  spfMailProviderHint?: SpfMailProviderHint;
};

function mergeTxtForDkim(chunks: string[]): string | null {
  if (!chunks.length) return null;
  if (chunks.length === 1) return chunks[0];
  return chunks.join('');
}

const DNS_FAIL_SPF: GradeLine[] = [
  {
    status: 'fail',
    text: 'Could not resolve SPF TXT (DNS error or non-definitive response).',
  },
];

const DNS_FAIL_DMARC = (org: string): GradeLine[] => [
  {
    status: 'fail',
    text: `Could not resolve DMARC TXT at _dmarc.${org} (DNS error or non-definitive response).`,
  },
];

const DNS_FAIL_DKIM: GradeLine[] = [
  {
    status: 'fail',
    text:
      'Could not resolve DKIM TXT at *._domainkey, _domainkey, or any probed selector (DNS error or non-definitive response).',
  },
];

/** SPF/DKIM query target + DMARC organisational domain (from tab host). */
export function resolveCheckTargets(
  tabHostname: string,
  mode: CheckMode,
): { tab: string; orgDomain: string; queryHost: string } {
  const tab = tabHostname.trim().toLowerCase();
  const orgDomain = getDomain(tab, { detectIp: false }) ?? tab;
  const queryHost = mode === 'apex' ? orgDomain : tab;
  return { tab, orgDomain, queryHost };
}

function analysisStrings(
  detailed: TxtRecordsDetailed,
  treatDnsAsFail: boolean,
): string[] {
  if (detailed.dnsState === 'error' && treatDnsAsFail) {
    return [];
  }
  return detailed.strings;
}

export async function runDnsCheck(
  tabHostname: string,
  mode: CheckMode = 'apex',
  options?: DnsCheckOptions,
): Promise<CheckResult> {
  const treatDnsAsFail = options?.treatDnsResolutionErrorsAsFailure ?? true;
  const dnsTxt = { dnsProvider: options?.dnsProvider };
  const { tab, orgDomain, queryHost } = resolveCheckTargets(tabHostname, mode);
  const dmarcFqdn = `_dmarc.${orgDomain}`;

  const orgSpfPromise = resolveTxtDetailed(orgDomain, dnsTxt);
  const [spfDetailed, dmarcDetailed, mailInfra] = await Promise.all([
    queryHost === orgDomain
      ? orgSpfPromise
      : resolveTxtDetailed(queryHost, dnsTxt),
    resolveTxtDetailed(dmarcFqdn, dnsTxt),
    runMailInfraChecks(orgDomain, dnsTxt),
  ]);
  const orgSpfDetailed =
    queryHost === orgDomain ? spfDetailed : await orgSpfPromise;

  const mxCard = mailInfra.find((c) => c.id === 'mx');
  const prof = mxCard?.providerProfile;
  const spfMailProviderHint =
    prof?.expectedSpfInclude?.trim()
      ? buildMailProviderSpfHint(
          orgDomain,
          orgSpfDetailed,
          prof.expectedSpfInclude,
          prof.name,
        )
      : undefined;

  const spfTxts = analysisStrings(spfDetailed, treatDnsAsFail);
  const dmarcTxts = analysisStrings(dmarcDetailed, treatDnsAsFail);

  const spfDnsErr =
    treatDnsAsFail && spfDetailed.dnsState === 'error';
  const dmarcDnsErr =
    treatDnsAsFail && dmarcDetailed.dnsState === 'error';

  const spfA = analyzeSpf(spfTxts);
  const dmarcA = analyzeDmarc(dmarcTxts);

  let dkimBest: (DkimRecordAnalysis & { selector: string }) | null = null;
  let hadDefinitiveDkimLookup = false;

  const wildcardDkimDet = await resolveTxtDetailed(
    dkimDnsWildcardFqdn(queryHost),
    dnsTxt,
  );
  if (
    wildcardDkimDet.dnsState === 'ok' ||
    wildcardDkimDet.dnsState === 'nxdomain'
  ) {
    hadDefinitiveDkimLookup = true;
  }
  const wildcardTxts = analysisStrings(wildcardDkimDet, treatDnsAsFail);
  const wildcardMerged = mergeTxtForDkim(wildcardTxts);
  const wildcardRec = analyzeDkimRecord(wildcardMerged);
  const wildcardOverrides =
    isNullDkimDeclaration(wildcardRec) ||
    wildcardRec.valid ||
    Boolean(wildcardRec.raw);

  if (wildcardOverrides) {
    dkimBest = { ...wildcardRec, selector: '*' };
  } else {
    const apexDkimFqdn = `_domainkey.${queryHost}`;
    const apexDkimDet = await resolveTxtDetailed(apexDkimFqdn, dnsTxt);
    if (
      apexDkimDet.dnsState === 'ok' ||
      apexDkimDet.dnsState === 'nxdomain'
    ) {
      hadDefinitiveDkimLookup = true;
    }
    const apexDkimTxts = analysisStrings(apexDkimDet, treatDnsAsFail);
    const apexDkimMerged = mergeTxtForDkim(apexDkimTxts);
    const apexDkimRec = analyzeDkimRecord(apexDkimMerged);

    if (isNullDkimDeclaration(apexDkimRec)) {
      dkimBest = { ...apexDkimRec, selector: '_domainkey' };
    } else if (apexDkimRec.valid) {
      dkimBest = { ...apexDkimRec, selector: '_domainkey' };
    } else {
      for (const sel of getDkimSelectors()) {
        const name = `${sel}._domainkey.${queryHost}`;
        const det = await resolveTxtDetailed(name, dnsTxt);
        if (det.dnsState === 'ok' || det.dnsState === 'nxdomain') {
          hadDefinitiveDkimLookup = true;
        }
        const txts = analysisStrings(det, treatDnsAsFail);
        const merged = mergeTxtForDkim(txts);
        const rec = analyzeDkimRecord(merged);
        const tagged: DkimRecordAnalysis & { selector: string } = {
          ...rec,
          selector: sel,
        };
        if (rec.valid) {
          dkimBest = tagged;
          break;
        }
        if (!dkimBest && rec.raw) {
          dkimBest = tagged;
        }
      }
    }
  }

  if (!dkimBest) {
    dkimBest = {
      valid: false,
      selector: '*',
      hasVersion: false,
      keyType: null,
      publicKeyEmpty: true,
      raw: null,
    };
  }

  const dkimDnsErr = treatDnsAsFail && !hadDefinitiveDkimLookup;

  let spfScore = scoreSpf(spfA);
  let dmarcScore = scoreDmarc(dmarcA, orgDomain);
  let dkimScore = scoreDkim(dkimBest);

  let spfBreakdown = buildSpfBreakdown(spfA);
  let dmarcBreakdown = buildDmarcBreakdown(dmarcA, orgDomain);
  let dkimBreakdown = buildDkimBreakdown(dkimBest, queryHost);

  if (spfDnsErr) {
    spfScore = scoreDnsResolutionFailure(
      'spf',
      'Could not resolve SPF TXT (DNS error or non-definitive response).',
    );
    spfBreakdown = DNS_FAIL_SPF;
  }
  if (dmarcDnsErr) {
    dmarcScore = scoreDnsResolutionFailure(
      'dmarc',
      `Could not resolve DMARC TXT at _dmarc.${orgDomain} (DNS error or non-definitive response).`,
    );
    dmarcBreakdown = DNS_FAIL_DMARC(orgDomain);
  }
  if (dkimDnsErr) {
    dkimScore = scoreDnsResolutionFailure(
      'dkim',
      'Could not resolve DKIM TXT at *._domainkey, _domainkey, or any probed selector (DNS error or non-definitive response).',
    );
    dkimBreakdown = DNS_FAIL_DKIM;
  }

  return {
    tabHostname: tab,
    queryHostname: queryHost,
    dmarcLookupHost: orgDomain,
    mode,
    full: computeFullScore(spfScore, dmarcScore, dkimScore),
    spfRecords: spfA.rawRecords,
    dmarcRecords: dmarcA.rawRecords,
    dkim: dkimBest,
    spfBreakdown,
    dmarcBreakdown,
    dkimBreakdown,
    mailInfra,
    spfMailProviderHint,
    emailAuthDnsError: {
      spf: spfDnsErr,
      dmarc: dmarcDnsErr,
      dkim: dkimDnsErr,
    },
  };
}
