import { describe, expect, it } from 'vitest';
import { analyzeSpf } from '@/lib/parse/spf';
import { analyzeDmarc } from '@/lib/parse/dmarc';
import {
  computeFullScore,
  scoreDkim,
  scoreDmarc,
  scoreDnsResolutionFailure,
  scoreSpf,
} from '@/lib/score';

describe('scoring', () => {
  it('SPF with -all and within lookup cap reaches full SPF points', () => {
    expect(scoreSpf(analyzeSpf(['v=spf1 -all'])).points).toBe(3);
    expect(
      scoreSpf(
        analyzeSpf([
          'v=spf1 include:a.example include:b.example include:c.example include:d.example include:e.example -all',
        ]),
      ).points,
    ).toBe(3);
  });

  it('computes overall from parts', () => {
    const spf = scoreSpf(analyzeSpf(['v=spf1 -all']));
    const dmarc = scoreDmarc(
      analyzeDmarc(['v=DMARC1; p=reject; rua=mailto:a@b.co']),
      'example.com',
    );
    const dkim = scoreDkim({
      valid: true,
      selector: 'test',
      hasVersion: true,
      keyType: 'rsa',
      publicKeyEmpty: false,
      raw: 'v=DKIM1; p=x',
    });
    const full = computeFullScore(spf, dmarc, dkim);
    expect(full.overall).toBe(
      Math.round((spf.points + dmarc.points + dkim.points) * 10) / 10,
    );
    expect(full.overall).toBeGreaterThan(5);
  });

  it('missing protocols score low', () => {
    const spf = scoreSpf(analyzeSpf([]));
    const dmarc = scoreDmarc(analyzeDmarc([]), 'x.test');
    const dkim = scoreDkim({
      valid: false,
      selector: 'google',
      hasVersion: false,
      keyType: null,
      publicKeyEmpty: true,
      raw: null,
    });
    const full = computeFullScore(spf, dmarc, dkim);
    expect(full.overall).toBe(0);
  });
});

describe('scoreDnsResolutionFailure', () => {
  it('returns fail with zero points for SPF', () => {
    const s = scoreDnsResolutionFailure('spf', 'DNS busted');
    expect(s.status).toBe('fail');
    expect(s.points).toBe(0);
    expect(s.max).toBe(3);
    expect(s.detail).toBe('DNS busted');
  });
});
