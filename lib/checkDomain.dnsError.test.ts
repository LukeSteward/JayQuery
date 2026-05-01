import { describe, expect, it, vi, beforeEach } from 'vitest';
import { runDnsCheck } from '@/lib/checkDomain';
import * as queryTxt from '@/lib/dns/queryTxt';
import * as mailInfra from '@/lib/checks/mailInfra';

vi.mock('@/lib/checks/mailInfra', () => ({
  runMailInfraChecks: vi.fn(),
}));

vi.mock('@/lib/dns/queryTxt', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/dns/queryTxt')>();
  return {
    ...mod,
    resolveTxtDetailed: vi.fn(),
  };
});

beforeEach(() => {
  vi.mocked(mailInfra.runMailInfraChecks).mockResolvedValue([]);
  vi.mocked(queryTxt.resolveTxtDetailed).mockReset();
});

describe('runDnsCheck DNS resolution errors', () => {
  it('marks SPF as fail when TXT lookup is non-definitive and strict mode is on', async () => {
    vi.mocked(queryTxt.resolveTxtDetailed).mockImplementation(
      async (name: string) => {
        if (name === 'example.com') {
          return { strings: [], dnsState: 'error' };
        }
        if (name === '_dmarc.example.com') {
          return { strings: ['v=DMARC1; p=reject;'], dnsState: 'ok' };
        }
        if (name.includes('._domainkey.')) {
          return { strings: [], dnsState: 'nxdomain' };
        }
        return { strings: [], dnsState: 'ok' };
      },
    );

    const r = await runDnsCheck('example.com', 'apex', {
      treatDnsResolutionErrorsAsFailure: true,
    });
    expect(r.emailAuthDnsError.spf).toBe(true);
    expect(r.full.spf.status).toBe('fail');
    expect(r.spfBreakdown[0].text).toContain('Could not resolve SPF TXT');
  });

  it('does not mark DNS error when strict mode is off', async () => {
    vi.mocked(queryTxt.resolveTxtDetailed).mockImplementation(
      async (name: string) => {
        if (name === 'example.com') {
          return { strings: [], dnsState: 'error' };
        }
        if (name === '_dmarc.example.com') {
          return { strings: ['v=DMARC1; p=reject;'], dnsState: 'ok' };
        }
        if (name.includes('._domainkey.')) {
          return { strings: [], dnsState: 'nxdomain' };
        }
        return { strings: [], dnsState: 'ok' };
      },
    );

    const r = await runDnsCheck('example.com', 'apex', {
      treatDnsResolutionErrorsAsFailure: false,
    });
    expect(r.emailAuthDnsError.spf).toBe(false);
    expect(r.full.spf.status).toBe('missing');
  });

  it('marks DKIM as fail when every selector hits DNS error', async () => {
    vi.mocked(queryTxt.resolveTxtDetailed).mockImplementation(
      async (name: string) => {
        if (name === 'example.com') {
          return { strings: ['v=spf1 -all'], dnsState: 'ok' };
        }
        if (name === '_dmarc.example.com') {
          return { strings: ['v=DMARC1; p=reject;'], dnsState: 'ok' };
        }
        if (name.includes('._domainkey.')) {
          return { strings: [], dnsState: 'error' };
        }
        return { strings: [], dnsState: 'ok' };
      },
    );

    const r = await runDnsCheck('example.com', 'apex', {
      treatDnsResolutionErrorsAsFailure: true,
    });
    expect(r.emailAuthDnsError.dkim).toBe(true);
    expect(r.full.dkim.status).toBe('fail');
    expect(r.dkimBreakdown.some((l) => l.text.includes('Could not resolve DKIM'))).toBe(
      true,
    );
  });
});
