// src/app/api/auth/[...nextauth]/route.ts
export { GET, POST } from "@/auth";
export const runtime = "nodejs"; // ensure Node runtime for DB/bcrypt
