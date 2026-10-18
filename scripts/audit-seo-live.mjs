#!/usr/bin/env node
// Auditoria nao destrutiva de SEO publico; Node.js 20+; sem dependencias.
const origin = process.env.SEO_BASE_URL || "https://boletim.radarregulatorio.org";
const paths = ["/", "/robots.txt", "/sitemap.xml",
  "/posts/radar-normativo-2026-10-17",
  "/posts/radar-normativo-2026-10-16",
  "/posts/radar-normativo-2026-10-15"];
const results=[];
for(const path of paths){
  let row={path,status:0,finalUrl:"",contentType:"",issues:[]};
  try{
    const response=await fetch(new URL(path,origin),{
      headers:{"Accept":"text/html,application/xml,text/plain;q=0.9"},
      redirect:"follow",signal:AbortSignal.timeout(15000)
    });
    row.status=response.status;row.finalUrl=response.url;
    row.contentType=response.headers.get("content-type")||"";
    const body=(await response.text()).slice(0,200000);
    if(!response.ok)row.issues.push("Resposta HTTP nao bem-sucedida");
    if(/cloudflare access|sign in.+cloudflare|log in to emdash isolado/i.test(body))
      row.issues.push("Interceptacao por Cloudflare Access");
    if(path.endsWith(".xml")&& !/<(urlset|sitemapindex)(\s|>)/.test(body))
      row.issues.push("Sitemap XML nao reconhecido");
    if(path==="/robots.txt"&&!/^\s*user-agent:/im.test(body))
      row.issues.push("robots.txt sem User-agent");
    if(path==="/"||path.startsWith("/posts/")){
      const count=(pattern)=>[...body.matchAll(pattern)].length;
      const title=count(/<title(?:\s[^>]*)?>/gi);
      const canon=count(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi);
      const description=count(/<meta\b[^>]*name=["']description["'][^>]*>/gi);
      const ogImage=count(/<meta\b[^>]*property=["']og:image["'][^>]*>/gi);
      const jsonld=count(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>/gi);
      row.tags={title,canonical:canon,description,ogImage,jsonld};
      if(title!==1)row.issues.push("Quantidade de tags title diferente de 1");
      if(canon!==1)row.issues.push("Quantidade de canonicals diferente de 1");
      if(description!==1)row.issues.push("Quantidade de descriptions diferente de 1");
      if(!ogImage)row.issues.push("Sem og:image");
      if(path.startsWith("/posts/")&&!jsonld)row.issues.push("Sem JSON-LD no HTML");
      if(/<meta\b[^>]*name=["']robots["'][^>]*noindex/i.test(body))
        row.issues.push("Possivel noindex em pagina publica");
    }
  }catch(e){row.issues.push("Consulta indisponivel: "+String(e).slice(0,140))}
  results.push(row);
}
console.log(JSON.stringify({origin,checkedAt:new Date().toISOString(),results},null,2));
if(results.some(r=>r.issues.length))process.exitCode=1;
