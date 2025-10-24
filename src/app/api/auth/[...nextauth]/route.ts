// RELATIVE import avoids "@/..." alias issues in the API route bundler
import { handlers } from "../../../../auth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    return await handlers.GET(req); // only pass the Request
  } catch (e: any) {
    console.error("[auth][GET] error:", e);
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

export async function POST(req: Request) {
  try {
    return await handlers.POST(req); // only pass the Request
  } catch (e: any) {
    console.error("[auth][POST] error:", e);
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
