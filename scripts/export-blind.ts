/**
 * Prepara a segunda marcação "às cegas", para medir a consistência das marcações.
 *   npm run tags:export:blind
 *
 * Exporta TODOS os votos substantivos (os que a r1 não marcou como procedimentais) com o mesmo contexto da r2 —
 * descrição completa, ementa, palavras-chave, placar, voto principal do projeto — mas SEM nenhuma marcação, tema ou
 * resumo escrito por nós. Fica em data/blind/ com o roteiro e as instruções de formato, para quem marcar não precisar
 * olhar em nenhum outro lugar.
 *
 * Saída: data/blind/batch-NN.txt  →  quem marca grava data/blind/out-NN.json  →  npm run tags:import:blind
 */
import fs from "node:fs";
import path from "node:path";
import { openDb } from "../src/lib/db";

const OUT = path.join(process.cwd(), "data", "blind");
const batchVotes = Number(process.argv[process.argv.indexOf("--batch-votes") + 1]) || 55;

const db = openDb();
const jaTem = db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'vote_tag_r1'").get();
if (!jaTem) throw new Error("Rode antes: npm run tags:export:r2 (cria a cópia vote_tag_r1 usada como base).");

type Row = {
  id: string; date: string; description: string | null; result: string | null; bill_id: string | null;
  label: string | null; ementa: string | null; keywords: string | null; sim: number; nao: number;
};
const rows = db
  .prepare(
    `SELECT sv.id, sv.date, sv.description, sv.result, sv.bill_id, b.label, b.ementa, b.keywords,
            (SELECT COUNT(*) FROM member_vote v WHERE v.session_vote_id = sv.id AND v.vote = 'SIM') AS sim,
            (SELECT COUNT(*) FROM member_vote v WHERE v.session_vote_id = sv.id AND v.vote = 'NAO') AS nao
       FROM session_vote sv
       JOIN vote_tag_r1 t ON t.sv = sv.id
       LEFT JOIN bill b ON b.id = sv.bill_id
      WHERE sv.is_nominal = 1 AND t.procedural = 0
      ORDER BY sv.bill_id, sv.date, sv.id`,
  )
  .all() as Row[];

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
  if (!/destaque|DTQ|emenda|requerimento|redação final/i.test(d) && !principal.has(v.bill_id)) {
    principal.set(v.bill_id, `${v.id} (${v.date}): "${d.replace(/\s+/g, " ").slice(0, 160)}" — Sim ${v.sim}, Não ${v.nao}`);
  }
}

const byBill = new Map<string, Row[]>();
for (const r of rows) {
  const k = r.bill_id ?? "none";
  if (!byBill.has(k)) byBill.set(k, []);
  byBill.get(k)!.push(r);
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.copyFileSync(path.join(process.cwd(), "docs", "rubric.md"), path.join(OUT, "roteiro.md"));
fs.writeFileSync(
  path.join(OUT, "LEIAME.md"),
  `# Marcação às cegas

Você vai marcar votações nominais da Câmara e do Senado do Brasil seguindo o roteiro em \`roteiro.md\` (leia inteiro antes).
Marque pelo **efeito de um voto Sim**. Use só as informações dos lotes (\`batch-NN.txt\`): identificação do projeto, ementa,
palavras-chave, descrição completa da votação, placar, resultado e o voto principal do projeto. Não decida pelo nome do
partido que pediu o destaque.

## Formato de cada lote
\`## <id do projeto> | <rótulo> | ementa: …\`, uma linha de palavras-chave e do voto principal, e depois uma linha por votação:
\`<id da votação> | <data> | <descrição> | Sim N Não N | resultado: … \`.

## O que entregar (um arquivo por lote)
Grave \`out-NN.json\` (mesmo NN do lote) com **uma entrada para CADA votação do lote**, sem pular nenhuma:

\`\`\`json
{ "votes": [
  { "sv": "C:2196833-326", "e": 0.2, "p": 0, "proc": false, "c": 0.4, "why": "frase curta em português" }
] }
\`\`\`

- \`e\`: −1…1 (efeito de um Sim no eixo Estado ↔ Mercado); \`p\`: −1…1 (efeito de um Sim nos privilégios de políticos);
  \`c\`: 0…1 (confiança na DIREÇÃO); \`proc\`: true só para moções do próprio processo; \`why\`: uma frase curta em português.
- Quando não der para saber a direção (por exemplo, um destaque de dispositivo cujo conteúdo você não vê), use \`e: 0, p: 0\`
  e confiança baixa (≤ 0,3) em vez de adivinhar. Temas penais, de costumes ou internacionais costumam ter \`e: 0\`.
- Valores entre −1 e 1 com uma casa decimal.
`,
);

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
console.log(`${rows.length} votos em ${byBill.size} projetos → ${n} lotes em ${OUT}`);
