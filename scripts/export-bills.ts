/**
 * Prepare votes for tagging.
 *   npx tsx scripts/export-bills.ts [--batch-votes 90]
 *   npx tsx scripts/export-bills.ts --legislatura 56 --dir data/tagging/hist/L56 [--desc-chars 320]
 *
 * Sem --legislatura só enxerga a legislatura atual (a visão session_vote). Com --legislatura N lê o histórico
 * (session_vote_all) e grava os lotes em --dir, para não misturar nem apagar os lotes de outras rodadas.
 *
 * 1. Votes that are clearly procedural motions (urgency/postponement/withdrawal requests, points of
 *    order …) are tagged automatically (procedural = 1, rubric_ver 'auto').
 * 2. All other untagged votes are written, grouped by bill, to data/tagging/batch-NN.txt for a
 *    reviewer (Claude Code) to tag following docs/rubric.md. Results go to data/tagging/out-NN.json
 *    and are loaded with `npm run tags:import`.
 *
 * Re-running only exports votes that have no tag yet.
 */
import fs from "node:fs";
import path from "node:path";
import { openDb } from "../src/lib/db";
import { PROCEDURAL } from "./lib/procedural";

function opt(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const OUT = path.resolve(opt("dir") ?? path.join(process.cwd(), "data", "tagging"));
const batchVotes = Number(opt("batch-votes")) || 90;
const LEG = opt("legislatura") ? Number(opt("legislatura")) : null;
/** Descrições chegam a ~535 caracteres; cortar em 150 escondia o que um destaque suprime. */
const DESC_CHARS = Number(opt("desc-chars")) || 150;

const db = openDb();
const rows = db
  .prepare(
    `SELECT sv.id, sv.chamber, sv.date, sv.description, sv.result, sv.bill_id, b.label, b.ementa
       FROM ${LEG === null ? "session_vote" : "session_vote_all"} sv
       LEFT JOIN bill b ON b.id = sv.bill_id
      WHERE sv.is_nominal = 1
        ${LEG === null ? "" : `AND sv.legislatura = ${Math.trunc(LEG)}`}
        AND sv.id NOT IN (SELECT sv FROM vote_tag)
      ORDER BY sv.bill_id, sv.date, sv.id`,
  )
  .all() as {
  id: string; chamber: string; date: string; description: string | null; result: string | null;
  bill_id: string | null; label: string | null; ementa: string | null;
}[];

const insAuto = db.prepare(
  `INSERT OR IGNORE INTO vote_tag (sv, source, economic, privilege, procedural, confidence, rationale, rubric_ver)
   VALUES (?, 'llm', 0, 0, 1, 0.9, 'Automático: moção procedimental', 'auto')`,
);

let auto = 0;
const manual: typeof rows = [];
db.exec("BEGIN");
for (const r of rows) {
  if (r.description && PROCEDURAL.some((re) => re.test(r.description!))) {
    insAuto.run(r.id);
    auto++;
  } else manual.push(r);
}
db.exec("COMMIT");

// Group by bill, then pack bills into batches of ~batchVotes votes.
const byBill = new Map<string, typeof rows>();
for (const r of manual) {
  const k = r.bill_id ?? "none";
  if (!byBill.has(k)) byBill.set(k, []);
  byBill.get(k)!.push(r);
}

fs.mkdirSync(OUT, { recursive: true });
// Só apaga lotes antigos da própria pasta de destino (por isso as legislaturas do histórico usam pastas separadas).
for (const f of fs.readdirSync(OUT)) if (f.startsWith("batch-")) fs.unlinkSync(path.join(OUT, f));

const clip = (s: string | null, n: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
let batch: string[] = [], count = 0, n = 0;
const flush = () => {
  if (!batch.length) return;
  n++;
  fs.writeFileSync(path.join(OUT, `batch-${String(n).padStart(2, "0")}.txt`), batch.join("\n"));
  batch = [];
  count = 0;
};
for (const [bill, votes] of byBill) {
  if (count > 0 && count + votes.length > batchVotes) flush();
  const first = votes[0];
  batch.push(`## ${bill} | ${first.label ?? "(no label)"} | ${clip(first.ementa, 280)}`);
  for (const v of votes) batch.push(`${v.id} | ${v.date} | ${clip(v.description, DESC_CHARS)} | ${v.result ?? "?"}`);
  batch.push("");
  count += votes.length;
}
flush();

console.log(`Auto-tagged ${auto} procedural votes. ${manual.length} votes on ${byBill.size} bills → ${n} batches in ${OUT}`);
