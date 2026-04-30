/**
 * Decode TXT RDATA from DoH JSON (quoted DNS presentation form).
 */
export function decodeTxtRdata(data: string): string {
  const s = data.trim();
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    const inner = s.slice(1, -1);
    return inner.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return s.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}
