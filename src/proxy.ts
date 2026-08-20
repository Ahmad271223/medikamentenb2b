import createMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { routing } from './i18n/routing';
import { SESSION_COOKIE } from './lib/auth/cookie';

const intlMiddleware = createMiddleware(routing);

// The middleware only performs cheap cookie-presence gating for /app routes —
// the AUTHORITATIVE session check runs server-side in the app layout and in
// every API handler (never trust the frontend, spec §76).
const PROTECTED = /^\/(de|en|ar)\/app(\/|$)/;

export default function middleware(req: NextRequest) {
  const response = intlMiddleware(req);

  const pathname = req.nextUrl.pathname;
  if (PROTECTED.test(pathname) && !req.cookies.get(SESSION_COOKIE)?.value) {
    const locale = pathname.split('/')[1] ?? routing.defaultLocale;
    const loginUrl = new URL(`/${locale}/login`, req.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
