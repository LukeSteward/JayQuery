export type DkimRecordAnalysis = {
  valid: boolean;
  selector: string;
  hasVersion: boolean;
  keyType: string | null;
  publicKeyEmpty: boolean;
  raw: string | null;
};

const DKIM_SELECTORS = [
  'google',
  'default',
  'selector1',
  'selector2',
  'k1',
  's1',
  'dkim',
  'mail',
] as const;

export function getDkimSelectors(): readonly string[] {
  return DKIM_SELECTORS;
}

function parseDkimTags(record: string): Map<string, string> {
  const map = new Map<string, string>();
  const parts = record.split(';').map((p) => p.trim()).filter(Boolean);
  for (const p of parts) {
    const eq = p.indexOf('=');
    if (eq <= 0) continue;
    const k = p.slice(0, eq).trim().toLowerCase();
    const v = p.slice(eq + 1).trim();
    map.set(k, v);
  }
  return map;
}

export function analyzeDkimRecord(txt: string | null): DkimRecordAnalysis {
  if (!txt) {
    return {
      valid: false,
      selector: '',
      hasVersion: false,
      keyType: null,
      publicKeyEmpty: true,
      raw: null,
    };
  }
  const trimmed = txt.replace(/\s+/g, ' ').trim();
  const hasVersion = /^v=DKIM1(\s|;|$)/i.test(trimmed);
  const tags = parseDkimTags(trimmed);
  const p = tags.get('p');
  const k = tags.get('k') ?? 'rsa';
  const publicKeyEmpty = !p || p.length === 0;

  const valid = hasVersion && !publicKeyEmpty;

  return {
    valid,
    selector: '',
    hasVersion,
    keyType: k || null,
    publicKeyEmpty,
    raw: trimmed,
  };
}
