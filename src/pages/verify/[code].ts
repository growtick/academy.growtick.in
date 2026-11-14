import type { APIRoute } from 'astro';

// Direct certificate links (/verify/GT-...) render the lookup page with the code pre-filled.
export const GET: APIRoute = ({ url, params }) => {
  const code = (params.code as string ?? '').trim();
  if (!code) {
    return new Response(null, { status: 302, headers: { Location: '/verify' } });
  }
  return new Response(null, {
    status: 302,
    headers: { Location: `/verify?code=${encodeURIComponent(code)}` },
  });
};
