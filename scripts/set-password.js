// Set (or reset) the sign-in password for an academy account. No email is sent.
//   node scripts/set-password.js <email> <password>
// Creates the user (email confirmed) if it doesn't exist yet.
// Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .dev.vars or the environment.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = { ...process.env };
try {
  for (const line of readFileSync('.dev.vars', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m && env[m[1]] === undefined) {
      let v = m[2].replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1').trim();
      const h = v.indexOf(' #');
      if (h >= 0) v = v.slice(0, h).trim();
      env[m[1]] = v;
    }
  }
} catch {}

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error('Usage: node scripts/set-password.js <email> <password>');
  process.exitCode = 1;
} else if (password.length < 8) {
  console.error('Use a password of at least 8 characters.');
  process.exitCode = 1;
} else {
  const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.auth.admin.listUsers({ perPage: 1000 });
  if (error) {
    console.error('Failed to list users:', error.message);
    process.exitCode = 1;
  } else {
    const user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    const r = user
      ? await sb.auth.admin.updateUserById(user.id, { password, email_confirm: true })
      : await sb.auth.admin.createUser({ email, password, email_confirm: true });
    if (r.error) {
      console.error('Failed:', r.error.message);
      process.exitCode = 1;
    } else {
      console.log(`Password ${user ? 'updated' : 'set (new user)'} for ${email}. Sign in at https://academy.growtick.in/login?mode=password`);
    }
  }
}
