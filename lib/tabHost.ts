const IPV4 =
  /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/;

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
  if (isUnsupportedUrlProtocol(url)) {
    return {
      ok: false,
      reason: 'Open a normal https (or http) website tab to check DNS.',
    };
  }

  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return { ok: false, reason: 'Could not parse the active tab URL.' };
  }

  if (!host || host === 'localhost') {
    return { ok: false, reason: 'Hostname is empty or localhost.' };
  }
  if (IPV4.test(host)) {
    return { ok: false, reason: 'IP addresses are not supported — use a domain name.' };
  }
  if (host.includes(':')) {
    return { ok: false, reason: 'IPv6 literal hosts are not supported.' };
  }

  return { ok: true, host, tabId };
}
