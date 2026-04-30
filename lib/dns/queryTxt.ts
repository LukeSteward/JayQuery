/**
 * DNS-over-HTTPS TXT resolution (Cloudflare primary, Google fallback).
 */

import { resolveTxtRecords } from '@/lib/dns/dohJson';

export { decodeTxtRdata } from '@/lib/dns/txtDecode';

/**
 * Resolve all TXT strings for `name` (FQDN, no trailing dot required).
 */
export async function resolveTxt(name: string): Promise<string[]> {
  return resolveTxtRecords(name);
}
