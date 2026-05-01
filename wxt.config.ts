import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    name: 'DNS Health Check',
    description:
      'SPF, DMARC, DKIM score plus MX, NS, MTA-STS, TLS-RPT, DNSSEC via DoH, and Entra OIDC tenant probe.',
    permissions: ['activeTab', 'storage'],
    host_permissions: [
      'https://cloudflare-dns.com/*',
      'https://dns.google/*',
      'https://login.microsoftonline.com/*',
    ],
    action: {
      default_title: 'DNS Health',
    },
  },
});
