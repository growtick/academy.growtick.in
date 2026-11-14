// Promote a signed-up user to admin so they can access /admin.
// Run after the user has signed in at least once via /login:
//   node scripts/make-admin.js <email>
// Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .dev.vars or the environment.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

function loadEnv() {
  const env = { ...process.env };
  try {
    const text = readFileSync('.dev.vars', 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (m && env[m[1]] === undefined) {
        let value = m[2].replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1').trim();
        const hash = value.indexOf(' #');
        if (hash >= 0) value = value.slice(0, hash).trim();
        env[m[1]] = value;
      }
    }
  } catch {}
  return env;
}

const env = loadEnv();
const email = process.argv[2];
if (!email) {
  console.error('Usage: node scripts/make-admin.js <email>');
  process.exit(1);
}
if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (in .dev.vars or environment).');
  process.exit(1);
}

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

(async () => {
  const { data: users, error: lerr } = await supabase.auth.admin.listUsers();
  if (lerr) {
    console.error('Failed to list users:', lerr.message);
    process.exit(1);
  }
  const user = users.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) {
    console.error(`No Supabase Auth user found for ${email}. Ask them to sign up at /login first.`);
    process.exit(1);
  }

  const { error: ierr } = await supabase
    .from('academy_profiles')
    .upsert({ id: user.id, role: 'admin' }, { onConflict: 'id' });
  if (ierr) {
    console.error('Failed to write admin profile:', ierr.message);
    process.exit(1);
  }

  console.log(`Set role=admin for ${email} (user id ${user.id}). They can now sign in at /login and open /admin.`);
})();
