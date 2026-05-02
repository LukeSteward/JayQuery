/**
 * DNS-over-HTTPS JSON API (choice of Google-first or Cloudflare-first, with fallback).
 * @see https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests/dns-json
 */

import type { DnsProvider } from '@/lib/settings';
import { decodeTxtRdata } from '@/lib/dns/txtDecode';

const CF_BASE = 'https://cloudflare-dns.com/dns-query';
const GOOGLE_BASE = 'https://dns.google/resolve';

export type DohAnswer = {
  name: string;
  type: number;
  TTL?: number;
  data?: string;
};

export type DohResult = {
  status: number;
  ad: boolean;
  answers: DohAnswer[];
};

/** Set when both DoH providers fail the HTTP request. */
export const FETCH_FAILED_STATUS = -1;

export type ResolveDnsOutcome = DohResult & {
  fetchFailed: boolean;
};

/** https://www.iana.org/assignments/dns-parameters/dns-parameters.xhtml#dns-parameters-6 */
export const DNS_TYPE = {
  A: 1,
  NS: 2,
  MX: 15,
  TXT: 16,
  DNSKEY: 48,
} as const;

export const RCODE = {
  NOERROR: 0,
  SERVFAIL: 2,
  NXDOMAIN: 3,
} as const;

/** Options shared by TXT/MX/NS/DNSSEC DoH lookups. */
export type DohResolveOptions = {
  dnssec?: boolean;
  fallbackWhenEmpty?: boolean;
  /** Default `google` (matches extension settings default). */
  dnsProvider?: DnsProvider;
};

function dohBaseOrder(dnsProvider: DnsProvider): [string, string] {
  return dnsProvider === 'google'
    ? [GOOGLE_BASE, CF_BASE]
    : [CF_BASE, GOOGLE_BASE];
}

function buildUrl(
  base: string,
  name: string,
  type: number,
  dnssec: boolean,
): string {
  const u = new URL(base);
  u.searchParams.set('name', name);
  u.searchParams.set('type', String(type));
  if (dnssec) {
    u.searchParams.set('do', 'true');
  }
  return u.toString();
}

async function fetchDoh(url: string): Promise<DohResult> {
  const res = await fetch(url, {
    headers: { Accept: 'application/dns-json' },
  });
  if (!res.ok) {
    throw new Error(`DoH HTTP ${res.status}`);
  }
  const json = (await res.json()) as {
    Status: number;
    AD?: boolean;
    Answer?: DohAnswer[];
  };
  return {
    status: json.Status,
    ad: json.AD === true,
    answers: json.Answer ?? [],
  };
}

async function resolveDnsOutcome(
  name: string,
  type: number,
  options?: DohResolveOptions,
): Promise<ResolveDnsOutcome> {
  const dnssec = options?.dnssec ?? false;
  const fallbackWhenEmpty = options?.fallbackWhenEmpty ?? true;
  const dnsProvider = options?.dnsProvider ?? 'google';
  const [primaryBase, fallbackBase] = dohBaseOrder(dnsProvider);

  const tryFetch = async (base: string): Promise<DohResult> => {
    const url = buildUrl(base, name, type, dnssec);
    return fetchDoh(url);
  };

  function shouldUseResult(o: DohResult): boolean {
    return (
      !fallbackWhenEmpty ||
      o.answers.length > 0 ||
      o.status !== RCODE.NOERROR
    );
  }

  try {
    const first = await tryFetch(primaryBase);
    if (shouldUseResult(first)) {
      return { ...first, fetchFailed: false };
    }
  } catch {
    /* try fallback provider */
  }
  try {
    const second = await tryFetch(fallbackBase);
    return { ...second, fetchFailed: false };
  } catch {
    return {
      status: FETCH_FAILED_STATUS,
      ad: false,
      answers: [],
      fetchFailed: true,
    };
  }
}

/**
 * Query public DoH: primary resolver from settings preference, alternate on failure or empty NOERROR.
 * Throws if both providers fail the HTTP request (legacy behaviour for MX/NS).
 */
export async function resolveDns(
  name: string,
  type: number,
  options?: DohResolveOptions,
): Promise<DohResult> {
  const o = await resolveDnsOutcome(name, type, options);
  if (o.fetchFailed) {
    throw new Error('DoH unavailable');
  }
  return { status: o.status, ad: o.ad, answers: o.answers };
}

export type TxtDnsState = 'ok' | 'nxdomain' | 'error';

export type TxtRecordsDetailed = {
  strings: string[];
  dnsState: TxtDnsState;
};

function classifyTxtDnsState(o: ResolveDnsOutcome): TxtDnsState {
  if (o.fetchFailed) return 'error';
  if (o.status === RCODE.NXDOMAIN) return 'nxdomain';
  if (o.status === RCODE.NOERROR) return 'ok';
  return 'error';
}

/**
 * TXT strings plus whether the lookup was definitive (NOERROR / NXDOMAIN) vs error.
 */
export async function resolveTxtRecordsDetailed(
  name: string,
  options?: DohResolveOptions,
): Promise<TxtRecordsDetailed> {
  const o = await resolveDnsOutcome(name, DNS_TYPE.TXT, {
    dnssec: false,
    fallbackWhenEmpty: true,
    ...options,
  });
  const dnsState = classifyTxtDnsState(o);
  if (dnsState !== 'ok') {
    return { strings: [], dnsState };
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of o.answers) {
    if (a.type !== DNS_TYPE.TXT || a.data == null) continue;
    const s = decodeTxtRdata(a.data);
    if (!seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return { strings: out, dnsState: 'ok' };
}

/** TXT record strings for `name` (legacy helper for mail-infra and simple callers). */
export async function resolveTxtRecords(
  name: string,
  options?: DohResolveOptions,
): Promise<string[]> {
  const d = await resolveTxtRecordsDetailed(name, options);
  return d.strings;
}

export type MxRecord = { priority: number; exchange: string };

/** Parse MX RDATA: "10 mail.example.com." */
export function parseMxRdata(data: string): MxRecord | null {
  const parts = data.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const priority = Number(parts[0]);
  if (!Number.isFinite(priority)) return null;
  const exchange = parts.slice(1).join(' ').replace(/\.$/, '').toLowerCase();
  return { priority, exchange };
}

export async function resolveMx(
  name: string,
  options?: Pick<DohResolveOptions, 'dnsProvider'>,
): Promise<MxRecord[]> {
  const r = await resolveDns(name, DNS_TYPE.MX, {
    dnssec: false,
    fallbackWhenEmpty: true,
    dnsProvider: options?.dnsProvider,
  });
  if (r.status !== RCODE.NOERROR) {
    return [];
  }
  const rows: MxRecord[] = [];
  for (const a of r.answers) {
    if (a.type !== DNS_TYPE.MX || !a.data) continue;
    const rec = parseMxRdata(a.data);
    if (rec) rows.push(rec);
  }
  return rows.sort((x, y) => x.priority - y.priority);
}

export async function resolveNs(
  name: string,
  options?: Pick<DohResolveOptions, 'dnsProvider'>,
): Promise<string[]> {
  const r = await resolveDns(name, DNS_TYPE.NS, {
    dnssec: false,
    fallbackWhenEmpty: true,
    dnsProvider: options?.dnsProvider,
  });
  if (r.status !== RCODE.NOERROR) {
    return [];
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of r.answers) {
    if (a.type !== DNS_TYPE.NS || !a.data) continue;
    const host = a.data.replace(/\.$/, '').toLowerCase();
    if (!seen.has(host)) {
      seen.add(host);
      out.push(host);
    }
  }
  return out;
}
