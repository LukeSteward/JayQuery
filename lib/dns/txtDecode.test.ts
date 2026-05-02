import { describe, expect, it } from 'vitest';
import { decodeTxtRdata } from '@/lib/dns/txtDecode';

describe('decodeTxtRdata', () => {
  it('concatenates multi-string TXT (Cloudflare-style DoH)', () => {
    const cf =
      '"v=DMARC1;" "p=quarantine;" "pct=100;" "rua=mailto:report@dmarc.amazon.com;" "ruf=mailto:report@dmarc.amazon.com"';
    expect(decodeTxtRdata(cf)).toBe(
      'v=DMARC1;p=quarantine;pct=100;rua=mailto:report@dmarc.amazon.com;ruf=mailto:report@dmarc.amazon.com',
    );
  });

  it('keeps Google-style single pre-joined TXT', () => {
    const google = '"v=DMARC1;p=quarantine;pct=100;rua=mailto:a@b.co"';
    expect(decodeTxtRdata(google)).toBe(
      'v=DMARC1;p=quarantine;pct=100;rua=mailto:a@b.co',
    );
  });

  it('handles unquoted DoH payloads', () => {
    expect(decodeTxtRdata('v=spf1 include:_spf.example.com ~all')).toBe(
      'v=spf1 include:_spf.example.com ~all',
    );
  });

  it('handles escaped quotes inside a segment', () => {
    expect(decodeTxtRdata(String.raw`"say \"hi\""`)).toBe('say "hi"');
  });

  it('handles two short adjacent strings', () => {
    expect(decodeTxtRdata('"ab" "cd"')).toBe('abcd');
  });
});
