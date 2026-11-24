import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "public, max-age=60",
    "X-Content-Type-Options": "nosniff",
  };
  const slug = new URL(request.url).searchParams.get("slug") ?? "";
  if (!/^[a-z0-9][a-z0-9-]{2,160}$/.test(slug)) {
    return new Response(JSON.stringify({ error: "invalid_slug" }), { status: 400, headers });
  }
  try {
    const db = (locals as typeof locals & { runtime: { env: { DB: D1Database } } }).runtime.env.DB;
    const row = await db.prepare(
      "SELECT COALESCE(SUM(v.views), 0) AS views FROM ec_posts p LEFT JOIN radar_article_views v ON v.entry_id=p.id WHERE p.slug=? AND p.status='published' AND p.deleted_at IS NULL GROUP BY p.id",
    ).bind(slug).first<{ views: number }>();
    if (!row) return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers });
    return new Response(JSON.stringify({ views: Math.max(0, Number(row.views) || 0) }), { headers });
  } catch {
    return new Response(JSON.stringify({ error: "unavailable" }), { status: 503, headers: { ...headers, "Cache-Control": "no-store" } });
  }
};

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
