/** Public site origin for links in emails and certificates. Production builds
 *  never use a localhost value (e.g. one left in .env). */
const configured = import.meta.env.PUBLIC_SITE_URL as string | undefined;
export const SITE_URL: string =
  import.meta.env.PROD && (!configured || /localhost|127\.0\.0\.1/.test(configured))
    ? 'https://academy.growtick.in'
    : (configured ?? 'http://localhost:4321').replace(/\/$/, '');
