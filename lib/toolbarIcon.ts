import type { FullScore } from '@/lib/score';
import type { HealthStatus } from '@/lib/score/common';
import type { ToolbarIconPillarDriver } from '@/lib/settings';
import { combinedToolbarRollupStatus } from '@/lib/toolbarIconCombinedRollup';
import {
  rasterNeutralToolbarToImageData,
  rasterToolbarScoreToImageData,
} from '@/lib/toolbarIconCanvasRaster';

/** Good = check in circle; bad = X in circle (stroke-only; used for SVG test strings). */
function svgGlyphGood(
  cx: number,
  cy: number,
  color: string,
  radius: number,
): string {
  const r = radius;
  const sw = Math.max(1.15, r * 0.16);
  return `
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${sw}" />
  <path d="M ${cx - r * 0.48} ${cy + r * 0.02} L ${cx - r * 0.08} ${cy + r * 0.38} L ${cx + r * 0.52} ${cy - r * 0.42}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" />`;
}

function svgGlyphBad(
  cx: number,
  cy: number,
  color: string,
  radius: number,
): string {
  const r = radius;
  const sw = Math.max(1.15, r * 0.16);
  const d = r * 0.48;
  return `
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${sw}" />
  <path d="M ${cx - d} ${cy - d} L ${cx + d} ${cy + d} M ${cx + d} ${cy - d} L ${cx - d} ${cy + d}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" />`;
}

const SINGLE_GLYPH_RADIUS = 9.35;

/** Pass → green good; warn → amber good (same glyph); fail/missing → red bad. */
function glyphMarkupForStatus(status: HealthStatus): string {
  const rad = SINGLE_GLYPH_RADIUS;
  if (status === 'pass') {
    return svgGlyphGood(12, 12, '#3dd68c', rad);
  }
  if (status === 'warn') {
    return svgGlyphGood(12, 12, '#e6b84a', rad);
  }
  return svgGlyphBad(12, 12, '#f07178', rad);
}

function buildCombinedToolbarSvg(full: FullScore): string {
  const inner = glyphMarkupForStatus(combinedToolbarRollupStatus(full));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">${inner}</svg>`;
}

function buildSingleToolbarSvg(
  full: FullScore,
  pillar: 'spf' | 'dmarc' | 'dkim',
): string {
  const inner = glyphMarkupForStatus(full[pillar].status);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">${inner}</svg>`;
}

export function toolbarIconSvgForScore(
  full: FullScore,
  driver: ToolbarIconPillarDriver,
): string {
  if (driver === 'combined') {
    return buildCombinedToolbarSvg(full);
  }
  return buildSingleToolbarSvg(full, driver);
}

function getPackagedIconPaths(): Record<'16' | '32', string> {
  const g = globalThis as typeof globalThis & {
    browser?: { runtime?: { getURL?: (path: string) => string } };
  };
  const getURL = g.browser?.runtime?.getURL;
  if (typeof getURL === 'function') {
    const bound = getURL.bind(g.browser!.runtime) as (path: string) => string;
    return {
      '16': bound('icon/16.png'),
      '32': bound('icon/32.png'),
    };
  }
  return { '16': 'icon/16.png', '32': 'icon/32.png' };
}

async function applyPackagedFallbackIcon(tabId: number): Promise<void> {
  await browser.action.setIcon({
    tabId,
    path: getPackagedIconPaths(),
  });
}

export async function toolbarIconImageDataForScore(
  full: FullScore,
  driver: ToolbarIconPillarDriver,
): Promise<{ '16': ImageData; '32': ImageData }> {
  const i16 = rasterToolbarScoreToImageData(full, driver, 16);
  const i32 = rasterToolbarScoreToImageData(full, driver, 32);
  return { '16': i16, '32': i32 };
}

export async function toolbarIconNeutralImageData(): Promise<{
  '16': ImageData;
  '32': ImageData;
}> {
  return {
    '16': rasterNeutralToolbarToImageData(16),
    '32': rasterNeutralToolbarToImageData(32),
  };
}

export async function applyToolbarIconForTab(
  tabId: number,
  full: FullScore,
  driver: ToolbarIconPillarDriver,
): Promise<void> {
  try {
    const imageData = await toolbarIconImageDataForScore(full, driver);

    /** Chrome validates imageData dictionary keys strictly in some builds. */
    await browser.action.setIcon({
      tabId,
      imageData: { 16: imageData['16'], 32: imageData['32'] },
    });
  } catch {
    await applyPackagedFallbackIcon(tabId);
  }
}

export async function resetToolbarIconForTab(tabId: number): Promise<void> {
  try {
    const imageData = await toolbarIconNeutralImageData();
    await browser.action.setIcon({
      tabId,
      imageData: { 16: imageData['16'], 32: imageData['32'] },
    });
  } catch {
    await applyPackagedFallbackIcon(tabId);
  }
}
