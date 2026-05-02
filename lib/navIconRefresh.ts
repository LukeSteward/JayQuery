import { parseCheckableHostnameFromUrl } from '@/lib/tabHost';

/**
 * Whether to re-run DNS scoring for the toolbar icon on this main-frame commit.
 * Caller should ignore non-main frames before calling (`frameId === 0`).
 */
export function shouldRefreshToolbarIcon(params: {
  lastHostname: string | null | undefined;
  url: string;
  transitionType: string;
  frameId: number;
}): boolean {
  if (params.frameId !== 0) {
    return false;
  }
  const hostname = parseCheckableHostnameFromUrl(params.url);
  if (hostname === null) {
    return false;
  }
  if (params.transitionType === 'reload') {
    return true;
  }
  const prev = params.lastHostname ?? null;
  return hostname !== prev;
}
