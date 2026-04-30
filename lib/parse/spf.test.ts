import { describe, expect, it } from 'vitest';
import { analyzeSpf } from '@/lib/parse/spf';

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
