import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  parseMxRdata,
  RCODE,
  resolveTxtRecordsDetailed,
} from '@/lib/dns/dohJson';

function jsonResponse(obj: object): Response {
  return {
    ok: true,
    status: 200,
    json: async () => obj,
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('dohJson helpers', () => {
  it('parses MX RDATA', () => {
    expect(parseMxRdata('10 mail.example.com.')).toEqual({
      priority: 10,
      exchange: 'mail.example.com',
    });
  });

  it('RCODE constants', () => {
    expect(RCODE.NXDOMAIN).toBe(3);
  });
});

describe('resolveTxtRecordsDetailed', () => {
  it('returns dnsState nxdomain for NXDOMAIN', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ Status: RCODE.NXDOMAIN })),
    );
    const r = await resolveTxtRecordsDetailed('missing.example.test');
    expect(r.dnsState).toBe('nxdomain');
    expect(r.strings).toEqual([]);
  });

  it('returns dnsState error for SERVFAIL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ Status: RCODE.SERVFAIL })),
    );
    const r = await resolveTxtRecordsDetailed('broken.example.test');
    expect(r.dnsState).toBe('error');
    expect(r.strings).toEqual([]);
  });

  it('returns dnsState ok and strings for NOERROR with TXT', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          Status: RCODE.NOERROR,
          Answer: [
            {
              name: 'x.test',
              type: 16,
              data: '"v=spf1 -all"',
            },
          ],
        }),
      ),
    );
    const r = await resolveTxtRecordsDetailed('spf.x.test');
    expect(r.dnsState).toBe('ok');
    expect(r.strings.some((s) => s.includes('v=spf1'))).toBe(true);
  });

  it('queries Google DoH first when dnsProvider is google', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        Status: RCODE.NOERROR,
        Answer: [{ name: 'x.test', type: 16, data: '"v=spf1 -all"' }],
      }),
    );
    vi.stubGlobal('fetch', fetchFn);
    await resolveTxtRecordsDetailed('spf.x.test', { dnsProvider: 'google' });
    expect(String(fetchFn.mock.calls[0][0])).toContain('dns.google');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('queries Cloudflare DoH first when dnsProvider is cloudflare', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        Status: RCODE.NOERROR,
        Answer: [{ name: 'x.test', type: 16, data: '"v=spf1 -all"' }],
      }),
    );
    vi.stubGlobal('fetch', fetchFn);
    await resolveTxtRecordsDetailed('spf.x.test', {
      dnsProvider: 'cloudflare',
    });
    expect(String(fetchFn.mock.calls[0][0])).toContain('cloudflare-dns.com');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('defaults to Google DoH first when dnsProvider omitted', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        Status: RCODE.NOERROR,
        Answer: [{ name: 'x.test', type: 16, data: '"v=spf1 -all"' }],
      }),
    );
    vi.stubGlobal('fetch', fetchFn);
    await resolveTxtRecordsDetailed('spf.x.test');
    expect(String(fetchFn.mock.calls[0][0])).toContain('dns.google');
  });

  it('concatenates multi-chunk TXT in one answer (Cloudflare-style)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          Status: RCODE.NOERROR,
          Answer: [
            {
              name: '_example.test',
              type: 16,
              data:
                '"v=DMARC1;" "p=quarantine;" "rua=mailto:a@x.test;"',
            },
          ],
        }),
      ),
    );
    const r = await resolveTxtRecordsDetailed('_dmarc.example.test', {
      dnsProvider: 'cloudflare',
    });
    expect(r.dnsState).toBe('ok');
    expect(r.strings).toEqual([
      'v=DMARC1;p=quarantine;rua=mailto:a@x.test;',
    ]);
  });
});
