import { describe, expect, it } from 'vitest';
import { analyzeMtaStsTxt } from '@/lib/parse/mtaStsRecord';

describe('analyzeMtaStsTxt', () => {
  it('accepts valid STS TXT', () => {
    const a = analyzeMtaStsTxt(['v=STSv1; id=20210101T010101']);
    expect(a.isValid).toBe(true);
    expect(a.id).toBe('20210101T010101');
  });

  it('rejects missing id', () => {
    const a = analyzeMtaStsTxt(['v=STSv1']);
    expect(a.isValid).toBe(false);
  });
});
