/** Minimal RFC 4180 CSV parser (quotes, escaped quotes, CRLF, BOM). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

/** Serialise rows to CSV; cells starting with = + - @ are prefixed with ' so
 *  spreadsheets don't execute them as formulas. */
export function toCsv(rows: (string | number | boolean | null | undefined)[][]): string {
  const cell = (v: unknown) => {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

export interface Person {
  name: string;
  email: string;
  phone: string | null;
}

/** Map a Google Form / spreadsheet export to people. Finds the name, email and
 *  phone columns by header text; rows without a valid email are reported. */
export function peopleFromCsv(text: string): { people: Person[]; skipped: { line: number; reason: string }[] } {
  const rows = parseCsv(text);
  const skipped: { line: number; reason: string }[] = [];
  if (rows.length < 2) return { people: [], skipped: [{ line: 1, reason: 'No data rows found (need a header row plus at least one row)' }] };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const find = (...keys: string[]) => header.findIndex((h) => keys.some((k) => h.includes(k)));
  const iEmail = find('email', 'e-mail', 'mail');
  const iPhone = find('mobile', 'phone', 'whatsapp', 'contact');
  let iName = find('full name', 'name');
  if (iName === iEmail) iName = header.findIndex((h, i) => i !== iEmail && h.includes('name'));
  if (iEmail < 0) return { people: [], skipped: [{ line: 1, reason: 'No email column found in the header row' }] };

  const people: Person[] = [];
  const seen = new Set<string>();
  rows.slice(1).forEach((r, idx) => {
    const line = idx + 2;
    const email = (r[iEmail] ?? '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      skipped.push({ line, reason: `Invalid email "${email}"` });
      return;
    }
    if (seen.has(email)) {
      skipped.push({ line, reason: `Duplicate email ${email} in file` });
      return;
    }
    seen.add(email);
    const name = (iName >= 0 ? r[iName] : '')?.trim() || email.split('@')[0];
    let phone = iPhone >= 0 ? (r[iPhone] ?? '').replace(/\D/g, '') : '';
    if (phone.length === 12 && phone.startsWith('91')) phone = phone.slice(2);
    if (phone.length === 11 && phone.startsWith('0')) phone = phone.slice(1);
    people.push({ name: name.slice(0, 80), email, phone: phone || null });
  });
  return { people, skipped };
}
