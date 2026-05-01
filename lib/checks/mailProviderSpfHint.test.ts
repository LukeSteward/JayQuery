import { describe, expect, it } from 'vitest';
import { buildMailProviderSpfHint } from '@/lib/checks/mailProviderSpfHint';

describe('buildMailProviderSpfHint', () => {
  it('passes when org SPF includes the expected mechanism', () => {
    const h = buildMailProviderSpfHint(
      'contoso.com',
      {
        dnsState: 'ok',
        strings: ['v=spf1 include:spf.protection.outlook.com -all'],
      },
      'spf.protection.outlook.com',
      'Microsoft 365',
    );
    expect(h.status).toBe('pass');
    expect(h.summary).toContain('spf.protection.outlook.com');
  });

  it('warns when include is missing', () => {
    const h = buildMailProviderSpfHint(
      'contoso.com',
      {
        dnsState: 'ok',
        strings: ['v=spf1 include:something.else.example -all'],
      },
      'spf.protection.outlook.com',
      'Microsoft 365',
    );
    expect(h.status).toBe('warn');
  });

  it('missing when no SPF TXT', () => {
    const h = buildMailProviderSpfHint(
      'contoso.com',
      { dnsState: 'ok', strings: ['not spf'] },
      'spf.example.com',
      'ExampleCo',
    );
    expect(h.status).toBe('missing');
  });

  it('fails on DNS error state', () => {
    const h = buildMailProviderSpfHint(
      'contoso.com',
      { dnsState: 'error', strings: [] },
      'spf.protection.outlook.com',
      'Microsoft 365',
    );
    expect(h.status).toBe('fail');
  });
});
