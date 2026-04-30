import { getDomain } from 'tldts';
import { runMailInfraChecks, type MailInfraCheck } from '@/lib/checks/mailInfra';
import { resolveTxt } from '@/lib/dns/queryTxt';
import { analyzeSpf } from '@/lib/parse/spf';
import { analyzeDmarc } from '@/lib/parse/dmarc';
import {
  analyzeDkimRecord,
  getDkimSelectors,
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
  type FullScore,
  type GradeLine,
} from '@/lib/score';

export type CheckMode = 'apex' | 'exact';

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
  /** MX, NS, MTA-STS TXT, TLS-RPT, DNSSEC — organizational domain (DNSHealth-style). */
  mailInfra: MailInfraCheck[];
};

function mergeTxtForDkim(chunks: string[]): string | null {
  if (!chunks.length) return null;
  if (chunks.length === 1) return chunks[0];
  return chunks.join('');
}

/** SPF/DKIM query target + DMARC organizational domain (from tab host). */
export function resolveCheckTargets(
  tabHostname: string,
  mode: CheckMode,
): { tab: string; orgDomain: string; queryHost: string } {
  const tab = tabHostname.trim().toLowerCase();
  const orgDomain = getDomain(tab, { detectIp: false }) ?? tab;
  const queryHost = mode === 'apex' ? orgDomain : tab;
  return { tab, orgDomain, queryHost };
}

export async function runDnsCheck(
  tabHostname: string,
  mode: CheckMode = 'apex',
): Promise<CheckResult> {
  const { tab, orgDomain, queryHost } = resolveCheckTargets(tabHostname, mode);
  const dmarcFqdn = `_dmarc.${orgDomain}`;

  const [spfTxts, dmarcTxts, mailInfra] = await Promise.all([
    resolveTxt(queryHost),
    resolveTxt(dmarcFqdn),
    runMailInfraChecks(orgDomain),
  ]);

  const spfA = analyzeSpf(spfTxts);
  const dmarcA = analyzeDmarc(dmarcTxts);

  let dkimBest: (DkimRecordAnalysis & { selector: string }) | null = null;

  for (const sel of getDkimSelectors()) {
    const name = `${sel}._domainkey.${queryHost}`;
    const txts = await resolveTxt(name);
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

  if (!dkimBest) {
    dkimBest = {
      valid: false,
      selector: getDkimSelectors()[0],
      hasVersion: false,
      keyType: null,
      publicKeyEmpty: true,
      raw: null,
    };
  }

  const spfScore = scoreSpf(spfA);
  const dmarcScore = scoreDmarc(dmarcA, orgDomain);
  const dkimScore = scoreDkim(dkimBest);

  return {
    tabHostname: tab,
    queryHostname: queryHost,
    dmarcLookupHost: orgDomain,
    mode,
    full: computeFullScore(spfScore, dmarcScore, dkimScore),
    spfRecords: spfA.rawRecords,
    dmarcRecords: dmarcA.rawRecords,
    dkim: dkimBest,
    spfBreakdown: buildSpfBreakdown(spfA),
    dmarcBreakdown: buildDmarcBreakdown(dmarcA, orgDomain),
    dkimBreakdown: buildDkimBreakdown(dkimBest),
    mailInfra,
  };
}
