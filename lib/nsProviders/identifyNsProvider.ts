import {
  NS_PROVIDER_DEFINITIONS,
  type NsProviderDefinition,
} from '@/lib/nsProviders/definitions';

export type NsProviderMatch = {
  name: string;
  matchedHost: string;
};

type CompiledNsProvider = {
  definition: NsProviderDefinition;
  regex: RegExp;
};

function compileNsProviders(): CompiledNsProvider[] {
  const out: CompiledNsProvider[] = [];
  for (const definition of NS_PROVIDER_DEFINITIONS) {
    try {
      const regex = new RegExp(definition.NsMatch, 'i');
      out.push({ definition, regex });
    } catch {
      /* skip broken patterns */
    }
  }
  return out;
}

const COMPILED_NS_PROVIDERS = compileNsProviders();

export function matchNsHostToProvider(
  hostname: string,
): NsProviderMatch | null {
  const host = hostname.trim().toLowerCase();
  if (!host) return null;

  for (const { definition, regex } of COMPILED_NS_PROVIDERS) {
    if (regex.test(host)) {
      return {
        name: definition.Name,
        matchedHost: host,
      };
    }
  }

  return null;
}

/**
 * First nameserver in lexical host order that matches a profile (deterministic; NS has no priority field).
 */
export function identifyNsProvider(ns: string[]): NsProviderMatch | null {
  const sorted = [...ns].sort((a, b) => a.localeCompare(b, 'en'));

  for (const host of sorted) {
    const m = matchNsHostToProvider(host);
    if (m) return m;
  }

  return null;
}

export type NsProviderGrouping = {
  /** First host in sorted order that matched a profile (same as {@link identifyNsProvider}). */
  identified: NsProviderMatch | null;
  /** Every NS hostname resolved to the same provider name. */
  allSameProvider: boolean;
};

/**
 * Whether all NS targets share one known provider (mirror {@link analyzeMxProviderGroup} semantics).
 */
export function analyzeNsProviderGroup(ns: string[]): NsProviderGrouping {
  const perHost = ns.map((h) => matchNsHostToProvider(h));
  const identified = identifyNsProvider(ns);

  const allNonEmpty = ns.every((h) => h.length > 0);
  const allMatched = allNonEmpty && perHost.every((m) => m !== null);
  const oneName =
    allMatched && perHost.every((m) => m!.name === perHost[0]!.name);

  return {
    identified,
    allSameProvider: Boolean(oneName && perHost.length > 0),
  };
}
