import type { FullScore } from '@/lib/score';
import type { HealthStatus } from '@/lib/score/common';
import type { ToolbarIconDriver } from '@/lib/settings';

/** Good = check in circle; bad = X in circle (stroke-only, works when rasterized small). */
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

/** Nearly fills the 24×24 toolbar asset (stroke-only; no filled backdrop). */
const SINGLE_GLYPH_RADIUS = 9.35;

/** Max circle in each 8-unit-wide column (centers at 4, 12, 20). */
const COMBINED_COLUMN_RADIUS = 3.72;

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

function glyphMarkupForColumn(status: HealthStatus, cx: number, cy: number): string {
  const rad = COMBINED_COLUMN_RADIUS;
  if (status === 'pass') {
    return svgGlyphGood(cx, cy, '#3dd68c', rad);
  }
  if (status === 'warn') {
    return svgGlyphGood(cx, cy, '#e6b84a', rad);
  }
  return svgGlyphBad(cx, cy, '#f07178', rad);
}

function buildCombinedToolbarSvg(full: FullScore): string {
  const cy = 12;
  const cols = [full.spf.status, full.dmarc.status, full.dkim.status];
  const inner = cols
    .map((st, i) => glyphMarkupForColumn(st, 4 + i * 8, cy))
    .join('');
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
  driver: ToolbarIconDriver,
): string {
  if (driver === 'combined') {
    return buildCombinedToolbarSvg(full);
  }
  return buildSingleToolbarSvg(full, driver);
}

async function rasterizeSvgToImageData(
  svg: string,
  size: number,
): Promise<ImageData> {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('SVG rasterize failed'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      throw new Error('Canvas 2D context unavailable');
    }
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(img, 0, 0, size, size);
    return ctx.getImageData(0, 0, size, size);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Neutral: transparent background, gray ring only (matches stroke-only toolbar style). */
const NEUTRAL_TOOLBAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.2" fill="none" stroke="#6b7280" stroke-width="1.35"/></svg>`;

export async function toolbarIconImageDataForScore(
  full: FullScore,
  driver: ToolbarIconDriver,
): Promise<{ '16': ImageData; '32': ImageData }> {
  const svg = toolbarIconSvgForScore(full, driver);
  const [i16, i32] = await Promise.all([
    rasterizeSvgToImageData(svg, 16),
    rasterizeSvgToImageData(svg, 32),
  ]);
  return { '16': i16, '32': i32 };
}

export async function toolbarIconNeutralImageData(): Promise<{
  '16': ImageData;
  '32': ImageData;
}> {
  const [i16, i32] = await Promise.all([
    rasterizeSvgToImageData(NEUTRAL_TOOLBAR_SVG, 16),
    rasterizeSvgToImageData(NEUTRAL_TOOLBAR_SVG, 32),
  ]);
  return { '16': i16, '32': i32 };
}

export async function applyToolbarIconForTab(
  tabId: number,
  full: FullScore,
  driver: ToolbarIconDriver,
): Promise<void> {
  const imageData = await toolbarIconImageDataForScore(full, driver);
  await browser.action.setIcon({ tabId, imageData });
}

export async function resetToolbarIconForTab(tabId: number): Promise<void> {
  const imageData = await toolbarIconNeutralImageData();
  await browser.action.setIcon({ tabId, imageData });
}
