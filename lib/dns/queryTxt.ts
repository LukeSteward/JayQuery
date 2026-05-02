/**
 * DNS-over-HTTPS TXT resolution (Google-first or Cloudflare-first + fallback; see lib/dns/dohJson).
 */

import {
  resolveTxtRecords,
  resolveTxtRecordsDetailed,
  type TxtRecordsDetailed,
  type DohResolveOptions,
} from '@/lib/dns/dohJson';

export type { DohResolveOptions };
export { decodeTxtRdata } from '@/lib/dns/txtDecode';
export type { TxtRecordsDetailed } from '@/lib/dns/dohJson';

export type ResolveTxtOpts = Pick<DohResolveOptions, 'dnsProvider'>;

/**
 * Resolve all TXT strings for `name` (FQDN, no trailing dot required).
 */
export async function resolveTxt(
  name: string,
  options?: ResolveTxtOpts,
): Promise<string[]> {
  return resolveTxtRecords(name, options);
}

export async function resolveTxtDetailed(
  name: string,
  options?: ResolveTxtOpts,
): Promise<TxtRecordsDetailed> {
  return resolveTxtRecordsDetailed(name, options);
}
