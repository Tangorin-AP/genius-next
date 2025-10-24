import type { NextRequest } from 'next/server';

import { handlers } from '@/auth';

export const runtime = 'nodejs';

// Wire the handlers exported by src/auth.ts (v5 style)
export { GET, POST } from '@/auth';
