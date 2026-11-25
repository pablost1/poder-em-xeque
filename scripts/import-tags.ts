/**
 * Load reviewed tags from data/tagging/out-*.json into vote_tag / bill_info (source 'llm').
 *   npm run tags:import
 *
 * Output file format:
 *   { "bills": [{ "bill": "C:123", "topic": "economy", "summary": "…" }],
 *     "votes": [{ "sv": "C:123-45", "e": -0.5, "p": 0, "proc": false, "c": 0.7, "why": "…" }] }
 * Validates ranges and ids; rejects the whole file if anything is invalid so nothing is half-loaded.
 */
import fs from "node:fs";
import path from "node:path";
import { openDb } from "../src/lib/db";

import { aplicarTraducao, validarTags, type TagOut, type Traducao } from "./lib/validate-tags";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
/** Pasta dos lotes e resultados (padrão data/tagging; o histórico usa uma pasta por legislatura). */
const DIR = path.resolve(arg("dir", path.join(process.cwd(), "data", "tagging")));
/** Versão do roteiro: r1 usa out-NN.json; r2 usa r2-out-NN.json (segunda rodada com mais contexto). */
const RUBRIC_VERSION = arg("rubric", "r1");
const prefix = RUBRIC_VERSION === "r1" ? "" : `${RUBRIC_VERSION}-`;
const OUT_PATTERN = new RegExp(String.raw`^${prefix}out-\d+\.json$`);
const BATCH_PATTERN = new RegExp(String.raw`^${prefix}batch-.*\.txt$`);

const db = openDb();
// session_vote_all: aceita marcações de qualquer legislatura (session_vote só enxerga a atual).
const svIds = new Set((db.prepare("SELECT id FROM session_vote_all").all() as { id: string }[]).map((r) => r.id));
const billIds = new Set((db.prepare("SELECT id FROM bill").all() as { id: string }[]).map((r) => r.id));

const insVote = db.prepare(
  `INSERT OR REPLACE INTO vote_tag (sv, source, economic, privilege, procedural, confidence, rationale, rubric_ver)
   VALUES (?, 'llm', ?, ?, ?, ?, ?, ?)`,
);
const insBill = db.prepare(`INSERT OR REPLACE INTO bill_info (bill_id, source, topic, summary) VALUES (?, 'llm', ?, ?)`);

const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => OUT_PATTERN.test(f)).sort() : [];
let nVotes = 0, nBills = 0, bad = 0;
for (const f of files) {
  const out: TagOut = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
  const errors = validarTags(out, svIds, billIds);
  if (errors.length) {
    bad++;
    console.error(`✗ ${f}: ${errors.length} problem(s), not loaded:\n  ${errors.slice(0, 10).join("\n  ")}`);
    continue;
  }
  // Se existe a tradução em português do lote (pt-NN.json), ela substitui o texto do arquivo. Sem isso, reimportar
  // um out-NN.json em inglês apagaria as traduções já aplicadas.
  const ptFile = path.join(DIR, f.replace("out-", "pt-"));
  const pt: Traducao = fs.existsSync(ptFile) ? JSON.parse(fs.readFileSync(ptFile, "utf8")) : {};
  const final = aplicarTraducao(out, pt);
  db.exec("BEGIN");
  for (const b of final.bills ?? []) insBill.run(b.bill, b.topic, b.summary);
  for (const v of final.votes ?? []) insVote.run(v.sv, v.e, v.p, v.proc ? 1 : 0, v.c, v.why ?? null, RUBRIC_VERSION);
  db.exec("COMMIT");
  nVotes += out.votes?.length ?? 0;
  nBills += out.bills?.length ?? 0;
  console.log(`✓ ${f}: ${out.votes?.length ?? 0} votes, ${out.bills?.length ?? 0} bills`);
}

// Votes in the exported batches that the reviewer did not list have no judgeable direction
// (typically destaques whose text is cut off): store them as neutral with low confidence so they
// carry no weight in the bars and don't reappear in the next export. Only with --fill-neutral.
if (process.argv.includes("--fill-neutral") && !bad) {
  const insNeutral = db.prepare(
    `INSERT OR IGNORE INTO vote_tag (sv, source, economic, privilege, procedural, confidence, rationale, rubric_ver)
     VALUES (?, 'llm', 0, 0, 0, 0.2, 'Sem direção econômica ou de privilégio clara (padrão)', ?)`,
  );
  let filled = 0;
  db.exec("BEGIN");
  for (const f of fs.readdirSync(DIR).filter((x) => BATCH_PATTERN.test(x))) {
    for (const m of fs.readFileSync(path.join(DIR, f), "utf8").matchAll(/^([CS]:[\d-]+) \|/gm)) {
      if (svIds.has(m[1])) filled += Number(insNeutral.run(m[1], RUBRIC_VERSION).changes);
    }
  }
  db.exec("COMMIT");
  console.log(`Filled ${filled} unlisted votes as neutral.`);
}

const left = db
  .prepare(`SELECT COUNT(*) c FROM session_vote_all WHERE is_nominal = 1 AND id NOT IN (SELECT sv FROM vote_tag)`)
  .get() as { c: number };
console.log(`Loaded ${nVotes} vote tags and ${nBills} bill infos from ${files.length - bad} file(s). Still untagged: ${left.c} nominal votes (todas as legislaturas).`);
if (bad) process.exit(1);
