// Use a relative import so the route bundler never trips over "@/..." aliases
import { handlers } from "../../../../auth";
export const runtime = "nodejs";

// Re-export the actual route handlers
export const GET = handlers.GET;
export const POST = handlers.POST;
