import { NextResponse } from 'next/server';

import { auth } from './auth';

const AUTH_ROUTES = ['/login', '/register'];
const PUBLIC_ROUTES = new Set([...AUTH_ROUTES, '/api/health']);

export default auth((req) => {
  const { pathname, search } = req.nextUrl;

  if (pathname.startsWith('/_next/') || pathname.startsWith('/api/auth') || pathname.startsWith('/favicon.ico')) {
    return NextResponse.next();
  }
  if (/\.(?:png|jpg|jpeg|gif|svg|ico|webp|css|js|woff2?)$/i.test(pathname)) {
    return NextResponse.next();
  }

  const isPublic = PUBLIC_ROUTES.has(pathname);
  const isAuthRoute = AUTH_ROUTES.includes(pathname);
  const isAuthenticated = Boolean(req.auth?.user?.id);

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
}, {
  callbacks: {
    authorized: () => true,
  },
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)'],
};
