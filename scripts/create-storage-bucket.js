// Create the public Supabase Storage bucket for certificate PDFs.
// Run once: node scripts/create-storage-bucket.js
// Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .dev.vars (gitignored)
// or the environment. Safe to re-run ("already exists" is OK).
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
if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (in .dev.vars or environment).');
  process.exit(1);
}

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const BUCKET = 'academy-certificates';

(async () => {
  const { data, error } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 5 * 1024 * 1024, // 5 MB
    allowedMimeTypes: ['application/pdf'],
  });

  if (error) {
    const msg = String(error?.message ?? error ?? '');
    if (msg.includes('already exists') || msg.includes('409')) {
      console.log(`Bucket "${BUCKET}" already exists — nothing to do.`);
      return;
    }
    console.error('Failed to create bucket:', error);
    process.exit(1);
  }

  console.log(`Created public bucket "${BUCKET}". Certificate PDFs will be publicly readable at:`);
  console.log(`${env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/public/${BUCKET}/certificates/<enrollment-id>.pdf`);
})();
