# Auditoria técnica de SEO — 17/10/2026

## Escopo

Portal Astro 7 + Emdash SSR, Cloudflare Workers e D1. Auditoria documental do repositório e consulta agregada somente leitura ao D1. Não houve alteração de conteúdo, plugin SEO ou metadados de produção.

## Evidências no repositório

- `src/pages/posts/[slug].astro`: utiliza `getSeoMeta(post)`; repassa `seo.title`, `seo.ogTitle`, `seo.description`, `seo.ogImage`, `seo.canonical` e `seo.robots` ao layout.
- `src/layouts/Base.astro`: constrói `createPublicPageContext` e renderiza `<EmDashHead page={pageCtx} />`.
- `seed/seed.json`: as coleções `posts` e `pages` incluem a capacidade `seo`.
- Não foram localizados arquivos `src/pages/sitemap.xml.ts` ou `src/pages/robots.txt.ts` no repositório. Isso, isoladamente, **não** comprova ausência de endpoints, pois o Emdash pode provê-los.

## Auditoria cadastral no D1

Filtro: `ec_posts.status='published' AND deleted_at IS NULL`.

| Indicador | Quantidade |
| --- | ---: |
| Publicados | 61 |
| Sem título | 0 |
| Sem resumo editorial (excerpt) | 0 |
| Sem imagem destacada | 49 |
| Título editorial com mais de 65 caracteres | 44 |
| Sem data de publicação | 0 |

Essas contagens **não são** auditoria de campos SEO individualizados. Ausência de imagem destacada não implica necessariamente ausência de `og:image`. Títulos editoriais longos não implicam necessariamente metatítulos longos.

Consulta reproduzível:

```sql
SELECT
 COUNT(*) AS published,
 SUM(CASE WHEN title IS NULL OR trim(title)='' THEN 1 ELSE 0 END) AS missing_title,
 SUM(CASE WHEN excerpt IS NULL OR trim(excerpt)='' THEN 1 ELSE 0 END) AS missing_excerpt,
 SUM(CASE WHEN featured_image IS NULL OR featured_image='' THEN 1 ELSE 0 END) AS missing_featured_image,
 SUM(CASE WHEN length(title)>65 THEN 1 ELSE 0 END) AS long_editorial_titles,
 SUM(CASE WHEN published_at IS NULL THEN 1 ELSE 0 END) AS missing_publication_date
FROM ec_posts WHERE status='published' AND deleted_at IS NULL;
```

## Verificação da saída pública

As consultas externas a `/robots.txt` e `/sitemap.xml` não obtiveram resposta verificável. Necessário executar a rotina `node scripts/audit-seo-live.mjs` de máquina com acesso HTTP ao domínio e conferir o corpo das respostas. A ferramenta sinaliza status, interceptação Cloudflare Access, metatags canônicas e Open Graph, além de presença de JSON-LD. O detector HTML é heurístico e pode exigir interpretação manual.

## Ações recomendadas, condicionadas à verificação

1. Confirmar que `robots.txt` e `sitemap.xml` são públicos e não redirecionam para Cloudflare Access. Só adicionar rotas ou exceções Cloudflare após verificar comportamento efetivo.
2. Verificar em amostra de artigos título, descrição, `canonical`, `og:image`, `twitter:image` e JSON-LD. Não duplicar componentes SEO já produzidos por `EmDashHead`.
3. Inventariar metadados SEO específicos no Emdash e revisar os casos sem imagem de compartilhamento válida, priorizando os radares mais recentes.
4. Caso sejam adotados cartões PNG, integrá-los somente após teste de dimensão, formato, cache, custo e acesso público de robôs.
5. Ampliar auditoria para detectar dados estruturados válidos e compatibilidade Google Search Console, sem confundir ausência de resultados indexados com erro técnico.

## Execução

```powershell
git pull --ff-only origin main
node scripts/audit-seo-live.mjs
```

Não é necessário implantar o Worker para executar a auditoria. A rotina não modifica o site, o banco ou o Cloudflare.
