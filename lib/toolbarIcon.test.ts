import { describe, expect, it } from 'vitest';
import { toolbarIconSvgForScore } from '@/lib/toolbarIcon';
import { combinedToolbarRollupStatus } from '@/lib/toolbarIconCombinedRollup';
import type { FullScore } from '@/lib/score';

const sample: FullScore = {
  overall: 5,
  spf: { points: 2, max: 3, status: 'pass', detail: 'ok' },
  dmarc: { points: 0, max: 4, status: 'fail', detail: 'x' },
  dkim: { points: 1, max: 3, status: 'warn', detail: 'y' },
};

const passPillar = { points: 3, max: 3, status: 'pass' as const, detail: 'ok' };

describe('combinedToolbarRollupStatus', () => {
  it('returns fail when any pillar fails or is missing', () => {
    expect(combinedToolbarRollupStatus(sample)).toBe('fail');
    const missingDkim: FullScore = {
      ...sample,
      dmarc: passPillar,
      dkim: { points: 0, max: 3, status: 'missing', detail: 'no' },
    };
    expect(combinedToolbarRollupStatus(missingDkim)).toBe('fail');
  });

  it('returns warn when none fail or miss but any pillar warns', () => {
    const allPresentSomeWarn: FullScore = {
      overall: 8,
      spf: passPillar,
      dmarc: { points: 3, max: 4, status: 'warn', detail: 'w' },
      dkim: passPillar,
    };
    expect(combinedToolbarRollupStatus(allPresentSomeWarn)).toBe('warn');
  });

  it('returns pass only when all pillars pass', () => {
    const allPass: FullScore = {
      overall: 10,
      spf: passPillar,
      dmarc: { points: 4, max: 4, status: 'pass', detail: 'ok' },
      dkim: passPillar,
    };
    expect(combinedToolbarRollupStatus(allPass)).toBe('pass');
  });
});

describe('toolbarIconSvgForScore', () => {
  it('combined mode uses a single rolled-up glyph (one circle)', () => {
    const allPass: FullScore = {
      overall: 10,
      spf: passPillar,
      dmarc: { points: 4, max: 4, status: 'pass', detail: 'ok' },
      dkim: passPillar,
    };
    const svg = toolbarIconSvgForScore(allPass, 'combined');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).not.toContain('#171b24');
    const circles = svg.match(/<circle/g) ?? [];
    expect(circles.length).toBe(1);
    expect(svg).toContain('#3dd68c');
  });

  it('combined mode shows amber check when rolled up to warn', () => {
    const rollupWarn: FullScore = {
      overall: 8,
      spf: passPillar,
      dmarc: { points: 3, max: 4, status: 'warn', detail: 'w' },
      dkim: passPillar,
    };
    const svg = toolbarIconSvgForScore(rollupWarn, 'combined');
    expect(svg).toContain('#e6b84a');
    expect(svg).not.toContain('#3dd68c');
    expect(svg).not.toContain('#f07178');
  });

  it('single-pillar mode uses only that pillar’s coloring', () => {
    const svgSpf = toolbarIconSvgForScore(sample, 'spf');
    expect(svgSpf).toContain('#3dd68c');
    expect(svgSpf).not.toContain('#e6b84a');

    const svgDkim = toolbarIconSvgForScore(sample, 'dkim');
    expect(svgDkim).toContain('#e6b84a');
  });

  it('fail status uses bad glyph stroke color', () => {
    const onlyFail: FullScore = {
      ...sample,
      spf: { points: 0, max: 3, status: 'fail', detail: 'n' },
    };
    const svg = toolbarIconSvgForScore(onlyFail, 'spf');
    expect(svg).toContain('#f07178');
  });
});
