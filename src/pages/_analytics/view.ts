import type { APIRoute } from "astro";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const headers = {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  };
  const origin = new URL(request.url).origin;
  if (request.headers.get("Origin") !== origin ||
      request.headers.get("Sec-Fetch-Site") === "cross-site") {
    return new Response(null, { status: 403, headers });
  }
  if (Number(request.headers.get("Content-Length") || "0") > 1024) {
    return new Response(null, { status: 413, headers });
  }
  let payload: unknown;
  try { payload = await request.json(); }
  catch { return new Response(null, { status: 400, headers }); }
  const slug = (payload && typeof payload === "object" && "slug" in payload)
    ? (payload as { slug: unknown }).slug : undefined;
  if (typeof slug !== "string" || !/^[a-z0-9][a-z0-9-]{2,160}$/.test(slug)) {
    return new Response(null, { status: 400, headers });
  }
  try {
    const db = (locals as typeof locals & { runtime: { env: { DB: D1Database } } }).runtime.env.DB;
    const post = await db.prepare(
      "SELECT id FROM ec_posts WHERE slug=? AND status='published' AND deleted_at IS NULL LIMIT 1",
    ).bind(slug).first<{ id: string }>();
    if (!post) return new Response(null, { status: 404, headers });
    const day = new Date().toISOString().slice(0, 10);
    await db.prepare(
      "INSERT INTO radar_article_views (entry_id, day, views) VALUES (?, ?, 1) ON CONFLICT(entry_id, day) DO UPDATE SET views=views+1",
    ).bind(post.id, day).run();
    return new Response(JSON.stringify({ recorded: true }), { status: 202, headers });
  } catch {
    return new Response(JSON.stringify({ recorded: false }), { status: 503, headers });
  }
};
