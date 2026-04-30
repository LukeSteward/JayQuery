import { describe, expect, it } from 'vitest';
import { analyzeTlsRptTxt } from '@/lib/parse/tlsRptRecord';

describe('analyzeTlsRptTxt', () => {
  it('accepts TLS-RPT with mailto rua', () => {
    const a = analyzeTlsRptTxt(['v=TLSRPTv1; rua=mailto:tls@example.com']);
    expect(a.isValid).toBe(true);
    expect(a.hasValidRua).toBe(true);
  });

  it('missing record', () => {
    const a = analyzeTlsRptTxt([]);
    expect(a.recordCount).toBe(0);
    expect(a.isValid).toBe(false);
  });
});
