import type { TxtRecordsDetailed } from '@/lib/dns/dohJson';
import { analyzeSpf, spfTxtRecordsInclude } from '@/lib/parse/spf';
import type { HealthStatus } from '@/lib/score/common';

/** Supplementary SPF check vs inbound MX provider profile — does not affect scoring. */
export type SpfMailProviderHint = {
  providerName: string;
  status: HealthStatus;
  summary: string;
  lines: string[];
};

/**
 * Compare SPF TXT at the mail (organizational) domain to the include suggested by
 * the identified MX host provider profile.
 */
export function buildMailProviderSpfHint(
  mailDomain: string,
  orgSpfTxt: TxtRecordsDetailed,
  expectedInclude: string,
  providerName: string,
): SpfMailProviderHint {
  const expected = expectedInclude.trim();
  const detailLabel = `SPF TXT at ${mailDomain}`;

  if (orgSpfTxt.dnsState === 'error') {
    return {
      providerName,
      status: 'fail',
      summary: 'SPF lookup failed',
      lines: [
        `Could not resolve ${detailLabel} (DNS error or non-definitive response).`,
      ],
    };
  }

  const txts = orgSpfTxt.strings;
  const spfA = analyzeSpf(txts);

  if (!spfA.present) {
    return {
      providerName,
      status: 'missing',
      summary: 'No SPF on mail domain',
      lines: [
        `No v=spf1 record on ${mailDomain}.`,
        `${providerName} (from MX) typically publishes: include:${expected}`,
      ],
    };
  }

  const includes = spfTxtRecordsInclude(txts, expected);
  const lines: string[] = [];

  if (spfA.multipleRecords) {
    lines.push(
      'Several v=spf1 TXT strings exist for this name — only one SPF record is valid per RFC.',
    );
  }

  if (includes) {
    // Summary already states the include; avoid repeating the same line below.
    return {
      providerName,
      status: spfA.multipleRecords ? 'warn' : 'pass',
      summary: `Includes ${expected}`,
      lines,
    };
  }

  lines.push(
    `SPF is published but has no include:${expected} (checked against ${detailLabel}).`,
  );
  lines.push(
    'If you send outbound mail through this provider, add that include (or the vendor’s current SPF macro) to the record.',
  );
  return {
    providerName,
    status: 'warn',
    summary: `Missing include:${expected}`,
    lines,
  };
}
