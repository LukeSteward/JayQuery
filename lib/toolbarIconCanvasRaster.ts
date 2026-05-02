import type { FullScore } from '@/lib/score';
import type { HealthStatus } from '@/lib/score/common';
import type { ToolbarIconDriver } from '@/lib/settings';
import { combinedToolbarRollupStatus } from '@/lib/toolbarIconCombinedRollup';

type DrawCtx = OffscreenCanvasRenderingContext2D;

const SINGLE_GLYPH_RADIUS = 9.35;

function strokeWidthForCircleRadius(radius: number): number {
  return Math.max(1.15, radius * 0.16);
}

function drawGlyphGood(
  ctx: DrawCtx,
  cx: number,
  cy: number,
  color: string,
  radius: number,
): void {
  const sw = strokeWidthForCircleRadius(radius);
  const r = radius;
  ctx.strokeStyle = color;
  ctx.lineWidth = sw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx - r * 0.48, cy + r * 0.02);
  ctx.lineTo(cx - r * 0.08, cy + r * 0.38);
  ctx.lineTo(cx + r * 0.52, cy - r * 0.42);
  ctx.stroke();
}

function drawGlyphBad(
  ctx: DrawCtx,
  cx: number,
  cy: number,
  color: string,
  radius: number,
): void {
  const sw = strokeWidthForCircleRadius(radius);
  const r = radius;
  const d = r * 0.48;

  ctx.strokeStyle = color;
  ctx.lineWidth = sw;
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx - d, cy - d);
  ctx.lineTo(cx + d, cy + d);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + d, cy - d);
  ctx.lineTo(cx - d, cy + d);
  ctx.stroke();
}

function drawGlyphForStatus(
  ctx: DrawCtx,
  cx: number,
  cy: number,
  status: HealthStatus,
  radius: number,
): void {
  if (status === 'pass') {
    drawGlyphGood(ctx, cx, cy, '#3dd68c', radius);
    return;
  }
  if (status === 'warn') {
    drawGlyphGood(ctx, cx, cy, '#e6b84a', radius);
    return;
  }
  drawGlyphBad(ctx, cx, cy, '#f07178', radius);
}

function drawToolbarScoreOnContext(
  ctx: DrawCtx,
  full: FullScore,
  driver: ToolbarIconDriver,
): void {
  if (driver === 'combined') {
    drawGlyphForStatus(
      ctx,
      12,
      12,
      combinedToolbarRollupStatus(full),
      SINGLE_GLYPH_RADIUS,
    );
    return;
  }

  drawGlyphForStatus(ctx, 12, 12, full[driver].status, SINGLE_GLYPH_RADIUS);
}

function canvasForToolbarIcon(sizePx: number): OffscreenCanvas {
  return new OffscreenCanvas(sizePx, sizePx);
}

/** Stroke-only toolbar glyphs matching the SVG layout (works in MV3 service workers). */
export function rasterToolbarScoreToImageData(
  full: FullScore,
  driver: ToolbarIconDriver,
  sizePx: number,
): ImageData {
  const canvas = canvasForToolbarIcon(sizePx);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable');
  }
  ctx.clearRect(0, 0, sizePx, sizePx);
  const s = sizePx / 24;
  ctx.setTransform(s, 0, 0, s, 0, 0);
  drawToolbarScoreOnContext(ctx, full, driver);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return ctx.getImageData(0, 0, sizePx, sizePx);
}

export function rasterNeutralToolbarToImageData(sizePx: number): ImageData {
  const canvas = canvasForToolbarIcon(sizePx);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable');
  }
  ctx.clearRect(0, 0, sizePx, sizePx);

  const s = sizePx / 24;
  ctx.setTransform(s, 0, 0, s, 0, 0);

  ctx.strokeStyle = '#6b7280';
  ctx.lineWidth = 1.35;
  ctx.beginPath();
  ctx.arc(12, 12, 9.2, 0, Math.PI * 2);
  ctx.stroke();

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return ctx.getImageData(0, 0, sizePx, sizePx);
}
