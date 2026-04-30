/**
 * DNS-over-HTTPS JSON API (Cloudflare primary, Google fallback).
 * @see https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests/dns-json
 */

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

/**
 * Query public DoH — try Cloudflare then Google on failure or empty NOERROR.
 */
export async function resolveDns(
  name: string,
  type: number,
  options?: { dnssec?: boolean; fallbackWhenEmpty?: boolean },
): Promise<DohResult> {
  const dnssec = options?.dnssec ?? false;
  const fallbackWhenEmpty = options?.fallbackWhenEmpty ?? true;

  const cfUrl = buildUrl(CF_BASE, name, type, dnssec);
  try {
    const cf = await fetchDoh(cfUrl);
    if (
      !fallbackWhenEmpty ||
      cf.answers.length > 0 ||
      cf.status !== RCODE.NOERROR
    ) {
      return cf;
    }
  } catch {
    // fall through
  }
  const gUrl = buildUrl(GOOGLE_BASE, name, type, dnssec);
  return fetchDoh(gUrl);
}

/** TXT record strings for `name`. */
export async function resolveTxtRecords(name: string): Promise<string[]> {
  const r = await resolveDns(name, DNS_TYPE.TXT, { dnssec: false });
  if (r.status !== RCODE.NOERROR) {
    return [];
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of r.answers) {
    if (a.type !== DNS_TYPE.TXT || a.data == null) continue;
    const s = decodeTxtRdata(a.data);
    if (!seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
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

export async function resolveMx(name: string): Promise<MxRecord[]> {
  const r = await resolveDns(name, DNS_TYPE.MX, {
    dnssec: false,
    fallbackWhenEmpty: true,
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

export async function resolveNs(name: string): Promise<string[]> {
  const r = await resolveDns(name, DNS_TYPE.NS, {
    dnssec: false,
    fallbackWhenEmpty: true,
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
