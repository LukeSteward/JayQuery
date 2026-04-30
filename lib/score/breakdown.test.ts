import { describe, expect, it } from 'vitest';
import { analyzeSpf } from '@/lib/parse/spf';
import { buildSpfBreakdown } from '@/lib/score/breakdown';

describe('buildSpfBreakdown', () => {
  it('lists failures for missing SPF', () => {
    const a = analyzeSpf([]);
    const b = buildSpfBreakdown(a);
    expect(b[0].status).toBe('fail');
  });
});
