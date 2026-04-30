# DNS Health (browser extension)

Chrome / Edge (Manifest V3) extension that reads the **active tab’s hostname**, fetches **TXT** records over **DNS-over-HTTPS** (Cloudflare, with Google fallback), evaluates **SPF**, **DMARC**, and **DKIM** (common selectors), and shows a **score out of 10** with per-protocol breakdown.

By default **SPF** and **DKIM** are checked on the **root (registrable) domain** — `www` and subdomains are stripped using the public suffix list. Use **Tab hostname** in the popup to run the same checks against the exact host (e.g. `www` or a subdomain). **DMARC** is always read from `_dmarc` at the tab’s **organizational domain**.

Conceptually aligned with [JohnDuprey/DNSHealth](https://github.com/johnduprey/DNSHealth); this repo implements checks in TypeScript for the browser, not PowerShell.

## Prerequisites

- Node.js 18+ and npm

## Development

```bash
npm install
npm run dev
```

Load the extension from the `.output/chrome-mv3` folder WXT prints (or after `npm run build`, from `.output/chrome-mv3`).

## Build

```bash
npm run build
```

Output: `.output/chrome-mv3/` (unpackaged extension).

## Load in Google Chrome

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select the folder: `JayQuery/.output/chrome-mv3` (use the path to your clone).

Pin the **DNS Health** action, open an `https` site, then click the icon to open the popup.

## Load in Microsoft Edge

1. Open `edge://extensions`.
2. Turn on **Developer mode** (left sidebar).
3. Click **Load unpacked**.
4. Select the same `.output/chrome-mv3` folder.

## Permissions

- **activeTab** — read the active tab URL (hostname) when you open the popup.
- **host_permissions** — `https://cloudflare-dns.com/*` and `https://dns.google/*` only, for DoH TXT queries.

## Tests

```bash
npm test
```

## Limitations

- **DKIM** probes a fixed list of common selectors (`google`, `default`, `selector1`, `selector2`, …); custom selectors may not be detected.
- **`More DNS checks`** (same areas as [DNSHealth](https://github.com/johnduprey/DNSHealth/) cmdlets, over DoH): **MX**, **NS**, **MTA-STS** TXT at `_mta-sts`, **TLS-RPT** TXT at `_smtp._tls`, and **DNSSEC** (DNSKEY + `AD` like `Test-DNSSEC`). These always use the tab’s **organizational domain**, not the tab-hostname toggle.
- **SPF / DMARC / DKIM** cards include **grading breakdowns** (bullet checklist with pass/warn/fail).
- **Not included** (would need broader permissions or external APIs): `Read-MtaStsPolicy` / `Test-MtaSts` HTTPS policy fetch, `Test-HttpsCertificate`, `Read-WhoisRecord`.
- Resolution uses **public** DNS; split-horizon or unpublished records won’t appear.
