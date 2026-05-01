import type { HealthStatus } from '@/lib/score/common';

/** Mail infra card payload for Entra OIDC probe (matches `MailInfraCheck`). */
export type M365TenantMailInfraCheck = {
  id: 'm365Tenant';
  title: string;
  status: HealthStatus;
  summary: string;
  lines: string[];
  tenantDirectoryId?: string;
  raw?: string;
};

/** Microsoft Entra v2 OIDC discovery document segment (tenant = domain GUID or vanity domain). */
const DISCOVERY_SUFFIX = '/v2.0/.well-known/openid-configuration';

/** Entra directory (tenant) ID is an 8-4-4-4-12 hex UUID string. */
const DIRECTORY_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type OidcDiscoveryDoc = {
  issuer?: unknown;
  authorization_endpoint?: unknown;
  token_endpoint?: unknown;
};

function isValidMailDomainHostname(domain: string): boolean {
  const d = domain.trim().toLowerCase();
  if (d.length < 1 || d.length > 253) return false;
  if (!/^[a-z0-9.-]+$/.test(d)) return false;
  if (d.startsWith('.') || d.endsWith('.') || d.includes('..')) return false;
  const labels = d.split('.');
  for (const label of labels) {
    if (label.length < 1 || label.length > 63) return false;
    if (label.startsWith('-') || label.endsWith('-')) return false;
    if (!/^[a-z0-9-]+$/.test(label)) return false;
  }
  return true;
}

function openIdDiscoveryUrl(domain: string): string {
  return `https://login.microsoftonline.com/${encodeURIComponent(
    domain.trim().toLowerCase(),
  )}${DISCOVERY_SUFFIX}`;
}

/** Collect first directory GUID from pathname segments after Entra STS hosts (exported for tests). */
export function extractTenantDirectoryIdFromUrl(href: string): string | null {
  try {
    const u = new URL(href);
    const h = u.hostname.toLowerCase();
    if (h !== 'login.microsoftonline.com' && h !== 'sts.windows.net') return null;
    const segments = u.pathname.split('/').filter(Boolean);
    for (const seg of segments) {
      if (DIRECTORY_ID_RE.test(seg)) return seg.toLowerCase();
    }
  } catch {
    /* invalid URL */
  }
  return null;
}

/** Parse tenant directory UUID from OIDC discovery issuer / endpoints only (no heuristic domain tenant ID). */
export function tenantDirectoryIdFromDiscoveryDoc(doc: OidcDiscoveryDoc): string | null {
  const candidates: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === 'string' && v.trim()) candidates.push(v.trim());
  };
  push(doc.issuer);
  push(doc.authorization_endpoint);
  push(doc.token_endpoint);

  for (const c of candidates) {
    const id = extractTenantDirectoryIdFromUrl(c);
    if (id) return id;
  }
  return null;
}

function jsonFromDiscoveryResponse(raw: unknown): OidcDiscoveryDoc | null {
  if (typeof raw !== 'object' || raw === null) return null;
  return raw as OidcDiscoveryDoc;
}

async function checkM365TenantInternal(domain: string): Promise<M365TenantMailInfraCheck> {
  const domainNorm = domain.trim().toLowerCase();
  const url = openIdDiscoveryUrl(domainNorm);

  if (!isValidMailDomainHostname(domainNorm)) {
    return {
      id: 'm365Tenant',
      title: 'Entra tenant (OIDC Check)',
      status: 'fail',
      summary: 'Invalid hostname',
      lines: ['Mail domain failed hostname validation — cannot query Entra metadata.'],
    };
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      credentials: 'omit',
      headers: { Accept: 'application/json, text/plain;q=0.8,*/*;q=0.5' },
    });
  } catch {
    return {
      id: 'm365Tenant',
      title: 'Entra tenant (OIDC Check)',
      status: 'fail',
      summary: 'Request failed',
      lines: ['Could not reach login.microsoftonline.com (network or blocked).'],
    };
  }

  if (response.status === 404) {
    return {
      id: 'm365Tenant',
      title: 'Entra tenant (OIDC Check)',
      status: 'missing',
      summary: 'No metadata (404)',
      lines: [
        'No OIDC discovery document for this hostname — tenant may not exist or domain is not verified in Entra.',
      ],
    };
  }

  if (response.status === 400) {
    return {
      id: 'm365Tenant',
      title: 'Entra tenant (OIDC Check)',
      status: 'warn',
      summary: 'TenantID not found, domain not on EntraID',
      lines: [],
    };
  }

  if (!response.ok) {
    return {
      id: 'm365Tenant',
      title: 'Entra tenant (OIDC Check)',
      status: response.status >= 500 ? 'fail' : 'warn',
      summary: `HTTP ${response.status}`,
      lines: [
        `Discovery request returned HTTP ${response.status} — tenant ID could not be read.`,
      ],
    };
  }

  let rawJson: unknown;
  try {
    rawJson = await response.json();
  } catch {
    return {
      id: 'm365Tenant',
      title: 'Entra tenant (OIDC Check)',
      status: 'warn',
      summary: 'Not JSON',
      lines: ['Response was not JSON — cannot parse issuer or endpoints.'],
    };
  }

  const doc = jsonFromDiscoveryResponse(rawJson);
  if (!doc) {
    return {
      id: 'm365Tenant',
      title: 'Entra tenant (OIDC Check)',
      status: 'warn',
      summary: 'Invalid payload',
      lines: ['OIDC document was not an object.'],
    };
  }

  const tenantId = tenantDirectoryIdFromDiscoveryDoc(doc);

  if (tenantId) {
    return {
      id: 'm365Tenant',
      title: 'Entra tenant (OIDC Check)',
      status: 'pass',
      summary: 'Tenant ID resolved',
      lines: [],
      tenantDirectoryId: tenantId,
    };
  }

  const issuerStr = typeof doc.issuer === 'string' ? doc.issuer : '(missing)';
  const authEp =
    typeof doc.authorization_endpoint === 'string'
      ? doc.authorization_endpoint
      : '';
  const rawBlock = [`issuer ${issuerStr}`, authEp ? `authorization_endpoint ${authEp}` : '']
    .filter(Boolean)
    .join('\n');

  return {
    id: 'm365Tenant',
    title: 'Entra tenant (OIDC Check)',
    status: 'missing',
    summary: 'No GUID in issuer',
    lines: [
      'Metadata responded but issuer / endpoints contain no UUID-shaped directory tenant ID (often template `{tenant}` or non-GUID segment).',
    ],
    raw: rawBlock || undefined,
  };
}

/** Query Entra OIDC discovery for organizational domain — returns tenant directory UUID when issuer/endpoints expose it. */
export async function checkM365Tenant(mailDomain: string): Promise<M365TenantMailInfraCheck> {
  return checkM365TenantInternal(mailDomain);
}
