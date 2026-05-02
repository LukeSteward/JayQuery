import type { FullScore } from '@/lib/score';
import type { HealthStatus } from '@/lib/score/common';

/**
 * One-toolbar summary when driver is `combined`:
 * - Fail / missing on any pillar → red X (same glyph as single-pillar fail).
 * - Else if any pillar warns → amber check (records present; non-fatal issues).
 * - Else all pass → green check.
 */
export function combinedToolbarRollupStatus(full: FullScore): HealthStatus {
  const statuses = [full.spf.status, full.dmarc.status, full.dkim.status];
  if (statuses.some((s) => s === 'fail' || s === 'missing')) {
    return 'fail';
  }
  if (statuses.some((s) => s === 'warn')) {
    return 'warn';
  }
  return 'pass';
}
