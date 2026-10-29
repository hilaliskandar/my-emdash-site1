import type { APIRoute } from "astro";
import { getEmDashCollection } from "emdash";

/**
 * Stable URLs for the most recently published edition of each radar.
 * A temporary, non-cacheable redirect prevents stale "latest" pointers.
 * No content is copied or modified.
 */
const SERIES: Record<string, string> = {
  "radar-normativo": "radar-normativo-",
  "radar-imobiliario": "radar-imobiliario-",
  "radar-contratacoes": "radar-contratacoes-",
};

const NO_STORE = { "Cache-Control": "no-store, max-age=0", "X-Robots-Tag": "noindex" };

export const GET: APIRoute = async ({ params, request }) => {
  const prefix = SERIES[params.radar ?? ""];
  if (!prefix) return new Response("Radar não encontrado.", { status: 404, headers: NO_STORE });

  // Search only published entries, most recent first. Continue through pages
  // so that the route stays accurate even when the archive grows.
  let cursor: string | undefined;
  for (let page = 0; page < 25; page++) {
    const result = await getEmDashCollection("posts", {
      locale: "pt-BR",
      status: "published",
      orderBy: { published_at: "desc" },
      limit: 100,
      ...(cursor ? { cursor } : {}),
    });

    const edition = result.entries.find((entry) =>
      entry.id.startsWith(prefix) && /^\d{4}-\d{2}-\d{2}$/.test(entry.id.slice(prefix.length))
    );
    if (edition) {
      const destination = new URL(`/posts/${encodeURIComponent(edition.id)}`, request.url);
      return new Response(null, {
        status: 302,
        headers: { ...NO_STORE, Location: destination.toString() },
      });
    }

    if (!result.nextCursor || result.nextCursor === cursor) break;
    cursor = result.nextCursor;
  }

  return new Response("Nenhuma edição publicada encontrada.", { status: 404, headers: NO_STORE });
};
