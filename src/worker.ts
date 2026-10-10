import { PILOT_INPUTS } from "./radar-pilots";
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

async function importSchemaProbe(request: Request, env: RadarEnv, ctx: ExecutionContext): Promise<Response> {
  const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
  if (request.method !== "GET") return new Response(null, { status: 405, headers });
  if (!env.EMDASH_API_TOKEN) return new Response(JSON.stringify({error:"missing_secret"}),{status:503,headers});
  const paths = ["/_emdash/api/schema/collections/posts/fields", "/_emdash/api/openapi.json", "/_emdash/api/taxonomies/category/terms"];
  const out: Record<string, unknown> = {};
  for (const path of paths) {
    try {
      const api = await handler.fetch(new Request(new URL(path, request.url), {
        headers: { Authorization: `Bearer ${env.EMDASH_API_TOKEN.trim()}`, Accept: "application/json" }
      }), env as never, ctx);
      const data = await api.json() as Record<string, any>;
      if (path.includes("openapi")) {
        const op = data?.paths?.["/_emdash/api/content/{collection}"]?.post;
        const terms = data?.paths?.["/_emdash/api/content/{collection}/{id}/terms/{taxonomy}"]?.post;
        out.openapi = { status: api.status, createContent: op?.requestBody?.content?.["application/json"]?.schema, setTerms: terms?.requestBody?.content?.["application/json"]?.schema, schemas: Object.fromEntries(Object.entries(data?.components?.schemas ?? {}).filter(([key])=>/createcontent|contentcreate|setcontentterm/i.test(key))) };
      } else {
        out[path] = {status: api.status, data};
      }
    } catch { out[path] = {error: "request_failed"}; }
  }
  return new Response(JSON.stringify(out), {headers});
}


