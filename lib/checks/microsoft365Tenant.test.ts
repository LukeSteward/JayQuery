import { describe, expect, it, vi } from 'vitest';
import {
  checkM365Tenant,
  extractTenantDirectoryIdFromUrl,
  tenantDirectoryIdFromDiscoveryDoc,
} from '@/lib/checks/microsoft365Tenant';

describe('extractTenantDirectoryIdFromUrl', () => {
  it('returns GUID segment from login.microsoftonline.com issuer', () => {
    expect(
      extractTenantDirectoryIdFromUrl(
        'https://login.microsoftonline.com/deadbeef-dead-beef-abcd-ef0123456789/v2.0',
      ),
    ).toBe('deadbeef-dead-beef-abcd-ef0123456789');
  });

  it('normalizes casing to lowercase', () => {
    expect(
      extractTenantDirectoryIdFromUrl(
        'https://login.microsoftonline.com/DEADbeef-DEAD-BEEF-ABCD-EF0123456789/oauth2/v2.0/token',
      ),
    ).toBe('deadbeef-dead-beef-abcd-ef0123456789');
  });

  it('returns GUID from STS issuer path', () => {
    expect(
      extractTenantDirectoryIdFromUrl(
        'https://sts.windows.net/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/',
      ),
    ).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  });

  it('returns null for wrong host', () => {
    expect(extractTenantDirectoryIdFromUrl('https://evil.test/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/')).toBeNull();
  });

  it('returns null when path has only non-GUID segment', () => {
    expect(
      extractTenantDirectoryIdFromUrl(
        'https://login.microsoftonline.com/contoso.onmicrosoft.com/oauth2/v2.0/authorize',
      ),
    ).toBeNull();
  });

  it('returns null on malformed URL', () => {
    expect(extractTenantDirectoryIdFromUrl('not-a-url')).toBeNull();
  });
});

describe('tenantDirectoryIdFromDiscoveryDoc', () => {
  it('prefers issuer GUID', () => {
    const tid = tenantDirectoryIdFromDiscoveryDoc({
      issuer: 'https://login.microsoftonline.com/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/v2.0',
      authorization_endpoint:
        'https://login.microsoftonline.com/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/oauth2/v2.0/authorize',
      token_endpoint:
        'https://login.microsoftonline.com/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/oauth2/v2.0/token',
    });
    expect(tid).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  });

  it('falls back to authorization_endpoint when issuer has no GUID', () => {
    expect(
      tenantDirectoryIdFromDiscoveryDoc({
        issuer: 'https://login.microsoftonline.com/{tenant}/v2.0',
        authorization_endpoint:
          'https://login.microsoftonline.com/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/oauth2/v2.0/authorize',
      }),
    ).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  });

  it('returns null for template placeholders only', () => {
    expect(
      tenantDirectoryIdFromDiscoveryDoc({
        issuer: 'https://login.microsoftonline.com/common/v2.0',
        authorization_endpoint:
          'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize',
      }),
    ).toBeNull();
  });

  it('reads sts.windows.net issuer', () => {
    expect(
      tenantDirectoryIdFromDiscoveryDoc({
        issuer: 'https://sts.windows.net/bbbbbbbb-cccc-dddd-eeee-ffffffffffff/',
      }),
    ).toBe('bbbbbbbb-cccc-dddd-eeee-ffffffffffff');
  });
});

describe('checkM365Tenant', () => {
  it('reports fail for invalid hostname', async () => {
    const r = await checkM365Tenant('evil..domain');
    expect(r.id).toBe('m365Tenant');
    expect(r.status).toBe('fail');
    expect(r.summary).toBe('Invalid hostname');
  });

  it('reports missing with 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(null, {
          status: 404,
        }),
      ),
    );
    try {
      const r = await checkM365Tenant('probably-nonexistent.invalid');
      expect(r.status).toBe('missing');
      expect(r.summary).toContain('404');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('reports pass when JSON contains issuer GUID', async () => {
    const body = {
      issuer: 'https://login.microsoftonline.com/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/v2.0',
      authorization_endpoint:
        'https://login.microsoftonline.com/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/oauth2/v2.0/authorize',
      token_endpoint:
        'https://login.microsoftonline.com/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/oauth2/v2.0/token',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 })),
    );
    try {
      const r = await checkM365Tenant('example.com');
      expect(r.status).toBe('pass');
      expect(r.lines.join('')).toContain('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
      expect(fetch).toHaveBeenCalledWith(
        'https://login.microsoftonline.com/example.com/v2.0/.well-known/openid-configuration',
        expect.any(Object),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
