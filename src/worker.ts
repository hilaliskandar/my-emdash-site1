import handler, { createScheduledHandler, PluginBridge } from "@emdash-cms/cloudflare/worker";

export { PluginBridge };

interface RadarEnv {
  EMDASH_API_TOKEN?: string;
}

/**
 * Internal, read-only import readiness probe.
 * The path is intentionally under /_emdash/ so it remains protected
 * by the existing Cloudflare Access Worker path policy.
 * Never returns a token, response body, or API content.
 */
async function radarImportProbe(request: Request, env: RadarEnv, ctx: ExecutionContext): Promise<Response> {
  const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
  if (request.method !== "GET") return new Response(null, { status: 405, headers });
  const token = env.EMDASH_API_TOKEN;
  if (!token) return new Response(JSON.stringify({ ready: false, reason: "missing_secret" }), { status: 503, headers });
  const normalizedToken = token.trim();
  const tokenShape = { hasExpectedPrefix: normalizedToken.startsWith("ec_pat_"), surroundingWhitespace: token !== normalizedToken, plausibleLength: normalizedToken.length >= 25 }; 
  const testUrl = new URL("/_emdash/api/schema/collections", request.url);
  const probe = new Request(testUrl, {
    method: "GET",
    headers: { Authorization: `Bearer ${normalizedToken}`, Accept: "application/json" },
  });
  try {
    // Dispatch internally instead of making a network request through Access.
    const response = await handler.fetch(probe, env as never, ctx);
    return new Response(JSON.stringify({
      ready: response.ok,
      apiStatus: response.status,
      tokenConfigured: true,
      tokenShape,
      diagnosis: response.status === 401 ? "credential_rejected_or_endpoint_auth" : response.status === 403 ? "permission_denied" : response.ok ? "authenticated" : "unexpected_api_status"
    }), { status: response.ok ? 200 : 503, headers });
  } catch {
    return new Response(JSON.stringify({ ready: false, reason: "internal_api_failure" }), { status: 503, headers });
  }
}

export default {
  ...handler,
  async fetch(request: Request, env: RadarEnv, ctx: ExecutionContext) {
    if (new URL(request.url).pathname === "/_emdash/import-readiness") {
      return radarImportProbe(request, env, ctx);
    }
    return handler.fetch(request, env as never, ctx);
  },
  scheduled: createScheduledHandler(),
} satisfies ExportedHandler<RadarEnv>;
