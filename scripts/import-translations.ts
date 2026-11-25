/**
 * Aplica as traduções pt-BR dos textos do banco (resumos de projetos e justificativas das marcações).
 *   npm run tags:pt
 *
 * Para cada data/tagging/out-NN.json existe um data/tagging/pt-NN.json com
 *   { "bills": { "<bill_id>": "resumo em português" }, "votes": { "<sv>": "justificativa em português" } }
 * A importação confere que TODO id do out-NN tem tradução (e que não há ids desconhecidos ou textos vazios) antes de
 * alterar qualquer coisa. Atualiza no lugar apenas as linhas source='llm'; correções humanas não são tocadas.
 */
import fs from "node:fs";
import path from "node:path";
import { openDb } from "../src/lib/db";

const DIR = path.join(process.cwd(), "data", "tagging");
const db = openDb();

type Out = { bills?: { bill: string }[]; votes?: { sv: string }[] };
type Pt = { bills?: Record<string, string>; votes?: Record<string, string> };

const outFiles = fs.readdirSync(DIR).filter((f) => /^out-\d+\.json$/.test(f)).sort();
const problems: string[] = [];
const bills = new Map<string, string>();
const votes = new Map<string, string>();

for (const f of outFiles) {
  const ptFile = f.replace("out-", "pt-");
  const ptPath = path.join(DIR, ptFile);
  if (!fs.existsSync(ptPath)) {
    problems.push(`${ptFile}: arquivo ausente`);
    continue;
  }
  const out: Out = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
  const pt: Pt = JSON.parse(fs.readFileSync(ptPath, "utf8"));
  const wantBills = new Set((out.bills ?? []).map((b) => b.bill));
  const wantVotes = new Set((out.votes ?? []).map((v) => v.sv));
  for (const id of wantBills) if (!pt.bills?.[id]?.trim()) problems.push(`${ptFile}: falta tradução do projeto ${id}`);
  for (const id of wantVotes) if (!pt.votes?.[id]?.trim()) problems.push(`${ptFile}: falta tradução do voto ${id}`);
  for (const id of Object.keys(pt.bills ?? {})) if (!wantBills.has(id)) problems.push(`${ptFile}: projeto desconhecido ${id}`);
  for (const id of Object.keys(pt.votes ?? {})) if (!wantVotes.has(id)) problems.push(`${ptFile}: voto desconhecido ${id}`);
  for (const [id, t] of Object.entries(pt.bills ?? {})) bills.set(id, t.trim());
  for (const [id, t] of Object.entries(pt.votes ?? {})) votes.set(id, t.trim());
}

if (problems.length) {
  console.error(`✗ ${problems.length} problema(s); nada foi alterado:\n  ${problems.slice(0, 25).join("\n  ")}`);
  process.exit(1);
}

const upBill = db.prepare("UPDATE bill_info SET summary = ? WHERE bill_id = ? AND source = 'llm'");
const upVote = db.prepare("UPDATE vote_tag SET rationale = ? WHERE sv = ? AND source = 'llm'");
let nb = 0;
let nv = 0;
db.exec("BEGIN");
for (const [id, t] of bills) nb += Number(upBill.run(t, id).changes);
for (const [id, t] of votes) nv += Number(upVote.run(t, id).changes);
// Padrões gerados pelos scripts em inglês nas versões antigas.
const auto = Number(
  db.prepare("UPDATE vote_tag SET rationale = 'Automático: moção procedimental' WHERE rationale = 'auto: procedural motion'").run().changes,
);
const neutro = Number(
  db
    .prepare(
      "UPDATE vote_tag SET rationale = 'Sem direção econômica ou de privilégio clara (padrão)' WHERE rationale = 'no clear economic/privilege direction (default)'",
    )
    .run().changes,
);
db.exec("COMMIT");
console.log(`Atualizados: ${nb} resumos, ${nv} justificativas, ${auto} automáticas, ${neutro} neutras.`);

// Conferência: sobrou texto em inglês?
const INGLES = /(?<!\p{L})(the|and|for|with|Yes|Final|Second|Appeal|Preliminary)(?!\p{L})/u;
const sobras = [
  ...(db.prepare("SELECT bill_id id, summary t FROM bill_info").all() as { id: string; t: string }[]),
  ...(db.prepare("SELECT sv id, rationale t FROM vote_tag WHERE rationale IS NOT NULL").all() as { id: string; t: string }[]),
].filter((r) => INGLES.test(r.t));
console.log(sobras.length ? `⚠ ${sobras.length} textos ainda parecem estar em inglês:` : "✓ Nenhum texto em inglês restante.");
for (const r of sobras.slice(0, 10)) console.log(`  ${r.id}: ${r.t}`);
