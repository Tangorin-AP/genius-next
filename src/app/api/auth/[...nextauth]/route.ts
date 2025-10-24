// Use RELATIVE import to avoid "@/..." alias issues in the API route bundler
import { handlers } from "../../../../auth";
export const runtime = "nodejs";

export const GET = async (req: Request, ctx: unknown) => {
  try {
    return await handlers.GET(req, ctx as any);
  } catch (e: any) {
    console.error("[auth][GET] error:", e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};

export const POST = async (req: Request, ctx: unknown) => {
  try {
    return await handlers.POST(req, ctx as any);
  } catch (e: any) {
    console.error("[auth][POST] error:", e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};
