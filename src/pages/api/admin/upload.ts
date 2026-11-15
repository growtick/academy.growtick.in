import type { APIRoute } from 'astro';
import { serviceDb } from '../../../lib/supabase';
import { json, requireAdmin } from '../../../lib/http';

export const prerender = false;

const MAX_FILE = 50 * 1024 * 1024;
const MAX_IMAGE = 5 * 1024 * 1024;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

const safeName = (n: string) =>
  n
    .normalize('NFKD')
    .replace(/[^\w.\-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+/, '')
    .slice(-100) || 'file';

// multipart POST:
//   target=lesson  lesson_id=<uuid>  file   → private academy-files bucket, sets lesson.file_path
//   target=cover   course=<slug>     file   → public academy-public bucket, sets course.cover_url
//   target=upi_qr                    file   → public academy-public bucket, sets settings.upi_qr_url
export const POST: APIRoute = async ({ request, cookies }) => {
  if (!(await requireAdmin({ request, cookies }))) return json({ error: 'Admin sign-in required' }, 401);
  const db = serviceDb();
  if (!db) return json({ error: 'Database is not configured' }, 503);

  let fd: FormData;
  try {
    fd = await request.formData();
  } catch {
    return json({ error: 'Expected a file upload' }, 400);
  }
  const file = fd.get('file');
  const target = String(fd.get('target') ?? '');
  if (!(file instanceof File) || file.size === 0) return json({ error: 'Choose a file to upload' }, 400);

  if (target === 'lesson') {
    const lessonId = String(fd.get('lesson_id') ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(lessonId)) return json({ error: 'Unknown lesson' }, 400);
    if (file.size > MAX_FILE) return json({ error: 'Files must be 50 MB or smaller' }, 400);
    const path = `lessons/${lessonId}/${safeName(file.name)}`;
    const { error } = await db.storage.from('academy-files').upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: true });
    if (error) return json({ error: `Upload failed: ${error.message}` }, 500);
    const { error: e2 } = await db.from('academy_lessons').update({ file_path: path }).eq('id', lessonId);
    return e2 ? json({ error: e2.message }, 500) : json({ ok: true, path });
  }

  if (target === 'cover' || target === 'upi_qr') {
    if (!IMAGE_TYPES.includes(file.type)) return json({ error: 'Upload a PNG, JPEG or WebP image' }, 400);
    if (file.size > MAX_IMAGE) return json({ error: 'Images must be 5 MB or smaller' }, 400);
    const course = String(fd.get('course') ?? '');
    if (target === 'cover' && !/^[a-z0-9-]{2,60}$/.test(course)) return json({ error: 'Unknown course' }, 400);
    const path = target === 'cover' ? `covers/${course}-${Date.now()}-${safeName(file.name)}` : `upi/qr-${Date.now()}-${safeName(file.name)}`;
    const { error } = await db.storage.from('academy-public').upload(path, file, { contentType: file.type, upsert: true });
    if (error) return json({ error: `Upload failed: ${error.message}` }, 500);
    const url = db.storage.from('academy-public').getPublicUrl(path).data.publicUrl;
    const { error: e2 } =
      target === 'cover'
        ? await db.from('academy_courses').update({ cover_url: url }).eq('slug', course)
        : await db.from('academy_settings').upsert({ key: 'upi_qr_url', value: url, updated_at: new Date().toISOString() });
    return e2 ? json({ error: e2.message }, 500) : json({ ok: true, url });
  }

  return json({ error: 'Unknown upload target' }, 400);
};
