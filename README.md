# JayQuery

Browser extension (**Chrome / Edge**, Manifest V3) that inspects the **active tab’s hostname**, resolves **TXT** records over **DNS-over-HTTPS** (Cloudflare primary, Google fallback), evaluates **SPF**, **DMARC**, and **DKIM** (common selectors), and shows a **score out of 10** with a per-protocol breakdown.

Conceptually aligned with [JohnDuprey/DNSHealth](https://github.com/johnduprey/DNSHealth); this project implements similar checks in **TypeScript** for the browser instead of PowerShell.

## Features

- **SPF** and **DKIM** default to the **root (registrable) domain** (`www` and subdomains stripped via the public suffix list). Toggle **Tab hostname** in the popup to check the exact host (e.g. `www` or a subdomain).
- **DMARC** is always read from `_dmarc` at the tab’s **organisational domain**.
- **More DNS checks** (over DoH, same general areas as [DNSHealth](https://github.com/johnduprey/DNSHealth/) cmdlets): **MX**, **NS**, **MTA-STS** TXT at `_mta-sts`, **TLS-RPT** TXT at `_smtp._tls`, **DNSSEC** (DNSKEY + `AD`-style signal). These use the **organisational domain**, not the tab-hostname toggle.
- **SPF / DMARC / DKIM** cards include **grading breakdowns** (checklist with pass / warn / fail).

## Privacy & network

- **Permissions:** **`tabs`** reads each tab’s **URL** once a navigation **finishes loading** (`tabs.onUpdated`, `complete`) and refreshes the **toolbar icon** after a **reload** or when the **hostname** changes (same host with only path/query/`#` changes does not re-run). Toolbar status glyphs are **drawn with `OffscreenCanvas`** (stroke paths) directly in the extension context; no SVG decode pipeline or **`offscreen`** document. **Storage** persists settings locally.
- **Host access:** `http://*/*` and `https://*/*` are declared so the browser can expose tab URLs to those APIs; **no code requests or injects into page content** for that. **DNS-over-HTTPS** uses `https://cloudflare-dns.com/*` and `https://dns.google/*`. The Entra-related probe uses `https://login.microsoftonline.com/*` per manifest.

## Prerequisites

- Node.js **24+** and npm

## Development

```bash
npm install
npm run dev
```

Load the extension from the `.output/chrome-mv3` folder WXT prints (after `npm run build`, use the same path).

## Build

```bash
npm run build
```

Output: **`.output/chrome-mv3/`** (unpackaged extension).

### Load in Google Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select your clone’s `.output/chrome-mv3` folder

Pin the **JayQuery** action, visit a site served over **HTTPS**, then click the icon to open the popup.

### Load in Microsoft Edge

1. Open `edge://extensions`
2. Enable **Developer mode** (sidebar)
3. **Load unpacked** → same `.output/chrome-mv3` folder

## Tests

```bash
npm test
```

## Limitations

- **DKIM** tries a fixed list of common selectors (`google`, `default`, `selector1`, `selector2`, …); custom selectors may be missed.
- **Not included** (would need broader permissions or extra APIs): MTA-STS **HTTPS** policy fetch, HTTPS certificate checks, WHOIS.
- Resolution uses **public** DNS; split-horizon or unpublished records will not appear.

## Licence

This project is licensed under the [**PolyForm Noncommercial License 1.0.0**](https://polyformproject.org/licenses/noncommercial/1.0.0/); see [`LICENSE`](LICENSE).

In short: you may **use, study, modify, and share** the project for **noncommercial** purposes (including personal use and many non-profit / educational uses). **Commercial use**, including **selling** the software, offering it for a fee, or building **paid products or services** on top of it, **is not allowed** under this licence without separate permission from the copyright holder.
