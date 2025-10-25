export { auth as middleware } from "./src/auth";
export const config = {
  matcher: [
    "/deck/:path*",
    "/api/mark/:path*",
    "/api/select/:path*",
    "/api/export/:path*",
  ],
};
