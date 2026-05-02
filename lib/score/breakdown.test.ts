import { describe, expect, it } from 'vitest';
import { analyzeSpf } from '@/lib/parse/spf';
import { analyzeDmarc } from '@/lib/parse/dmarc';
import {
  buildDmarcBreakdown,
  buildSpfBreakdown,
  DKIM_ABSENT_PROBE_DETAIL_TEXT,
  filterBreakdownForCompactMode,
  type GradeLine,
} from '@/lib/score/breakdown';

describe('buildSpfBreakdown', () => {
  it('lists failures for missing SPF', () => {
    const a = analyzeSpf([]);
    const b = buildSpfBreakdown(a);
    expect(b[0].status).toBe('fail');
  });
});

describe('buildDmarcBreakdown', () => {
  it('marks relaxed alignment as warn so compact mode explains score vs strict', () => {
    const a = analyzeDmarc([
      'v=DMARC1; p=quarantine; rua=mailto:r@example.com;',
    ]);
    const lines = buildDmarcBreakdown(a, 'example.com');
    const alignment = lines.find((l) => l.text.includes('Alignment'));
    expect(alignment?.status).toBe('warn');
  });

  it('marks strict alignment as pass when either tag is s', () => {
    const a = analyzeDmarc([
      'v=DMARC1; p=reject; adkim=s; aspf=r; rua=mailto:r@example.com;',
    ]);
    const lines = buildDmarcBreakdown(a, 'example.com');
    const alignment = lines.find((l) => l.text.includes('Strict alignment'));
    expect(alignment?.status).toBe('pass');
  });

  it('fails after multiple DMARC TXT records with no further policy bullets', () => {
    const a = analyzeDmarc([
      'v=DMARC1; p=reject;',
      'v=DMARC1; p=none; rua=mailto:x@y.test;',
    ]);
    const lines = buildDmarcBreakdown(a, 'example.com');
    expect(lines.some((l) => l.status === 'fail' && l.text.includes('Multiple DMARC'))).toBe(
      true,
    );
    expect(lines.some((l) => l.text.includes('p='))).toBe(false);
  });
});

describe('filterBreakdownForCompactMode', () => {
  const mixed: GradeLine[] = [
    { status: 'pass', text: 'ok' },
    { status: 'info', text: 'fyi' },
    { status: 'warn', text: 'watch' },
    { status: 'fail', text: 'bad' },
    { status: 'missing', text: 'gone' },
  ];

  it('drops pass and info', () => {
    const out = filterBreakdownForCompactMode(mixed);
    expect(out.map((l) => l.status)).toEqual(['warn', 'fail', 'missing']);
  });

  it('returns empty when only pass/info', () => {
    expect(
      filterBreakdownForCompactMode([
        { status: 'pass', text: 'a' },
        { status: 'info', text: 'b' },
      ]),
    ).toEqual([]);
  });

  it('drops DKIM absent probe message even though status is missing', () => {
    expect(
      filterBreakdownForCompactMode([
        { status: 'info', text: 'Probed selectors: google.' },
        { status: 'missing', text: DKIM_ABSENT_PROBE_DETAIL_TEXT },
      ]),
    ).toEqual([]);
  });
});
