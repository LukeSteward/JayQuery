import { runDnsCheck } from '@/lib/checkDomain';
import { shouldRefreshToolbarIcon } from '@/lib/navIconRefresh';
import { loadSettings } from '@/lib/settings';
import type { FullScore } from '@/lib/score';
import { parseCheckableHostnameFromUrl } from '@/lib/tabHost';
import {
  applyToolbarIconForTab,
  resetToolbarIconForTab,
} from '@/lib/toolbarIcon';

const lastHostnameByTabId = new Map<number, string>();
/** Latest successful graded icon scores (apex check) — reapplied after same-host navigations Chrome resets icons. */
const lastToolbarScoreByTabId = new Map<number, FullScore>();
/** Previous fully loaded URL — same URL again at `complete` ⇒ reload heuristic. */
const lastCompleteUrlByTabId = new Map<number, string>();
/** Per-tab generation; incremented at each refresh kick so stale async work skips setIcon. */
const toolbarRefreshGenByTabId = new Map<number, number>();

async function reapplyCachedToolbarIcon(tabId: number): Promise<void> {
  const cached = lastToolbarScoreByTabId.get(tabId);
  if (cached == null) {
    return;
  }
  const settings = await loadSettings();
  if (settings.toolbarIconDriver === 'disabled') {
    await resetToolbarIconForTab(tabId);
    return;
  }
  try {
    await applyToolbarIconForTab(
      tabId,
      cached,
      settings.toolbarIconDriver,
    );
  } catch {
    await resetToolbarIconForTab(tabId);
    lastToolbarScoreByTabId.delete(tabId);
  }
}

async function refreshToolbarIconForTab(
  tabId: number,
  hostname: string,
  token: number,
): Promise<void> {
  const settings = await loadSettings();
  if (settings.toolbarIconDriver === 'disabled') {
    if (toolbarRefreshGenByTabId.get(tabId) !== token) {
      return;
    }
    await resetToolbarIconForTab(tabId);
    return;
  }
  try {
    const result = await runDnsCheck(hostname, 'apex', {
      treatDnsResolutionErrorsAsFailure:
        settings.treatDnsResolutionErrorsAsFailure,
      dnsProvider: settings.dnsProvider,
    });
    if (toolbarRefreshGenByTabId.get(tabId) !== token) {
      return;
    }
    await applyToolbarIconForTab(
      tabId,
      result.full,
      settings.toolbarIconDriver,
    );
    lastToolbarScoreByTabId.set(tabId, result.full);
  } catch {
    if (toolbarRefreshGenByTabId.get(tabId) !== token) {
      return;
    }
    await resetToolbarIconForTab(tabId);
    lastToolbarScoreByTabId.delete(tabId);
  }
}

function handleTabNavigationComplete(
  tabId: number,
  url: string,
  transitionType: string,
): void {
  const hostname = parseCheckableHostnameFromUrl(url);
  if (hostname === null) {
    lastHostnameByTabId.delete(tabId);
    lastToolbarScoreByTabId.delete(tabId);
    lastCompleteUrlByTabId.delete(tabId);
    return;
  }

  const last = lastHostnameByTabId.get(tabId) ?? null;

  if (
    shouldRefreshToolbarIcon({
      lastHostname: last,
      url,
      transitionType,
      frameId: 0,
    })
  ) {
    const prevGen = toolbarRefreshGenByTabId.get(tabId) ?? 0;
    const token = prevGen + 1;
    toolbarRefreshGenByTabId.set(tabId, token);
    lastHostnameByTabId.set(tabId, hostname);

    void refreshToolbarIconForTab(tabId, hostname, token);
    return;
  }

  /** Same-host path/query change: Chromium clears per-tab toolbar artwork — repaint from cache without re-querying DNS. */
  if (last === hostname && lastToolbarScoreByTabId.has(tabId)) {
    void reapplyCachedToolbarIcon(tabId);
  }
}

async function refreshToolbarIconsForActiveTabsAlreadyOpen(): Promise<void> {
  try {
    const tabs = await browser.tabs.query({ active: true });
    for (const tab of tabs) {
      const id = tab.id;
      const url = tab.url;
      if (id == null || url == null) continue;
      if (parseCheckableHostnameFromUrl(url) !== null) {
        lastCompleteUrlByTabId.set(id, url);
      }
      handleTabNavigationComplete(id, url, 'link');
    }
  } catch {
    /* ignore — best-effort hydrate */
  }
}

export default defineBackground(() => {
  void refreshToolbarIconsForActiveTabsAlreadyOpen();

  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status !== 'complete') {
      return;
    }
    const url = tab.url;
    if (!url) {
      return;
    }

    const previousCompleteUrl = lastCompleteUrlByTabId.get(tabId);
    lastCompleteUrlByTabId.set(tabId, url);

    /** Full reload keeps the same URL; client-side pathname-only SPA updates may not emit `complete` again. */
    const transitionType =
      previousCompleteUrl !== undefined && previousCompleteUrl === url
        ? 'reload'
        : 'link';

    handleTabNavigationComplete(tabId, url, transitionType);
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    lastHostnameByTabId.delete(tabId);
    lastToolbarScoreByTabId.delete(tabId);
    lastCompleteUrlByTabId.delete(tabId);
    toolbarRefreshGenByTabId.delete(tabId);
  });
});
