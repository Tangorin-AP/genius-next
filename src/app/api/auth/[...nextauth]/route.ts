// src/app/api/auth/[...nextauth]/route.ts
import { handlers } from "../../../../auth";
export const runtime = "nodejs";
export const GET = handlers.GET;
export const POST = handlers.POST;
