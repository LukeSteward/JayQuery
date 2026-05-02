/**
 * Inbound mail provider fingerprints for MX hostnames.
 * Ported from [DNSHealth](https://github.com/JohnDuprey/DNSHealth) `MailProviders/*.json`
 * (upstream patterns; order matches alphabetical filenames there).
 */
export type MailProviderDefinition = {
  Name: string;
  MxMatch: string;
  SpfInclude?: string;
  SpfReplace?: string[];
  Selectors?: string[];
  MinimumSelectorPass?: number;
};

export const MAIL_PROVIDER_DEFINITIONS: MailProviderDefinition[] = [
  {
    Name: 'AppRiver',
    MxMatch: 'arsmtp.com',
    SpfInclude: '{0}.spf.smtp25.com',
    SpfReplace: ['DomainNameDashNotation'],
    Selectors: [''],
  },
  {
    Name: 'Barracuda Email Gateway Defense',
    MxMatch: 'ess(?<Country>.[a-z]{2})?.barracudanetworks.com',
    SpfInclude: 'spf.ess{0}.barracudanetworks.com',
    SpfReplace: ['Country'],
    Selectors: [''],
  },
  {
    Name: 'Google',
    // Workspace publishes both *.l.google.com and *.googlemail.com MX hosts.
    MxMatch: 'google\\.com|googlemail\\.com',
    SpfInclude: '_spf.google.com',
    Selectors: ['google'],
    MinimumSelectorPass: 1,
  },
  {
    Name: 'Hornet Security',
    MxMatch: 'mx[0-9][0-9].hornetsecurity.com',
    SpfInclude: 'spf.hornetsecurity.com',
    Selectors: [''],
  },
  {
    Name: 'Intermedia',
    MxMatch: 'serverdata.net',
    SpfInclude: 'spf.intermedia.net',
    Selectors: [''],
  },
  {
    Name: 'Microsoft 365',
    MxMatch: 'mail.protection.outlook.com|mx.microsoft|mail.eo.outlook.com',
    SpfInclude: 'spf.protection.outlook.com',
    Selectors: ['selector1', 'selector2'],
    MinimumSelectorPass: 1,
  },
  {
    Name: 'Mimecast',
    // Upstream uses a PowerShell named capture; align with `SpfReplace: ['Prefix']`.
    MxMatch: '(?<Prefix>[a-z]{2})-smtp-inbound-[0-9].mimecast.com',
    SpfInclude: '{0}._netblocks.mimecast.com',
    SpfReplace: ['Prefix'],
    Selectors: [],
  },
  {
    Name: 'Proofpoint',
    MxMatch: 'ppe-hosted.com',
    SpfInclude: 'ppe-hosted.com',
    Selectors: [''],
  },
  {
    Name: 'Reflexion',
    MxMatch: 'asp.reflexion.net',
    SpfInclude: 'reflexion.net',
    Selectors: [''],
  },
  {
    Name: 'Sophos',
    MxMatch:
      'mx-[0-9]{2}-(?<Country>(us|eu))-(?<Location>(central|east|west))-(?<Server>([0-9])).prod.hydra.sophos.com',
    SpfInclude: '_spf.prod.hydra.sophos.com',
  },
  {
    Name: 'SpamTitan',
    MxMatch: 'spamtitan.com',
    Selectors: [''],
  },
  {
    Name: 'Symantec Cloud',
    MxMatch: 'cluster[0-9].{3,4}.messagelabs.com',
    SpfInclude: 'spf.messagelabs.com',
    Selectors: [''],
  },
];
