import type { APIRoute } from "astro";

export const prerender = false;

/** Public aggregated reading counter. No personal identifiers are returned. */
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
    // Historical estimates are deliberately excluded from factual public counts.
    return new Response(JSON.stringify({ views: Math.max(0, Number(row.views) || 0) }), { headers });
  } catch {
    return new Response(JSON.stringify({ error: "unavailable" }), { status: 503, headers: { ...headers, "Cache-Control": "no-store" } });
  }
};
