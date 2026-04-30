import { describe, expect, it } from 'vitest';
import { decodeTxtRdata } from '@/lib/dns/queryTxt';

describe('decodeTxtRdata', () => {
  it('strips outer quotes', () => {
    expect(decodeTxtRdata('"v=spf1 include:_spf.google.com ~all"')).toBe(
      'v=spf1 include:_spf.google.com ~all',
    );
  });

  it('handles escaped quotes', () => {
    expect(decodeTxtRdata('"say \\"hi\\""')).toBe('say "hi"');
  });
});
