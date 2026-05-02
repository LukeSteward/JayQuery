import { describe, expect, it } from 'vitest';
import {
  analyzeMxProviderGroup,
  identifyMxProvider,
} from '@/lib/mailProviders/identifyMxProvider';

describe('identifyMxProvider', () => {
  it('matches Microsoft 365 protection endpoints', () => {
    const r = identifyMxProvider(
      [
        { priority: 0, exchange: 'contoso-com.mail.protection.outlook.com' },
        { priority: 10, exchange: 'contoso-com.mail.protection.outlook.com' },
      ],
      'contoso.com',
    );
    expect(r?.name).toBe('Microsoft 365');
    expect(r?.expectedSpfInclude).toBe('spf.protection.outlook.com');
    expect(r?.matchedExchange).toBe('contoso-com.mail.protection.outlook.com');
  });

  it('matches Google Workspace-style MX', () => {
    const r = identifyMxProvider(
      [{ priority: 1, exchange: 'smtp.google.com' }],
      'example.com',
    );
    expect(r?.name).toBe('Google');
    expect(r?.dkimSelectors).toEqual(['google']);
  });

  it('matches googlemail.com MX hosts used alongside aspmx.l.google.com', () => {
    const r = identifyMxProvider(
      [{ priority: 50, exchange: 'aspmx2.googlemail.com' }],
      'example.com',
    );
    expect(r?.name).toBe('Google');
    expect(r?.matchedExchange).toBe('aspmx2.googlemail.com');
  });

  it('uses Mimecast Prefix for SPF include template', () => {
    const r = identifyMxProvider(
      [{ priority: 10, exchange: 'us-smtp-inbound-1.mimecast.com' }],
      'example.com',
    );
    expect(r?.name).toBe('Mimecast');
    expect(r?.expectedSpfInclude).toBe('us._netblocks.mimecast.com');
  });

  it('formats AppRiver SPF using domain dash notation', () => {
    const r = identifyMxProvider(
      [{ priority: 10, exchange: 'example-com.inbound10.arsmtp.com' }],
      'example.com',
    );
    expect(r?.name).toBe('AppRiver');
    expect(r?.expectedSpfInclude).toBe('example-com.spf.smtp25.com');
  });

  it('returns null when no profile matches', () => {
    const r = identifyMxProvider(
      [{ priority: 10, exchange: 'mx.custom-on-prem.example.net' }],
      'example.net',
    );
    expect(r).toBeNull();
  });

  it('walks MX in priority order and matches the first host that fits a profile', () => {
    const r = identifyMxProvider(
      [
        { priority: 5, exchange: 'edge-first.example.net' },
        { priority: 10, exchange: 'smtp.google.com' },
      ],
      'example.com',
    );
    expect(r?.name).toBe('Google');
    expect(r?.matchedExchange).toBe('smtp.google.com');
  });
});

describe('analyzeMxProviderGroup', () => {
  it('marks allSameProvider when every MX matches the same profile', () => {
    const g = analyzeMxProviderGroup(
      [
        { priority: 0, exchange: 'd226511.b.ess.uk.barracudanetworks.com' },
        { priority: 10, exchange: 'd226511.a.ess.uk.barracudanetworks.com' },
      ],
      'example.com',
    );
    expect(g.allSameProvider).toBe(true);
    expect(g.identified?.name).toBe('Barracuda Email Gateway Defense');
  });

  it('does not set allSameProvider when MX hosts hit different profiles', () => {
    const g = analyzeMxProviderGroup(
      [
        { priority: 5, exchange: 'mx1.ppe-hosted.com' },
        { priority: 10, exchange: 'smtp.google.com' },
      ],
      'example.com',
    );
    expect(g.allSameProvider).toBe(false);
  });

  it('does not set allSameProvider when one MX is unknown', () => {
    const g = analyzeMxProviderGroup(
      [
        { priority: 5, exchange: 'edge.example.net' },
        { priority: 10, exchange: 'smtp.google.com' },
      ],
      'example.com',
    );
    expect(g.allSameProvider).toBe(false);
    expect(g.identified?.name).toBe('Google');
  });

  it('marks allSameProvider for typical Google Workspace MX (l.google.com + googlemail.com)', () => {
    const g = analyzeMxProviderGroup(
      [
        { priority: 10, exchange: 'aspmx.l.google.com' },
        { priority: 30, exchange: 'alt1.aspmx.l.google.com' },
        { priority: 40, exchange: 'alt2.aspmx.l.google.com' },
        { priority: 50, exchange: 'aspmx2.googlemail.com' },
      ],
      'example.com',
    );
    expect(g.allSameProvider).toBe(true);
    expect(g.identified?.name).toBe('Google');
  });
});
