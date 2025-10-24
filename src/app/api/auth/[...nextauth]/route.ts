// STUB to prove this file is wired
export const runtime = "nodejs";

export async function GET() {
  return new Response(JSON.stringify({ ok: true, route: "auth-stub" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

export async function POST() {
  return new Response(JSON.stringify({ ok: true, route: "auth-stub-post" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
