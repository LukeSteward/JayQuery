/**
 * Authoritative DNS / registrar NS hostname fingerprints for delegation nameservers.
 * Order matters: first `NsMatch` regex win per host (`i` flag). Narrow infra patterns first.
 */

export type NsProviderDefinition = {
  Name: string;
  NsMatch: string;
};

export const NS_PROVIDER_DEFINITIONS: NsProviderDefinition[] = [
  {
    Name: 'Microsoft Azure DNS',
    NsMatch:
      '\\.azure-dns\\.(?:biz|cn|co\\.uk|com|de|eu|gov|info|jp|mil|museum|net|org|sx|us)$',
  },
  {
    Name: 'Amazon Route 53',
    NsMatch:
      '(?:\\.awsdns-[0-9][0-9]\\.[a-z0-9.-]+|\\.amzndns\\.(?:co\\.uk|com|net|org))$',
  },
  {
    Name: 'Google Domains / Cloud DNS',
    NsMatch:
      '\\.(?:googledomains\\.com|googledomain\\.com|googlehosted\\.com)$',
  },
  { Name: 'Cloudflare', NsMatch: '\\.ns\\.cloudflare\\.com$' },
  {
    Name: 'IONOS',
    NsMatch: '\\.ui-dns\\.(?:biz|co\\.uk|com|de|eu|info|net|org)$',
  },
  { Name: 'Namecheap', NsMatch: '\\.registrar-servers\\.com$' },
  { Name: 'GoDaddy', NsMatch: '\\.domaincontrol\\.com$' },
  { Name: 'Oracle Dyn', NsMatch: '\\.dynect\\.net$' },
  {
    Name: 'UltraDNS (Neustar)',
    NsMatch: '\\.ultradns\\.(?:biz|co\\.uk|com|eu|info|net|org)$',
  },
  { Name: 'NS1', NsMatch: '\\.nsone\\.net$' },
  { Name: 'DNS Made Easy', NsMatch: '\\.dnsmadeeasy\\.com$' },
  { Name: 'DNSimple', NsMatch: '\\.dnsimple\\.com$' },
  { Name: 'DigitalOcean', NsMatch: '\\.digitalocean\\.com$' },
  {
    Name: 'Rackspace',
    NsMatch: '\\.rackspacecloud\\.com$|\\.rackspace\\.com$',
  },
  { Name: 'OVHcloud', NsMatch: '\\.ovh\\.net$' },
  {
    Name: 'Hetzner',
    NsMatch: '\\.hetzner(?:-dns)?\\.(?:com|de)$',
  },
  { Name: 'Akamai Linode', NsMatch: '\\.linode\\.com$' },
  { Name: 'Bluehost', NsMatch: '\\.bluehost\\.com$' },
  { Name: 'HostGator', NsMatch: '\\.hostgator\\.com$' },
  {
    Name: 'SiteGround',
    NsMatch: '\\.siteground\\.(?:biz|com|net)$',
  },
  { Name: 'DreamHost', NsMatch: '\\.dreamhost\\.com$' },
  { Name: 'Wix', NsMatch: '\\.wixdns\\.net$' },
  { Name: 'EuroDNS', NsMatch: '\\.eurodns\\.com$' },
  {
    Name: 'Tucows / OpenSRS',
    NsMatch: '\\.opensrs\\.net$|\\.enom\\.com$',
  },
  { Name: 'Fasthosts (LiveDNS)', NsMatch: '\\.livedns\\.co\\.uk$' },
  {
    Name: '123 Reg / Webfusion (Phase8)',
    NsMatch: '\\.phase8\\.(?:co\\.uk|net)$',
  },
  { Name: '20i (StackDNS)', NsMatch: '\\.stackdns\\.com$' },
  {
    Name: 'Krystal',
    NsMatch: '\\.krystal\\.(?:co\\.uk|hosting|uk)$',
  },
  { Name: 'Tsohost', NsMatch: '\\.tsohost\\.co\\.uk$' },
  { Name: 'Hurricane Electric', NsMatch: '\\.he\\.net$' },
];
