import type { MxRecord } from '@/lib/dns/dohJson';
import {
  MAIL_PROVIDER_DEFINITIONS,
  type MailProviderDefinition,
} from '@/lib/mailProviders/definitions';

export type MxProviderMatch = {
  name: string;
  /** SPF `include:` target suggested by the provider profile (DNSHealth-style). */
  expectedSpfInclude?: string;
  /** Suggested DKIM selector names from the provider profile, if any non-empty. */
  dkimSelectors?: string[];
  matchedExchange: string;
};

type CompiledProvider = {
  definition: MailProviderDefinition;
  regex: RegExp;
};

const RESERVED_SPF_REPLACE: Record<string, (mailDomain: string) => string> = {
  DomainNameDashNotation: (mailDomain) => mailDomain.replace(/\./g, '-'),
};

function compileProviders(): CompiledProvider[] {
  const out: CompiledProvider[] = [];
  for (const definition of MAIL_PROVIDER_DEFINITIONS) {
    try {
      const regex = new RegExp(definition.MxMatch, 'i');
      out.push({ definition, regex });
    } catch {
      /* skip broken patterns */
    }
  }
  return out;
}

const COMPILED_PROVIDERS = compileProviders();

/**
 * PowerShell-style `{0}` replacement (DNSHealth uses `-f ($ReplaceList -join ', ')`).
 */
function applySpfFormat(template: string, formatArg: string): string {
  return template.replace(/\{0\}/g, formatArg);
}

function buildExpectedSpfInclude(
  def: MailProviderDefinition,
  match: RegExpMatchArray,
  mailDomainLower: string,
): string | undefined {
  const raw = def.SpfInclude?.trim();
  if (!raw) return undefined;

  const parts = def.SpfReplace;
  if (!parts?.length) return raw;

  const replaceList = parts.map((key) => {
    const reserved = RESERVED_SPF_REPLACE[key];
    if (reserved) return reserved(mailDomainLower);
    const g = match.groups?.[key];
    return g ?? '';
  });
  return applySpfFormat(raw, replaceList.join(', '));
}

function nonEmptySelectors(def: MailProviderDefinition): string[] | undefined {
  const s = def.Selectors?.filter((x) => x.length > 0);
  return s && s.length > 0 ? s : undefined;
}

function matchExchangeToProvider(
  exchange: string,
  mailDomainLower: string,
): MxProviderMatch | null {
  const host = exchange;
  if (!host || host === '.') return null;

  for (const { definition, regex } of COMPILED_PROVIDERS) {
    const m = host.match(regex);
    if (!m) continue;

    return {
      name: definition.Name,
      expectedSpfInclude: buildExpectedSpfInclude(
        definition,
        m,
        mailDomainLower,
      ),
      dkimSelectors: nonEmptySelectors(definition),
      matchedExchange: host,
    };
  }

  return null;
}

/**
 * Identifies inbound mail provider from MX hosts, mirroring
 * [Read-MXRecord](https://github.com/JohnDuprey/DNSHealth/blob/main/DNSHealth/Public/Records/Read-MXRecord.ps1):
 * walk MX records in priority order; first hostname matching a provider `MxMatch` wins.
 */
export function identifyMxProvider(
  mx: MxRecord[],
  mailDomain: string,
): MxProviderMatch | null {
  const mailDomainLower = mailDomain.trim().toLowerCase();

  for (const record of mx) {
    const m = matchExchangeToProvider(record.exchange, mailDomainLower);
    if (m) return m;
  }

  return null;
}

export type MxProviderGrouping = {
  /**
   * First MX in priority order that matched a profile (same as {@link identifyMxProvider}).
   * SPF/DKIM hints use this match (or the first host when all MX agree on one provider).
   */
  identified: MxProviderMatch | null;
  /** Every MX hostname resolved to the same provider name. */
  allSameProvider: boolean;
};

/**
 * Whether all MX targets share one known provider (for simpler UX — no duplicate provider line).
 */
export function analyzeMxProviderGroup(
  mx: MxRecord[],
  mailDomain: string,
): MxProviderGrouping {
  const mailDomainLower = mailDomain.trim().toLowerCase();
  const perHost = mx.map((r) =>
    matchExchangeToProvider(r.exchange, mailDomainLower),
  );
  const identified = identifyMxProvider(mx, mailDomain);

  const allNonEmpty = mx.every((r) => r.exchange && r.exchange !== '.');
  const allMatched = allNonEmpty && perHost.every((m) => m !== null);
  const oneName =
    allMatched &&
    perHost.every((m) => m!.name === perHost[0]!.name);

  return {
    identified,
    allSameProvider: oneName && perHost.length > 0,
  };
}
