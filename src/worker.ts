import { RADAR_BATCH } from "./radar-batch-data";
import { PILOT_INPUTS } from "./radar-pilots";
import handler, { createScheduledHandler, PluginBridge } from "@emdash-cms/cloudflare/worker";

export { PluginBridge };

interface RadarEnv {
  EMDASH_API_TOKEN?: string;
  DB: D1Database;
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


function draftBlocksFromSource(text: string) {
  // Preserve the exact supplied wording, with one block per nonempty line or paragraph.
  const chunks = text.replace(/\r\n/g, "\n").split(/\n\s*\n|\n(?=[^\n])/).map(x=>x.trim()).filter(Boolean);
  return chunks.map((chunk,i) => ({
    _type:"block", _key:"archive"+String(i).padStart(4,"0"), style:"normal", markDefs:[],
    children:[{_type:"span",_key:"s"+i,marks:[],text:chunk}]
  }));
}

async function radarArchiveImport(request: Request, env: RadarEnv, ctx: ExecutionContext): Promise<Response> {
  const headers={"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};
  const url = new URL(request.url);
  if (request.method==="GET" && request.headers.get("accept")?.includes("text/html")) {
    const html=`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Acervo dos radares</title><style>body{max-width:840px;margin:40px auto;font:16px/1.5 system-ui;padding:20px;color:#243a43}button{padding:12px 20px}pre{white-space:pre-wrap;background:#eee;padding:14px}</style><h1>Importação de 27 edições do acervo</h1><p>As edições serão importadas exclusivamente como <strong>rascunhos</strong>, sem publicação. O procedimento importa cinco edições por operação, com verificação de duplicações.</p><label>Lote: <select id="batch"><option value="0">1 — edições 1 a 5</option><option value="1">2 — edições 6 a 10</option><option value="2">3 — edições 11 a 15</option><option value="3">4 — edições 16 a 20</option><option value="4">5 — edições 21 a 25</option><option value="5">6 — edições 26 a 27</option></select></label><p><button onclick="run()">Criar rascunhos do lote selecionado</button></p><pre id="result">Aguardando execução.</pre><script>async function run(){if(!confirm('Criar somente rascunhos deste lote?'))return;const o=document.getElementById('result');o.textContent='Importando...';try{const r=await fetch(location.pathname,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({batch:Number(document.getElementById('batch').value),confirm:'IMPORTAR_RASCUNHOS'})});o.textContent=JSON.stringify(await r.json(),null,2)}catch(e){o.textContent=String(e)}}</script></html>`;
    return new Response(html,{headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","Content-Security-Policy":"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'"}});
  }
  if(request.method==="GET")return new Response(JSON.stringify({available:RADAR_BATCH.map((x,i)=>({i,radar:x.radar,date:x.date})),draftOnly:true}),{headers});
  if(request.method!=="POST")return new Response(null,{status:405,headers});
  if(request.headers.get("origin")!==url.origin)return new Response(JSON.stringify({error:"origin_mismatch"}),{status:403,headers});
  if(!env.EMDASH_API_TOKEN)return new Response(JSON.stringify({error:"missing_token"}),{status:503,headers});
  let input:{batch?:number,confirm?:string};
  try{input=await request.json() as typeof input}catch{return new Response(JSON.stringify({error:"invalid_json"}),{status:400,headers})}
  if(input.confirm!=="IMPORTAR_RASCUNHOS"||!Number.isInteger(input.batch)||input.batch!<0||input.batch!>5)return new Response(JSON.stringify({error:"invalid_batch_or_confirmation"}),{status:400,headers});
  const selected=RADAR_BATCH.slice(input.batch!*5,input.batch!*5+5);
  const auth={Authorization:`Bearer ${env.EMDASH_API_TOKEN.trim()}`,Accept:"application/json"};
  const out=[];
  for(const item of selected){
    const slug="radar-"+item.radar+"-"+item.date+"-arquivo";
    const get=await handler.fetch(new Request(new URL("/_emdash/api/content/posts?limit=100",url),{headers:auth}),env as never,ctx);
    if(!get.ok){out.push({slug,status:"list_error",http:get.status});break}
    const result=await get.json() as any;
    const records=result?.data?.items??result?.data?.entries??result?.data?.content??[];
    if(!Array.isArray(records)){out.push({slug,status:"unexpected_listing"});break}
    if(records.some((r:any)=>r.slug===slug)){out.push({slug,status:"already_exists"});continue}
    const title=(item.radar==="normativo"?"Radar Normativo Urbano":"Radar Imobiliário Metropolitano")+" — "+item.date.split("-").reverse().join("/");
    const description=item.text.replace(/\r\n/g,"\n").split("\n").map(x=>x.trim()).filter(Boolean).slice(0,3).join(" ").slice(0,500);
    const body={slug,status:"draft",locale:"pt-BR",publishedAt:item.date+"T12:00:00-03:00",data:{title,excerpt:description,content:draftBlocksFromSource(item.text)},taxonomies:{category:[item.category_slug]}};
    const create=await handler.fetch(new Request(new URL("/_emdash/api/content/posts",url),{method:"POST",headers:{...auth,"Content-Type":"application/json"},body:JSON.stringify(body)}),env as never,ctx);
    out.push({slug,status:create.ok?"created_draft":"api_error",http:create.status});
    if(!create.ok)break;
  }
  return new Response(JSON.stringify({batch:input.batch,results:out,allDrafts:true}),{headers});
}

/** Aggregate-only view counter: does not persist IP addresses or cookies. */
async function recordArticleView(request: Request, env: RadarEnv): Promise<Response> {
  const headers = { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" };
  if (request.method !== "POST") return new Response(null, { status: 405, headers });
  const url = new URL(request.url);
  if (request.headers.get("Origin") !== url.origin || request.headers.get("Sec-Fetch-Site") === "cross-site") {
    return new Response(null, { status: 403, headers });
  }
  let body: { slug?: unknown };
  try { body = await request.json() as { slug?: unknown }; }
  catch { return new Response(null, { status: 400, headers }); }
  const slug = body.slug;
  if (typeof slug !== "string" || !/^[a-z0-9][a-z0-9-]{2,160}$/.test(slug)) {
    return new Response(null, { status: 400, headers });
  }
  try {
    const post = await env.DB.prepare("SELECT id FROM ec_posts WHERE slug=? AND status='published' AND deleted_at IS NULL LIMIT 1").bind(slug).first<{ id: string }>();
    if (!post) return new Response(null, { status: 404, headers });
    const day = new Date().toISOString().slice(0, 10);
    await env.DB.prepare("INSERT INTO radar_article_views (entry_id, day, views) VALUES (?, ?, 1) ON CONFLICT(entry_id, day) DO UPDATE SET views = views + 1").bind(post.id, day).run();
    return new Response(JSON.stringify({ recorded: true }), { status: 202, headers });
  } catch {
    return new Response(JSON.stringify({ recorded: false }), { status: 503, headers });
  }
}
export default {
  ...handler,
  async fetch(request: Request, env: RadarEnv, ctx: ExecutionContext) {
    if (new URL(request.url).pathname === "/_analytics/view") return recordArticleView(request, env);
    if (new URL(request.url).pathname === "/_emdash/import-archive") return radarArchiveImport(request, env, ctx);
    if (new URL(request.url).pathname === "/_emdash/import-pilots") return pilotDraftImport(request, env, ctx);
    if (new URL(request.url).pathname === "/_emdash/import-schema") return importSchemaProbe(request, env, ctx);
    if (new URL(request.url).pathname === "/_emdash/import-readiness") {
      return radarImportProbe(request, env, ctx);
    }
    return handler.fetch(request, env as never, ctx);
  },
  scheduled: createScheduledHandler(),
} satisfies ExportedHandler<RadarEnv>;
