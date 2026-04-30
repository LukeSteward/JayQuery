export type DmarcAnalysis = {
  present: boolean;
  validVersion: boolean;
  /** More than one DMARC TXT */
  multipleRecords: boolean;
  policy: 'none' | 'quarantine' | 'reject' | null;
  /** Subdomain policy (sp=), if present */
  sp: 'none' | 'quarantine' | 'reject' | null;
  pct: number | null;
  hasRua: boolean;
  aspf: 'r' | 's' | null;
  adkim: 'r' | 's' | null;
  rawRecords: string[];
};

function parseTagBlock(record: string): Map<string, string> {
  const map = new Map<string, string>();
  const body = record.replace(/^v=DMARC1\s*;/i, '').trim();
  const parts = body.split(';').map((p) => p.trim()).filter(Boolean);
  for (const p of parts) {
    const eq = p.indexOf('=');
    if (eq <= 0) continue;
    const key = p.slice(0, eq).trim().toLowerCase();
    const val = p.slice(eq + 1).trim();
    map.set(key, val);
  }
  return map;
}

export function analyzeDmarc(txtRecords: string[]): DmarcAnalysis {
  const dmarcLike = txtRecords.filter((t) =>
    /^\s*v=DMARC1(\s|;)/i.test(t),
  );
  const present = dmarcLike.length > 0;
  const multipleRecords = dmarcLike.length > 1;
  const primary = dmarcLike[0] ?? '';
  const tags = primary ? parseTagBlock(primary) : new Map<string, string>();

  const pRaw = tags.get('p')?.toLowerCase() ?? null;
  let policy: DmarcAnalysis['policy'] = null;
  if (pRaw === 'none' || pRaw === 'quarantine' || pRaw === 'reject') {
    policy = pRaw;
  }

  const spRaw = tags.get('sp')?.toLowerCase() ?? null;
  let sp: DmarcAnalysis['sp'] = null;
  if (spRaw === 'none' || spRaw === 'quarantine' || spRaw === 'reject') {
    sp = spRaw;
  }

  const pctRaw = tags.get('pct');
  let pct: number | null = null;
  if (pctRaw != null && /^\d+$/.test(pctRaw)) {
    const n = Number(pctRaw);
    if (n >= 0 && n <= 100) pct = n;
  }

  const rua = tags.get('rua');
  const hasRua = Boolean(rua && rua.length > 0);

  const aspf = tags.get('aspf')?.toLowerCase();
  const adkim = tags.get('adkim')?.toLowerCase();

  return {
    present,
    validVersion: present,
    multipleRecords,
    policy,
    sp,
    pct,
    hasRua,
    aspf: aspf === 'r' || aspf === 's' ? aspf : null,
    adkim: adkim === 'r' || adkim === 's' ? adkim : null,
    rawRecords: [...dmarcLike],
  };
}
