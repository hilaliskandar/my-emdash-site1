import type { APIRoute } from "astro";
import { GET as renderSvg } from "./share.svg";

export const prerender = false;

/**
 * PNG prototype, deliberately not referenced by Open Graph metadata.
 * Images binding transformations can be billable. Do not merge until cost
 * and runtime behavior have been approved and tested.
 */
export const GET: APIRoute = async (context) => {
  const svgResponse = await renderSvg(context);
  if (svgResponse.status !== 200 || !svgResponse.body) return svgResponse;

  const images = (context.locals as typeof context.locals & {
    runtime: {
      env: {
        IMAGES?: {
          input: (body: ReadableStream) => {
            output: (opts: { format: "image/png" }) =>
              Promise<{ response: (opts?: { headers?: Record<string, string> }) => Response }>;
          };
        };
      };
    };
  }).runtime.env.IMAGES;

  if (!images) {
    return new Response("Conversao PNG nao configurada", {
      status: 503,
      headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  try {
    const transformed = await images.input(svgResponse.body).output({ format: "image/png" });
    const result = transformed.response({
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=300, s-maxage=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
    return result;
  } catch {
    return new Response("Conversao PNG indisponivel", {
      status: 503,
      headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
    });
  }
};
