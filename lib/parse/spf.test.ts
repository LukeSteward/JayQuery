import { describe, expect, it } from 'vitest';
import { analyzeSpf, isNullSpf, spfTxtRecordsInclude } from '@/lib/parse/spf';

describe('spfTxtRecordsInclude', () => {
  it('returns true when include matches', () => {
    expect(
      spfTxtRecordsInclude(
        ['v=spf1 include:spf.protection.outlook.com -all'],
        'spf.protection.outlook.com',
      ),
    ).toBe(true);
  });

  it('honors mechanism qualifiers on include', () => {
    expect(
      spfTxtRecordsInclude(['v=spf1 +include:_spf.google.com ~all'], '_spf.google.com'),
    ).toBe(true);
  });

  it('returns false when include is absent', () => {
    expect(
      spfTxtRecordsInclude(['v=spf1 include:other.example -all'], 'spf.protection.outlook.com'),
    ).toBe(false);
  });

  it('ignores non-SPF TXT', () => {
    expect(spfTxtRecordsInclude(['not spf'], 'spf.example.com')).toBe(false);
  });
});

describe('analyzeSpf', () => {
  it('detects missing SPF', () => {
    const a = analyzeSpf(['some other txt']);
    expect(a.present).toBe(false);
    expect(a.multipleRecords).toBe(false);
  });

  it('detects single SPF and -all', () => {
    const a = analyzeSpf(['v=spf1 include:spf.example.com -all']);
    expect(a.present).toBe(true);
    expect(a.multipleRecords).toBe(false);
    expect(a.allQualifier).toBe('fail');
    expect(a.openAll).toBe(false);
  });

  it('detects +all as open', () => {
    const a = analyzeSpf(['v=spf1 +all']);
    expect(a.openAll).toBe(true);
  });

  it('detects multiple SPF records', () => {
    const a = analyzeSpf(['v=spf1 -all', 'v=spf1 include:x -all']);
    expect(a.multipleRecords).toBe(true);
  });
});

describe('isNullSpf', () => {
  it('is true for v=spf1 -all only', () => {
    expect(isNullSpf(analyzeSpf(['v=spf1 -all']))).toBe(true);
  });

  it('allows exp= modifier', () => {
    expect(isNullSpf(analyzeSpf(['v=spf1 exp=explain.example.com -all']))).toBe(
      true,
    );
  });

  it('is false when include is present', () => {
    expect(
      isNullSpf(analyzeSpf(['v=spf1 include:_spf.example.com -all'])),
    ).toBe(false);
  });

  it('is false when ip4 authorises', () => {
    expect(isNullSpf(analyzeSpf(['v=spf1 ip4:192.0.2.1 -all']))).toBe(false);
  });

  it('is false for ~all', () => {
    expect(isNullSpf(analyzeSpf(['v=spf1 ~all']))).toBe(false);
  });
});
