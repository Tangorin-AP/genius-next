import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

const isAuthPage = (p: string) => p === "/login" || p === "/register";

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (pathname.startsWith("/api/auth")) return NextResponse.next();
  if (pathname.startsWith("/_next/") || pathname === "/favicon.ico" || pathname === "/robots.txt" || pathname === "/sitemap.xml") {
    return NextResponse.next();
  }

  const secret = process.env.AUTH_SECRET;

  let token: any = await getToken({ req, secret }).catch(() => null);
  if (!token) token = await getToken({ req, secret, cookieName: "__Secure-authjs.session-token" as any });
  if (!token) token = await getToken({ req, secret, cookieName: "authjs.session-token" as any });

  const isAuthenticated = !!token;

  if (!isAuthenticated && !isAuthPage(pathname)) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname + (search || ""));
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthenticated && isAuthPage(pathname)) {
    return NextResponse.redirect(new URL("/study", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
