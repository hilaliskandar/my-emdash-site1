-- Auditoria somente leitura. Execute no banco D1 de producao.
-- Inclui todas as publicacoes, com categorias atuais agregadas.
SELECT p.slug, p.id, p.published_at,
       COALESCE(GROUP_CONCAT(DISTINCT t.slug), '') AS categories
FROM ec_posts AS p
LEFT JOIN content_taxonomies AS c
  ON c.collection = 'posts' AND c.entry_id = p.id
  AND c.status IS NULL AND c.deleted_at IS NULL
LEFT JOIN taxonomies AS t
  ON t.id = c.taxonomy_id AND t.name = 'category'
WHERE p.status = 'published' AND p.deleted_at IS NULL
  AND p.locale = 'pt-BR'
GROUP BY p.id
ORDER BY p.published_at DESC;
