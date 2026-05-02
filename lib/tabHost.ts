const IPV4 =
  /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/;

export function parseCheckableHostnameFromUrl(url: string): string | null {
  if (!url || isUnsupportedUrlProtocol(url)) {
    return null;
  }
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }
  if (!host || host === 'localhost') {
    return null;
  }
  if (IPV4.test(host)) {
    return null;
  }
  if (host.includes(':')) {
    return null;
  }
  return host;
}

function isUnsupportedUrlProtocol(url: string): boolean {
  const u = url.toLowerCase();
  return (
    u.startsWith('chrome:') ||
    u.startsWith('edge:') ||
    u.startsWith('about:') ||
    u.startsWith('devtools:') ||
    u.startsWith('chrome-extension:') ||
    u.startsWith('moz-extension:') ||
    u.startsWith('view-source:')
  );
}

export type TabHostResult =
  | { ok: true; host: string; tabId: number }
  | { ok: false; reason: string };

export async function getActiveTabHostname(): Promise<TabHostResult> {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  const tabId = tab?.id;
  const url = tab?.url;
  if (tabId == null) {
    return { ok: false, reason: 'No active tab ID available.' };
  }
  if (!url) {
    return { ok: false, reason: 'No URL available for the active tab.' };
  }
  const host = parseCheckableHostnameFromUrl(url);

  if (host == null) {
    if (isUnsupportedUrlProtocol(url)) {
      return {
        ok: false,
        reason: 'Open a normal https (or http) website tab to check DNS.',
      };
    }
    let rawHost: string;
    try {
      rawHost = new URL(url).hostname;
    } catch {
      return { ok: false, reason: 'Could not parse the active tab URL.' };
    }
    if (!rawHost || rawHost === 'localhost') {
      return { ok: false, reason: 'Hostname is empty or localhost.' };
    }
    if (IPV4.test(rawHost)) {
      return {
        ok: false,
        reason: 'IP addresses are not supported — use a domain name.',
      };
    }
    if (rawHost.includes(':')) {
      return { ok: false, reason: 'IPv6 literal hosts are not supported.' };
    }
    return { ok: false, reason: 'Could not parse the active tab URL.' };
  }

  return { ok: true, host, tabId };
}
