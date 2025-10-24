import type { NextRequest } from 'next/server';

import { handlers } from '@/auth';

export const runtime = 'nodejs';

export function GET(request: NextRequest) {
  return handlers.GET(request);
}

export function POST(request: NextRequest) {
  return handlers.POST(request);
}
