// Auditoria somente leitura para as editorias do portal.
// Execute: node scripts/audit-categories.mjs --input resultado.json
// O JSON esperado contem a saida da consulta SQL documentada abaixo.
import { readFileSync } from 'node:fs';

const expected = {
  'radar-normativo-': 'radar-normativo-urbano',
  'radar-imobiliario-': 'radar-imobiliario-metropolitano',
  'radar-contratacoes-': 'radar-contratacoes-urbanisticas',
  'puxadinho': 'puxadinho',
};
const source = process.argv.indexOf('--input');
if (source < 0 || !process.argv[source + 1]) {
  console.error('Informe --input <arquivo.json> com o resultado do SQL de auditoria.');
  process.exit(2);
}
const raw = JSON.parse(readFileSync(process.argv[source + 1], 'utf8'));
const rows = Array.isArray(raw) ? raw : raw.results?.[0]?.results ?? raw.result?.[0]?.results ?? raw.results;
if (!Array.isArray(rows)) throw new Error('Resposta de consulta D1 desconhecida');
let failures = 0;
for (const row of rows) {
  const slug = row.slug;
  let required = slug?.startsWith('puxadinho') ? 'puxadinho' : undefined;
  for (const [prefix, category] of Object.entries(expected)) {
    if (prefix !== 'puxadinho' && slug?.startsWith(prefix)) required = category;
  }
  if (!required) continue;
  const categories = typeof row.categories === 'string' ? row.categories.split('|') : row.categories ?? [];
  if (!categories.includes(required)) {
    failures++;
    console.error('SEM CATEGORIA: ' + slug + ' => ' + required);
  }
}
console.log('Artigos inspecionados: ' + rows.length + '; pendencias: ' + failures);
if (failures > 0) process.exitCode = 1;
