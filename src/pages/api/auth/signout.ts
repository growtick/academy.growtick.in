import type { APIRoute } from 'astro';
import { userDb } from '../../../lib/supabase';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  await userDb({ request, cookies }).auth.signOut();
  return redirect('/', 303);
};
