import { describe, expect, it } from 'vitest';
import { analyzeDmarc } from '@/lib/parse/dmarc';

describe('analyzeDmarc', () => {
  it('parses basic DMARC', () => {
    const r = analyzeDmarc([
      'v=DMARC1; p=reject; rua=mailto:a@x.test; adkim=s; aspf=s',
    ]);
    expect(r.present).toBe(true);
    expect(r.multipleRecords).toBe(false);
    expect(r.policy).toBe('reject');
    expect(r.hasRua).toBe(true);
    expect(r.adkim).toBe('s');
    expect(r.aspf).toBe('s');
  });

  it('detects missing', () => {
    const r = analyzeDmarc([]);
    expect(r.present).toBe(false);
  });
});
