import { describe, expect, it } from 'vitest';
import { parseMxRdata, RCODE } from '@/lib/dns/dohJson';

describe('dohJson helpers', () => {
  it('parses MX RDATA', () => {
    expect(parseMxRdata('10 mail.example.com.')).toEqual({
      priority: 10,
      exchange: 'mail.example.com',
    });
  });

  it('RCODE constants', () => {
    expect(RCODE.NXDOMAIN).toBe(3);
  });
});