function blocksFromMarkdown(markdown: string) {
  const chunks = markdown.split(/\n\s*\n/g).map(x => x.trim()).filter(Boolean);
  return chunks.slice(1).map((chunk, i) => {
    const heading = /^(#{2,4})\s+/.exec(chunk);
    const text = heading ? chunk.replace(/^#{2,4}\s+/, "") : chunk;
    return {
      _type: "block", _key: "pilot" + String(i).padStart(4, "0"),
      style: heading ? "h" + Math.min(heading[1].length, 3) : "normal",
      markDefs: [],
      children: [{ _type: "span", _key: "s" + i, marks: [], text }],
    };
  });
}

async function pilotDraftImport(request: Request, env: RadarEnv, ctx: ExecutionContext): Promise<Response> {
  const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
  const url = new URL(request.url);
  if (request.method === "GET" && request.headers.get("accept")?.includes("text/html")) {
    const page = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Importação piloto EmDash</title><style>body{font:16px/1.6 system-ui;max-width:780px;margin:5vh auto;padding:24px;color:#20343b}button{padding:10px 18px;margin:8px 8px 8px 0;cursor:pointer}pre{white-space:pre-wrap;padding:16px;background:#f1f4f5;border-radius:6px}</style><h1>Importação piloto dos radares</h1><p>Criação exclusiva como <strong>rascunho</strong>. Confira cada edição no EmDash antes de publicar.</p><p>05/10/2026 — Radar Normativo e Radar Imobiliário</p><button onclick="run('normativo')">Criar rascunho Normativo</button><button onclick="run('imobiliario')">Criar rascunho Imobiliário</button><pre id="result">Nenhuma importação executada.</pre><script>async function run(pilot){if(!confirm('Criar somente o rascunho de '+pilot+'?'))return;document.getElementById('result').textContent='Processando...';try{const r=await fetch(location.pathname,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pilot,confirm:'CRIAR_RASCUNHO'})});document.getElementById('result').textContent=JSON.stringify(await r.json(),null,2)}catch(e){document.getElementById('result').textContent=String(e)}}</script></html>`;
    return new Response(page, {headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"}});
  }
  if (request.method === "GET") {
    return new Response(JSON.stringify({
      available: PILOT_INPUTS.map(p => ({ key:p.key,title:p.md.split("\n")[0].replace(/^# /,""),date:"2026-10-05" })),
      action: "POST same route with JSON {pilot:'normativo'|'imobiliario', confirm:'CRIAR_RASCUNHO'}",
      noAutomaticPublication: true
    }), { headers });
  }
  if (request.method !== "POST") return new Response(null, {status:405,headers});
  const origin = request.headers.get("origin");
  if (!origin || origin !== url.origin) return new Response(JSON.stringify({error:"origin_not_allowed"}),{status:403,headers});
  if (!env.EMDASH_API_TOKEN) return new Response(JSON.stringify({error:"missing_secret"}),{status:503,headers});
  let payload: {pilot?:string,confirm?:string};
  try { payload = await request.json() as typeof payload; }
  catch { return new Response(JSON.stringify({error:"invalid_json"}),{status:400,headers}); }
  if (payload.confirm !== "CRIAR_RASCUNHO") return new Response(JSON.stringify({error:"confirmation_required"}),{status:400,headers});
  const pilot = PILOT_INPUTS.find(p=>p.key === payload.pilot);
  if (!pilot) return new Response(JSON.stringify({error:"unknown_pilot"}),{status:400,headers});
  const slug = "radar-" + pilot.key + "-2026-10-05-piloto";
  const auth = { Authorization: `Bearer ${env.EMDASH_API_TOKEN.trim()}`, Accept:"application/json" };
  // Reconcile by fixed slug before creating. This also avoids accidental repeat imports.
  const listRes = await handler.fetch(new Request(new URL("/_emdash/api/content/posts?limit=100",url), {headers: auth}), env as never,ctx);
  if (!listRes.ok) return new Response(JSON.stringify({error:"list_failed",apiStatus:listRes.status}),{status:502,headers});
  const listed = await listRes.json() as any;
  const entries = listed?.data?.items ?? listed?.data?.entries ?? listed?.data?.content ?? [];
  if (!Array.isArray(entries)) return new Response(JSON.stringify({error:"unexpected_list_shape"}),{status:502,headers});
  if (entries.some((e:any) => e.slug === slug)) return new Response(JSON.stringify({status:"already_exists",slug}),{headers});
  const title = pilot.md.split("\n")[0].replace(/^# /,"");
  const body = { slug, status:"draft",locale:"pt-BR",
    publishedAt:"2026-10-05T12:00:00-03:00",
    data:{ title, excerpt: pilot.md.split(/\n\s*\n/)[1] ?? "",content:blocksFromMarkdown(pilot.md)},
    taxonomies:{category:[pilot.key === "normativo"?"radar-normativo-urbano":"radar-imobiliario-metropolitano"]}
  };
  const res = await handler.fetch(new Request(new URL("/_emdash/api/content/posts",url),{
    method:"POST",headers:{...auth,"Content-Type":"application/json"},body:JSON.stringify(body)
  }),env as never,ctx);
  if (!res.ok) return new Response(JSON.stringify({status:"failed",apiStatus:res.status,slug}),{status:502,headers});
  const record = await res.json() as any;
  return new Response(JSON.stringify({status:"created_as_draft",slug,apiStatus:res.status,id:record?.data?.id ?? record?.data?.item?.id ?? null}),{headers});
}

export default {
  ...handler,
  async fetch(request: Request, env: RadarEnv, ctx: ExecutionContext) {
    if (new URL(request.url).pathname === "/_emdash/import-pilots") return pilotDraftImport(request, env, ctx);
    if (new URL(request.url).pathname === "/_emdash/import-schema") return importSchemaProbe(request, env, ctx);
    if (new URL(request.url).pathname === "/_emdash/import-readiness") {
      return radarImportProbe(request, env, ctx);
    }
    return handler.fetch(request, env as never, ctx);
  },
  scheduled: createScheduledHandler(),
} satisfies ExportedHandler<RadarEnv>;
