import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

import { ensureAuthSecretForRuntime } from '@/lib/env';

const AUTH_ROUTES = ['/login', '/register'];
const PUBLIC_ROUTES = new Set([...AUTH_ROUTES, '/api/health']);

export default async function middleware(req: NextRequest) {
  const { secret } = ensureAuthSecretForRuntime();

  const { pathname, search } = req.nextUrl;

  if (pathname.startsWith('/_next/') || pathname.startsWith('/api/auth') || pathname.startsWith('/favicon.ico')) {
    return NextResponse.next();
  }
  if (/\.(?:png|jpg|jpeg|gif|svg|ico|webp|css|js|woff2?)$/i.test(pathname)) {
    return NextResponse.next();
  }

  const isPublic = PUBLIC_ROUTES.has(pathname);
  const isAuthRoute = AUTH_ROUTES.includes(pathname);

  let token = null;
try {
  // default read
  token = await getToken({ req, secret });
  // try the secure cookie name used in production
  if (!token) token = await getToken({ req, secret, cookieName: "__Secure-authjs.session-token" as any });
  // try the non-prefixed name used locally
  if (!token) token = await getToken({ req, secret, cookieName: "authjs.session-token" as any });
} catch (error) {
  console.error("Failed to read authentication session token.", error);
}

  const tokenId = typeof token?.id === 'string' ? token.id : typeof token?.sub === 'string' ? token.sub : undefined;
  const isAuthenticated = Boolean(tokenId);

  if (!isAuthenticated && !isPublic) {
    const loginUrl = new URL('/login', req.nextUrl.origin);
    const callback = pathname + (search ?? '');
    if (callback !== '/login') {
      loginUrl.searchParams.set('callbackUrl', callback);
    }
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthenticated && isAuthRoute) {
    return NextResponse.redirect(new URL('/', req.nextUrl.origin));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)'],
};
