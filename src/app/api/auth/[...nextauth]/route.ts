import type { NextRequest } from 'next/server';

import { handlers } from '@/auth';

export const runtime = 'nodejs';

// re-export handlers from your central auth file
export { GET, POST } from "@/auth";
export const runtime = "nodejs"; // ensure Node runtime for DB/bcrypt
