/**
 * Decode TXT RDATA from DoH JSON (DNS master-file presentation).
 * A TXT RR may contain several character strings; concatenation uses no delimiter
 * (RFC 1035: same logical TXT record).
 *
 * Google's DoH often returns one pre-joined string; Cloudflare's JSON returns multiple
 * quoted `"…"` chunks in `data`. Stripping only the outermost quotes breaks DMARC parsing.
 */

const SEGMENT = /^"((?:[^"\\]|\\.)*)"/;

export function decodeTxtRdata(data: string): string {
  const s = data.trim();
  if (s.length === 0) return s;

  if (s[0] !== '"') {
    return s.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }

  const segments: string[] = [];
  let pos = 0;
  while (pos < s.length) {
    while (pos < s.length && /\s/.test(s[pos]!)) pos++;
    if (pos >= s.length) break;
    if (s[pos] !== '"') break;
    const m = SEGMENT.exec(s.slice(pos));
    if (!m) break;
    segments.push(
      m[1]!.replace(/\\"/g, '"').replace(/\\\\/g, '\\'),
    );
    pos += m[0].length;
  }

  if (segments.length > 0) {
    return segments.join('');
  }

  if (s.length >= 2 && s.endsWith('"')) {
    const inner = s.slice(1, -1);
    return inner.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }

  return s.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}
