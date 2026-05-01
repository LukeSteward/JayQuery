import { describe, expect, it } from 'vitest';
import { toolbarIconSvgForScore } from '@/lib/toolbarIcon';
import type { FullScore } from '@/lib/score';

const sample: FullScore = {
  overall: 5,
  spf: { points: 2, max: 3, status: 'pass', detail: 'ok' },
  dmarc: { points: 0, max: 4, status: 'fail', detail: 'x' },
  dkim: { points: 1, max: 3, status: 'warn', detail: 'y' },
};

describe('toolbarIconSvgForScore', () => {
  it('combined mode includes three column glyphs (circle elements)', () => {
    const svg = toolbarIconSvgForScore(sample, 'combined');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).not.toContain('#171b24');
    const circles = svg.match(/<circle/g) ?? [];
    expect(circles.length).toBeGreaterThanOrEqual(3);
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
