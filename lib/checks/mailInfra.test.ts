import { describe, expect, it } from 'vitest';
import {
  DNSSEC_NO_DNSKEY_DETAIL_TEXT,
  filterMailInfraLinesWhenCompact,
} from '@/lib/checks/mailInfra';
import { MTA_STS_ABSENT_DETAIL_TEXT } from '@/lib/parse/mtaStsRecord';
import { TLS_RPT_ABSENT_DETAIL_TEXT } from '@/lib/parse/tlsRptRecord';

describe('filterMailInfraLinesWhenCompact', () => {
  it('removes absent-record boilerplate lines only', () => {
    expect(
      filterMailInfraLinesWhenCompact([
        MTA_STS_ABSENT_DETAIL_TEXT,
        'some other detail',
      ]),
    ).toEqual(['some other detail']);
    expect(filterMailInfraLinesWhenCompact([TLS_RPT_ABSENT_DETAIL_TEXT])).toEqual(
      [],
    );
    expect(
      filterMailInfraLinesWhenCompact([DNSSEC_NO_DNSKEY_DETAIL_TEXT]),
    ).toEqual([]);
  });
});
