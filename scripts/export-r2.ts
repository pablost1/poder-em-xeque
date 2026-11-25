/**
 * Segunda rodada de marcação (r2), com mais contexto que a primeira.
 *   npm run tags:export:r2
 *
 * Reavalia (a) os votos que ficaram neutros e (b) as afirmações mais fortes da r1. Cada voto sai com a descrição
 * COMPLETA, a ementa inteira, as palavras-chave do projeto, o placar da votação e o voto principal do mesmo projeto
 * (para dar o sentido de um destaque). Antes de exportar, guarda uma cópia das marcações atuais em `vote_tag_r1`.
 *
 * Saída: data/tagging/r2-batch-NN.txt. Marque cada lote em data/tagging/r2-out-NN.json (mesmo formato do r1) e carregue
 * com:  npm run tags:import -- --rubric r2
 * A r2 só substitui os votos que listar; os demais ficam como na r1.
 */
import fs from "node:fs";
import path from "node:path";
import { openDb } from "../src/lib/db";
import { deriveIv } from "../src/lib/derive";

const OUT = path.join(process.cwd(), "data", "tagging");
const batchVotes = Number(process.argv[process.argv.indexOf("--batch-votes") + 1]) || 55;

/** Por padrão ficam de fora temas em que dificilmente há direção econômica ou de privilégio (penal, costumes, tratados). */
const TODOS_OS_TEMAS = process.argv.includes("--all-topics");

const db = openDb();
// Cópia única das marcações da r1 (não sobrescreve se já existir).
db.exec(`CREATE TABLE IF NOT EXISTS vote_tag_r1 AS SELECT * FROM vote_tag WHERE 0`);
const jaTem = (db.prepare("SELECT COUNT(*) n FROM vote_tag_r1").get() as { n: number }).n;
if (jaTem === 0) {
  db.exec("INSERT INTO vote_tag_r1 SELECT * FROM vote_tag WHERE rubric_ver IN ('r1', 'auto')");
  console.log(`Cópia da r1 guardada em vote_tag_r1 (${(db.prepare("SELECT COUNT(*) n FROM vote_tag_r1").get() as { n: number }).n} marcações).`);
}
deriveIv(db); // garante vote_tag_eff atualizada

type Row = {
  id: string; date: string; description: string | null; result: string | null; bill_id: string | null;
  label: string | null; ementa: string | null; keywords: string | null;
  economic: number; privilege: number; confidence: number; rationale: string | null; sim: number; nao: number;
};
const rows = db
  .prepare(
    `SELECT sv.id, sv.date, sv.description, sv.result, sv.bill_id, b.label, b.ementa, b.keywords,
            t.economic, t.privilege, t.confidence, t.rationale,
            (SELECT COUNT(*) FROM member_vote v WHERE v.session_vote_id = sv.id AND v.vote = 'SIM') AS sim,
            (SELECT COUNT(*) FROM member_vote v WHERE v.session_vote_id = sv.id AND v.vote = 'NAO') AS nao
       FROM session_vote sv
       JOIN vote_tag_eff t ON t.sv = sv.id
       LEFT JOIN bill b ON b.id = sv.bill_id
       LEFT JOIN bill_info_eff bi ON bi.bill_id = sv.bill_id
      WHERE sv.is_nominal = 1 AND t.procedural = 0
        ${TODOS_OS_TEMAS ? "" : "AND COALESCE(bi.topic, 'other') NOT IN ('security', 'rights-customs', 'international', 'other')"}
        AND ((ABS(t.economic) < 0.2 AND ABS(t.privilege) < 0.3) OR ABS(t.economic) >= 0.5 OR ABS(t.privilege) >= 0.5)
      ORDER BY sv.bill_id, sv.date, sv.id`,
  )
  .all() as Row[];

// Voto principal de cada projeto: o que não é destaque/emenda (para dar contexto).
const principal = new Map<string, string>();
const todos = db
  .prepare(
    `SELECT sv.id, sv.bill_id, sv.description, sv.date,
            (SELECT COUNT(*) FROM member_vote v WHERE v.session_vote_id = sv.id AND v.vote = 'SIM') AS sim,
            (SELECT COUNT(*) FROM member_vote v WHERE v.session_vote_id = sv.id AND v.vote = 'NAO') AS nao
       FROM session_vote sv WHERE sv.is_nominal = 1 AND sv.bill_id IS NOT NULL ORDER BY sv.date, sv.id`,
  )
  .all() as { id: string; bill_id: string; description: string | null; date: string; sim: number; nao: number }[];
for (const v of todos) {
  const d = v.description ?? "";
  const ehLateral = /destaque|DTQ|emenda|requerimento|redação final/i.test(d);
  if (!ehLateral && !principal.has(v.bill_id)) principal.set(v.bill_id, `${v.id} (${v.date}): "${d.replace(/\s+/g, " ").slice(0, 160)}" — Sim ${v.sim}, Não ${v.nao}`);
}

const byBill = new Map<string, Row[]>();
for (const r of rows) {
  const k = r.bill_id ?? "none";
  if (!byBill.has(k)) byBill.set(k, []);
  byBill.get(k)!.push(r);
}

fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (f.startsWith("r2-batch-")) fs.unlinkSync(path.join(OUT, f));
const flat = (s: string | null, n: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

let batch: string[] = [], count = 0, n = 0;
const flush = () => {
  if (!batch.length) return;
  n++;
  fs.writeFileSync(path.join(OUT, `r2-batch-${String(n).padStart(2, "0")}.txt`), batch.join("\n"));
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
    const atual = Math.abs(v.economic) < 0.2 && Math.abs(v.privilege) < 0.3
      ? "r1: neutro"
      : `r1: e=${v.economic} p=${v.privilege} conf=${v.confidence} — ${flat(v.rationale, 90)}`;
    batch.push(`${v.id} | ${v.date} | ${flat(v.description, 540)} | Sim ${v.sim} Não ${v.nao} | resultado: ${v.result ?? "?"} | ${atual}`);
  }
  batch.push("");
  count += votes.length;
}
flush();
const neutros = rows.filter((r) => Math.abs(r.economic) < 0.2 && Math.abs(r.privilege) < 0.3).length;
console.log(`${rows.length} votos (${neutros} neutros + ${rows.length - neutros} afirmações fortes) em ${byBill.size} projetos → ${n} lotes em ${OUT}`);
