import { createBrowserClient, createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from 'astro:env/server';

export interface AstroCookies {
  get(name: string): { value?: string } | undefined;
  set(
    key: string,
    value: string,
    options?: {
      path?: string;
      domain?: string;
      sameSite?: 'lax' | 'strict' | 'none';
      secure?: boolean;
      httpOnly?: boolean;
      maxAge?: number;
      expires?: Date;
    }
  ): void;
  delete(name: string, options?: { path?: string; domain?: string }): void;
}

export interface ServerContext {
  cookies: AstroCookies;
  request: Request;
}

/** Browser Supabase client (anon key). Safe to import anywhere. */
export function browserDb() {
  return createBrowserClient(
    import.meta.env.PUBLIC_SUPABASE_URL ?? '',
    import.meta.env.PUBLIC_SUPABASE_ANON_KEY ?? ''
  );
}

/** Cookie-less server Supabase client with the anon key (public reads only). */
export function anonDb() {
  return createServerClient(
    import.meta.env.PUBLIC_SUPABASE_URL ?? '',
    import.meta.env.PUBLIC_SUPABASE_ANON_KEY ?? '',
    { cookies: { getAll: () => [] } }
  );
}

/** Cookie adapters for @supabase/ssr (getAll/setAll), wired to an Astro context. */
export function cookieAdapters(context: ServerContext) {
  return {
    getAll: () => {
      const header = context.request.headers.get('cookie');
      if (!header) return [];
      return header
        .split(';')
        .map((c) => {
          const eq = c.indexOf('=');
          if (eq === -1) return { name: c.trim(), value: '' };
          return { name: c.slice(0, eq).trim(), value: c.slice(eq + 1).trim() };
        })
        .filter((c) => c.name);
    },
    setAll: (cookies: { name: string; value: string; options?: CookieOptions }[]) => {
      for (const { name, value, options } of cookies) {
        context.cookies.set(name, value, {
          path: options?.path ?? '/',
          domain: options?.domain,
          sameSite: options?.sameSite as 'lax' | 'strict' | 'none' | undefined,
          secure: options?.secure,
          httpOnly: options?.httpOnly,
          maxAge: options?.maxAge,
          expires:
            options?.expires instanceof Date
              ? options.expires
              : typeof options?.expires === 'number'
                ? new Date(options.expires * 1000)
                : undefined,
        });
      }
    },
  };
}

/** Server Supabase client bound to a request's cookies (user session). */
export function userDb(context: ServerContext) {
  return createServerClient(
    import.meta.env.PUBLIC_SUPABASE_URL ?? '',
    import.meta.env.PUBLIC_SUPABASE_ANON_KEY ?? '',
    { cookies: cookieAdapters(context) }
  );
}

/** Service-role Supabase client (server endpoints only). Null when not configured. */
export function serviceDb() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  return createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Best-effort database client for server code: service role if configured,
 *  otherwise the anon key (public reads only). */
export function db(context?: ServerContext) {
  return serviceDb() ?? (context ? userDb(context) : anonDb());
}
