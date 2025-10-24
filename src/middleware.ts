import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

// Public routes you DON'T want to protect.
// Add/remove paths to suit your app.
const PUBLIC_ROUTES = new Set<string>([
  "/login",
  "/register",
]);

// Anything under /api/auth is always public (Auth.js' own routes)
const isAuthApiRoute = (pathname: string) => pathname.startsWith("/api/auth");
const isAuthPage = (pathname: string) => pathname === "/login" || pathname === "/register";

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Skip protection for public routes and Auth.js internal API
  if (PUBLIC_ROUTES.has(pathname) || isAuthApiRoute(pathname)) {
    return NextResponse.next();
  }

  const secret = process.env.AUTH_SECRET;
  let token: any = null;

  // Read the session token (prod/dev cookie names)
  try {
    token = await getToken({ req, secret });
    if (!token) {
      token = await getToken({ req, secret, cookieName: "__Secure-authjs.session-token" as any });
    }
    if (!token) {
      token = await getToken({ req, secret, cookieName: "authjs.session-token" as any });
    }
  } catch (error) {
    console.error("Failed to read authentication session token.", error);
  }

  const isAuthenticated = !!token;

  // If NOT authenticated and route is protected → send to /login with callback
  if (!isAuthenticated && !isAuthPage(pathname)) {
    const loginUrl = new URL("/login", req.url);
    const callback = pathname + (search || "");
    if (pathname !== "/login") {
      loginUrl.searchParams.set("callbackUrl", callback);
    }
    return NextResponse.redirect(loginUrl);
  }

  // If authenticated and hitting an auth page → push to app landing
  if (isAuthenticated && isAuthPage(pathname)) {
    return NextResponse.redirect(new URL("/study", req.url));
  }

  return NextResponse.next();
}

export const config = {
  // Protect everything except Next static assets/images and common public files
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
