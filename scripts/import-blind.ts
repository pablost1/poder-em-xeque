/**
 * Carrega a marcação às cegas (data/blind/out-NN.json) em vote_tag_blind.
 *   npm run tags:import:blind
 * Confere formato, faixas e se TODAS as votações de cada lote foram marcadas.
 */
import fs from "node:fs";
import path from "node:path";
import { openDb } from "../src/lib/db";
import { validarTags, type TagOut } from "./lib/validate-tags";

const DIR = path.join(process.cwd(), "data", "blind");
const db = openDb();
const svIds = new Set((db.prepare("SELECT id FROM session_vote").all() as { id: string }[]).map((r) => r.id));
const ins = db.prepare(
  `INSERT OR REPLACE INTO vote_tag_blind (sv, economic, privilege, procedural, confidence, rationale) VALUES (?, ?, ?, ?, ?, ?)`,
);

const lotes = fs.readdirSync(DIR).filter((f) => /^batch-\d+\.txt$/.test(f)).sort();
let total = 0, faltando = 0, problemas = 0, semArquivo = 0;
for (const f of lotes) {
  const nn = f.match(/\d+/)![0];
  const outPath = path.join(DIR, `out-${nn}.json`);
  if (!fs.existsSync(outPath)) {
    semArquivo++;
    console.log(`… lote ${nn}: ainda sem out-${nn}.json`);
    continue;
  }
  const esperados = [...fs.readFileSync(path.join(DIR, f), "utf8").matchAll(/^([CS]:[\d-]+) \|/gm)].map((m) => m[1]);
  let out: TagOut;
  try {
    out = JSON.parse(fs.readFileSync(outPath, "utf8"));
  } catch (e) {
    problemas++;
    console.error(`✗ lote ${nn}: JSON inválido (${(e as Error).message})`);
    continue;
  }
  const erros = validarTags(out, svIds, new Set());
  const dados = new Set((out.votes ?? []).map((v) => v.sv));
  const faltam = esperados.filter((id) => !dados.has(id));
  const extras = [...dados].filter((id) => !esperados.includes(id));
  const dup = (out.votes ?? []).length - dados.size;
  if (erros.length || extras.length || dup) {
    problemas++;
    console.error(`✗ lote ${nn}: ${erros.length} erro(s) de formato, ${extras.length} id(s) fora do lote, ${dup} repetido(s):\n  ${[...erros, ...extras.map((x) => `fora do lote: ${x}`)].slice(0, 6).join("\n  ")}`);
    continue;
  }
  db.exec("BEGIN");
  for (const v of out.votes ?? []) ins.run(v.sv, v.e, v.p, v.proc ? 1 : 0, v.c, v.why ?? null);
  db.exec("COMMIT");
  total += out.votes?.length ?? 0;
  faltando += faltam.length;
  console.log(`✓ lote ${nn}: ${out.votes?.length ?? 0} marcadas${faltam.length ? `, ${faltam.length} FALTANDO` : ""}`);
}
console.log(`Carregadas ${total} marcações às cegas. Faltando: ${faltando}. Lotes com problema: ${problemas}. Sem arquivo: ${semArquivo}.`);
if (problemas) process.exit(1);
