import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    name: 'JayQuery',
    description:
      'SPF, DMARC, DKIM score plus MX, NS, MTA-STS, TLS-RPT, DNSSEC via DoH, and Entra OIDC tenant probe.',
    permissions: ['storage', 'tabs'],
    host_permissions: [
      'http://*/*',
      'https://*/*',
      'https://cloudflare-dns.com/*',
      'https://dns.google/*',
      'https://login.microsoftonline.com/*',
    ],
    action: {
      default_title: 'JayQuery',
    },
  },
});
