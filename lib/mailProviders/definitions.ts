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
    Name: 'Amazon SES',
    MxMatch: 'amazonses.com',
    SpfInclude: 'amazonses.com',
    Selectors: [''],
  },
  {
    Name: 'Fastmail',
    MxMatch: 'messagingengine.com',
    SpfInclude: 'spf.messagingengine.com',
    Selectors: ['fm1', 'fm2', 'fm3'],
    MinimumSelectorPass: 1,
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
    Name: 'Mailgun',
    MxMatch: 'mailgun.org',
    SpfInclude: 'mailgun.org',
    Selectors: ['smtp'],
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
    Name: 'Postmark',
    MxMatch: 'inbound.postmarkapp.com',
    SpfInclude: 'spf.mtasv.net',
    Selectors: ['pm'],
  },
  {
    Name: 'SendGrid',
    MxMatch: 'sendgrid.net',
    SpfInclude: 'sendgrid.net',
    Selectors: ['s1', 's2'],
    MinimumSelectorPass: 1,
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
  {
    Name: 'Zoho Mail',
    MxMatch: 'zoho.com|zoho.eu|zohomail.com',
    SpfInclude: 'zoho.com',
    Selectors: ['zmail'],
  },
  {
    Name: 'Rackspace Email',
    MxMatch: 'emailsrvr.com',
    SpfInclude: 'emailsrvr.com',
    Selectors: ['default'],
  },
  {
    Name: 'Mailchimp',
    MxMatch: 'inbound.mailchimpapp.net',
    SpfInclude: 'spf.mailchimpapp.net',
    Selectors: ['mc'],
  },
  {
    Name: 'Constant Contact',
    MxMatch: 'ctctmail.com',
    SpfInclude: 'spf.ctctmail.com',
    Selectors: ['cc'],
  },
  {
    Name: 'iCloud',
    MxMatch: 'me.com|icloud.com',
    SpfInclude: 'icloud.com',
    Selectors: [''],
  },
  {
    Name: 'Yahoo Mail',
    MxMatch: 'yahoodns.net|yahoo.com',
    SpfInclude: 'spf.yahoo.com',
    Selectors: ['s1', 's2'],
    MinimumSelectorPass: 1,
  },
  {
    Name: 'AOL Mail',
    MxMatch: 'mx.aol.com',
    SpfInclude: 'spf.aol.com',
    Selectors: ['s1', 's2'],
    MinimumSelectorPass: 1,
  },
  {
    Name: 'Outlook.com',
    MxMatch: 'hotmail.com',
    SpfInclude: 'spf.protection.outlook.com',
    Selectors: ['selector1', 'selector2'],
    MinimumSelectorPass: 1,
  },
  {
    Name: 'MailerLite',
    MxMatch: 'inbound.mailerlite.com',
    SpfInclude: 'spf.mailerlite.com',
    Selectors: ['ml'],
  },
  {
    Name: 'ConvertKit',
    MxMatch: 'inbound.convertkit.com',
    SpfInclude: 'spf.convertkit.com',
    Selectors: ['ck'],
  },
  {
    Name: 'Campaign Monitor',
    MxMatch: 'createsend.com',
    SpfInclude: 'spf.createsend.com',
    Selectors: ['cm'],
  },
  {
    Name: 'AWeber',
    MxMatch: 'aweber.com',
    SpfInclude: 'spf.aweber.com',
    Selectors: ['aweber'],
  },
  {
    Name: 'GetResponse',
    MxMatch: 'getresponse.com',
    SpfInclude: 'spf.getresponse.com',
    Selectors: ['gr'],
  },
  {
    Name: 'ActiveCampaign',
    MxMatch: 'activecampaign.com',
    SpfInclude: 'spf.activecampaign.com',
    Selectors: ['ac'],
  },
  {
    Name: 'Klaviyo',
    MxMatch: 'inbound.klaviyo.com',
    SpfInclude: 'spf.klaviyo.com',
    Selectors: ['kl'],
  },
  {
    Name: 'Brevo (Sendinblue)',
    MxMatch: 'mail.smtpbp.com|sendinblue.com',
    SpfInclude: 'spf.sendinblue.com',
    Selectors: ['mail'],
  },
  {
    Name: 'Elastic Email',
    MxMatch: 'elasticemail.com',
    SpfInclude: 'spf.elasticemail.com',
    Selectors: ['api'],
  },
  {
    Name: 'Mandrill',
    MxMatch: 'inbound.mailchimp.com',
    SpfInclude: 'spf.mandrillapp.com',
    Selectors: ['mandrill'],
  },
  {
    Name: 'SocketLabs',
    MxMatch: 'smtp.socketlabs.com',
    SpfInclude: 'spf.socketlabs.com',
    Selectors: ['sl'],
  },
  {
    Name: 'SparkPost',
    MxMatch: 'sparkpost.com',
    SpfInclude: 'spf.sparkpost.com',
    Selectors: ['sp'],
  },
  {
    Name: 'Mailjet',
    MxMatch: 'mailjet.com',
    SpfInclude: 'spf.mailjet.com',
    Selectors: ['mailjet'],
  },
  {
    Name: 'Titan Email',
    MxMatch: 'titan.email',
    SpfInclude: 'spf.titan.email',
    Selectors: ['default'],
  },
  {
    Name: 'ImprovMX',
    MxMatch: 'mx1.improvmx.com|mx2.improvmx.com',
    SpfInclude: 'spf.improvmx.com',
    Selectors: [''],
  },
  {
    Name: 'ForwardMX',
    MxMatch: 'forwardmx.io',
    SpfInclude: 'spf.forwardmx.io',
    Selectors: [''],
  },
  {
    Name: 'Tutanota',
    MxMatch: 'tutanota.de',
    SpfInclude: 'spf.tutanota.de',
    Selectors: [''],
  },
  {
    Name: 'ProtonMail',
    MxMatch: 'protonmail.ch|mail.protonmail.ch',
    SpfInclude: 'spf.protonmail.ch',
    Selectors: ['protonmail', 'protonmail2', 'protonmail3'],
    MinimumSelectorPass: 1,
  },
  {
    Name: 'Hey.com',
    MxMatch: 'hey.com',
    SpfInclude: 'spf.hey.com',
    Selectors: [''],
  },
  {
    Name: 'Namecheap Email',
    MxMatch: 'registrar-servers.com',
    SpfInclude: 'spf.registrar-servers.com',
    Selectors: ['default'],
  },
  {
    Name: 'Hostinger Email',
    MxMatch: 'hostinger.com',
    SpfInclude: 'spf.hostinger.com',
    Selectors: ['default'],
  },
  {
    Name: 'DreamHost Email',
    MxMatch: 'dreamhost.com',
    SpfInclude: 'spf.dreamhost.com',
    Selectors: ['dreamhost'],
  },
  {
    Name: 'Bluehost Email',
    MxMatch: 'bluehost.com',
    SpfInclude: 'spf.bluehost.com',
    Selectors: ['default'],
  },
  {
    Name: 'SiteGround Email',
    MxMatch: 'siteground.com',
    SpfInclude: 'spf.siteground.com',
    Selectors: ['default'],
  },
  {
    Name: 'GoDaddy Email',
    MxMatch: 'secureserver.net',
    SpfInclude: 'spf.secureserver.net',
    Selectors: ['k1'],
  },
  {
    Name: 'cPanel Email',
    MxMatch: 'cpanel',
    SpfInclude: '',
    Selectors: ['default', 'mail'],
  },
];
