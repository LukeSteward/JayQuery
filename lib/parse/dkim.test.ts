import { describe, expect, it } from 'vitest';
import { analyzeDkimRecord } from '@/lib/parse/dkim';

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
