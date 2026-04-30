# DNS Health Check

Browser extension (**Chrome / Edge**, Manifest V3) that inspects the **active tab’s hostname**, resolves **TXT** records over **DNS-over-HTTPS** (Cloudflare primary, Google fallback), evaluates **SPF**, **DMARC**, and **DKIM** (common selectors), and shows a **score out of 10** with a per-protocol breakdown.

Conceptually aligned with [JohnDuprey/DNSHealth](https://github.com/johnduprey/DNSHealth); this project implements similar checks in **TypeScript** for the browser instead of PowerShell.

## Features

- **SPF** and **DKIM** default to the **root (registrable) domain** (`www` and subdomains stripped via the public suffix list). Toggle **Tab hostname** in the popup to check the exact host (e.g. `www` or a subdomain).
- **DMARC** is always read from `_dmarc` at the tab’s **organizational domain**.
- **More DNS checks** (over DoH, same general areas as [DNSHealth](https://github.com/johnduprey/DNSHealth/) cmdlets): **MX**, **NS**, **MTA-STS** TXT at `_mta-sts`, **TLS-RPT** TXT at `_smtp._tls`, **DNSSEC** (DNSKEY + `AD`-style signal). These use the **organizational domain**, not the tab-hostname toggle.
- **SPF / DMARC / DKIM** cards include **grading breakdowns** (checklist with pass / warn / fail).

## Privacy & network

- **Permissions:** `activeTab` (hostname when you open the popup); **host access** only to `https://cloudflare-dns.com/*` and `https://dns.google/*` for DoH TXT queries.

## Prerequisites

- Node.js **18+** and npm

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

Pin the **DNS Health** action, visit a site served over **HTTPS**, then click the icon to open the popup.

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

## License

This project is licensed under the [**PolyForm Noncommercial License 1.0.0**](https://polyformproject.org/licenses/noncommercial/1.0.0/) — see [`LICENSE`](LICENSE).

In short: you may **use, study, modify, and share** the project for **noncommercial** purposes (including personal use and many nonprofit / educational uses). **Commercial use** — including **selling** the software, offering it for a fee, or building **paid products or services** on top of it — **is not allowed** under this license without separate permission from the copyright holder.

Replace **JayQuery contributors** in `LICENSE` with your **name or legal entity** before publishing if you want that line to reflect real ownership.
