/**
 * DNS-over-HTTPS TXT resolution (Cloudflare primary, Google fallback).
 */

import {
  resolveTxtRecords,
  resolveTxtRecordsDetailed,
  type TxtRecordsDetailed,
} from '@/lib/dns/dohJson';

export { decodeTxtRdata } from '@/lib/dns/txtDecode';
export type { TxtRecordsDetailed } from '@/lib/dns/dohJson';

/**
 * Resolve all TXT strings for `name` (FQDN, no trailing dot required).
 */
export async function resolveTxt(name: string): Promise<string[]> {
  return resolveTxtRecords(name);
}

export async function resolveTxtDetailed(
  name: string,
): Promise<TxtRecordsDetailed> {
  return resolveTxtRecordsDetailed(name);
}
