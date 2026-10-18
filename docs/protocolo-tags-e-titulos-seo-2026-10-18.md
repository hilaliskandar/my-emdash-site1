# Classificação temática, geográfica, institucional e títulos SEO

Data-base: 18/10/2026. Aplicável às publicações do Radar Regulatório em Emdash 1.0.1.

## Situação da base

- 61 artigos publicados, 25 tags nativas Emdash (`taxonomies.name='tag'`).
- 46 artigos com pelo menos uma tag e 107 vínculos em `content_taxonomies`, apurados após retroclassificação.
- 15 artigos exigem leitura dirigida: não atribuir tags apenas pela editoria.
- A taxonomia `tag` está definida em `_emdash_taxonomy_defs` para `posts`; a rota `src/pages/tag/[slug].astro` e a exibição no detalhe de cada artigo já estão implementadas.
- Existe uma categoria editorial independente em `taxonomies.name='category'`. **Nunca** substituí-la por uma tag.

## Formato de identificadores e entidades

Usar `taxonomies.name='tag'`, `locale='pt-BR'`, `slug='<classe>:<identificador>'`, `label` legível. Classes:

| Classe | Exemplo de slug | Label |
|---|---|---|
| tema | `tema:regularizacao-fundiaria` | Regularização Fundiária |
| municipio | `municipio:guarulhos-sp` | Guarulhos (SP) |
| regiao-metropolitana | `regiao-metropolitana:sao-paulo` | Região Metropolitana de São Paulo |
| empresa | `empresa:pacaembu` | Pacaembu |
| fundo | `fundo:trxf11` | TRXF11 |
| orgao-publico | `orgao-publico:ana` | ANA |

Não transformar qualquer menção de município em região metropolitana nem confundir organizações, ações ou fundos. Município homônimo exige UF e evidência contextual. Um nome de pessoa jurídica não pode ser inferido de siglas ambíguas.

## Regra de classificação na publicação

1. Ler título, resumo e conteúdo integral (inclusive itens específicos do radar).
2. Recuperar as tags já cadastradas, sinônimos aprovados e tags já associadas ao artigo.
3. Gerar **candidaturas**, com `slug`, classe, trecho de evidência e nível de confiança. A menção textual é condição necessária, mas não suficiente: contexto decide vínculo.
4. Criar nova tag somente quando realmente não existir termo equivalente; atribuir IDs estáveis e aplicar unicidade por `name+slug`.
5. Aplicar tags via integração de taxonomias do Emdash, preservando todas as associações anteriores. Se a edição for republicada, a operação deve ser idempotente.
6. Se houver homônimo, atribuição territorial incerta ou nome empresarial ambíguo, encaminhar para revisão, sem associação automática.
7. Guardar relatório de execução com edição, versão das regras, tags sugeridas, aprovadas, rejeitadas e justificativas.

## Título SEO

1. Determinar o comprimento do título editorial e o título SEO já persistido. O limite de 60–65 caracteres é uma **heurística**, não exigência rígida dos motores de busca, que apresentam resultados segundo largura visual.
2. **Não substituir** `seo_title` já preenchido sem aprovação específica.
3. Se o título for longo e não houver SEO, gerar uma proposta resumida a partir do conteúdo: tema central, órgãos, localidades, números e situação jurídica exata. **Nunca cortar texto arbitrariamente** nem afirmar contratação quando o ato apenas habilita propostas.
4. Conservar `ec_posts.title`, `slug`, `excerpt` e conteúdo editorial.
5. Conferir o título final acrescido do nome do portal, `og:title`, `canonical`, `robots` e a imagem de compartilhamento no HTML público.

## Integração com os três publicadores

Os publicadores dos radares são fluxos externos ao arquivo `src/pages/posts/[slug].astro`; alterar apenas o template de exibição não automatiza sua criação. A integração deve ocorrer no ponto que monta o **rascunho** ou chama a API de conteúdo Emdash: gerar candidaturas, revisar casos incertos, enviar `taxonomies: {category:[...], tag:[...]}` com os identificadores/slug aceitos e preencher o campo SEO nativo quando adequado. Confirmar no ambiente de teste o formato exato do campo SEO exigido pela API antes de ativar a escrita automática.

Até essa integração, executar classificação pós-publicação com acesso autorizado ao D1 ou pela API, evitando duplicatas e respeitando metadados existentes.

## Verificações de aceite

- Uma segunda execução não cria novos vínculos para tags já associadas.
- Tag de município mantém UF; região metropolitana só aparece quando ela é assunto efetivo.
- Edição de contratos conserva a diferença entre edital publicado, prazo aberto e contratação celebrada.
- Preserva por padrão títulos SEO, categorias, manchetes e conteúdos preexistentes.
- Tags aparecem na página do artigo e sua rota de arquivo lista as publicações corretas.
- Registrar contagem de artigos publicados, artigos com tags e associações, além de amostra de atribuições rejeitadas.
