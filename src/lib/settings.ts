import { serviceDb } from './supabase';

export const SETTING_KEYS = [
  'signatory_name',
  'upi_id',
  'upi_payee_name',
  'upi_qr_url',
  'contact_phone',
  'contact_whatsapp',
  'contact_instagram',
] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

/** All academy settings as a map; placeholder "TODO…" values read as empty. */
export async function getSettings(): Promise<Partial<Record<SettingKey, string>>> {
  const db = serviceDb();
  if (!db) return {};
  const { data } = await db.from('academy_settings').select('key, value');
  const out: Record<string, string> = {};
  for (const r of data ?? []) {
    if (r.value && !String(r.value).startsWith('TODO')) out[r.key] = r.value;
  }
  return out;
}

/** upi://pay deep link that opens the learner's UPI app with the amount filled in. */
export function upiLink(s: { upi_id?: string; upi_payee_name?: string }, amount: number, note: string) {
  if (!s.upi_id) return null;
  const p = new URLSearchParams({ pa: s.upi_id, pn: s.upi_payee_name || 'Growtick', am: amount.toFixed(2), cu: 'INR', tn: note.slice(0, 50) });
  return `upi://pay?${p.toString()}`;
}
