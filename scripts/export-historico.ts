/**
 * Prepara a marcação das votações de uma legislatura do histórico.
 *   npm run tags:export:hist -- --legislatura 56 [--batch-votes 55]
 *
 * 1. Moções procedimentais são marcadas automaticamente (procedural = 1, rubric_ver 'auto').
 * 2. As demais votações sem marcação vão para data/tagging/hist/L56/batch-NN.txt com o mesmo contexto da segunda
 *    marcação (descrição completa, ementa, palavras-chave, placar, voto principal do projeto), junto com o roteiro.
 *    Quem marca grava out-NN.json na mesma pasta; depois: npm run tags:import -- --dir data/tagging/hist/L56 --fill-neutral
 */
import fs from "node:fs";
import path from "node:path";
import { openDb } from "../src/lib/db";
import { ehProcedural } from "./lib/procedural";

function opt(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const LEG = Number(opt("legislatura"));
if (!Number.isInteger(LEG) || LEG < 52) throw new Error("Use --legislatura N (52 ou mais).");
const OUT = path.resolve(opt("dir") ?? path.join(process.cwd(), "data", "tagging", "hist", `L${LEG}`));
const batchVotes = Number(opt("batch-votes")) || 55;

const db = openDb();
type Row = {
  id: string; date: string; description: string | null; result: string | null; bill_id: string | null;
  label: string | null; ementa: string | null; keywords: string | null; sim: number; nao: number;
};
const rows = db
  .prepare(
    `SELECT sv.id, sv.date, sv.description, sv.result, sv.bill_id, b.label, b.ementa, b.keywords,
            (SELECT COUNT(*) FROM member_vote_all v WHERE v.session_vote_id = sv.id AND v.vote = 'SIM') AS sim,
            (SELECT COUNT(*) FROM member_vote_all v WHERE v.session_vote_id = sv.id AND v.vote = 'NAO') AS nao
       FROM session_vote_all sv LEFT JOIN bill b ON b.id = sv.bill_id
      WHERE sv.is_nominal = 1 AND sv.legislatura = ? AND sv.id NOT IN (SELECT sv FROM vote_tag)
      ORDER BY sv.bill_id, sv.date, sv.id`,
  )
  .all(LEG) as Row[];

const insAuto = db.prepare(
  `INSERT OR IGNORE INTO vote_tag (sv, source, economic, privilege, procedural, confidence, rationale, rubric_ver)
   VALUES (?, 'llm', 0, 0, 1, 0.9, 'Automático: moção procedimental', 'auto')`,
);
let auto = 0;
const manual: Row[] = [];
db.exec("BEGIN");
for (const r of rows) {
  if (ehProcedural(r.description)) {
    insAuto.run(r.id);
    auto++;
  } else manual.push(r);
}
db.exec("COMMIT");

// Voto principal de cada projeto (a primeira votação que não é destaque, emenda ou requerimento).
const principal = new Map<string, string>();
const todos = db
  .prepare(
    `SELECT sv.id, sv.bill_id, sv.description, sv.date,
            (SELECT COUNT(*) FROM member_vote_all v WHERE v.session_vote_id = sv.id AND v.vote = 'SIM') AS sim,
            (SELECT COUNT(*) FROM member_vote_all v WHERE v.session_vote_id = sv.id AND v.vote = 'NAO') AS nao
       FROM session_vote_all sv WHERE sv.is_nominal = 1 AND sv.bill_id IS NOT NULL AND sv.legislatura = ? ORDER BY sv.date, sv.id`,
  )
  .all(LEG) as { id: string; bill_id: string; description: string | null; date: string; sim: number; nao: number }[];
for (const v of todos) {
  const d = v.description ?? "";
  if (!/destaque|DTQ|emenda|requerimento|redação final/i.test(d) && !principal.has(v.bill_id)) {
    principal.set(v.bill_id, `${v.id} (${v.date}): "${d.replace(/\s+/g, " ").slice(0, 160)}" — Sim ${v.sim}, Não ${v.nao}`);
  }
}

const byBill = new Map<string, Row[]>();
for (const r of manual) {
  const k = r.bill_id ?? "none";
  if (!byBill.has(k)) byBill.set(k, []);
  byBill.get(k)!.push(r);
}

fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (f.startsWith("batch-")) fs.unlinkSync(path.join(OUT, f));
fs.copyFileSync(path.join(process.cwd(), "docs", "rubric.md"), path.join(OUT, "roteiro.md"));
fs.copyFileSync(path.join(process.cwd(), "data", "blind", "LEIAME.md"), path.join(OUT, "LEIAME.md"));

const flat = (s: string | null, n: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
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
  const f = votes[0];
  batch.push(`## ${bill} | ${f.label ?? "(sem rótulo)"} | ementa: ${flat(f.ementa, 380)}`);
  if (f.keywords) batch.push(`   palavras-chave: ${flat(f.keywords, 170)}`);
  if (principal.has(bill)) batch.push(`   voto principal do projeto: ${principal.get(bill)}`);
  for (const v of votes) {
    batch.push(`${v.id} | ${v.date} | ${flat(v.description, 540)} | Sim ${v.sim} Não ${v.nao} | resultado: ${v.result ?? "?"}`);
  }
  batch.push("");
  count += votes.length;
}
flush();
console.log(`L${LEG}: ${auto} procedimentais marcadas automaticamente; ${manual.length} votos em ${byBill.size} projetos → ${n} lotes em ${OUT}`);
