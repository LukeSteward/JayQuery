import { describe, expect, it } from 'vitest';
import {
  analyzeDkimRecord,
  dkimDnsWildcardFqdn,
  isNullDkimDeclaration,
} from '@/lib/parse/dkim';

describe('analyzeDkimRecord', () => {
  it('accepts valid DKIM', () => {
    const r = analyzeDkimRecord('v=DKIM1; k=rsa; p=MIGfMA0GC...');
    expect(r.valid).toBe(true);
    expect(r.hasVersion).toBe(true);
    expect(r.publicKeyEmpty).toBe(false);
  });

  it('detects revocation', () => {
    const r = analyzeDkimRecord('v=DKIM1; p=');
    expect(r.valid).toBe(false);
    expect(r.publicKeyEmpty).toBe(true);
    expect(r.hasVersion).toBe(true);
  });
});

describe('isNullDkimDeclaration', () => {
  it('is true for v=DKIM1 with empty p', () => {
    const r = analyzeDkimRecord('v=DKIM1; p=');
    expect(isNullDkimDeclaration(r)).toBe(true);
  });

  it('is true when p tag is omitted', () => {
    const r = analyzeDkimRecord('v=DKIM1;');
    expect(isNullDkimDeclaration(r)).toBe(true);
  });

  it('is false when a public key is present', () => {
    const r = analyzeDkimRecord('v=DKIM1; p=MII');
    expect(isNullDkimDeclaration(r)).toBe(false);
  });

  it('is false without v=DKIM1', () => {
    const r = analyzeDkimRecord('foo=bar');
    expect(isNullDkimDeclaration(r)).toBe(false);
  });

  it('is false for null analysis', () => {
    const r = analyzeDkimRecord(null);
    expect(isNullDkimDeclaration(r)).toBe(false);
  });
});

describe('dkimDnsWildcardFqdn', () => {
  it('builds the literal star selector name', () => {
    expect(dkimDnsWildcardFqdn('example.com')).toBe('*._domainkey.example.com');
  });
});
