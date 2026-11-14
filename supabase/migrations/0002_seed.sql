-- Growtick Academy seed data (Phase 1: offline flow).
-- Seeds the first course and batch from the GST poster (Sun 15 Nov 2026).
--
-- Idempotent: safe to re-run. Applies via `npx supabase db push` alongside
-- 0001_academy.sql. For a local stack, `supabase/seed.sql` can be re-applied
-- with `psql -f supabase/seed.sql` after `supabase db reset`.

-- ---------------------------------------------------------------------------
-- Course: Master Your GST Compliance
-- ---------------------------------------------------------------------------
insert into academy_courses (
  slug, title, subtitle, description, outcomes, highlights, cover_url,
  delivery, certificate_kind, pass_mark, status
) values (
  'gst-compliance',
  'Master Your GST Compliance',
  'A practical, career-ready GST program for students and young professionals.',
  'Learn Input Tax Credit (ITC), file GSTR-1, GSTR-2B and GSTR-3B on time, and '
  || 'handle GST in books, invoicing and e-way bill rules. Expert-led sessions with '
  || 'practical real-world examples. Includes a Certificate of Appreciation.',
  '["Input Tax Credit (ITC)", "File GSTR-1, GSTR-2B & GSTR-3B on time", "GST in books, invoicing & e-way bill rules"]'::jsonb,
  '["Expert-led sessions", "Practical real-world examples", "Career-ready skills", "Certificate of Appreciation"]'::jsonb,
  '/academy/gst-poster-1000.webp',
  'offline',
  'appreciation',
  0,
  'published'
) on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Batch: Sun 15 Nov 2026, 2:00-5:00 PM, Chickpet Pathshala Hall, Bangalore
-- Fee ₹49, pay on arrival. Capacity: 60 (confirm with Growtick before launch).
-- starts_at/ends_at stored in UTC (2pm IST = 08:30 UTC, 5pm IST = 11:30 UTC).
-- ---------------------------------------------------------------------------
insert into academy_batches (
  course_id, kind, starts_at, ends_at, venue, address, map_url,
  capacity, fee, pay_on_spot, status
)
select
  'gst-compliance', 'offline', '2026-11-15T08:30:00+00', '2026-11-15T11:30:00+00',
  'Chickpet Pathshala Hall, Shri Adinath Jain Temple',
  'Chickpet, Bangalore, Karnataka',
  'https://maps.google.com/?q=Chickpet+Pathshala+Hall+Bangalore',
  60, 49, true, 'open'
where not exists (
  select 1 from academy_batches where course_id = 'gst-compliance'
);

-- ---------------------------------------------------------------------------
-- Settings placeholders (fill in via Admin → Settings before launch)
-- ---------------------------------------------------------------------------
insert into academy_settings (key, value) values
  ('signatory_name', 'TODO: signatory name for certificates'),
  ('upi_id', 'TODO: UPI ID for online payments'),
  ('upi_qr_url', '/brand/upi-qr.png'),          -- TODO: upload UPI QR image
  ('contact_phone', '+91 95130 59059'),
  ('contact_whatsapp', 'https://wa.me/919513059059'),
  ('contact_instagram', 'https://instagram.com/growtick.in'),
  ('email_from', 'academy@growtick.in')
on conflict (key) do nothing;
