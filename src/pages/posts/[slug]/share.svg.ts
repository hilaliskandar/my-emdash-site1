import type { APIRoute } from "astro";

export const prerender = false;

const escapeXml = (value: string) => value.replace(/[&<>"']/g, (char) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);

function wrapLines(value: string, limit = 37, maxLines = 4): string[] {
  const words = value.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!word) continue;
    const next = current ? current + " " + word : word;
    if (next.length > limit && current) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines) break;
    } else current = next;
  }
  if (lines.length < maxLines && current) lines.push(current);
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length)
    lines[maxLines - 1] = lines[maxLines - 1].slice(0, limit - 1).trimEnd() + "…";
  return lines;
}

export const GET: APIRoute = async ({ params, locals }) => {
  const slug = params.slug;
  const headers = {
    "Content-Type": "image/svg+xml; charset=utf-8",
    "Cache-Control": "public, max-age=300, s-maxage=3600",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  };
  if (!slug || !/^[a-z0-9][a-z0-9-]{2,160}$/.test(slug))
    return new Response(null, { status: 404 });
  const db = (locals as typeof locals & { runtime: { env: { DB: D1Database } } }).runtime.env.DB;
  let post: { title: string; published_at: string | null } | null = null;
  try {
    post = await db.prepare(
      "SELECT title, published_at FROM ec_posts WHERE slug=? AND status='published' AND deleted_at IS NULL LIMIT 1",
    ).bind(slug).first();
  } catch {
    return new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  if (!post) return new Response(null, { status: 404 });
  const section = slug.startsWith("radar-normativo-") ? "RADAR NORMATIVO"
    : slug.startsWith("radar-imobiliario-") ? "RADAR IMOBILIÁRIO"
    : slug.startsWith("radar-contratacoes-") ? "RADAR CONTRATAÇÕES"
    : slug.startsWith("puxadinho-") ? "O PUXADINHO" : "RADAR REGULATÓRIO";
  const lines = wrapLines(post.title, 39, 4);
  const date = post.published_at?.slice(0,10).split("-").reverse().join(".") ?? "";
  const title = lines.map((line, index) =>
    `<text x="78" y="${255 + index*73}" font-size="61" font-weight="750" fill="#fff">${escapeXml(line)}</text>`,
  ).join("\n");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="${escapeXml(post.title)}">
  <rect width="1200" height="630" fill="#111827"/>
  <rect x="0" width="20" height="630" fill="#f59e0b"/>
  <rect x="78" y="82" width="94" height="7" rx="3" fill="#f59e0b"/>
  <text x="78" y="136" fill="#fbbf24" font-size="26" font-weight="700" letter-spacing="3">${escapeXml(section)}</text>
  <g font-family="Arial, Helvetica, sans-serif">${title}</g>
  <path d="M78 535H1120" stroke="#475569" stroke-width="2"/>
  <text x="78" y="585" font-family="Arial, Helvetica, sans-serif" font-weight="700" fill="#fff" font-size="29">RADAR REGULATÓRIO</text>
  <text x="1120" y="585" text-anchor="end" font-family="Arial, Helvetica, sans-serif" fill="#cbd5e1" font-size="25">${escapeXml(date)}</text>
</svg>`;
  return new Response(svg, { status: 200, headers });
};
