import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const dir=mkdtempSync(join(tmpdir(),'audit-categories-'));
function run(payload) {
  const file=join(dir,'fixture.json');
  writeFileSync(file,JSON.stringify(payload));
  return spawnSync(process.execPath,['scripts/audit-categories.mjs','--input',file],{encoding:'utf8'});
}
try {
  const ok=run([{results:[
    {slug:'radar-normativo-2026-10-16',categories:'radar-normativo-urbano'},
    {slug:'radar-imobiliario-2026-10-16',categories:'radar-imobiliario-metropolitano'},
    {slug:'radar-contratacoes-2026-10-16',categories:'radar-contratacoes-urbanisticas'},
    {slug:'puxadinho-10',categories:'puxadinho'}
  ]}]);
  assert.equal(ok.status,0,ok.stderr);
  const absent=run([{results:[{slug:'radar-normativo-2026-10-16',categories:''}]}]);
  assert.equal(absent.status,1,'Deve detectar categoria ausente');
  const empty=run([{results:[]}]);
  assert.notEqual(empty.status,0,'Deve falhar para consulta vazia');
  const malformed=run([{results:[{error:'unauthorized'}]}]);
  assert.notEqual(malformed.status,0,'Deve falhar para resposta inesperada');
  console.log('Quatro testes da auditoria passaram.');
} finally {rmSync(dir,{recursive:true,force:true});}
