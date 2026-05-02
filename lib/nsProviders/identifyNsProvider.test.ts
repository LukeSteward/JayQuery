import { describe, expect, it } from 'vitest';
import {
  analyzeNsProviderGroup,
  identifyNsProvider,
  matchNsHostToProvider,
} from '@/lib/nsProviders/identifyNsProvider';

describe('matchNsHostToProvider', () => {
  it('matches Microsoft Azure DNS', () => {
    const r = matchNsHostToProvider('ns1-01.azure-dns.com');
    expect(r?.name).toBe('Microsoft Azure DNS');
    expect(r?.matchedHost).toBe('ns1-01.azure-dns.com');
  });

  it('matches Amazon Route 53 (awsdns delegation)', () => {
    const r = matchNsHostToProvider('ns-2048.awsdns-56.co.uk');
    expect(r?.name).toBe('Amazon Route 53');
  });

  it('matches Amazon Route 53 (amzndns glue)', () => {
    expect(matchNsHostToProvider('ns1.amzndns.com')?.name).toBe(
      'Amazon Route 53',
    );
    expect(matchNsHostToProvider('ns2.amzndns.co.uk')?.name).toBe(
      'Amazon Route 53',
    );
    expect(matchNsHostToProvider('ns1.amzndns.net')?.name).toBe(
      'Amazon Route 53',
    );
    expect(matchNsHostToProvider('ns2.amzndns.org')?.name).toBe(
      'Amazon Route 53',
    );
  });

  it('matches Cloudflare', () => {
    const r = matchNsHostToProvider('david.ns.cloudflare.com');
    expect(r?.name).toBe('Cloudflare');
  });

  it('matches IONOS ui-dns delegation', () => {
    const r = matchNsHostToProvider('ns1047.ui-dns.com');
    expect(r?.name).toBe('IONOS');
  });

  it('returns null for unknown nameserver', () => {
    expect(matchNsHostToProvider('ns1.custom-on-prem.example.net')).toBeNull();
  });

  it('is case insensitive', () => {
    const r = matchNsHostToProvider('DAVID.NS.CLOUDFLARE.COM');
    expect(r?.name).toBe('Cloudflare');
  });
});

describe('identifyNsProvider', () => {
  it('uses lexicographically first host among matches as primary', () => {
    const r = identifyNsProvider([
      'zebra.ns.cloudflare.com',
      'amy.ns.cloudflare.com',
      'marc.ns.cloudflare.com',
    ]);
    expect(r?.name).toBe('Cloudflare');
    expect(r?.matchedHost).toBe('amy.ns.cloudflare.com');
  });

  it('matches first alphabetical host that resolves to any profile', () => {
    const r = identifyNsProvider([
      'ns-unknown.example.net',
      'ns-cloud-e1.googledomains.com',
      'ns-2048.awsdns-56.net',
    ]);
    expect(r?.name).toBe('Amazon Route 53');
    expect(r?.matchedHost).toBe('ns-2048.awsdns-56.net');
  });
});

describe('analyzeNsProviderGroup', () => {
  it('sets allSameProvider when every NS matches one profile name', () => {
    const g = analyzeNsProviderGroup([
      'amy.ns.cloudflare.com',
      'brad.ns.cloudflare.com',
    ]);
    expect(g.allSameProvider).toBe(true);
    expect(g.identified?.name).toBe('Cloudflare');
  });

  it('does not set allSameProvider when NS hit different profiles', () => {
    const g = analyzeNsProviderGroup([
      'ns-851.awsdns-42.net',
      'david.ns.cloudflare.com',
    ]);
    expect(g.allSameProvider).toBe(false);
    expect(g.identified?.name).toBeDefined();
  });

  it('does not set allSameProvider when one NS is unknown', () => {
    const g = analyzeNsProviderGroup([
      'ns1.edge.example.net',
      'david.ns.cloudflare.com',
    ]);
    expect(g.allSameProvider).toBe(false);
    expect(g.identified?.name).toBe('Cloudflare');
  });
});
