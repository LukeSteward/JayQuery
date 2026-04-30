import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    name: 'DNS Health Check',
    description:
      'SPF, DMARC, DKIM score plus MX, NS, MTA-STS, TLS-RPT, DNSSEC via DNS-over-HTTPS.',
    permissions: ['activeTab'],
    host_permissions: [
      'https://cloudflare-dns.com/*',
      'https://dns.google/*',
    ],
    action: {
      default_title: 'DNS Health',
    },
  },
});
