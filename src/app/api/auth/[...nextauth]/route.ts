export const runtime = 'nodejs';

export { GET, POST } from '@/auth';

// Wire the handlers exported by src/auth.ts (v5 style)
export { GET, POST } from "@/auth";
export const runtime = "nodejs"; // ensure Node runtime (not Edge)
